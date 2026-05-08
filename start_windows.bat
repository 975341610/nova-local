@echo off
rem Nova one-click launcher.
rem
rem v0.23.2: version-aware. If <APP_ROOT>\current\ points at a versioned slot
rem (created by the in-app updater or bootstrap_to_v0.23.1.ps1), we prefer
rem that slot's electron runtime + frontend bundle. Otherwise we fall back to
rem the legacy flat layout directly under APP_ROOT.
rem
rem NOTE: we intentionally avoid `!` inside message text. Delayed expansion
rem would otherwise eat `!` characters and produce garbled output.
setlocal enabledelayedexpansion

set "APP_ROOT=%~dp0"
cd /d "%APP_ROOT%"

set OMP_NUM_THREADS=4
set OPENBLAS_NUM_THREADS=4
set ELECTRON_RUN_AS_NODE=

rem NOVA_APP_ROOT tells main.js the true APP_ROOT even when __dirname resolves
rem through an NTFS junction (current -> versions\<ver>\electron) and lands on
rem the wrong path. Without this, bootstrapVersionedLayout nests versions\<ver>
rem inside itself and Nova fails to start.
set "NOVA_APP_ROOT=%APP_ROOT%"

echo ==========================================
echo     Nova - One Click Desktop Start
echo ==========================================

rem ---- Resolve active slot (current\ junction or flat root) ----
set "ACTIVE=%APP_ROOT%"
if exist "%APP_ROOT%current\VERSION.txt" (
    set "ACTIVE=%APP_ROOT%current\"
    echo [*] Using versioned slot: %APP_ROOT%current
) else (
    echo [*] Using flat layout at APP_ROOT
)

python --version >nul 2>&1
if errorlevel 1 (
    echo [x] Python is not installed or not available in PATH.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo [*] Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [x] Failed to create .venv
        pause
        exit /b 1
    )
)

set "VENV_PYTHON=%APP_ROOT%.venv\Scripts\python.exe"
set "CORE_STAMP_FILE=%APP_ROOT%.venv\.nova_core_deps_installed"
set "CORE_REQ_FILE=%APP_ROOT%requirements-core.txt"

if not exist "%VENV_PYTHON%" (
    echo [x] Virtual environment looks incomplete. Recreating...
    if exist ".venv" rmdir /s /q ".venv"
    python -m venv .venv
    if errorlevel 1 (
        echo [x] Failed to recreate .venv
        pause
        exit /b 1
    )
)

rem v0.23.4: re-install pip deps when requirements-core.txt has changed since
rem last install (e.g. an update bundle added cryptography). We hash the
rem requirements file and compare against the stamp; if mismatched, force a
rem re-install. This eliminates the "ModuleNotFoundError: cryptography" class
rem of bugs after a fresh .nova-update install.
set "CORE_REQ_HASH="
if exist "%CORE_REQ_FILE%" (
    for /f "delims=" %%H in ('certutil -hashfile "%CORE_REQ_FILE%" SHA1 ^| find /v ":" ^| find /v "CertUtil"') do (
        if not defined CORE_REQ_HASH set "CORE_REQ_HASH=%%H"
    )
    set "CORE_REQ_HASH=!CORE_REQ_HASH: =!"
)

set "STAMP_HASH="
if exist "%CORE_STAMP_FILE%" (
    set /p STAMP_HASH=<"%CORE_STAMP_FILE%"
)

if not "!CORE_REQ_HASH!"=="!STAMP_HASH!" (
    if exist "%CORE_STAMP_FILE%" (
        echo [*] requirements-core.txt has changed since last install - reinstalling...
    )
    if exist "%CORE_STAMP_FILE%" del /q "%CORE_STAMP_FILE%"
)

if not exist "%CORE_STAMP_FILE%" (
    echo [*] Installing Python dependencies...
    if not exist "%CORE_REQ_FILE%" (
        echo [x] requirements-core.txt not found at:
        echo     %CORE_REQ_FILE%
        pause
        exit /b 1
    )

    "%VENV_PYTHON%" -m pip --version >nul 2>&1
    if errorlevel 1 (
        echo [x] pip is unavailable in the virtual environment.
        echo [x] Deleting and recreating .venv...
        if exist ".venv" rmdir /s /q ".venv"
        python -m venv .venv
        if errorlevel 1 (
            echo [x] Failed to recreate .venv
            pause
            exit /b 1
        )
        set "VENV_PYTHON=%APP_ROOT%.venv\Scripts\python.exe"
    )

    echo [*] Using requirements file:
    echo     %CORE_REQ_FILE%
    "%VENV_PYTHON%" -m pip install -r "%CORE_REQ_FILE%" --disable-pip-version-check
    if errorlevel 1 (
        echo [x] Failed to install dependencies from:
        echo     %CORE_REQ_FILE%
        pause
        exit /b 1
    )

    > "%CORE_STAMP_FILE%" echo !CORE_REQ_HASH!
)

