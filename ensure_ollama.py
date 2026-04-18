import os
import urllib.request
import zipfile
import sys
import shutil
import json
import subprocess

MIN_REQUIRED_OLLAMA_VERSION = "0.1.29"

def get_local_ollama_version(ollama_exe):
    if not os.path.exists(ollama_exe):
        return None
    try:
        result = subprocess.run([ollama_exe, "--version"], capture_output=True, text=True, check=True)
        # Output is usually "ollama version is 0.1.29"
        version_str = result.stdout.strip().split()[-1]
        return version_str
    except Exception as e:
        print(f"[!] Error checking local Ollama version: {e}")
        return None

def is_version_older(current, required):
    if not current: return True
    def parse_version(v):
        # Remove 'v' prefix if present
        v = v.lstrip('v')
        return [int(x) for x in v.split('.')]
    
    try:
        curr_parts = parse_version(current)
        req_parts = parse_version(required)
        for c, r in zip(curr_parts, req_parts):
            if c < r: return True
            if c > r: return False
        return len(curr_parts) < len(req_parts)
    except:
        return True

def get_latest_ollama_version():
    print("[*] Checking latest Ollama version from GitHub...")
    try:
        url = "https://api.github.com/repos/ollama/ollama/releases/latest"
        headers = {"User-Agent": "Mozilla/5.0"}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
            return data["tag_name"]
    except Exception as e:
        print(f"[!] Failed to fetch latest version: {e}. Falling back to v0.20.5")
        return "v0.20.5"

def download_with_progress(url, dest):
    print(f"[*] Downloading Ollama engine from {url}...")
    def reporthook(count, block_size, total_size):
        percent = int(count * block_size * 100 / total_size) if total_size > 0 else 0
        sys.stdout.write(f"\r[*] Progress: {percent}%")
        sys.stdout.flush()
        
    urllib.request.urlretrieve(url, dest, reporthook=reporthook)
    print("\n[*] Download completed.")

def install_ollama(force=False):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "data")
    config_path = os.path.join(data_dir, "ai_config.json")
    
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                config = json.load(f)
                if not config.get("enabled", True):
                    print("[*] AI is disabled in ai_config.json")
                    sys.exit(2)
        except Exception as e:
            print(f"[!] Error reading ai_config.json: {e}")

    bin_dir = os.path.join(base_dir, "bin")
    os.makedirs(bin_dir, exist_ok=True)
    ollama_exe = os.path.join(bin_dir, "ollama.exe")
    
    version_file = os.path.join(bin_dir, "ollama_version.txt")
    
    # 检查本地版本
    local_version = get_local_ollama_version(ollama_exe)
    if not force and local_version:
        if not is_version_older(local_version, MIN_REQUIRED_OLLAMA_VERSION):
            print(f"[*] Integrated Ollama engine (v{local_version}) meets minimum requirements (v{MIN_REQUIRED_OLLAMA_VERSION}). Ready.")
            return

    current_version = get_latest_ollama_version()
    print(f"[*] Target Ollama version: {current_version}")

    if os.path.exists(ollama_exe):
        # 检查是否为旧版本，如果是旧版本，我们需要重新下载
        if os.path.exists(version_file):
            with open(version_file, "r") as f:
                if f.read().strip() == current_version and not force:
                    print("[*] Integrated Ollama engine is already at latest version.")
                    return
        print("[*] Upgrading integrated Ollama engine...")
    else:
        print("[*] Setting up integrated Ollama engine (First time only)...")
        
    url = f"https://github.com/ollama/ollama/releases/download/{current_version}/ollama-windows-amd64.zip"
    zip_path = os.path.join(bin_dir, "ollama.zip")
    
    try:
        download_with_progress(url, zip_path)
        print("[*] Extracting Ollama engine...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for item in zip_ref.namelist():
                # 跳过根目录，直接解压到 bin_dir
                target_path = os.path.join(bin_dir, item)
                if item.endswith('/'):
                    os.makedirs(target_path, exist_ok=True)
                    continue
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                source = zip_ref.open(item)
                target = open(target_path, "wb")
                with source, target:
                    shutil.copyfileobj(source, target)
        os.remove(zip_path)
        with open(version_file, "w") as f:
            f.write(current_version)
        print("[*] Ollama engine successfully integrated into Nova.")
    except Exception as e:
        print(f"[!] Failed to download or extract Ollama: {e}")
        if os.path.exists(zip_path):
            os.remove(zip_path)
        sys.exit(1)

if __name__ == "__main__":
    force_update = "--force" in sys.argv
    install_ollama(force=force_update)
