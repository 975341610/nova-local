from llama_cpp import Llama
from llama_cpp.llama_chat_format import get_chat_completion_template
llm = Llama(
    model_path=str("/workspace/iris_4313d091-e484-4384-8564-8ce91e478bc4/nova_repo/data/models/gemma-4-E2B-it-Q4_K_M.gguf"),
    n_ctx=2048,
    verbose=False
)
print("BOS:", llm.token_bos())
print("EOS:", llm.token_eos())

# I will just format the prompt manually using BOS
prompt = "<bos><start_of_turn>user\nHi!<end_of_turn>\n<start_of_turn>model\n"
prompt = prompt.replace("<bos>", llm.detokenize([llm.token_bos()]).decode("utf-8"))

response = llm.create_completion(prompt=prompt, max_tokens=100)
print("RESPONSE:", response["choices"][0]["text"])
