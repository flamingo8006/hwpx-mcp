@echo off
REM hwpx-mcp uninstaller - Windows batch entry point.

chcp 65001 > nul
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%uninstall-windows.ps1"

if not exist "%PS_SCRIPT%" (
    echo [ERROR] uninstall-windows.ps1 not found next to this batch file.
    pause
    exit /b 1
)

echo === hwpx-mcp uninstaller ===
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
set "EXITCODE=%ERRORLEVEL%"

echo.
if "%EXITCODE%"=="0" (
    echo [OK] Uninstall finished. Restart Claude Desktop to drop the hwpx MCP entry.
) else (
    echo [FAIL] Uninstaller exited with code %EXITCODE%.
)
echo.
pause
exit /b %EXITCODE%
