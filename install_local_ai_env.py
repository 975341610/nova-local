import os
import sys
import subprocess
import urllib.request
import re

def get_latest_cpu_wheel_url():
    # Use jllllll CPU release page
    url = "https://github.com/jllllll/llama-cpp-python-cuBLAS-wheels/releases/expanded_assets/cpu"
    print(f"[*] Fetching latest release info from {url} ...")
    
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
            
            # Find cp311-cp311-win_amd64 wheel link
            # format usually: /jllllll/llama-cpp-python-cuBLAS-wheels/releases/download/cpu/llama_cpp_python-0.3.2+cpu-cp311-cp311-win_amd64.whl
            matches = re.findall(r'href="([^"]*cp311-cp311-win_amd64\.whl)"', html)
            if matches:
                # Get the first match
                return "https://github.com" + matches[0]
            else:
                print("[!] Could not find a matching wheel for cp311 win_amd64 on the release page.")
                return None
    except Exception as e:
        print(f"[!] Failed to fetch release page: {e}")
        return None

def download_wheel(url):
    filename = url.split('/')[-1]
    
    print(f"[*] Downloading pre-compiled wheel: {filename} ...")
    print(f"    URL: {url}")
    
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response, open(filename, 'wb') as out_file:
            # Note: We don't read entirely into memory
            import shutil
            shutil.copyfileobj(response, out_file)
        
        print(f"[*] Download completed: {filename}")
        return filename
    except Exception as e:
        print(f"[!] Failed to download: {e}")
        return None

def install_wheel(filename):
    print(f"[*] Installing {filename}...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", filename, "--force-reinstall", "--no-cache-dir"])
        print("[*] Installation successful!")
        if os.path.exists(filename):
            os.remove(filename)
        return True
    except subprocess.CalledProcessError as e:
        print(f"[!] Installation failed: {e}")
        return False

if __name__ == "__main__":
    if sys.version_info.major != 3 or sys.version_info.minor != 11:
        print("[!] This script requires Python 3.11. You are running Python {}.{}".format(sys.version_info.major, sys.version_info.minor))
        sys.exit(1)
        
    print("=== Second Brain AI: Local AI Environment Installer (CPU Mode) ===")
    wheel_url = get_latest_cpu_wheel_url()
    
    if wheel_url:
        wheel_file = download_wheel(wheel_url)
        if wheel_file:
            install_wheel(wheel_file)
            print("\n[*] All set! You can now start the backend with: python start_backend.py")
            sys.exit(0)
            
    print("\n[!] Auto-installer failed. Please manually download the wheel from:")
    print("    https://github.com/jllllll/llama-cpp-python-cuBLAS-wheels/releases/tag/cpu")
    print("    Look for a file ending with: cp311-cp311-win_amd64.whl")
    print("    Then install it using: pip install <downloaded_file>")
