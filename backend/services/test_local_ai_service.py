import asyncio
import os
import sys
from pathlib import Path

# 添加 nova_repo/ 作为根目录
PROJECT_ROOT = Path("/workspace/iris_4313d091-e484-4384-8564-8ce91e478bc4/nova_repo")
sys.path.append(str(PROJECT_ROOT))

# 尝试导入
try:
    from backend.services.local_ai import local_ai_manager
except ImportError as e:
    print(f"Import failed: {e}")
    print(f"Current sys.path: {sys.path}")
    sys.exit(1)

async def test_local_ai():
    print("--- Local AI Initialization Test ---")
    status = local_ai_manager.get_status()
    print(f"Initial Status: {status}")
    
    print("\nStarting initialization (Download & Load)...")
    # 为了测试，我们只加载模型，跳过大文件下载如果环境不支持
    # 或者如果已经下载好了。
    await local_ai_manager.initialize_model()
    
    status = local_ai_manager.get_status()
    print(f"Post-Init Status: {status}")
    
    if status["is_ready"]:
        print("\n--- Generation Test ---")
        messages = [
            {"role": "user", "content": "你好，请自我介绍一下。"}
        ]
        print("Prompt: 你好，请自我介绍一下。")
        print("Response: ", end="", flush=True)
        async for chunk in local_ai_manager.generate_chat_stream(messages):
            print(chunk, end="", flush=True)
        print("\n\nTest completed successfully.")
    else:
        print(f"\nTest failed: {status['error']}")

if __name__ == "__main__":
    asyncio.run(test_local_ai())
