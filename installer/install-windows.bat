@echo off
REM hwpx-mcp installer - Windows batch entry point.
REM Double-click this file to run the PowerShell installer with the
REM permissions needed to update Claude Desktop's config.

chcp 65001 > nul
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%install-windows.ps1"

if not exist "%PS_SCRIPT%" (
    echo [ERROR] install-windows.ps1 not found next to this batch file.
    echo         Expected: %PS_SCRIPT%
    pause
    exit /b 1
)

echo === hwpx-mcp installer ===
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
set "EXITCODE=%ERRORLEVEL%"

echo.
if "%EXITCODE%"=="0" (
    echo [OK] Installation finished. Please fully quit and reopen Claude Desktop.
) else (
    echo [FAIL] Installer exited with code %EXITCODE%. See messages above.
)
echo.
pause
exit /b %EXITCODE%
