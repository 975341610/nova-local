import urllib.request
import re

def find_basic_wheel(verbose=False):
    url = "https://jllllll.github.io/llama-cpp-python-cuBLAS-wheels/basic/cpu/"
    if verbose:
        print(f"[*] Searching for basic CPU wheels at: {url}")
    
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            html = response.read().decode('utf-8')
            
        # Look for llama_cpp_python-0.3.19-cp311-cp311-win_amd64.whl
        pattern = r'href="(llama_cpp_python-0\.3\.19-cp311-cp311-win_amd64\.whl)"'
        matches = re.findall(pattern, html)
        
        if matches:
            wheel_name = matches[0]
            full_url = url + wheel_name
            if verbose:
                print(f"[+] Found compatible basic wheel: {full_url}")
            return full_url
        else:
            if verbose:
                print("[!] Could not find exact match for 0.3.19 and cp311 in basic/cpu.")
            return None
    except Exception as e:
        if verbose:
            print(f"[!] Error searching for wheel: {e}")
        return None

if __name__ == "__main__":
    wheel_url = find_basic_wheel(verbose=False)
    if wheel_url:
        print(f"RESULT_URL={wheel_url}")
    else:
        print("RESULT_URL=NONE")