"%VENV_PYTHON%" -c "import llama_cpp" >nul 2>&1
if errorlevel 1 (
    echo [*] Optional local AI runtime is not installed.
    echo [*] Nova note features will still start normally.
    echo [*] You can install it later with install_windows_cpu.bat
)

if not exist "%ACTIVE%frontend_dist\index.html" (
    echo [x] frontend_dist\index.html is missing under:
    echo     %ACTIVE%
    echo [x] This install is broken.
    pause
    exit /b 1
)

if not exist "%ACTIVE%electron\main.js" (
    echo [x] electron\main.js is missing under:
    echo     %ACTIVE%
    pause
    exit /b 1
)

rem ---- electron\node_modules bootstrap (v0.23.3) ----
rem v0.23.3+ ships yaml + chokidar inside the update payload, but legacy
rem installs and dev checkouts may still be missing them. Detect a common
rem offender (yaml) and run `npm install --omit=dev` inside electron\ if
rem needed. This makes `.nova-update` installs auto-heal next boot instead
rem of throwing "Cannot find module 'yaml'".
if not exist "%ACTIVE%electron\node_modules\yaml\package.json" (
    echo [*] electron\node_modules\yaml not found - bootstrapping...
    where npm >nul 2>&1
    if errorlevel 1 (
        echo [!] npm is not on PATH. Skipping bootstrap.
        echo [!] If Electron fails with "Cannot find module 'yaml'", install
        echo [!] Node.js and re-run, or copy electron\node_modules from a
        echo [!] working install.
    ) else (
        pushd "%ACTIVE%electron"
        call npm install --omit=dev --no-audit --no-fund --ignore-scripts
        if errorlevel 1 (
            echo [!] npm install failed - Nova may fail to start.
        ) else (
            echo [*] electron\node_modules bootstrapped.
        )
        popd
    )
)

rem ---- Electron runtime lookup order ----
rem 1. active slot's own bundled runtime
rem 2. any other version slot's runtime (pick the newest)
rem 3. dev-time node_modules under nova-block\
set "ELECTRON_RUNTIME_DIR=%ACTIVE%electron\runtime"
set "ELECTRON_EXE=%ELECTRON_RUNTIME_DIR%\electron.exe"

if exist "%ELECTRON_EXE%" call :check_exe_size
if not exist "%ELECTRON_EXE%" call :locate_runtime
if exist "%ELECTRON_EXE%" call :check_exe_size

if not exist "%ELECTRON_EXE%" (
    echo [x] Electron runtime not found or invalid.
    echo [x] Fix it with ONE of the following:
    echo     1^) cd nova-block ^&^& npm install
    echo     2^) Run fetch_electron.bat to download official runtime
    echo     3^) Manually download electron-v36.2.1-win32-x64.zip from
    echo        https://github.com/electron/electron/releases/tag/v36.2.1
    echo        and extract INTO %ELECTRON_RUNTIME_DIR%
    pause
    exit /b 1
)

echo [*] Launching Nova Electron desktop...
pushd "%ACTIVE%electron"
call "%ELECTRON_EXE%" .
set "NOVA_EXIT_CODE=%ERRORLEVEL%"
popd
if not "%NOVA_EXIT_CODE%"=="0" (
    echo [x] Nova desktop exited with code %NOVA_EXIT_CODE%.
    pause
    exit /b %NOVA_EXIT_CODE%
)
pause
exit /b 0

:check_exe_size
for %%F in ("%ELECTRON_EXE%") do set "ELECTRON_SIZE=%%~zF"
if not defined ELECTRON_SIZE goto :eof
if %ELECTRON_SIZE% LSS 1048576 (
    echo [x] electron.exe is only %ELECTRON_SIZE% bytes - treating as Git LFS pointer or corrupted.
    if exist "%ELECTRON_RUNTIME_DIR%" rd /s /q "%ELECTRON_RUNTIME_DIR%"
)
goto :eof

:locate_runtime
rem 2a) other version slot
if exist "%APP_ROOT%versions" (
    for /f "delims=" %%D in ('dir /b /ad "%APP_ROOT%versions\" 2^>nul') do (
        if exist "%APP_ROOT%versions\%%D\electron\runtime\electron.exe" (
            echo [*] Copying Electron runtime from versions\%%D...
            if not exist "%ELECTRON_RUNTIME_DIR%" mkdir "%ELECTRON_RUNTIME_DIR%"
            xcopy /E /I /Y "%APP_ROOT%versions\%%D\electron\runtime" "%ELECTRON_RUNTIME_DIR%" >nul
            goto :eof
        )
    )
)
rem 2b) dev nova-block\node_modules
if exist "%APP_ROOT%nova-block\node_modules\electron\dist\electron.exe" (
    echo [*] Copying Electron runtime from local nova-block\node_modules...
    if not exist "%ELECTRON_RUNTIME_DIR%" mkdir "%ELECTRON_RUNTIME_DIR%"
    xcopy /E /I /Y "%APP_ROOT%nova-block\node_modules\electron\dist" "%ELECTRON_RUNTIME_DIR%" >nul
    goto :eof
)
echo [x] No Electron runtime found in any known location.
goto :eof
