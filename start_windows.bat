@echo off
setlocal enabledelayedexpansion

set "APP_ROOT=%~dp0"
cd /d "%APP_ROOT%"

set OMP_NUM_THREADS=4
set OPENBLAS_NUM_THREADS=4
set ELECTRON_RUN_AS_NODE=

echo ==========================================
echo     Nova - One Click Desktop Start
echo ==========================================

python --version >nul 2>&1
if errorlevel 1 (
    echo [!] Python is not installed or not available in PATH.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo [*] Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [!] Failed to create .venv
        pause
        exit /b 1
    )
)

set "VENV_PYTHON=%APP_ROOT%\.venv\Scripts\python.exe"
set "CORE_STAMP_FILE=%APP_ROOT%\.venv\.nova_core_deps_installed"
set "CORE_REQ_FILE=%APP_ROOT%requirements-core.txt"

if not exist "%VENV_PYTHON%" (
    echo [!] Virtual environment looks incomplete. Recreating...
    if exist ".venv" rmdir /s /q ".venv"
    python -m venv .venv
    if errorlevel 1 (
        echo [!] Failed to recreate .venv
        pause
        exit /b 1
    )
)

if not exist "%CORE_STAMP_FILE%" (
    echo [*] Installing Python dependencies...
    if not exist "%CORE_REQ_FILE%" (
        echo [!] requirements-core.txt not found at:
        echo     %CORE_REQ_FILE%
        pause
        exit /b 1
    )

    "%VENV_PYTHON%" -m pip --version >nul 2>&1
    if errorlevel 1 (
        echo [!] pip is unavailable in the virtual environment.
        echo [!] Deleting and recreating .venv...
        if exist ".venv" rmdir /s /q ".venv"
        python -m venv .venv
        if errorlevel 1 (
            echo [!] Failed to recreate .venv
            pause
            exit /b 1
        )
        set "VENV_PYTHON=%APP_ROOT%\.venv\Scripts\python.exe"
    )

    echo [*] Using requirements file:
    echo     %CORE_REQ_FILE%
    "%VENV_PYTHON%" -m pip install -r "%CORE_REQ_FILE%" --disable-pip-version-check
    if errorlevel 1 (
        echo [!] Failed to install dependencies from:
        echo     %CORE_REQ_FILE%
        pause
        exit /b 1
    )

    > "%CORE_STAMP_FILE%" echo ok
)

"%VENV_PYTHON%" -c "import llama_cpp" >nul 2>&1
if errorlevel 1 (
    echo [*] Optional local AI runtime is not installed.
    echo [*] Nova note features will still start normally.
    echo [*] You can install it later with install_windows_cpu.bat
)

if not exist "frontend_dist\index.html" (
    echo [!] frontend_dist\index.html is missing.
    echo [!] This package expects a built frontend bundle.
    pause
    exit /b 1
)

if not exist "electron\main.js" (
    echo [!] electron\main.js is missing.
    pause
    exit /b 1
)

set "ELECTRON_RUNTIME_DIR=%APP_ROOT%electron\runtime"
set "ELECTRON_EXE=%ELECTRON_RUNTIME_DIR%\electron.exe"

REM -------- Detect Git LFS pointer / corrupted electron.exe --------
if exist "%ELECTRON_EXE%" call :check_exe_size
if not exist "%ELECTRON_EXE%" call :locate_runtime
if exist "%ELECTRON_EXE%" call :check_exe_size

if not exist "%ELECTRON_EXE%" (
    echo [!] Electron runtime not found or invalid.
    echo [!] Fix it with ONE of the following:
    echo     1^) cd nova-block ^&^& npm install
    echo     2^) Run fetch_electron.bat to download official runtime
    echo     3^) Manually download electron-v36.2.1-win32-x64.zip from
    echo        https://github.com/electron/electron/releases/tag/v36.2.1
    echo        and extract INTO %ELECTRON_RUNTIME_DIR%
    pause
    exit /b 1
)

echo [*] Launching Nova Electron desktop...
pushd "electron"
call "%ELECTRON_EXE%" .
set "NOVA_EXIT_CODE=%ERRORLEVEL%"
popd
if not "%NOVA_EXIT_CODE%"=="0" (
    echo [!] Nova desktop exited with code %NOVA_EXIT_CODE%.
    pause
    exit /b %NOVA_EXIT_CODE%
)
pause
exit /b 0

:check_exe_size
for %%F in ("%ELECTRON_EXE%") do set "ELECTRON_SIZE=%%~zF"
if not defined ELECTRON_SIZE goto :eof
if %ELECTRON_SIZE% LSS 1048576 (
    echo [!] electron.exe is only %ELECTRON_SIZE% bytes - treating as Git LFS pointer or corrupted.
    if exist "%ELECTRON_RUNTIME_DIR%" rd /s /q "%ELECTRON_RUNTIME_DIR%"
)
goto :eof

:locate_runtime
if exist "%APP_ROOT%nova-block\node_modules\electron\dist\electron.exe" (
    echo [*] Copying Electron runtime from local nova-block\node_modules...
    if not exist "%ELECTRON_RUNTIME_DIR%" mkdir "%ELECTRON_RUNTIME_DIR%"
    xcopy /E /I /Y "%APP_ROOT%nova-block\node_modules\electron\dist" "%ELECTRON_RUNTIME_DIR%" >nul
    goto :eof
)
if exist "C:\AI\nova\nova-block\node_modules\electron\dist\electron.exe" (
    echo [*] Copying Electron runtime from C:\AI\nova...
    if not exist "%ELECTRON_RUNTIME_DIR%" mkdir "%ELECTRON_RUNTIME_DIR%"
    xcopy /E /I /Y "C:\AI\nova\nova-block\node_modules\electron\dist" "%ELECTRON_RUNTIME_DIR%" >nul
    goto :eof
)
if exist "C:\AI\x\node_modules\electron\dist\electron.exe" (
    echo [*] Copying Electron runtime from C:\AI\x...
    if not exist "%ELECTRON_RUNTIME_DIR%" mkdir "%ELECTRON_RUNTIME_DIR%"
    xcopy /E /I /Y "C:\AI\x\node_modules\electron\dist" "%ELECTRON_RUNTIME_DIR%" >nul
    goto :eof
)
echo [!] No Electron runtime found in any known location.
goto :eof
