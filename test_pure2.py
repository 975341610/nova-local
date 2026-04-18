from llama_cpp import Llama
llm = Llama(
    model_path=str("/workspace/iris_4313d091-e484-4384-8564-8ce91e478bc4/nova_repo/data/models/gemma-4-E2B-it-Q4_K_M.gguf"),
    n_ctx=2048,
    n_threads=4,
    verbose=False
)
response = llm.create_chat_completion(
    messages=[
        {"role": "user", "content": "Hi!"}
    ],
    max_tokens=100
)
print("RESPONSE:", response["choices"][0]["message"]["content"])
