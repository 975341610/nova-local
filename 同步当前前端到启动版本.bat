@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo   Sync Nova frontend to current runtime
echo ==========================================
echo This is for development testing. It builds nova-block and mirrors
echo nova-block\dist to current\frontend_dist, which start_windows.bat loads.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync_dev_frontend.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] Frontend sync failed with exit code %EXIT_CODE%.
    echo [ERROR] Read the detailed reason above.
    pause
    exit /b %EXIT_CODE%
)

echo.
echo [OK] Frontend sync completed.
echo [NEXT] Close Nova and run start_windows.bat again.
pause
