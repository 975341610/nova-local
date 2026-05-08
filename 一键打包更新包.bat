@echo off
setlocal
call "%~dp0package_release.bat" %*
exit /b %ERRORLEVEL%
