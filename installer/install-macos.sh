#!/usr/bin/env bash
# hwpx-mcp installer (macOS)
#
# Safe, idempotent installer:
#   * Auto-detects ~/Library/Application Support/Claude/claude_desktop_config.json
#     and accepts HWPX_MCP_CLAUDE_CONFIG override.
#   * Prints an "Install Plan" before touching anything.
#   * Skips writes that would be no-ops (identical JSON / identical SHA-1).
#   * Backs up replaced items to <target>.bak-<timestamp> and prunes older
#     backups so at most 2 remain per target.
#   * Only touches its own keys:
#       - mcpServers.hwpx inside claude_desktop_config.json (other MCP
#         entries' VALUES are preserved -- the file is reserialized via
#         json.dump so indentation / whitespace / key order / line endings
#         may shift; original is saved to .bak-<timestamp>)
#       - ~/.claude/skills/hwpx-document-writer (other skills untouched)
#       - ~/Documents/skills/templates/<template>.hwpx (other templates
#         untouched)
#
# Override the config location with HWPX_MCP_CLAUDE_CONFIG if auto-detection
# picks the wrong file.

set -euo pipefail

# ---------------------------------------------------------------------------
# Output helpers (ANSI color, fall back gracefully if not a TTY)
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m';  C_GRAY=$'\033[90m';  C_RESET=$'\033[0m'
else
  C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_GRAY=""; C_RESET=""
fi

step() { printf '%s[*]%s %s\n' "$C_CYAN"   "$C_RESET" "$1"; }
ok()   { printf '%s[+]%s %s\n' "$C_GREEN"  "$C_RESET" "$1"; }
warn() { printf '%s[!]%s %s\n' "$C_YELLOW" "$C_RESET" "$1"; }
fail() { printf '%s[x]%s %s\n' "$C_RED"    "$C_RESET" "$1" >&2; }
info() { printf '%s    %s%s\n' "$C_GRAY" "$1" "$C_RESET"; }

timestamp() { date +%Y%m%d-%H%M%S; }

sha1_of() {
  # macOS ships /usr/bin/shasum
  shasum -a 1 "$1" | awk '{print $1}'
}

# Keep only the most recent $2 backups matching "<basename>.bak-*" next to $1.
# Backups can be either files (config snapshots) or directories (skill folders),
# so we list entry names directly via `find -maxdepth 1` instead of `ls -t`,
# which would otherwise expand directory contents and break this routine.
prune_old_backups() {
  local target="$1" keep="${2:-2}"
  local parent base
  parent="$(dirname -- "$target")"
  base="$(basename -- "$target")"
  [ -d "$parent" ] || return 0

  # Sort newest-first by mtime. Names are timestamped, but mtime sort is what
  # we want regardless. Use NUL-delimited records for safety.
  local listing
  listing="$(find "$parent" -mindepth 1 -maxdepth 1 -name "$base.bak-*" -print0 2>/dev/null \
    | xargs -0 stat -f '%m %N' 2>/dev/null \
    | sort -rn \
    | cut -d' ' -f2-)"
  [ -z "$listing" ] && return 0

  local idx=0
  while IFS= read -r b; do
    [ -z "$b" ] && continue
    idx=$((idx + 1))
    if [ "$idx" -gt "$keep" ]; then
      rm -rf -- "$b" 2>/dev/null && info "Pruned old backup: $(basename -- "$b")"
    fi
  done <<< "$listing"
}

move_aside_with_backup() {
  local path="$1"
  [ -e "$path" ] || return 0
  local backup="$path.bak-$(timestamp)"
  mv -- "$path" "$backup"
  info "Existing item backed up -> $(basename -- "$backup")"
  prune_old_backups "$path" 2
}

copy_aside_with_backup() {
  local path="$1"
  [ -e "$path" ] || return 0
  local backup="$path.bak-$(timestamp)"
  cp -p -- "$path" "$backup"
  info "Config snapshot saved -> $(basename -- "$backup")"
  prune_old_backups "$path" 2
}

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PAYLOAD_DIR="$SCRIPT_DIR/payload"
SKILL_ZIP="$PAYLOAD_DIR/hwpx-document-writer.zip"

SKILLS_ROOT="$HOME/.claude/skills"
SKILL_TARGET="$SKILLS_ROOT/hwpx-document-writer"
TEMPLATES_ROOT="$HOME/Documents/skills/templates"

DEFAULT_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
CONFIG_PATH="${HWPX_MCP_CLAUDE_CONFIG:-$DEFAULT_CONFIG}"
CONFIG_SOURCE='default (~/Library/Application Support/Claude)'
[ -n "${HWPX_MCP_CLAUDE_CONFIG:-}" ] && CONFIG_SOURCE='HWPX_MCP_CLAUDE_CONFIG env var'

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo
echo "========================================"
echo "  hwpx-mcp installer (macOS)"
echo "========================================"
echo

# ---------------------------------------------------------------------------
# 0. Claude Desktop running-process guard
# ---------------------------------------------------------------------------
# If Claude Desktop is running, it holds the old config in memory and won't
# pick up our changes until fully quit + relaunched. Earlier testers ran
# into this on first install and saw "hwpx-mcp 도구가 연결되어 있지 않습
# 니다" even though the config file on disk was correct. Detect early and
# let the user decide whether to abort or proceed.
#
# Skip the prompt non-interactively (CI / piped) — just print the warning.
step 'Checking Claude Desktop process'
# pgrep matches by process name only, so we follow up with `ps -p $pid -o
# command=` to confirm the executable lives under a Claude.app bundle.
# This prevents false positives from unrelated CLIs named 'claude' (e.g.
# personal scripts).
#
# `command=` returns argv (full path + args). We use this rather than
# `comm=` because POSIX/BSD `comm` is documented as the command *name*
# only and may return just "Claude" without the bundle path on some macOS
# versions. If `command=` returns empty (e.g. permission denied for
# another user's process), fall back to trusting the name match — better
# to over-warn than to silently miss Claude Desktop.
RAW_PIDS="$(pgrep -ix 'Claude' 2>/dev/null || true)"
CLAUDE_PIDS=""
for pid in $RAW_PIDS; do
  exe="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  case "$exe" in
    # Strong match: path-form pointing into a Claude.app bundle.
    */Claude.app/Contents/MacOS/*) CLAUDE_PIDS="$CLAUDE_PIDS $pid" ;;
    # Fallback for cases where ps strips the path (some macOS versions
    # return just "Claude") or the property is unavailable. We accept
    # only the capital-C "Claude" form because Claude Desktop's binary is
    # /Applications/Claude.app/Contents/MacOS/Claude — the lowercase bare
    # "claude" token, which we observed for the PATH-launched Claude Code
    # CLI, is rejected so it does not produce noise on dev machines.
    '' | Claude) CLAUDE_PIDS="$CLAUDE_PIDS $pid" ;;
    # Anything else (e.g. /usr/local/bin/claude CLI with a full path, or
    # bare "claude" CLI) is rejected.
  esac
done
CLAUDE_PIDS="${CLAUDE_PIDS# }"
if [ -n "$CLAUDE_PIDS" ]; then
  warn "Claude Desktop is currently running (PID: $CLAUDE_PIDS)."
  info 'It holds the old config in memory; changes will not take effect until you'
  info 'fully quit (Cmd+Q, or right-click the menu-bar icon -> Quit) and reopen.'
  if [ -t 0 ] && [ -t 1 ]; then
    printf '    Continue anyway? [y/N] '
    read -r ans
    case "$ans" in
      y|Y|yes|YES) info 'Proceeding. Remember to fully quit and reopen Claude Desktop afterwards.' ;;
      *)
        fail 'Aborted by user. Quit Claude Desktop, then rerun this installer.'
        exit 7
        ;;
    esac
  else
    info '(non-interactive shell — proceeding without prompt; do quit + reopen Claude Desktop after install)'
  fi
else
  ok 'Claude Desktop is not running.'
fi

# ---------------------------------------------------------------------------
# 1. Payload sanity
# ---------------------------------------------------------------------------
step 'Checking payload files'
if [ ! -f "$SKILL_ZIP" ]; then
  fail "Payload missing: $SKILL_ZIP"
  info 'Extract the installer zip intact and rerun.'
  exit 2
fi

# Resolve template — exactly one *.hwpx in payload/.
TEMPLATE_SOURCE=""
TEMPLATE_COUNT=0
while IFS= read -r -d '' f; do
  TEMPLATE_SOURCE="$f"
  TEMPLATE_COUNT=$((TEMPLATE_COUNT + 1))
done < <(find "$PAYLOAD_DIR" -maxdepth 1 -type f -name '*.hwpx' -print0)

if [ "$TEMPLATE_COUNT" -eq 0 ]; then
  fail "No .hwpx template found in $PAYLOAD_DIR"
  info 'Extract the installer zip intact and rerun.'
  exit 2
fi
if [ "$TEMPLATE_COUNT" -gt 1 ]; then
  fail "Multiple .hwpx templates in $PAYLOAD_DIR (expected exactly one)"
  exit 2
fi
TEMPLATE_FILENAME="$(basename -- "$TEMPLATE_SOURCE")"
TEMPLATE_TARGET="$TEMPLATES_ROOT/$TEMPLATE_FILENAME"
ok 'Payload OK'

# ---------------------------------------------------------------------------
# 2. Node.js prereq
# ---------------------------------------------------------------------------
step 'Checking Node.js'
if ! command -v node >/dev/null 2>&1; then
  fail 'Node.js not found on PATH.'
  info 'Install Node.js 18 LTS or newer from https://nodejs.org/ then rerun this installer.'
  info 'If you use a version manager (nvm, asdf, mise), make sure it is loaded in your shell.'
  exit 3
fi
NODE_VERSION="$(node --version 2>/dev/null || true)"
ok "Node.js detected ($NODE_VERSION)"

# ---------------------------------------------------------------------------
# 3. Python3 prereq (used for safe JSON merging)
# ---------------------------------------------------------------------------
step 'Checking python3'
if ! command -v python3 >/dev/null 2>&1; then
  fail 'python3 not found on PATH.'
  info 'macOS ships python3 with the Xcode Command Line Tools.'
  info 'Run:  xcode-select --install   then rerun this installer.'
  exit 3
fi
ok "python3 detected ($(python3 --version 2>&1))"

# ---------------------------------------------------------------------------
# 4. Locate Claude Desktop config
# ---------------------------------------------------------------------------
step 'Locating Claude Desktop config'
CONFIG_DIR="$(dirname -- "$CONFIG_PATH")"
CONFIG_EXISTS=0
[ -f "$CONFIG_PATH" ] && CONFIG_EXISTS=1

if [ "$CONFIG_EXISTS" -eq 0 ] && [ ! -d "$CONFIG_DIR" ]; then
  fail 'Claude Desktop config directory not found.'
  info 'Install Claude Desktop from https://claude.ai/download, open it at least once, then rerun.'
  info 'Non-standard install? Set HWPX_MCP_CLAUDE_CONFIG to the full path of claude_desktop_config.json.'
  exit 4
fi
ok "Config target: $CONFIG_PATH"
info "(detected via: $CONFIG_SOURCE)"

# ---------------------------------------------------------------------------
# 5. Build install plan
# ---------------------------------------------------------------------------
step 'Planning changes'

# -- config plan
CONFIG_CHANGE='create new config file'
if [ "$CONFIG_EXISTS" -eq 1 ]; then
  CONFIG_CHANGE="$(python3 - "$CONFIG_PATH" <<'PYEOF'
import json, sys
path = sys.argv[1]
target = {"command": "npx", "args": ["-y", "hwpx-mcp-server@latest"]}
try:
    with open(path, 'r', encoding='utf-8') as f:
        raw = f.read().strip()
    if not raw:
        print('add hwpx entry (empty file)')
        sys.exit(0)
    data = json.loads(raw)
except json.JSONDecodeError:
    print('rewrite (config unparseable; original will be backed up)')
    sys.exit(0)
except Exception:
    print('rewrite (config unreadable; original will be backed up)')
    sys.exit(0)
mcp = data.get('mcpServers') if isinstance(data, dict) else None
if not isinstance(mcp, dict) or 'hwpx' not in mcp:
    print('add hwpx entry (other MCP entries preserved)')
    sys.exit(0)
if mcp['hwpx'] == target:
    print('skip (hwpx entry already current)')
else:
    print('update hwpx entry (other MCP entries preserved)')
PYEOF
)"
fi

# -- skill plan
SKILL_CHANGE='install'
[ -e "$SKILL_TARGET" ] && SKILL_CHANGE='replace (existing folder will be backed up)'

# -- template plan
TEMPLATE_CHANGE='install'
if [ -f "$TEMPLATE_TARGET" ]; then
  if [ "$(sha1_of "$TEMPLATE_SOURCE")" = "$(sha1_of "$TEMPLATE_TARGET")" ]; then
    TEMPLATE_CHANGE='skip (bytes identical)'
  else
    TEMPLATE_CHANGE='replace (existing file will be backed up)'
  fi
fi

echo
echo '--- Install Plan ---'
printf '  Claude config : %s\n'   "$CONFIG_PATH"
printf '      action    : %s\n'   "$CONFIG_CHANGE"
printf '  Skill folder  : %s\n'   "$SKILL_TARGET"
printf '      action    : %s\n'   "$SKILL_CHANGE"
printf '  Template file : %s\n'   "$TEMPLATE_TARGET"
printf '      action    : %s\n'   "$TEMPLATE_CHANGE"
echo

# Order: install skill + template first, then write the Claude Desktop config
# entry LAST. This way, if any of the asset installs fail, Claude Desktop
# never sees a half-installed `hwpx` MCP entry pointing at missing files.
# Re-running the installer recovers cleanly because each step is idempotent.

# ---------------------------------------------------------------------------
# 6. Install the skill
# ---------------------------------------------------------------------------
step 'Installing skill'
mkdir -p -- "$SKILLS_ROOT"
[ -e "$SKILL_TARGET" ] && move_aside_with_backup "$SKILL_TARGET"

# Warn — but never touch — loose SKILL.md / REFERENCE.md siblings at the
# skills root. The buggy v0.5.2 PS1 installer dropped these here; clean them
# up manually if you see this warning. We intentionally do NOT delete files
# outside our declared ownership scope (hwpx-document-writer/ subfolder only).
for stray in 'SKILL.md' 'REFERENCE.md'; do
  if [ -f "$SKILLS_ROOT/$stray" ]; then
    warn "Loose $stray detected at $SKILLS_ROOT/ -- not ours; left in place"
    info "If left over from a v0.5.2 install, remove manually: rm \"$SKILLS_ROOT/$stray\""
  fi
done

# Stage extraction so we can cope with both flat zips (SKILL.md at root) and
# nested zips (<folder>/SKILL.md) without leaving stray files under
# $SKILLS_ROOT.
SKILL_STAGE="$(mktemp -d -t hwpx-skill)"
trap 'rm -rf -- "$SKILL_STAGE"' EXIT

unzip -q -o -- "$SKILL_ZIP" -d "$SKILL_STAGE"

SKILL_MD="$(find "$SKILL_STAGE" -type f -name 'SKILL.md' -print -quit)"
if [ -z "$SKILL_MD" ]; then
  fail 'Skill zip does not contain SKILL.md'
  exit 6
fi
SRC_DIR="$(dirname -- "$SKILL_MD")"

mkdir -p -- "$SKILL_TARGET"
# Copy contents (preserve hidden files via dotglob-equivalent find).
find "$SRC_DIR" -mindepth 1 -maxdepth 1 -exec cp -R -- {} "$SKILL_TARGET/" \;

if [ ! -f "$SKILL_TARGET/SKILL.md" ]; then
  fail "Skill extraction did not produce SKILL.md at $SKILL_TARGET"
  exit 6
fi
ok "Skill installed to $SKILL_TARGET"

rm -rf -- "$SKILL_STAGE"
trap - EXIT

# ---------------------------------------------------------------------------
# 7. Install the template
# ---------------------------------------------------------------------------
step 'Installing template'
case "$TEMPLATE_CHANGE" in
  skip*)
    ok 'Template bytes already identical; skipping copy.'
    ;;
  *)
    mkdir -p -- "$TEMPLATES_ROOT"
    [ -f "$TEMPLATE_TARGET" ] && move_aside_with_backup "$TEMPLATE_TARGET"
    cp -p -- "$TEMPLATE_SOURCE" "$TEMPLATE_TARGET"
    ok "Template installed to $TEMPLATE_TARGET"
    ;;
esac

# ---------------------------------------------------------------------------
# 8. Update Claude Desktop config (LAST — see ordering note above)
# ---------------------------------------------------------------------------
step 'Updating claude_desktop_config.json'

case "$CONFIG_CHANGE" in
  skip*)
    ok 'Config already current; skipping write.'
    ;;
  *)
    mkdir -p -- "$CONFIG_DIR"
    [ -f "$CONFIG_PATH" ] && copy_aside_with_backup "$CONFIG_PATH"

    python3 - "$CONFIG_PATH" <<'PYEOF'
import json, os, sys, tempfile
path = sys.argv[1]
target = {"command": "npx", "args": ["-y", "hwpx-mcp-server@latest"]}
data = {}
if os.path.exists(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            raw = f.read().strip()
        if raw:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                data = parsed
    except json.JSONDecodeError:
        # Existing file was unparseable; backup is already on disk.
        data = {}
mcp = data.get('mcpServers')
if not isinstance(mcp, dict):
    mcp = {}
    data['mcpServers'] = mcp
mcp['hwpx'] = target

# Atomic write: stage to a sibling tempfile, fsync, then rename. Prevents a
# crash mid-write from leaving the user with a truncated/empty config.
# Preserve the existing file's permissions (mkstemp defaults to 0o600 which
# would silently lock the file down).
parent = os.path.dirname(path) or '.'
prev_mode = None
try:
    prev_mode = os.stat(path).st_mode & 0o777
except FileNotFoundError:
    prev_mode = 0o644
fd, tmp = tempfile.mkstemp(prefix='.claude_desktop_config.', suffix='.tmp', dir=parent, text=True)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())
    os.chmod(tmp, prev_mode)
    os.replace(tmp, path)
except BaseException:
    if os.path.exists(tmp):
        try: os.unlink(tmp)
        except OSError: pass
    raise
PYEOF
    ok "Wrote $CONFIG_PATH"
    ;;
esac

# ---------------------------------------------------------------------------
# 9. Done
# ---------------------------------------------------------------------------
echo
echo '----------------------------------------'
ok 'Installation complete.'
echo
echo 'Next steps:'
echo '  1. Fully quit Claude Desktop (Cmd+Q, or right-click menu bar -> Quit).'
echo '  2. Reopen Claude Desktop.'
echo '  3. Open a new chat and try the hwpx skill. See README.md for Korean sample prompts.'
echo
exit 0
