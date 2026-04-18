from llama_cpp import Llama
llm = Llama(
    model_path=str("/workspace/iris_4313d091-e484-4384-8564-8ce91e478bc4/nova_repo/data/models/gemma-4-E2B-it-Q4_K_M.gguf"),
    n_ctx=2048,
    n_threads=4,
    verbose=False
)
system_content = """You are a low-level API interface. 
Output ONLY one <Action> tag. No other text.
Available:
<Action type="insert_code_block" language="...">code</Action>
<Action type="set_title">New Title</Action>
<Action type="insert_todo">task</Action>
"""
messages=[
    {"role": "system", "content": system_content},
    {"role": "user", "content": "【Create a python fibonacci function】"},
    {"role": "assistant", "content": "<Action type=\"insert_code_block\" language=\"python\">def fib(n):\n    if n <= 1: return n\n    return fib(n-1) + fib(n-2)</Action>"},
    {"role": "user", "content": "【把标题改为工作日志】"},
    {"role": "assistant", "content": "<Action type=\"set_title\">工作日志</Action>"},
    {"role": "user", "content": "【把标题改成会议记录】"}
]
response = llm.create_chat_completion(
    messages=messages,
    max_tokens=100
)
print("RESPONSE:", response["choices"][0]["message"]["content"])
