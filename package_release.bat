@echo off
setlocal
chcp 65001 >nul

set "ROOT=%~dp0"
set "SCRIPT=%ROOT%scripts\package_release.ps1"
set "DEFAULT_SIGN_KEY=%ROOT%dist\keys\nova-release-2026-05.pem"
set "DEFAULT_SIGNING_KEY_ID=nova-release-2026-05"
set "MODE=%~2"
set "PUBLIC_ARG="
if not "%PUBLIC_BASE_URL%"=="" set "PUBLIC_ARG=-PublicBaseUrl %PUBLIC_BASE_URL%"

if "%~1"=="" goto usage
if "%MODE%"=="" set "MODE=release"

if /I "%MODE%"=="dev" goto dev
if /I "%MODE%"=="release" goto release
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
    echo       package_release.bat %~1 release
    exit /b 2
  )
)
if "%SIGNING_KEY_ID%"=="" (
  set "SIGNING_KEY_ID=%DEFAULT_SIGNING_KEY_ID%"
  echo [INFO] Using bundled local release signing key id: %DEFAULT_SIGNING_KEY_ID%
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Version "%~1" -SignKey "%SIGN_KEY%" -SigningKeyId "%SIGNING_KEY_ID%" %PUBLIC_ARG%
exit /b %ERRORLEVEL%

:dev
echo [WARN] Building an unsigned development package. Signed clients will reject it in Settings update.
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Version "%~1" -UnsignedDevPackage -NoVersionBump %PUBLIC_ARG%
exit /b %ERRORLEVEL%

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
exit /b 2
