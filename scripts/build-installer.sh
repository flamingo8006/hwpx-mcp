#!/usr/bin/env bash
# Builds the hwpx-mcp installer zips from installer/ + dist-skill/.
#
# Inputs (must already exist under dist-skill/):
#   - hwpx-document-writer.zip   (skill payload)
#   - 공문서_프레임.hwpx          (template payload)
#
# Outputs:
#   dist-skill/hwpx-mcp-installer-windows.zip
#   dist-skill/hwpx-mcp-installer-macos.zip
#
# Run from anywhere:
#   bash scripts/build-installer.sh                 # build both
#   bash scripts/build-installer.sh windows         # build Windows only
#   bash scripts/build-installer.sh macos           # build macOS only
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALLER_DIR="$REPO_ROOT/installer"

# dist-skill/ is gitignored and lives in the main worktree. From a side
# worktree, point HWPX_DIST_SKILL at the main repo's dist-skill/ folder.
DIST_SKILL="${HWPX_DIST_SKILL:-$REPO_ROOT/dist-skill}"

SKILL_ZIP="$DIST_SKILL/hwpx-document-writer.zip"
TEMPLATE="$DIST_SKILL/공문서_프레임.hwpx"

TARGET="${1:-all}"
case "$TARGET" in
  all|windows|macos) ;;
  *)
    echo "Usage: $0 [all|windows|macos]" >&2
    exit 64
    ;;
esac

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
# Helper: zip a staged tree using Python's zipfile
#
# Why not Info-ZIP's `zip`? Apple's bundled zip 3.0 was compiled without
# Unicode support, so it does not set general-purpose bit 11 (UTF-8) on
# entries. Without that flag Windows Explorer's built-in extractor falls back
# to the OEM code page (949 on Korean Windows) and mojibakes filenames like
# "공문서_프레임.hwpx".
#
# Python 3's zipfile sets bit 11 automatically when names are non-ASCII, and
# also lets us preserve unix executable bits for *.sh / *.command files
# (Info-ZIP would also do that, but we need the UTF-8 fix anyway).
# ---------------------------------------------------------------------------
zip_stage() {
  local stage="$1" top="$2" out="$3"
  rm -f -- "$out"
  python3 - "$stage" "$top" "$out" <<'PYEOF'
import os, sys, zipfile

stage, top, out = sys.argv[1], sys.argv[2], sys.argv[3]
root = os.path.join(stage, top)

EXEC_EXTS = {'.sh', '.command'}

# external_attr layout: (unix_mode << 16) | dos_flags
# dos_flags 0x10 marks the entry as a subdirectory; without it, some Windows
# tooling treats the entry as a file. unix mode <<16 lets macOS/Linux extract
# with the right permissions.
DIR_ATTR  = (0o755 << 16) | 0x10
EXEC_ATTR = (0o755 << 16)
FILE_ATTR = (0o644 << 16)

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    # Emit directory entries first so Explorer/Finder show a clean tree.
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        filenames.sort()
        rel_dir = os.path.relpath(dirpath, stage).replace(os.sep, '/')
        if rel_dir != '.':
            zi = zipfile.ZipInfo(rel_dir + '/')
            zi.external_attr = DIR_ATTR
            zf.writestr(zi, b'')
        for name in filenames:
            abs_path = os.path.join(dirpath, name)
            arcname = os.path.relpath(abs_path, stage).replace(os.sep, '/')
            ext = os.path.splitext(name)[1].lower()
            with open(abs_path, 'rb') as fh:
                data = fh.read()
            zi = zipfile.ZipInfo.from_file(abs_path, arcname)
            zi.external_attr = EXEC_ATTR if ext in EXEC_EXTS else FILE_ATTR
            zf.writestr(zi, data, zipfile.ZIP_DEFLATED)
PYEOF
}

build_windows() {
  STAGE="$(mktemp -d -t hwpx-installer-XXXXXX)"
  trap 'rm -rf "$STAGE"' RETURN
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
  zip_stage "$STAGE" "$TOP" "$OUT"

  echo ""
  echo "[+] Built: $OUT"
  ls -la "$OUT"
  echo ""
  echo "--- Archive contents ---"
  unzip -l "$OUT"
  rm -rf "$STAGE"
  trap - RETURN
}

build_macos() {
  STAGE="$(mktemp -d -t hwpx-installer-XXXXXX)"
  trap 'rm -rf "$STAGE"' RETURN
  TOP="hwpx-mcp-installer-macos"
  mkdir -p "$STAGE/$TOP/payload"

  cp \
    "$INSTALLER_DIR/install-macos.command" \
    "$INSTALLER_DIR/install-macos.sh" \
    "$INSTALLER_DIR/uninstall-macos.command" \
    "$INSTALLER_DIR/uninstall-macos.sh" \
    "$INSTALLER_DIR/README.md" \
    "$STAGE/$TOP/"

  cp "$SKILL_ZIP" "$STAGE/$TOP/payload/"
  cp "$TEMPLATE"  "$STAGE/$TOP/payload/"

  # Make sure exec bits are set on the source (we copy these into the zip
  # via zip_stage which forces 0755, but keep filesystem semantics consistent).
  chmod +x \
    "$STAGE/$TOP/install-macos.sh" \
    "$STAGE/$TOP/install-macos.command" \
    "$STAGE/$TOP/uninstall-macos.sh" \
    "$STAGE/$TOP/uninstall-macos.command"

  OUT="$DIST_SKILL/hwpx-mcp-installer-macos.zip"
  zip_stage "$STAGE" "$TOP" "$OUT"

  echo ""
  echo "[+] Built: $OUT"
  ls -la "$OUT"
  echo ""
  echo "--- Archive contents ---"
  unzip -l "$OUT"
  rm -rf "$STAGE"
  trap - RETURN
}

case "$TARGET" in
  windows) build_windows ;;
  macos)   build_macos ;;
  all)     build_windows; build_macos ;;
esac
