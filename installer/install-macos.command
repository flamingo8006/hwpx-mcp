#!/usr/bin/env bash
# Double-clickable wrapper around install-macos.sh.
# Finder runs *.command files in Terminal, so this is the user-friendly entry.
#
# We deliberately do NOT use `set -e` here: if the installer fails, we still
# want to reach the banner and the trailing `read` so testers can see the
# exit code and any error output before Terminal closes.
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER="$SCRIPT_DIR/install-macos.sh"

if [ ! -f "$INSTALLER" ]; then
  echo "[ERROR] install-macos.sh not found next to this file."
  echo "        Expected: $INSTALLER"
  echo
  read -r -p "Press Enter to close..."
  exit 1
fi

# Strip quarantine bits from the bundle so Gatekeeper does not block us on
# subsequent runs. Quietly ignore failures (quarantine attr may not be set).
xattr -d com.apple.quarantine "$INSTALLER" 2>/dev/null || true
xattr -d com.apple.quarantine "${BASH_SOURCE[0]}" 2>/dev/null || true

echo "=== hwpx-mcp installer ==="
echo
chmod +x "$INSTALLER" 2>/dev/null || true
bash "$INSTALLER"
EXITCODE=$?

echo
if [ "$EXITCODE" -eq 0 ]; then
  echo "[OK] Installation finished. Please fully quit (Cmd+Q) and reopen Claude Desktop."
else
  echo "[FAIL] Installer exited with code $EXITCODE. See messages above."
fi
echo
read -r -p "Press Enter to close this window..."
exit "$EXITCODE"
