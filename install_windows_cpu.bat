@echo off
setlocal

echo ==========================================
echo [Nova] Windows CPU Installer for llama-cpp-python
echo ==========================================
echo This script will help you install a compatible version 
echo of llama-cpp-python for your CPU (no AVX2/AVX512 support).
echo.

echo [*] Step 1: Searching for a 'basic' pre-compiled wheel (jllllll/llama-cpp-python-cuBLAS-wheels)...
for /f "tokens=2 delims==" %%i in ('python find_basic_wheel.py ^| findstr "RESULT_URL="') do set WHEEL_URL=%%i

if "%WHEEL_URL%"=="NONE" (
    set WHEEL_URL=
)

if "%WHEEL_URL%"=="" (
    echo [!] Could not find an official 'basic' pre-compiled wheel automatically.
    echo [!] You may need to compile from source or find a wheel manually.
    goto MANUAL_COMPILE
)

echo [+] Found 'basic' wheel: %WHEEL_URL%
echo.
set /p choice="Do you want to install this 'basic' wheel? (Y/N): "
if /i "%choice%"=="Y" (
    echo [*] Uninstalling existing llama-cpp-python...
    python -m pip uninstall -y llama-cpp-python
    echo [*] Installing basic wheel...
    python -m pip install %WHEEL_URL% --force-reinstall --no-cache-dir
    echo.
    echo [+] Installation completed successfully.
    goto END
)

:MANUAL_COMPILE
echo.
echo ==========================================
echo [Manual Compilation Option]
echo ==========================================
echo If the pre-compiled wheel doesn't work, you can compile it locally.
echo This REQUIRES "Visual Studio C++ Build Tools" to be installed on your system.
echo.
set /p choice="Do you want to attempt local compilation? (Y/N): "
if /i "%choice%"=="Y" (
    echo [*] Uninstalling existing llama-cpp-python...
    python -m pip uninstall -y llama-cpp-python
    echo [*] Installing from source (this may take several minutes)...
    set CMAKE_ARGS="-DLLAMA_AVX2=OFF -DLLAMA_AVX512=OFF -DLLAMA_AVX=OFF"
    python -m pip install llama-cpp-python==0.3.19 --force-reinstall --no-cache-dir --verbose
    echo.
    echo [+] Source installation attempted. Please check for errors above.
)

:END
del wheel_info.txt
echo.
echo ==========================================
echo Installation process finished.
echo ==========================================
pause
