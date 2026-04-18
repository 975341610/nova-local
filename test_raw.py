import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.services.local_ai import local_ai_manager

async def test():
    print("Testing generate_chat_stream...")
    async for chunk in local_ai_manager.generate_chat_stream("【把标题改成会议记录】", action="ask"):
        print(repr(chunk))
        
    async for chunk in local_ai_manager.generate_chat_stream("【插入一个购物清单待办】", action="ask"):
        print(repr(chunk))

    async for chunk in local_ai_manager.generate_chat_stream("【写一个 Python 冒泡排序代码块】", action="ask"):
        print(repr(chunk))
        
    async for chunk in local_ai_manager.generate_chat_stream("【插入一段普通文本：今天继续推进 Nova】", action="ask"):
        print(repr(chunk))

asyncio.run(test())
