import requests
import os
import time

def test_open_file_api():
    base_url = "http://127.0.0.1:8765/api"
    
    # 1. 创建一个临时文件
    test_file = "test_open.txt"
    with open(test_file, "w") as f:
        f.write("Hello from test_open_file_api")
    
    abs_path = os.path.abspath(test_file)
    print(f"Testing open-file for: {abs_path}")
    
    try:
        # 2. 调用 API
        # 注意：这里假设后端已经在运行，如果没运行这个测试会失败
        # 在实际环境中，我们通常在集成测试中启动服务器
        response = requests.post(f"{base_url}/system/open-file", json={"path": abs_path})
        print(f"Response: {response.status_code}, {response.json()}")
        
        if response.status_code == 200:
            print("Successfully requested to open file!")
        else:
            print("Failed to open file via API.")
            
    except Exception as e:
        print(f"Error connecting to backend: {e}")
    finally:
        # 清理
        if os.path.exists(test_file):
            os.remove(test_file)

if __name__ == "__main__":
    # 这个脚本仅用于说明测试逻辑，因为后端可能没起
    print("This is a manual verification script for the open-file API.")
    # test_open_file_api() 
