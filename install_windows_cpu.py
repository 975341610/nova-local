import subprocess
import sys


def install_llama_cpp() -> bool:
    print("[*] Installing llama-cpp-python for Windows CPU...")
    # Use the official prebuilt CPython 3.11 Windows wheel to avoid source builds.
    whl_url = (
        "https://github.com/abetlen/llama-cpp-python/releases/download/"
        "v0.3.19/llama_cpp_python-0.3.19-cp311-cp311-win_amd64.whl"
    )

    command = [
        sys.executable,
        "-m",
        "pip",
        "install",
        whl_url,
        "--force-reinstall",
        "--no-cache-dir",
        "--timeout",
        "60",
    ]

    print(f"[*] Command: {' '.join(command)}")

    try:
        subprocess.check_call(command)
        print("\n[+] llama-cpp-python (CPU) installed successfully!")
        return True
    except subprocess.CalledProcessError as exc:
        print(f"\n[!] Installation failed with error code {exc.returncode}")
        return False


if __name__ == "__main__":
    if install_llama_cpp():
        print("\n[*] You can now start the Nova backend.")
    else:
        print("\n[!] Please ensure you have a stable internet connection.")
        sys.exit(1)
