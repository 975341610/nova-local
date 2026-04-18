from llama_cpp import Llama
import os
import sys

llm = Llama(
    model_path=str("/workspace/iris_4313d091-e484-4384-8564-8ce91e478bc4/nova_repo/data/models/gemma-4-E2B-it-Q4_K_M.gguf"),
    n_ctx=2048,
    n_threads=4,
    verbose=False
)

prompt = "<start_of_turn>user\nHi!<end_of_turn>\n<start_of_turn>model\n"
response = llm.create_completion(prompt=prompt, max_tokens=100)
print("RESPONSE:", response["choices"][0]["text"])

