#!/usr/bin/env bash
# Double-clickable wrapper around uninstall-macos.sh.
#
# We deliberately do NOT use `set -e` here: if the uninstaller fails, we
# still want to reach the banner and the trailing `read` so testers can see
# the exit code before Terminal closes.
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
UNINSTALLER="$SCRIPT_DIR/uninstall-macos.sh"

if [ ! -f "$UNINSTALLER" ]; then
  echo "[ERROR] uninstall-macos.sh not found next to this file."
  echo "        Expected: $UNINSTALLER"
  echo
  read -r -p "Press Enter to close..."
  exit 1
fi

xattr -d com.apple.quarantine "$UNINSTALLER" 2>/dev/null || true
xattr -d com.apple.quarantine "${BASH_SOURCE[0]}" 2>/dev/null || true

echo "=== hwpx-mcp uninstaller ==="
echo
chmod +x "$UNINSTALLER" 2>/dev/null || true
bash "$UNINSTALLER"
EXITCODE=$?

echo
if [ "$EXITCODE" -eq 0 ]; then
  echo "[OK] Uninstall finished. Restart Claude Desktop to drop the hwpx MCP entry."
else
  echo "[FAIL] Uninstaller exited with code $EXITCODE."
fi
echo
read -r -p "Press Enter to close this window..."
exit "$EXITCODE"
