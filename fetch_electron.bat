@echo off
setlocal enabledelayedexpansion

set "APP_ROOT=%~dp0"
cd /d "%APP_ROOT%"

set "ELECTRON_VERSION=v36.2.1"
set "ELECTRON_URL=https://github.com/electron/electron/releases/download/%ELECTRON_VERSION%/electron-%ELECTRON_VERSION%-win32-x64.zip"
set "ELECTRON_RUNTIME_DIR=%APP_ROOT%electron\runtime"
set "ELECTRON_ZIP=%APP_ROOT%electron_runtime_download.zip"

echo ==========================================
echo   Nova - Download Electron Runtime
echo ==========================================
echo [*] Target: %ELECTRON_VERSION% (win32-x64)
echo [*] Destination: %ELECTRON_RUNTIME_DIR%
echo.

if exist "%ELECTRON_RUNTIME_DIR%" (
    echo [*] Cleaning existing runtime directory...
    rd /s /q "%ELECTRON_RUNTIME_DIR%"
)

mkdir "%ELECTRON_RUNTIME_DIR%"

echo [*] Downloading Electron runtime... ^(~120 MB^)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '%ELECTRON_URL%' -OutFile '%ELECTRON_ZIP%'"
if errorlevel 1 (
    echo [!] Download failed. Please check your network or proxy settings.
    pause
    exit /b 1
)

echo [*] Extracting...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Expand-Archive -Force -Path '%ELECTRON_ZIP%' -DestinationPath '%ELECTRON_RUNTIME_DIR%'"
if errorlevel 1 (
    echo [!] Extraction failed.
    pause
    exit /b 1
)

del /f /q "%ELECTRON_ZIP%" >nul 2>&1

if not exist "%ELECTRON_RUNTIME_DIR%\electron.exe" (
    echo [!] electron.exe not found after extraction.
    pause
    exit /b 1
)

for %%F in ("%ELECTRON_RUNTIME_DIR%\electron.exe") do (
    if %%~zF LSS 1048576 (
        echo [!] electron.exe is suspiciously small ^(%%~zF bytes^).
        pause
        exit /b 1
    ) else (
        echo [OK] electron.exe %%~zF bytes
    )
)

echo.
echo [OK] Electron runtime installed successfully.
echo [*] You can now run start_windows.bat to launch Nova.
pause
