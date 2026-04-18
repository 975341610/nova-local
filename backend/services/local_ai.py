try:
    from llama_cpp import Llama
except ImportError:
    Llama = None

import os
import threading
import asyncio
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, AsyncGenerator

# from huggingface_hub import hf_hub_download

from backend.config import get_settings

class LocalAIManager:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(LocalAIManager, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
            
        self.settings = get_settings()
        self.model_dir = self.settings.data_root / "models"
        self.model_path: Optional[Path] = None
        self.llm: Optional[Llama] = None
        self.is_loading = False
        self.is_ready = False
        self.error = None
        
        # 默认模型配置
        self.repo_id = "unsloth/gemma-4-E2B-it-GGUF"
        self.filename = "gemma-4-E2B-it-Q4_K_M.gguf"
        
        self._initialized = True

    def get_status(self):
        return {
            "is_ready": self.is_ready,
            "is_loading": self.is_loading,
            "error": self.error,
            "model_path": str(self.model_path) if self.model_path else None
        }

    async def _check_ollama_running(self) -> bool:
        """检查 Ollama 服务是否正在运行"""
        import httpx
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get("http://127.0.0.1:11434/api/tags", timeout=1.0)
                return resp.status_code == 200
            except:
                return False

    async def start_ollama_server(self):
        """启动集成的 Ollama 服务"""
        import subprocess
        import os
        from pathlib import Path
        import sys
        
        if sys.platform != "win32":
            print("[!] Local Ollama engine integration is currently only supported on Windows.")
            return False
            
        base_dir = Path(__file__).resolve().parent.parent.parent
        ollama_bin = base_dir / "bin" / "ollama.exe"
        if not ollama_bin.exists():
            print(f"[!] Ollama binary not found at {ollama_bin}")
            return False
            
        env = os.environ.copy()
        env["OLLAMA_HOST"] = "127.0.0.1:11434"
        env["OLLAMA_MODELS"] = str(base_dir / "data" / "ollama_models")
        
        print(f"[*] Starting Ollama server from {ollama_bin} in background...")
        try:
            if os.name == 'nt':
                # Windows: hide console window
                subprocess.Popen(
                    [str(ollama_bin), "serve"],
                    env=env,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            else:
                subprocess.Popen(
                    [str(ollama_bin), "serve"],
                    env=env,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            return True
        except Exception as e:
            print(f"[!] Error starting Ollama server: {e}")
            return False

    async def _ensure_ollama_model(self) -> bool:
        """确保本地 GGUF 模型已注册到 Ollama (nova-local)"""
        # 1. 检查 Ollama 服务是否可用，如果不可用尝试启动它
        is_running = await self._check_ollama_running()
        if not is_running:
            print("[*] Ollama not running, attempting to start it...")
            await self.start_ollama_server()
            # 等待几秒让服务启动
            for _ in range(5):
                await asyncio.sleep(1)
                if await self._check_ollama_running():
                    is_running = True
                    break
        
        if not is_running:
            print("[!] Failed to start or reach Ollama server.")
            return False

        if not self.model_path or not self.model_path.exists():
            return False
            
        model_name = "nova-local"
        try:
            import httpx
            
            # 2. 检查模型是否已存在
            async with httpx.AsyncClient() as client:
                try:
                    resp = await client.get("http://127.0.0.1:11434/api/tags", timeout=5.0)
                    if resp.status_code != 200:
                        return False
                    
                    # 检查模型是否已存在 (避免重复创建，但考虑到模板可能更新，我们可以根据配置决定是否强制覆盖)
                    models_data = resp.json().get("models", [])
                    # 暂时注释掉直接返回 True 的逻辑，确保新的 Modelfile(携带模板) 能够生效覆盖旧模型
                    # if any(m.get("name") == f"{model_name}:latest" or m.get("name") == model_name for m in models_data):
                    #    print(f"[*] Local model '{model_name}' is already registered in Ollama.")
                    #    return True
                except Exception as e:
                    print(f"[!] Ollama not reachable: {e}")
                    return False

            # 2. 创建 Modelfile 并注册
            print(f"[*] Registering local model to Ollama: {self.model_path}")
            # 注意: Windows 下 tempfile 可能有权限问题, 这里用简单的 context manager
            fd, modelfile_path = tempfile.mkstemp(suffix='.modelfile')
            try:
                with os.fdopen(fd, 'w', encoding='utf-8') as f:
                    # 路径转义，Windows 路径在 Modelfile 中需使用正斜杠
                    abs_path = str(self.model_path.absolute()).replace("\\", "/")
                    f.write(f'FROM "{abs_path}"\n')
                    # 为 Gemma 模型配置必须的模板和停止词，防止无限重复循环输出
                    f.write('TEMPLATE """<start_of_turn>user\n')
                    f.write('{{ if .System }}{{ .System }}\n')
                    f.write('{{ end }}{{ .Prompt }}<end_of_turn>\n')
                    f.write('<start_of_turn>model\n')
                    f.write('{{ .Response }}<end_of_turn>\n')
                    f.write('"""\n')
                    f.write('PARAMETER stop "<end_of_turn>"\n')
                    f.write('PARAMETER stop "<eos>"\n')
                    f.write('PARAMETER temperature 0.7\n')
                    f.write('PARAMETER top_p 0.9\n')
                
                # 寻找内置的 ollama.exe
                base_dir = Path(__file__).resolve().parent.parent.parent
                ollama_bin = base_dir / "bin" / "ollama.exe"
                ollama_cmd = str(ollama_bin) if ollama_bin.exists() else "ollama"

                # 执行 ollama create，传递环境变量
                env = os.environ.copy()
                env["OLLAMA_HOST"] = "127.0.0.1:11434"
                env["OLLAMA_MODELS"] = str(base_dir / "data" / "ollama_models")

                process = await asyncio.create_subprocess_exec(
                    ollama_cmd, "create", model_name, "-f", modelfile_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env
                )
                stdout, stderr = await process.communicate()
                
                if process.returncode == 0:
                    print(f"[*] Ollama create success: {stdout.decode().strip()}")
                    return True
                else:
                    print(f"[!] Ollama create failed: {stderr.decode().strip()}")
                    return False
            finally:
                if os.path.exists(modelfile_path):
                    os.remove(modelfile_path)
                    
        except Exception as e:
            print(f"[!] Error ensuring Ollama model: {e}")
            return False

    async def stop_ollama_server(self):
        """停止本地 Ollama 服务并释放资源"""
        print("[*] Stopping Ollama server and releasing resources...")
        self.is_ready = False
        self.llm = None
        
        try:
            import psutil
            import os
            import signal

            found = False
            # 1. 尝试终止所有相关的 ollama 进程
            for proc in psutil.process_iter(['pid', 'name', 'exe']):
                try:
                    # 匹配进程名或可执行路径中包含 'ollama' 的进程
                    name = proc.info.get('name', '').lower()
                    exe = (proc.info.get('exe') or '').lower()
                    
                    if 'ollama' in name or 'ollama' in exe:
                        print(f"[*] Found Ollama process: {proc.info['pid']} ({name})")
                        found = True
                        
                        # 尝试优雅终止
                        proc.terminate()
                        
                        # 等待一会看是否退出
                        try:
                            proc.wait(timeout=3)
                        except psutil.TimeoutExpired:
                            # 强制杀死
                            print(f"[!] Process {proc.info['pid']} did not terminate, killing...")
                            proc.kill()
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    continue

            if not found:
                print("[*] No active Ollama processes found to stop.")
            else:
                print("[*] All Ollama processes stopped successfully.")
            
            return True
        except Exception as e:
            print(f"[!] Failed to stop Ollama processes: {e}")
            return False

    def shutdown(self):
        """同步包装：释放资源并尝试停止本地 Ollama 进程"""
        print("[*] Local AI Manager shutting down...")
        self.is_ready = False
        self.llm = None
        
        # 由于 shutdown 通常在同步上下文（如析构或主进程退出）调用，
        # 我们这里使用同步方式执行清理
        try:
            import psutil
            for proc in psutil.process_iter(['name', 'exe']):
                try:
                    name = proc.info.get('name', '').lower()
                    exe = (proc.info.get('exe') or '').lower()
                    if 'ollama' in name or 'ollama' in exe:
                        print(f"[*] Terminating background process: {proc.info['pid']}")
                        proc.kill() # 退出时直接强制杀死
                except:
                    continue
        except Exception as e:
            print(f"[!] Failed to stop Ollama processes during shutdown: {e}")

    async def initialize_model(self):
        """异步初始化模型：直接加载本地预置模型"""
        if self.is_ready or self.is_loading:
            return
            
        self.is_loading = True
        self.error = None
        
        try:
            # 0. 读取 config
            preferred_engine = "auto"
            num_ctx = 8192
            config_path = self.settings.data_root / "ai_config.json"
            if config_path.exists():
                try:
                    import json
                    with open(config_path, "r") as f:
                        config = json.load(f)
                        preferred_engine = config.get("preferred_engine", "auto")
                        num_ctx = config.get("num_ctx", 8192)
                except:
                    pass

            # 1. 检查本地模型是否存在 (预置路径)
            self.model_path = self.model_dir / self.filename
            print(f"[*] Checking pre-installed model: {self.model_path}, preferred_engine: {preferred_engine}, num_ctx: {num_ctx}")
            
            if not self.model_path.exists():
                # 如果不存在，报错提示需要预置
                raise FileNotFoundError(f"Pre-installed model not found at {self.model_path}")
            
            # 2. 加载模型 (增加 Mock 逻辑以应对占位文件)
            file_size = self.model_path.stat().st_size
            if file_size == 0:
                print("[*] Detected placeholder model file (0 bytes). Entering Mock Mode.")
                self.llm = "MOCK_LLM"
            else:
                print(f"[*] Loading real model from {self.model_path}...")
                if Llama is None:
                    raise ImportError("llama-cpp-python not installed")
                
                # Preferred Engine Logic
                current_engine = None

                if preferred_engine == "ollama":
                    print("[*] preferred_engine is 'ollama'. Skipping llama_cpp and falling back to Ollama proxy.")
                    self.llm = "MOCK_LLM_ERROR"
                    current_engine = "ollama"
                else:
                    try:
                        # 第一阶段尝试：开启 GPU 全量加速
                        print(f"[*] Attempting GPU acceleration (n_gpu_layers=-1, n_ctx={num_ctx})...")
                        self.llm = Llama(
                            model_path=str(self.model_path),
                            n_ctx=num_ctx,
                            n_threads=os.cpu_count() or 4,
                            chat_format="gemma",
                            verbose=False,
                            n_gpu_layers=-1,
                            use_mmap=False,
                            use_mlock=False
                        )
                        print("[*] GPU acceleration enabled successfully.")
                        current_engine = "llama"
                    except (ValueError, OSError, RuntimeError, Exception) as e:
                        # 降级尝试：退回到安全 CPU 模式
                        print(f"[!] GPU initialization failed ({type(e).__name__}): {str(e)}")
                        # 对于 CPU 模式，我们如果用户设置的 num_ctx 太大，强制限制在 4096 以防内存溢出崩溃
                        safe_num_ctx = min(num_ctx, 4096)
                        print(f"[*] Falling back to CPU mode (n_gpu_layers=0, n_ctx={safe_num_ctx})...")
                        try:
                            self.llm = Llama(
                                model_path=str(self.model_path),
                                n_ctx=safe_num_ctx,
                                n_threads=1,
                                n_batch=128,
                                chat_format="gemma",
                                verbose=False,
                                n_gpu_layers=0,
                                use_mmap=False,
                                use_mlock=False
                            )
                            current_engine = "llama"
                        except Exception as e2:
                            # 终极保底
                            print(f"[!] CPU fallback also failed: {e2}. Entering Mock Error Mode (Ollama Proxy).")
                            self.llm = "MOCK_LLM_ERROR"
                            current_engine = "ollama"
                
                # Save the detected engine if it was 'auto'
                if preferred_engine == "auto" and current_engine:
                    print(f"[*] Auto-detected engine: {current_engine}. Saving to config.")
                    try:
                        import json
                        config_path = self.settings.data_root / "ai_config.json"
                        config = {}
                        if config_path.exists():
                            with open(config_path, "r") as f:
                                config = json.load(f)
                        config["preferred_engine"] = current_engine
                        with open(config_path, "w") as f:
                            json.dump(config, f, indent=2)
                    except:
                        pass

                if self.llm == "MOCK_LLM_ERROR":
                    # 在出错模式下，尝试提前为 Ollama 注册模型以减少后续响应延迟
                    print("[*] Pre-registering local model to Ollama for fallback...")
                    await self._ensure_ollama_model()
                        
            self.is_ready = True
            print("[*] Local AI Model is ready (Instantly).")
            
        except Exception as e:
            self.error = str(e)
            print(f"[!] Local AI initialization failed: {self.error}")
        finally:
            self.is_loading = False

    async def generate_chat_stream(self, prompt: str, context: Optional[str] = None, action: str = "ask") -> AsyncGenerator[str, None]:
        """Generate a chat stream using the local LLM."""
        print(f"[DEBUG] Local AI generating chat stream... action={action}, is_ready={self.is_ready}")
        
        # Support both full-width and half-width brackets for robustness
        is_editor_command = ("【" in prompt and "】" in prompt) or ("[" in prompt and "]" in prompt)
        print(f"[DEBUG] is_editor_command={is_editor_command}")
        
        system_prompts = {
            "continue": "You are a writing assistant. Continue writing the following text naturally. Return only the new text. CRITICAL: Do NOT repeat the input text, start directly with the continuation.",
            "expand": "You are a writing assistant. Expand the following text with more details and depth. Return only the expanded version.",
            "summarize": "You are a writing assistant. Summarize the following text concisely. Return only the summary.",
            "rewrite": "You are a writing assistant. Rewrite the following text to be more professional and clear. Return only the rewritten text. CRITICAL: Do NOT repeat the input text, return ONLY the rewritten result.",
            "translate": "You are a writing assistant. Translate the following text to Chinese (if it is English) or English (if it is Chinese). Return only the translation.",
            "outline": "You are a writing assistant. Generate a structured outline for the following topic or text. Return only the outline.",
            "ask": """You are a note-taking and personal knowledge base assistant. 
Based on the selected text and context, answer the user's intent or improve the text accordingly.

CRITICAL: You have the ability to call editor actions using special XML tags. 
- To set or update the note title: <Action type="set_title">New Title</Action>
- To update note tags: <Action type="set_tags">tag1, tag2, tag3</Action>
- To insert a code block: <Action type="insert_code_block" language="python">print("hello")</Action>
- To insert a task list: <Action type="insert_todo">task content</Action>

If the user asks to "set title", "rename", "give a title", or if the note is untitled and you're generating content, ALWAYS include the <Action type="set_title"> tag.
If the content suggests specific topics, include <Action type="set_tags">.

Return the text and any actions needed. Do not explain the actions to the user.
""",
            "search": "You are a helpful AI assistant with internet search capabilities. Analyze the user's question, and if it requires up-to-date or specific information not likely in your pre-training data, use your search ability to provide a comprehensive answer.",
        }
        
        system_content = system_prompts.get(action, "You are a helpful writing assistant.")
        
        if is_editor_command:
            system_content = """You are a low-level API interface for a note-taking app. 
Your task is to parse the user's intent and output EXACTLY ONE XML <Action> tag.
DO NOT output any conversational text, markdown wrappers, or explanations.

Available Actions:
<Action type="insert_code_block" language="...">code</Action>
<Action type="insert_todo">task</Action>
<Action type="insert_text">content</Action>
<Action type="set_title">New Title</Action>
<Action type="set_tags">tag1, tag2</Action>
"""
            print(f"[*] Detected Editor Command via 【】. Switching system content.")
            
            # Inject few-shot messages
            few_shot = [
                {"role": "user", "content": "【Create a python fibonacci function】"},
                {"role": "assistant", "content": "<Action type=\"insert_code_block\" language=\"python\">def fib(n):\n    if n <= 1: return n\n    return fib(n-1) + fib(n-2)</Action>"},
                {"role": "user", "content": "【把标题改为工作日志】"},
                {"role": "assistant", "content": "<Action type=\"set_title\">工作日志</Action>"},
                {"role": "user", "content": "【加个待办任务：买牛奶】"},
                {"role": "assistant", "content": "<Action type=\"insert_todo\">买牛奶</Action>"}
            ]
            messages = [{"role": "system", "content": system_content}] + few_shot
        else:
            messages = [{"role": "system", "content": system_content}]
        
        user_content = prompt
        if context:
            user_content = f"Context:\n{context}\n\nTask/Question:\n{prompt}"
        
        messages.append({"role": "user", "content": user_content})
        
        if action == "search":
            yield 'data: {"text": "[Searching the web for latest information...]\\n\\n"}\n\n'
            try:
                import urllib.parse
                import urllib.request
                import json
                search_query = urllib.parse.quote(prompt)
                req = urllib.request.Request(
                    f"https://html.duckduckgo.com/html/?q={search_query}",
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                )
                with urllib.request.urlopen(req, timeout=10) as response:
                    html = response.read().decode('utf-8')
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(html, 'html.parser')
                    snippets = [a.text for a in soup.find_all('a', class_='result__snippet')]
                    search_context = "\n".join(snippets[:5])
                    messages = [
                        {"role": "system", "content": system_prompts.get(action)},
                        {"role": "user", "content": f"Based on the following search results, please summarize and answer the user's question:\n\n{prompt}\n\nSearch Results:\n{search_context}"}
                    ]
            except Exception as e:
                yield f'data: {{"text": "\\n[Web search failed: {str(e)}. Falling back to local knowledge...]\\n"}}\n\n'
        
        # Yield an immediate ping to satisfy reverse proxy TTFB and flush any intermediate proxy buffers
        buffer_flush = " " * 4096
        yield f': ping {buffer_flush}\n\n'
        yield 'data: {"text": ""}\n\n'

        async for chunk in self.generate_chat_stream_messages(messages):
            import json
            if chunk == "":
                # Keep-alive ping, we can just send an empty SSE comment
                yield ': ping\n\n'
            else:
                yield f'data: {json.dumps({"text": chunk}, ensure_ascii=False)}\n\n'
            
        yield 'data: [DONE]\n\n'

    async def generate_chat_stream_messages(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        """流式生成对话 (更高效的非阻塞异步桥接)"""
        import asyncio
        if not self.is_ready or not self.llm:
            yield "Local AI model is not ready."
            return

        # Mock 模式下的响应
        if self.llm == "MOCK_LLM":
            mock_response = "你好！我是集成在本地的 Gemma 4 E2B IT 模型。由于当前处于演示环境，我正在使用 Mock 模式为您提供即时响应。我已经预置在系统中，可以帮您处理本地笔记和隐私数据。"
            for word in mock_response.split():
                yield word + " "
                await asyncio.sleep(0.05)
            return

        if self.llm == "MOCK_LLM_ERROR":
            # 自动将本项目 gguf 注册给 Ollama
            success = await self._ensure_ollama_model()
            model_to_use = "nova-local" if success else "gemma:2b"

            # 获取 num_ctx 配置
            num_ctx = 8192
            config_path = self.settings.data_root / "ai_config.json"
            if config_path.exists():
                try:
                    import json
                    with open(config_path, "r") as f:
                        config = json.load(f)
                        num_ctx = config.get("num_ctx", 8192)
                except:
                    pass

            # Try to connect to local Ollama if available
            try:
                import httpx
                import json
                print(f"[*] MOCK_LLM_ERROR detected. Attempting to connect to local Ollama (127.0.0.1:11434) using model '{model_to_use}' with num_ctx={num_ctx}...")
                
                ollama_url = "http://127.0.0.1:11434/api/chat"
                payload = {
                    "model": model_to_use,
                    "messages": messages,
                    "stream": True,
                    "options": {
                        "num_ctx": num_ctx
                    }
                }
                
                async with httpx.AsyncClient() as client:
                    async with client.stream("POST", ollama_url, json=payload, timeout=None) as response:
                        if response.status_code == 200:
                            async for line in response.aiter_lines():
                                if line:
                                    try:
                                        chunk_data = json.loads(line)
                                        content = chunk_data.get("message", {}).get("content", "")
                                        if content:
                                            yield content
                                    except json.JSONDecodeError:
                                        continue
                            return # Successfully proxied to Ollama
            except Exception as e:
                print(f"[!] Failed to connect to Ollama: {e}")

            mock_response = "【系统提示】由于硬件指令集兼容性问题，系统已为您自动切换至内部集成的 AI 保底引擎。但是由于端口 11434 被占用或服务被防火墙拦截，系统无法连接到内置的引擎。请检查安全软件设置后重新运行 start_windows.bat。"
            for word in mock_response:
                yield word
                await asyncio.sleep(0.05)
            return

        print(f"DEBUG messages content generate: {messages}")
        
        async_queue = asyncio.Queue()
        loop = asyncio.get_running_loop()
        
        def producer():
            try:
                # 使用 Llama-cpp 建议的采样参数以获得更好效果
                response = self.llm.create_chat_completion(
                    messages=messages,
                    max_tokens=2048, # 增加输出限制
                    stream=True,
                    stop=["<end_of_turn>", "</start_of_turn>", "<start_of_turn>", "<eos>"],
                    temperature=0.7,
                    top_p=0.9,
                    repeat_penalty=1.1
                )
                for chunk in response:
                    if "choices" in chunk and len(chunk["choices"]) > 0:
                        delta = chunk["choices"][0].get("delta", {})
                        text = delta.get("content", "")
                        if text:
                            # 过滤系统标签
                            for tag in ["<end_of_turn>", "</start_of_turn>", "<start_of_turn>", "<eos>"]:
                                text = text.replace(tag, "")
                            if text:
                                loop.call_soon_threadsafe(async_queue.put_nowait, text)
            except Exception as e:
                loop.call_soon_threadsafe(async_queue.put_nowait, f"\n[Error: {str(e)}]")
            finally:
                # 发送结束信号
                loop.call_soon_threadsafe(async_queue.put_nowait, None)

        # 启动线程执行阻塞的 LLM 生成
        threading.Thread(target=producer, daemon=True).start()

        while True:
            try:
                # Wait for data with a timeout to send keep-alive pings
                chunk = await asyncio.wait_for(async_queue.get(), timeout=2.0)
                if chunk is None:
                    break
                yield chunk
            except asyncio.TimeoutError:
                # Yield an empty string to keep the proxy connection alive
                yield ""


# 单例
local_ai_manager = LocalAIManager()
