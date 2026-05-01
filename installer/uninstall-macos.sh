#!/usr/bin/env bash
# hwpx-mcp uninstaller (macOS)
#
# Non-destructive:
#   * Auto-detects ~/Library/Application Support/Claude/claude_desktop_config.json
#     (HWPX_MCP_CLAUDE_CONFIG override supported).
#   * Backs up the config before modification (keeps the most recent 2 .bak-*
#     snapshots and prunes the rest).
#   * The skill directory is MOVED to .bak-<timestamp> (not deleted) so a
#     manual restore is possible.
#   * Template files under ~/Documents/skills/templates are LEFT IN PLACE --
#     users may have edited them; a warning explains how to remove manually.

set -euo pipefail

# ---------------------------------------------------------------------------
# Output helpers
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

# See install-macos.sh — `find -maxdepth 1` so we don't accidentally walk
# into backup directories.
prune_old_backups() {
  local target="$1" keep="${2:-2}"
  local parent base
  parent="$(dirname -- "$target")"
  base="$(basename -- "$target")"
  [ -d "$parent" ] || return 0

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
  info "Existing item moved aside -> $(basename -- "$backup")"
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
SKILL_TARGET="$HOME/.claude/skills/hwpx-document-writer"
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
echo "  hwpx-mcp uninstaller (macOS)"
echo "========================================"
echo

# ---------------------------------------------------------------------------
# 1. Remove hwpx entry from Claude Desktop config
# ---------------------------------------------------------------------------
step 'Editing claude_desktop_config.json'
if [ ! -f "$CONFIG_PATH" ]; then
  warn 'No Claude Desktop config found (already uninstalled?).'
else
  info "Config target: $CONFIG_PATH"
  info "(detected via: $CONFIG_SOURCE)"

  if ! command -v python3 >/dev/null 2>&1; then
    fail 'python3 not found on PATH (needed to safely edit JSON).'
    info 'Run:  xcode-select --install   then rerun this uninstaller.'
    exit 3
  fi

  copy_aside_with_backup "$CONFIG_PATH"

  # Encode result via exit code instead of stdout capture: macOS bash 3.2
  # has parser quirks with `$(...)` wrapping a quoted heredoc. Exit codes:
  #   0 = removed, 10 = entry absent, 11 = file unparseable, other = I/O error.
  set +e
  python3 - "$CONFIG_PATH" <<'PYEOF'
import json, os, sys, tempfile
path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as f:
        raw = f.read().strip()
except Exception as exc:
    print(f'ERROR: {exc}', file=sys.stderr)
    sys.exit(2)
if not raw:
    sys.exit(10)
try:
    data = json.loads(raw)
except json.JSONDecodeError as exc:
    print(f'ERROR: unparseable JSON ({exc})', file=sys.stderr)
    sys.exit(11)
if not isinstance(data, dict):
    sys.exit(10)
mcp = data.get('mcpServers')
if not isinstance(mcp, dict) or 'hwpx' not in mcp:
    sys.exit(10)
del mcp['hwpx']

# Atomic write: stage to a sibling tempfile, fsync, then rename. Preserve
# the original file's mode bits (mkstemp defaults to 0o600).
parent = os.path.dirname(path) or '.'
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
  PY_RC=$?
  set -e

  case "$PY_RC" in
    0)  ok "Removed 'hwpx' entry" ;;
    10) warn "'hwpx' entry was not present" ;;
    11) fail 'Could not parse claude_desktop_config.json (see error above)'; exit 5 ;;
    *)  fail "Could not edit claude_desktop_config.json (python3 exit=$PY_RC)"; exit 5 ;;
  esac
fi

# ---------------------------------------------------------------------------
# 2. Move the skill aside
# ---------------------------------------------------------------------------
step 'Moving skill folder aside'
if [ -e "$SKILL_TARGET" ]; then
  move_aside_with_backup "$SKILL_TARGET"
  ok 'Skill moved to .bak-<timestamp>'
else
  warn 'Skill folder not found (nothing to move)'
fi

echo
echo '----------------------------------------'
ok 'Uninstall complete.'
echo
echo 'Notes:'
echo "  * Template files under $TEMPLATES_ROOT were left in place"
echo '    in case you customized them. Delete manually for a full wipe.'
echo '  * Config and skill backups (.bak-<timestamp>) were kept --'
echo '    delete them manually once you are sure the uninstall is clean.'
echo
exit 0
