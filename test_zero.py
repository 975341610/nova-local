from llama_cpp import Llama
llm = Llama(
    model_path=str("/workspace/iris_4313d091-e484-4384-8564-8ce91e478bc4/nova_repo/data/models/gemma-4-E2B-it-Q4_K_M.gguf"),
    n_ctx=2048,
    verbose=False
)
system_content = """You are an API. Reply ONLY with ONE valid XML tag.
Map user intent:
Title change -> <Action type="set_title">TITLE</Action>
Code block -> <Action type="insert_code_block" language="LANG">CODE</Action>
Todo list -> <Action type="insert_todo">TODO</Action>
Normal text -> <Action type="insert_text">TEXT</Action>
"""
messages=[
    {"role": "system", "content": system_content},
    {"role": "user", "content": "把标题改成会议记录"}
]
print("TEST 1:", llm.create_chat_completion(messages=messages, max_tokens=100)["choices"][0]["message"]["content"])

messages=[
    {"role": "system", "content": system_content},
    {"role": "user", "content": "加一个待办：买牛奶"}
]
print("TEST 2:", llm.create_chat_completion(messages=messages, max_tokens=100)["choices"][0]["message"]["content"])

messages=[
    {"role": "system", "content": system_content},
    {"role": "user", "content": "写一段python冒泡排序"}
]
print("TEST 3:", llm.create_chat_completion(messages=messages, max_tokens=100)["choices"][0]["message"]["content"])

