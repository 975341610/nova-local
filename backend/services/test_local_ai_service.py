import asyncio
import os
import sys
from pathlib import Path

import pytest

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

async def run_local_ai_smoke_test():
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

@pytest.mark.skipif(
    os.environ.get("NOVA_RUN_LOCAL_AI_TEST") != "1",
    reason="Local AI smoke test downloads/loads a model; set NOVA_RUN_LOCAL_AI_TEST=1 to run it.",
)
def test_local_ai():
    asyncio.run(run_local_ai_smoke_test())


if __name__ == "__main__":
    asyncio.run(run_local_ai_smoke_test())
