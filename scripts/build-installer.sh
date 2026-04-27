#!/usr/bin/env bash
# Builds the Windows installer zip from installer/ + dist-skill/.
#
# Inputs (must already exist under dist-skill/):
#   - hwpx-document-writer.zip   (skill payload)
#   - 공문서_프레임.hwpx          (template payload)
#
# Output:
#   dist-skill/hwpx-mcp-installer-windows.zip
#
# Run from anywhere:
#   bash scripts/build-installer.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALLER_DIR="$REPO_ROOT/installer"

# dist-skill/ is gitignored and lives in the main worktree. From a side
# worktree, point HWPX_DIST_SKILL at the main repo's dist-skill/ folder.
DIST_SKILL="${HWPX_DIST_SKILL:-$REPO_ROOT/dist-skill}"

SKILL_ZIP="$DIST_SKILL/hwpx-document-writer.zip"
TEMPLATE="$DIST_SKILL/공문서_프레임.hwpx"

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
if [ ! -d "$INSTALLER_DIR" ]; then
  echo "ERROR: installer/ folder not found at $INSTALLER_DIR" >&2
  exit 1
fi
if [ ! -f "$SKILL_ZIP" ]; then
  echo "ERROR: skill zip not found at $SKILL_ZIP" >&2
  echo "       Build or fetch dist-skill/hwpx-document-writer.zip first." >&2
  exit 1
fi
if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: template not found at $TEMPLATE" >&2
  echo "       Place 공문서_프레임.hwpx under dist-skill/ before running." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Populate installer/payload/ (for local inspection / dev testing)
# ---------------------------------------------------------------------------
PAYLOAD_DIR="$INSTALLER_DIR/payload"
rm -rf "$PAYLOAD_DIR"
mkdir -p "$PAYLOAD_DIR"
cp "$SKILL_ZIP" "$PAYLOAD_DIR/"
cp "$TEMPLATE"  "$PAYLOAD_DIR/"
echo "[+] Payload populated: $PAYLOAD_DIR"

# ---------------------------------------------------------------------------
# Stage + zip with a single top-level folder so testers see
#   hwpx-mcp-installer-windows/
#   ├── install-windows.bat
#   └── ...
# after extracting, instead of files dumped into their cwd.
# ---------------------------------------------------------------------------
STAGE="$(mktemp -d -t hwpx-installer-XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

TOP="hwpx-mcp-installer-windows"
mkdir -p "$STAGE/$TOP/payload"

cp \
  "$INSTALLER_DIR/install-windows.bat" \
  "$INSTALLER_DIR/install-windows.ps1" \
  "$INSTALLER_DIR/uninstall-windows.bat" \
  "$INSTALLER_DIR/uninstall-windows.ps1" \
  "$INSTALLER_DIR/README.md" \
  "$STAGE/$TOP/"

cp "$SKILL_ZIP" "$STAGE/$TOP/payload/"
cp "$TEMPLATE"  "$STAGE/$TOP/payload/"

OUT="$DIST_SKILL/hwpx-mcp-installer-windows.zip"
rm -f "$OUT"

# Build zip via Python's zipfile instead of Info-ZIP's `zip`. Apple's bundled
# zip 3.0 was compiled without Unicode support, so it won't set the UTF-8 flag
# (general purpose bit 11) on entries. Without that flag, Windows Explorer's
# built-in extractor falls back to the OEM code page (949 on Korean Windows)
# and mojibakes filenames like "공문서_프레임.hwpx".
#
# Python 3's zipfile automatically sets bit 11 whenever a name isn't pure
# ASCII, which is exactly what Windows needs.
python3 - "$STAGE" "$TOP" "$OUT" <<'PYEOF'
import os, sys, zipfile
stage, top, out = sys.argv[1], sys.argv[2], sys.argv[3]
root = os.path.join(stage, top)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    # Emit directory entries first so Explorer shows a clean tree.
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        filenames.sort()
        rel_dir = os.path.relpath(dirpath, stage).replace(os.sep, '/')
        if rel_dir != '.':
            zf.writestr(zipfile.ZipInfo(rel_dir + '/'), b'')
        for name in filenames:
            abs_path = os.path.join(dirpath, name)
            arcname = os.path.relpath(abs_path, stage).replace(os.sep, '/')
            zf.write(abs_path, arcname)
PYEOF

echo ""
echo "[+] Built: $OUT"
ls -la "$OUT"
echo ""
echo "--- Archive contents ---"
unzip -l "$OUT"
