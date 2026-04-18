import asyncio
import os
import sys

# Add backend to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.services.local_ai import local_ai_manager

async def test():
    await local_ai_manager.initialize_model()
    print("Testing generate_chat_stream...")
    async for chunk in local_ai_manager.generate_chat_stream("【把标题改成会议记录】", action="ask"):
        print(chunk, end='')

asyncio.run(test())
