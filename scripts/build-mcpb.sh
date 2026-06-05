#!/usr/bin/env bash
# Builds the hwpx MCP Bundle (.mcpb) for one-click install in Claude Desktop.
#
# An .mcpb (formerly .dxt) is a zip archive bundling the compiled MCP server
# (dist/) plus its production node_modules and a manifest.json. Users install
# it by double-clicking — no Node.js, no JSON editing, no terminal, no MOTW
# console-closing problem that the .bat/.ps1 installer hits on hardened PCs.
#
# Output:
#   dist-skill/installers/hwpx-mcp-server.mcpb
#
# Run from anywhere:
#   bash scripts/build-mcpb.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$REPO_ROOT/mcp-server"
STAGE="$SERVER_DIR/.mcpb-stage"

# dist-skill/ is gitignored and lives in the main worktree. From a side
# worktree, point HWPX_DIST_SKILL at the main repo's dist-skill/ folder.
DIST_SKILL="${HWPX_DIST_SKILL:-$REPO_ROOT/dist-skill}"
OUT="$DIST_SKILL/installers/hwpx-mcp-server.mcpb"

# Pinned packer version for reproducible builds (npx downloads/executes it).
MCPB_CLI_VERSION="2.1.2"

# argv-based load so a repo path containing a quote can't break the expression.
VERSION="$(node -p "require(process.argv[1]).version" "$SERVER_DIR/package.json")"

echo "==> hwpx-mcp-server@$VERSION → .mcpb"

# ---------------------------------------------------------------------------
# 1. Compile the server
# ---------------------------------------------------------------------------
echo "==> Building server (tsc)"
( cd "$SERVER_DIR" && npm run build >/dev/null )

# ---------------------------------------------------------------------------
# 2. Stage bundle layout:  manifest.json + server/ + node_modules/
# ---------------------------------------------------------------------------
echo "==> Staging bundle"
rm -rf "$STAGE"
mkdir -p "$STAGE/server" "$STAGE/assets"
cp -R "$SERVER_DIR/dist/." "$STAGE/server/"

# Bundle the .hwpx templates from dist-skill/templates/ into assets/. The
# server self-deploys these to ~/Documents/skills/templates on first run.
shopt -s nullglob
template_count=0
for tpl in "$DIST_SKILL"/templates/*.hwpx; do
  cp "$tpl" "$STAGE/assets/"
  template_count=$((template_count + 1))
done
shopt -u nullglob

# macOS stores Hangul filenames as NFD (decomposed); an NFD entry inside the
# .mcpb renders garbled on Windows AND breaks the skill's NFC filename match
# (template lookup fails → Mode C fallback). Force every staged template to NFC.
python3 - "$STAGE/assets" <<'PY'
import os, sys, unicodedata
d = sys.argv[1]
names = os.listdir(d)
# Guard: two staged names that fold to the same NFC name would silently
# overwrite each other on a normalization-sensitive FS (e.g. Linux CI),
# dropping a template from the bundle. Fail loudly before touching anything.
seen = {}
for name in names:
    nfc = unicodedata.normalize("NFC", name)
    if nfc in seen:
        sys.exit(f"ERROR: template filename collision under NFC: {seen[nfc]!r} vs {name!r}")
    seen[nfc] = name
for name in names:
    nfc = unicodedata.normalize("NFC", name)
    if name == nfc:
        continue
    src = os.path.join(d, name)
    tmp = os.path.join(d, "._nfc_tmp")
    os.rename(src, tmp)                        # drop NFD entry (APFS normalization-insensitive)
    try:
        os.rename(tmp, os.path.join(d, nfc))  # recreate with NFC bytes
    except OSError:
        os.rename(tmp, src)                   # restore original name, then surface the error
        raise
    print(f"==> Normalized template filename NFD->NFC: {nfc}")
PY

if [ "$template_count" -eq 0 ]; then
  echo "ERROR: no .hwpx templates found in $DIST_SKILL/templates" >&2
  echo "       Set HWPX_DIST_SKILL to the folder whose templates/ holds the files." >&2
  exit 1
fi
echo "==> Bundled $template_count template(s)"

# Production-only node_modules: install into the stage root so Node resolves
# them by walking up from server/index.js. `npm ci` (not `install`) for a
# strict, lockfile-pinned, reproducible tree.
if [ ! -f "$SERVER_DIR/package-lock.json" ]; then
  echo "ERROR: mcp-server/package-lock.json required for reproducible build" >&2
  exit 1
fi
cp "$SERVER_DIR/package.json" "$STAGE/package.json"
cp "$SERVER_DIR/package-lock.json" "$STAGE/package-lock.json"
echo "==> Installing production dependencies"
( cd "$STAGE" && npm ci --omit=dev --no-audit --no-fund --silent )

# ---------------------------------------------------------------------------
# 3. Generate manifest.json
#    - name kept STABLE across releases so Desktop treats new files as an
#      in-place update (only `version` is bumped).
#    - no user_config: local mode needs zero input → truly zero-prompt install.
# ---------------------------------------------------------------------------
echo "==> Writing manifest.json"
cat > "$STAGE/manifest.json" <<JSON
{
  "manifest_version": "0.3",
  "name": "hwpx-mcp-server",
  "display_name": "HWPX 한글 문서 편집",
  "version": "$VERSION",
  "description": "HWPX(한글) 문서를 AI로 편집하는 MCP 서버 — 135개 도구 (서식 채우기 / 스타일 팔레트 / 자유 작성)",
  "author": {
    "name": "flamingo99",
    "url": "https://github.com/flamingo8006/hwpx-mcp"
  },
  "homepage": "https://github.com/flamingo8006/hwpx-mcp",
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["\${__dirname}/server/index.js"]
    }
  },
  "compatibility": {
    "platforms": ["darwin", "win32"],
    "runtimes": {
      "node": ">=18"
    }
  }
}
JSON

# ---------------------------------------------------------------------------
# 4. Pack with the official mcpb CLI (via npx — no global install)
# ---------------------------------------------------------------------------
echo "==> Packing"
mkdir -p "$(dirname "$OUT")"
npx --yes "@anthropic-ai/mcpb@$MCPB_CLI_VERSION" pack "$STAGE" "$OUT"

echo "==> Done: $OUT"
ls -lh "$OUT"
