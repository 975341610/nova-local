@echo off
setlocal
chcp 65001 >nul

set "ROOT=%~dp0"
set "SCRIPT=%ROOT%scripts\package_release.ps1"
set "DEFAULT_SIGN_KEY=%ROOT%dist\keys\nova-release-2026-05.pem"
set "DEFAULT_SIGNING_KEY_ID=nova-release-2026-05"
set "VERSION=%~1"
set "MODE=%~2"
set "INTERACTIVE=0"
set "PUBLIC_ARG="
if not "%PUBLIC_BASE_URL%"=="" set "PUBLIC_ARG=-PublicBaseUrl %PUBLIC_BASE_URL%"

if "%VERSION%"=="" goto interactive
if "%MODE%"=="" set "MODE=release"

if /I "%MODE%"=="dev" goto dev
if /I "%MODE%"=="release" goto release
goto usage

:interactive
set "INTERACTIVE=1"
echo Nova signed update package builder
echo.
echo This window opened because no command-line arguments were provided.
echo.
set /p VERSION=Enter target version, for example 0.23.6: 
if "%VERSION%"=="" (
  echo [ERROR] Version cannot be empty.
  goto finish_error
)
set /p MODE=Enter mode [release/dev], default release: 
if "%MODE%"=="" set "MODE=release"
if /I "%MODE%"=="dev" goto dev
if /I "%MODE%"=="release" goto release
echo [ERROR] Unknown mode: %MODE%
goto usage

:release
if "%SIGN_KEY%"=="" (
  if exist "%DEFAULT_SIGN_KEY%" (
    set "SIGN_KEY=%DEFAULT_SIGN_KEY%"
    echo [INFO] Using bundled local release signing key: %DEFAULT_SIGN_KEY%
  ) else (
    echo [ERROR] Missing environment variable SIGN_KEY.
    echo [FIX] Run:
    echo       set SIGN_KEY=C:\keys\nova-release.pem
    echo       set SIGNING_KEY_ID=nova-release-2026-05
    echo       package_release.bat %VERSION% release
    goto finish_error
  )
)
if "%SIGNING_KEY_ID%"=="" (
  set "SIGNING_KEY_ID=%DEFAULT_SIGNING_KEY_ID%"
  echo [INFO] Using bundled local release signing key id: %DEFAULT_SIGNING_KEY_ID%
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Version "%VERSION%" -SignKey "%SIGN_KEY%" -SigningKeyId "%SIGNING_KEY_ID%" %PUBLIC_ARG%
goto finish

:dev
echo [WARN] Building an unsigned development package. Signed clients will reject it in Settings update.
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Version "%VERSION%" -UnsignedDevPackage -NoVersionBump %PUBLIC_ARG%
goto finish

:usage
echo Usage:
echo   package_release.bat 0.24.0 release
echo   package_release.bat 0.24.0 dev
echo.
echo Release mode requires:
echo   set SIGN_KEY=C:\keys\nova-release.pem
echo   set SIGNING_KEY_ID=nova-release-2026-05
echo   set PUBLIC_BASE_URL=https://example.com/nova/updates
echo.
echo Notes:
echo   release creates a signed package for Settings -^> Update.
echo   dev     creates an unsigned package for local packaging tests only.
echo   If dist\keys\nova-release-2026-05.pem exists, release mode uses it by default.
goto finish_error

:finish
set "EXIT_CODE=%ERRORLEVEL%"
if "%INTERACTIVE%"=="1" (
  echo.
  if "%EXIT_CODE%"=="0" (
    echo [OK] Packaging command finished successfully.
  ) else (
    echo [ERROR] Packaging command failed with exit code %EXIT_CODE%.
  )
  echo Press any key to close this window.
  pause >nul
)
exit /b %EXIT_CODE%

:finish_error
set "EXIT_CODE=2"
if "%INTERACTIVE%"=="1" (
  echo.
  echo Press any key to close this window.
  pause >nul
)
exit /b %EXIT_CODE%
