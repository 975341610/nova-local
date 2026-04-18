# Development Log

## [2026-04-15] - 编辑器核心 Bug 修复 (Spellcheck, NoteLink, Drag Handle & CodeBlock) [已解决]

### 1. 拼写检查 (Spellcheck) 稳定性增强 [x]
- **错误拦截**: 在 `AISpellcheck.ts` 中增加了对 `405 Method Not Allowed` 错误的捕获。一旦后端返回 405，插件将自动进入静默状态并停止重复请求，有效防止了由于接口未就绪或受限导致的疯狂重试。

### 2. NoteLink 引用功能修复 [x]
- **闪退修复**: 解决了 `NoteLink` 建议菜单在快速重新渲染或点击时由于 `Tippy.js` 实例意外销毁导致的闪退问题。
- **生命周期保护**: 在 `NoteLinkConfig.tsx` 中增加了更严谨的 `props.clientRect` 存在性判断。
- **事件冒泡拦截**: 在 `NoteLinkSuggestion.tsx` 的按钮点击与按下事件中加入了 `stopPropagation()`，防止事件冒泡干扰编辑器焦点。

### 3. 代码块 (CodeBlock) 交互优化 [x]
- **Backspace 行为修正**: 拦截了代码块最开头的 `Backspace` 按键。当光标位于代码块首行首位且按下退格时，现在会将代码块直接转换回普通段落，而不是将代码文本合并到上一行正文中，彻底解决了代码块删除导致的排版污染问题。

### 4. 拖拽手柄 (Drag Handle) 异常修复 [x]
- **异常静默**: 增加了更严谨的三层状态检测（`editor`, `editor.view`, `editor.view.dom`），彻底修复了在文档被销毁时触发定位计算导致的 `The editor view is not available` 报错问题。

### 4. 质量与稳定性
- **构建验证**: 确保 `npm run build` 无错误通过。
- **分支管理**: 修复代码已在本地分支 `fix/editor-bugs` 完成提交。

## [2026-04-15] - 菜单面板主题自定义 (菜单色彩/透明度调整)

### 1. 菜单面板外观调节功能
- **设置面板增强**: 在 `SettingsDialog.tsx` 中新增主题调节 Tab，支持对“Slash 菜单”、“文字气泡菜单”、“块级菜单”进行独立外观配置。
- **调节维度**: 实现了透明度 (0-1)、毛玻璃模糊度 (0-40px)、背景色、前景色（文字）及边框色的精细调节。
- **实时预览**: 调节过程中样式通过 CSS 变量实时生效于所有菜单面板。
- **持久化与迁移**: 配置自动保存至本地存储，并支持 v1.0 到 v1.1 的数据自动合并与补全。

### 2. 菜单样式 Token 化接入
- **Slash 菜单**: 接入 `--slash-menu-fg` 与 `--slash-menu-border`，优化视觉层次感。
- **气泡菜单 (Bubble Menu)**: 为 Tiptap 文字菜单注入动态样式属性，确保透明度与模糊效果一致。
- **块菜单**: 统一接入主题变量体系。

### 3. 质量与稳定性
- **TDD 流程**: 补齐了 `theme-config.test.ts` 测试用例，覆盖配置校验与向后兼容逻辑.
- **构建通过**: 确保 `npm run build` 无类型错误且产物正常。

### 4. 文字气泡菜单乱码修复
- **修复：解决文字气泡菜单（BubbleMenu）中 Tooltips 显示乱码（火星文）的问题 [已完成]**

## [2026-04-14] - AI 插件跨平台稳定性修复

### 1. 修复 Linux/Cloud 环境下 AI 插件开关超时
- **绕过 Windows 专属脚本**: 在 `backend/api/routes.py` 和 `backend/services/local_ai.py` 中增加了系统平台检查。
- **异步化进程调用**: 将 `ensure_ollama.py` 的执行改为异步子进程调用 (`asyncio.create_subprocess_exec`)，并仅在 Windows (`win32`) 平台上触发，彻底解决了 Linux 环境下因同步执行该脚本导致的异步事件循环阻塞和接口响应超时问题。

## [2026-04-14] - 模板管理功能修复 (Hotfix)

### 1. 修复模板删除与更新 404 错误
- **前端 API 调用修正**: 修复了 `nova-block/src/lib/api.ts` 中 `deleteTemplate` 和 `updateTemplate` 方法缺失 HTTP 方法声明的问题。
  - `deleteTemplate`: 显式添加了 `method: 'DELETE'`，解决了原先默认使用 `GET` 请求导致后端路由匹配失败报 404 的问题。
  - `updateTemplate`: 显式添加了 `method: 'PATCH'`，确保与后端定义的 `@router.patch` 路由保持一致。
- **接口验证**: 通过 `curl` 模拟 `DELETE` 请求验证了后端 `/api/templates/{id}` 接口逻辑正常，响应 `{"status": "success"}`，确认修复有效。

## [2026-04-14] - UI 交互与性能深度修复 (v0.17.1)

### 1. 拖拽幽灵线条 (Drop Cursor Ghosting) 终极修复
- **移除粗暴的 DOM 操作**: 废弃了之前通过 `requestAnimationFrame` 强制 `el.remove()` 物理删除 `.nova-drop-cursor` 的方案，该方案会导致 ProseMirror 内部插件（`DropCursorView`）在执行 `removeChild` 时报 `TypeError: Cannot read properties of null` 错误。
- **引入安全的 CSS 隐藏方案**: 将所有强制清理操作替换为安全可控的 CSS 样式修改（`(el as HTMLElement).style.display = 'none'` 和 `opacity = '0'`），完美解决了快速拖拽过程中的“幽灵线条”残留问题，且彻底消除了控制台的报错。

### 2. 拖拽手柄 (Drag Handle) 点击与拖拽事件冲突修复
- **精准的意图识别**: 引入了 `dragInteractionRef` 引用来记录鼠标按下的起始坐标（X, Y）和时间戳。
- **区分点击和拖拽**: 在触发拖拽前判断鼠标移动距离（>4px）和持续时间（>300ms）。如果是单纯的短促点击，则打开节点选项菜单；如果是真正的拖拽，则平滑进入拖拽状态。这解决了“Notion风格手柄一点击就误判为拖拽”的交互痛点。

### 3. AI 拼写检查红线残留问题修复
- **精准的状态拦截**: 在 `NovaBlockEditor.tsx` 中拦截了 `removeError` meta 事务（Transaction），一旦检测到该事务，强制返回 `DecorationSet.empty`，确保红线（Decoration）能立即消失，并同步清空了 `storage.errors`。

### 4. 工程与环境修复
- 解决了所有的 TypeScript 编译错误，确保 `npm run build` 无警告通过。
- 修复了后端可能出现的 `405 Method Not Allowed` 和僵尸进程占用端口 (`8765`) 问题，完善了开发体验。

### 5. 交互修复：Slash 菜单表情面板 (Emoticon) 唤起失效
- **问题分析**：由于 Tiptap Slash 菜单项被点击时（`mousedown`）会冒泡，而表情面板组件在唤起瞬间会立即往 `document` 上挂载“点击外部关闭面板”的监听器，导致它瞬间捕获到了仍处于冒泡阶段的 `mousedown`，从而误判为“点击外部”并将面板秒关。
- **解决方案**：在 `NovaBlockEditor.tsx` 中的弹窗监听器注册逻辑中，引入 `setTimeout(..., 0)`，确保在当前的鼠标事件完全冒泡结束之后，再去注册外部点击监听器。彻底解决了 Slash 菜单点击无效的 bug，并兼容旧有的 `/e` 快捷键。

## [2026-04-13] - 真·插件系统 Phase 2: AI 服务进程动态启停与物理级解耦

### 1. 后端进程精确管理
- **跨平台进程终止**: 在 `local_ai.py` 中实现了 `stop_ollama_server` 方法，利用 `psutil` 跨平台精确识别并终止所有 `ollama` 相关的后台进程。
- **优雅与强制混合终止策略**: 优先尝试 `proc.terminate()` 并在 3s 后超时则执行 `proc.kill()`，确保显存和内存得到物理级释放，解决进程残留问题。
- **生命周期挂钩**: 更新了 `shutdown` 逻辑，确保主程序退出时能同步清理所有残留的 AI 服务子进程。

### 2. API 路由增强
- **新增 `/api/ai/toggle` 接口**: 支持 `{ enabled: boolean }` 载荷，作为 `toggle-plugin` 的标准别名。
- **物理解耦链路逻辑**: 当 `enabled=false` 时，主动调用 `stop_ollama_server` 而非仅仅释放内存中的模型引用。

### 3. 前端交互体验升级
- **动态加载状态**: 在 `SettingsDialog.tsx` 中为 AI 插件开关增加了 `Loader2` 动画和明确的任务提示（如“正在释放显存并停止 AI 服务进程...”）。
- **防抖保护**: 通过 React 状态锁定，防止用户在高耗时进程切换期间频繁点击开关导致进程树混乱。
- **UI 状态同步**: 确保 AI 开关在切换时，前端视觉反馈与后端真实的进程状态达成强一致性。

### 0. 热修复：API 声明错误 (SyntaxError)
- **修复 global 声明顺序**: 修复了 `backend/api/routes.py` 中 `inline_ai` 函数因 `global ai_enabled` 声明位于其首次使用之后导致的 `SyntaxError`。现已将声明移至函数开头。

### 1. 拼写检查 (Spellcheck) 逻辑优化
- **前端偏移量重构**: 修复了 `AISpellcheck.ts` 忽略后端返回的 `offset` 而错误使用 `indexOf` 重新计算位置的问题。现在直接使用后端精确计算的字符偏移量，彻底解决了多处相同错词时的定位错乱。
- **后端规则引擎增强**: 
  - 改进了 `spellcheck_engine.py` 中的 `_check_templates` 正则逻辑。
  - 引入了代词过滤机制，解决了“我的很快”、“他跑的”等句子中“的”被错误纠正为“得”的误报问题（仅当紧邻“的”的字符为动词/形容词且非代词时触发纠错）。
- **TDD 质量保证**: 新增了 `spellcheck_robust_test.py` 测试集，覆盖了中文字符偏移、重叠匹配、模板误报等边界场景，确保逻辑稳健。

### 2. AI 插件开关 (AI Switch) 彻底合规化
- **后端 API 全量校验**: 为 `routes.py` 中的所有 AI 相关接口（`/ask`, `/search`, `/chat`, `/ai/inline`, `/ai/suggest-tags`, `/tags/suggest`）增加了 `ai_enabled` 全局开关校验。（拼写检查已迁移为基础能力：`/text/spellcheck`，不受开关限制；`/ai/spellcheck` 仅作兼容转发）
- **后台进程生命周期管理**: 
  - 在 `local_ai.py` 中实现了 `shutdown()` 方法。
  - 当用户在设置中关闭 AI 插件时，系统会自动终止后台运行的 `ollama.exe` 相关进程并释放 LLM 显存资源。
- **状态持久化修复**: 确保后端启动时正确从 `data/ai_config.json` 加载 `enabled` 状态，而非硬编码为 `True`。

### 3. 错别字修改建议悬浮卡片 (Suggestion Card UI) - [2026-04-13] 热修复
- **修复触发机制 (Reliable Trigger)**:
  - 在 `AISpellcheck.ts` 插件中引入 `props.handleClick` 拦截逻辑。
  - 弃用不稳定的 DOM 事件监听，通过 ProseMirror 原生 `view.coordsAtPos(pos)` 获取精确的字符级视口坐标。
  - 确保 100% 拦截对 `spellcheck-error` 节点的点击，不再被选区或光标事件吞噬。
- **重构定位算法 (Precise Positioning)**:
  - 修改 `SpellcheckSuggestionCard.tsx`，通过 `useLayoutEffect` 动态测量卡片高度。
  - 实现“智能吸附”定位：默认渲染在错词正上方（12px 间距），若上方空间不足则自动翻转至下方。
  - 增加了视口边界溢出处理（Horizontal Edge Snapping），确保卡片在任何滚动位置均能精准贴合红线位置。
- **UI/UX 进化 (Linear/Apple 风格)**: 
  - 实现了 `SpellcheckSuggestionCard.tsx` 组件，采用 `backdrop-blur-xl`、`rounded-2xl` 和 `shadow-soft` 设计语言。
  - 引入 `framer-motion` 弹性动画（Spring Animation），提升卡片弹出与消失的丝滑感。
- **交互逻辑重构**: 
  - 修复了 Tiptap Decoration 点击拦截问题，通过自定义事件 `open-spellcheck-suggestion` 传递错误详情。
  - 实现“一键替换”功能，点击建议词即可自动修正编辑器内的错字并触发保存逻辑。
- **健壮性增强**: 确保卡片精确定位在错词上方，并处理了点击空白处自动关闭的逻辑。
- **水平居中偏移修复 (Horizontal Centering Fix) [2026-04-13]**:
  - 优化了 `SpellcheckSuggestionCard.tsx` 的定位算法，明确以错别字区域的绝对中心点 `centerX = left + width / 2` 为基准。
  - 修正了 `framer-motion` 的样式应用，将 `translateX: '-50%'` 更改为显式的 `transform: 'translateX(-50%)'`，确保 CSS 属性正确生效。
  - 改进了视口边界检测逻辑，配合 `translateX(-50%)` 确保卡片在左右边缘处能自动吸附且不偏移中心。
- **异步任务拦截**: 在 `background_index_note_async` 中增加了开关检查，确保 AI 禁用时不会在后台消耗资源进行摘要生成或向量化。
- **前端拼写检查解绑**: `AISpellcheck` 扩展移除了运行前校验 AI 状态的逻辑，确保拼写检查始终作为核心规则能力运行。
- **IPC 通道支持**: 适配了 `text:spellcheck` 通道，使得 Electron 本地模式下也能正常进行拼写检查。

### 3. AI 插件动态 UI 解绑
- **智能标签按钮隐藏**: 在 `PropertyPanel.tsx` 中引入 `useAI()`，当 AI 插件禁用时，动态隐藏“AI 建议标签”按钮（Sparkles 图标），避免用户误点。
- **Slash 命令过滤**: `SlashMenuConfig.tsx` 已支持基于 `item.requiresAI` + `isAiEnabled` 的过滤逻辑，AI 插件关闭时自动剔除需要 AI 支持的 Slash 命令（如 “AI 写作”）。
- **交互拦截与提示**: 在 `NovaBlockEditor.tsx` 中为 Slash AI 指令执行链路增加状态拦截，若 AI 禁用则通过 `onNotify` 提示用户先在设置中开启。

### 4. 热修复：播放列表弹窗滚动异常 (Playlist Popover Scrolling Fix)
- **修复滚动逻辑**: 解决了黑胶播放器播放列表弹出框在滚动内部内容时会自动关闭的问题。
- **具体实现**: 
  - 在 `PlaylistPopover.tsx` 中为容器增加了 `playlist-popover-container` 类名。
  - 在 `MusicContext.tsx` 的全局滚动监听中，增加了对该类名的点击/滚动拦截，确保用户在查看长播放列表时能顺畅滚动而不触发关闭逻辑。

---

- [x] **高性能规则引擎实现 (`spellcheck_engine.py`)**:
  - 引入 `pyahocorasick` (Aho-Corasick 自动机) 实现毫秒级错词匹配。
  - 内置高频中文易错词库（如：“地确”、“再所不惜”、“已经”错拼等）。
  - 支持**精准白名单**与保护区机制，防止专有名词误报。
  - 实现基于正则的上下文模板检查（如：动补关系下的“的地得”自动纠错）。
- [x] **API 接口改造**:
  - 重构 `backend/api/routes.py` 中的 `/api/ai/spellcheck` 接口，剔除低效且不可控的 LLM 调用，改为直连规则引擎。
  - 保持原有返回格式 `{"errors": [...]}`，实现无缝替换。
- [x] **前端 Tiptap 插件微调**:
  - 将 `AISpellcheck` 插件的 `debounceMs` 从 2500ms 降低至 800ms，大幅提升反馈灵敏度。
  - 优化触发机制，使其更好地配合中文输入法上屏。
- [x] **严格 TDD 流程**:
  - 编写并通过了 `spellcheck_test.py` 单元测试，覆盖基本匹配、白名单与正则模板。

## [2026-04-12] - 修复 spellcheck 接口 500 错误 (Unescaped Curly Braces)
- [x] **修复 Prompt 构造逻辑**:
  - 修复了 `backend/api/routes.py` 中 `/api/ai/spellcheck` 接口因 f-string 中包含 JSON 示例的大括号 `{}` 且未转义导致的 500 Internal Server Error。
  - 将 f-string 替换为显式字符串拼接与转义处理，确保 Prompt 模板正确解析。

## [2026-04-12] - Phase 4/5: AI Config, Smart Tags, and Context Spellcheck
- [x] **AI Initialization & Memory**:
  - Added `data/ai_config.json` for persistent AI settings (`enabled`, `preferred_engine`).
  - Optimized `ensure_ollama.py` to exit with status 2 when disabled, and updated `start_windows.bat` to skip background service startup.
  - Implemented engine auto-detection (GPU > CPU > Ollama) in `local_ai.py` with persistence of the "best" engine to `preferred_engine`.
  - Enabled dynamic AI initialization when toggling the plugin in the UI.
- [x] **Smart Tags**:
  - Implemented `/api/ai/suggest-tags` endpoint using LLM to generate up to 3 concise tags (max 5 chars) from note content.
  - Connected frontend `PropertyPanel` to the real tag suggestion API.
- [x] **Context-Aware Spellcheck (Feishu Style)**:
  - Implemented `/api/ai/spellcheck` backend to identify typos and context-sensitive errors using LLM.
  - Created `AISpellcheck` Tiptap extension with heavy debouncing (2.5s) and active-paragraph-only scanning.
  - Added visual feedback (red wavy underline) and interactive correction (tooltip on hover, replacement on click).

## [2026-04-12] - 自动同步本地模型至 Ollama (Ollama Fallback Enhanced)
- [x] **本地模型自动注册**:
  - 在 `backend/services/local_ai.py` 中新增 `_ensure_ollama_model` 方法。
  - 当 `llama-cpp` 加载失败（`MOCK_LLM_ERROR`）触发 Ollama 代理模式时，系统会自动生成临时 `Modelfile`。
  - 通过 `ollama create nova-local -f Modelfile` 命令，将项目自带的 `gemma-4-E2B-it-Q4_K_M.gguf` 注册为 Ollama 模型。
- [x] **Fallback 逻辑优化**:
  - 修改 `generate_chat_stream_messages`，在代理请求中优先使用 `nova-local` 模型。
  - 仅当 Ollama 注册失败或服务不可用时，才回退到公版 `gemma:2b`。
  - 在 `initialize_model` 阶段增加预注册逻辑，大幅缩短首个对话请求的等待时间。

## [2026-04-12] - 修复 Windows 平台模型加载 Access Violation 0x00000000
- [x] **禁用内存映射与锁定**:
  - 在 `backend/services/local_ai.py` 中为 `Llama` 实例化添加 `use_mmap=False` 和 `use_mlock=False`。
  - 彻底解决因 `mmap` 失败后底层库未处理空指针访问导致的 Windows 平台模型加载崩溃。
- [x] **收缩 Fallback 资源占用**:
  - 在 CPU 降级模式中进一步限制 `n_threads=1` 和 `n_batch=128`。
  - 针对无显卡低配机器，通过极致的单线程与小批次初始化，排除指令集不兼容或多线程引起的非法指令错误。

## [2026-04-12] - 智能显卡探测与 GPU/CPU 自适应加载 (GPU Fallback)
- [x] **实现 GPU 初始化自适应**:
  - 修改 `backend/services/local_ai.py`，引入 `try...except` 机制封装 `Llama` 实例初始化。
  - **首选加速模式**: 尝试以 `n_gpu_layers=-1` (全量 Offload) 和 `n_ctx=8192` 启动，充分发挥 Nvidia 独立显卡性能。
  - **自动降级模式**: 若检测到 `ValueError`、`OSError` 或 `RuntimeError`（通常由于无 CUDA 环境或显存不足引起），系统将自动打印警告并降级到 `n_gpu_layers=0` (纯 CPU 模式)，并将 `n_ctx` 同步减半至 `4096` 以确保内存安全。
  - 解决了同一份代码在高性能 GPU 机器和纯 CPU 办公本之间无法兼顾性能与稳定性的矛盾。

## [2026-04-12] - 深度修复 llama-cpp-python Windows 启动崩溃 (DLL Access Violation)
- [x] **入口导入顺序强制优化**:
  - 修改 `start_backend.py`（后端实际启动入口），在 `import uvicorn` 之前强制优先尝试导入 `llama_cpp`。
  - 确保在 `uvicorn` 加载底层网络库和 Windows Socket 依赖之前，`llama-cpp-python` 的 C++ 绑定 DLL 已完成内存加载与符号初始化，彻底阻断 Windows 平台上的 DLL 加载顺序冲突。
- [x] **模型初始化参数安全化**:
  - 在 `backend/services/local_ai.py` 中将 `n_gpu_layers` 显式设为 `0`，明确纯 CPU 推理模式，防止底层库在尝试自动探测/分配显存时触发空指针引用。
  - 将默认上下文长度 `n_ctx` 从 `8192` 降至 `4096`，减少 50% 的初始内存申请，避免在低配机器上因连续大块内存分配失败导致的底层崩塌。

## [2026-04-12] - 调整 import 顺序修复 llama-cpp-python Windows 访问违例 (Access Violation)
- [x] **Import 顺序优化**:
  - 在 `backend/services/local_ai.py` 中将 `from llama_cpp import Llama` 移至文件最顶部，确保在加载 `pandas`、`numpy` 或 `asyncio` 等库之前先加载底层 C 库。
  - 在 `backend/main.py` 和 `backend/api/routes.py` 的顶部提前导入 `local_ai_manager`，确保 `llama_cpp` 在整个应用生命周期的最早阶段被初始化，彻底解决 Windows 平台上预编译版本可能导致的 `0x0000000000000000` 访问违例错误。

## [2026-04-12] - 修复 routes.py 中的 f-string 语法错误
- [x] **修复嵌套 f-string 引用冲突**:
  - 修复了 `backend/api/routes.py` 第 620 行附近的 `SyntaxError: f-string: unterminated string`。
  - 原因是 f-string 嵌套时的单引号和双引号冲突，Python 3.11 中 `status['error']` 的单引号提前闭合了最外层的 `f'...'`。
  - 解决方法是将 `status['error']` 提取为变量 `error_msg` 后再进行 f-string 拼接。

## [2026-04-12] - 修复 llama-cpp-python Windows CPU 安装版本冲突 (0.3.19 Pinned)
- [x] **锁定版本与直连安装**:
  - 由于 `llama-cpp-python` 官方 pre-built cpu wheel 目前仅更新至 `0.3.19`，而 PyPI 已有 `0.3.20+`，导致 pip 在默认安装时会尝试从源码编译最新版从而触发 CMake 缺失错误。
  - 修改 `install_windows_cpu.bat` 和 `install_windows_cpu.py`，直接指定 `v0.3.19` 的 Windows cp311 wheel 直链进行安装，确保 CPU 环境下的稳定性和免编译特性。


## [2026-04-12] - 解决 llama-cpp-python Windows CPU 免编译安装问题
- [x] **Windows CPU 安装脚本**:
  - 新增 `install_windows_cpu.bat` 和 `install_windows_cpu.py`。
  - 通过官方预编译 wheel 源 (`https://abetlen.github.io/llama-cpp-python/whl/cpu`) 实现 Windows 环境下的免编译安装，解决了用户在缺少 C++ 编译环境时安装失败的问题。

## [2026-04-12] - 修复 Nginx 代理 SSE 流式超时与缓冲问题 (ERR_INCOMPLETE_CHUNKED_ENCODING)
- [x] **心跳保活机制**:
  - 修改 `backend/services/local_ai.py`，加入 `asyncio.wait_for` 2秒超时轮询。在模型长时思考未产出 token 时，主动向前端发送 `: ping\n\n` 心跳包，防止 Strato Proxy / Nginx 判定连接空闲而强制掐断（502 / Chunked Encoding Error）。
- [x] **TTFB 代理缓冲区冲刷**:
  - 在流式连接建立之初，抢先发送携带 4KB 空格字符的心跳注释，瞬间填满并强制冲刷反向代理的底层缓冲区，确保首个字节穿透网关。
- [x] **网关缓存与连接寿命增强**:
  - 更新 `backend/api/routes.py` 中的 Header 注入 `Cache-Control: no-cache, no-transform`，禁止中间代理缓存或整形。
  - 调整 `backend/main.py` 的 Uvicorn 配置，强行延长 `timeout_keep_alive=65`。
## [2026-04-12] - 修复本地 AI 流式输出、System Prompts 与停止符
- [x] **实时流式输出修复**:
  - 修复了 `backend/services/local_ai.py` 中 `generate_chat_stream_messages` 内部由于线程 `queue.get()` 阻塞导致的卡顿现象，改为非阻塞轮询加 `asyncio.sleep(0.01)`。
  - 在 `backend/api/routes.py` 的 `inline_ai` 接口中，给 `StreamingResponse` 增加了 `X-Accel-Buffering: no`、`Cache-Control: no-cache`、`Connection: keep-alive` 头，彻底解决前端接收数据时的缓冲（憋大招）问题。
- [x] **屏蔽系统标签泄漏**:
  - 在 `backend/services/local_ai.py` 的 `self.llm.create_chat_completion` 调用中加入了 `stop=["<end_of_turn>", "</start_of_turn>", "<start_of_turn>", "<eos>"]`，防止底层模型的控制标签泄漏到用户界面。
- [x] **修复复读机现象**:
  - 优化了 `backend/services/local_ai.py` 中的 `system_prompts`，对 `continue`（续写）和 `rewrite`（重写）指令增加了强制约束（`CRITICAL: Do NOT repeat the input text...`），防止模型把上下文又复述一遍。


## [2026-04-12] - AI 编辑器指令增强与流式解析器优化
- [x] **后端指令拦截与引导**:
  - 在 `backend/services/local_ai.py` 中增加了对用户 prompt 的拦截。
  - 当检测到用户使用 `【】` 包裹文本时，自动注入强制性的 System Prompt，要求 AI 必须且只能输出 XML `<Action>` 标签。
  - 丰富了 Action 列表，新增支持 `insert_code_block` (带语言属性)、`insert_todo` 和 `insert_text`。
- [x] **前端流式解析器重构**:
  - 在 `NovaBlockEditor.tsx` 中重构了 `Stream Command Parser`。
  - 引入了基于正则的全局匹配与缓冲区 (`streamBuffer`) 机制，能够稳健地处理跨 SSE 数据块的 XML 标签。
  - 增强了对带属性标签（如 `<Action type="..." language="...">`）的解析能力。
  - 实现了普通文本与 Action 标签的交替解析处理，确保 Action 标签不会作为普通文本插入编辑器。
- [x] **编辑器 Action 处理器扩展**:
  - 扩展了 `handleAIAction` 逻辑，支持：
    - `insert_code_block`: 在当前光标处插入 Tiptap 代码块，并自动设置语法高亮语言。
    - `insert_todo`: 插入带选框的待办事项。
    - `insert_text`: 插入 AI 生成的普通文本内容。
- [x] **鲁棒性与性能**:
  - 解决了之前流式解析可能因为标签被截断而失效的问题。
  - 优化了缓冲区清理逻辑，防止非法标签残留干扰后续解析。

## [2026-04-12] - Local AI Inference Fixes & Web Search Integration
- [x] Fix local AI fallback failure (`AI Config missing` error) when plugin is enabled.
  - Reason: `local_ai_manager` was instantiated correctly but `is_ready` state was not synced properly due to multi-process/reloads or event-loop context issues.
  - Fix: Initialize `local_ai_manager` globally on `toggle_ai_plugin` and ensure `generate_chat_stream` is non-blocking with `run_in_executor`. Also properly handle `StopIteration` raised into `Future`.
- [x] Implement web search capabilities for local AI (`/api/ai/inline` with `action="search"`).
  - Approach: If `action="search"`, search DuckDuckGo, extract snippets, and pass them as context to the AI model before generation.

## [2026-04-11] - Local AI Inference Fixes & Enhancements
- [x] Debugging the local AI inference stream. The user reported that the AI produces no response in the frontend.
- [x] Temporarily reverted the prompt structure in `backend/services/local_ai.py` back to ChatML (`<|im_start|>`) so the substitute Qwen model generates readable text.
- [x] **Event Loop Blocking Fix**: Refactored `generate_chat_stream` in `backend/services/local_ai.py` to use `asyncio.to_thread(next, iterator)` in a loop, ensuring that the synchronous `create_completion` stream does not block the FastAPI async event loop.
- [x] **Context Awareness**: Updated `streamInlineAI` payload in `nova-block/src/components/novablock/NovaBlockEditor.tsx` to include `editor.getText()` instead of an empty string, providing the AI with the necessary context from the user's notes.
- [x] **System Prompt Tuning**: Overhauled `system_prompts['ask']` in `backend/api/routes.py` to explicitly set the AI's persona as a "professional personal knowledge base assistant," greatly improving relevance for note-taking queries.
- [x] Triggered a frontend rebuild to apply the UI and API payload changes.

## [2026-04-10] - 全局性能专项审计与优化修复 (v0.17.0)

### 1. 后端并发与事件循环优化
- **FastAPI 非阻塞重构**: 针对 `quick_capture`, `create_note`, `update_note`, `upload_media` 等大量涉及 SQLAlchemy 数据库操作和磁盘 I/O 的接口，将 `async def` 转换为 `def`。此举利用 FastAPI 内部线程池执行同步任务，彻底解决了原有代码在并发请求下阻塞事件循环导致的后端假死问题。
- **AI 异步安全封装**: 保持 AI 接口异步特性，但通过 `run_in_threadpool` 包装其中的同步数据库查询（如 `get_or_create_model_config`），确保 AI 生成与数据库读取不互相阻塞。

### 2. 传输协议与载荷优化
- **笔记列表轻量化**: 重构 `GET /notes` 与 `GET /notes/tree` 接口逻辑。引入 `NoteListItemResponse` 并在后端使用 SQLAlchemy `defer(Note.content)`，使列表请求不再携带庞大的正文字段。
- **按需延迟加载 (Lazy Loading)**: 新增 `GET /notes/{note_id}` 接口。前端 `App.tsx` 逻辑调整为“先加载轻量列表，点击具体笔记后再拉取完整正文”，极大地降低了首屏加载延迟和浏览器内存占用。
- **IPC 桥接更新**: 同步更新 `ipc_bridge.py` 以适配上述 API 变更，确保 Electron 环境下的性能增益一致。

### 3. 前端 Base64 滥用清理
- **习惯追踪器 (HabitTracker)**: 移除 Base64 图片 fallback 逻辑。现在图片背景与图标强制走物理上传接口并返回持久化 URL，避免了 TB 级 Base64 字符串撑爆 LocalStorage 的风险。
- **情绪板 (Moodboard)**: 将 `FileReader.readAsDataURL` 替换为 `URL.createObjectURL` 进行本地预览，仅在需要时上传，大幅减少了前端内存瞬时峰值。

### 4. 画布 (Canvas) 持久化序列化优化
- **字段外科手术**: 深度重构 `serializeCanvasContent`。序列化时主动剔除 ReactFlow 运行时高频变动的 `selected`, `dragging`, `measured` 等非持久化字段。
- **冗余剔除**: 剥离数据对象中注入的函数句柄（`onChange` 等），使存储在数据库中的 JSON 载荷体积缩小 ~40%，并消除了因“点击即变动”触发的无效保存请求。

### 5. 构建与产物
- 修复了 `PropertyPanel.tsx` 和 `GlobalSearchPanel.tsx` 中因字段可选化导致的 TypeScript 类型报错。
- 执行 `npm run build` 并将最新产物同步至 `frontend_dist/`。

## [2026-04-10] - 版本同步与升级 (v0.16.0)

### 核心变更
- **版本号升级**: 依据需求，将应用版本从 `v0.15.x` 提升至次版本号 `v0.16.0`。
- **多处同步**: 更新了 `nova-block/package.json`、`VERSION.txt` 以及所有位置的版本声明，确保全局一致。
- **构建与交付**: 已重新执行前端构建并同步至 `frontend_dist/`。

## [2026-04-10] - 画布多选菜单图标化精简 (v0.15.2)

### 1. UI 精简与图标化
- **快捷工具栏重构**: 将 `SelectionToolbar`（多选弹出菜单）从原有的长按钮文字模式改为精简的图标组模式。
- **视觉升级**: 
  - 采用深色极客风格的毛玻璃背景 (`bg-black/75`, `backdrop-blur-xl`)，配合 `white/10` 细边框和深度阴影，提升视觉精致度。
  - 引入 `FolderPlus`（编组）和 `Trash2`（删除）图标，增加 `strokeWidth={2.5}` 强化轮廓感。
- **交互优化**:
  - 为按钮添加了 `title` (Tooltip) 提示：“编组 (Group)”与“批量删除选中项”。
  - 增加了平滑的 hover 缩放 (`scale-105`) 与点击反馈 (`active-scale-95`)，并伴随颜色平滑过渡。
  - 新增了选区计数器（Selected Count），以小胶囊样式展示当前选中节点数。

### 2. 构建与提交
- 执行 `npm run build` 并将产物同步至 `frontend_dist/`。

## [2026-04-10] - 画布背景清除功能增强 (v0.15.1)

### 1. 交互与功能优化
- **悬停清除背景**: 在顶栏“更换背景”按钮旁增加了一个悬停可见的“清除”按钮。当画布已设置背景图时，鼠标悬停在背景图标上即可看到红色的“清除”小图标。
- **清除逻辑**: 点击清除按钮后，`backgroundUrl` 将被重置，画布恢复为默认背景，并自动触发持久化保存。

### 2. 构建与同步
- 执行 `npm run build` 并将产物同步至 `frontend_dist/`。

## [2026-04-10] - 画布 UI/UX 深度优化：深色模式、可折叠导航与自定义背景 (v0.15.0)

### 1. 视觉与主题优化
- **全站深色模式**: 将画布背景改为 `#0b0f16`，并辅以带科技感的网格纹理 (`linear-gradient` grid) 和柔和的径向渐变，提升沉浸感。
- **UI 质感提升**: 导航栏、小地图、控制组件均改为半透明深色毛玻璃材质 (`bg-black/40`, `backdrop-blur-xl`)，边框采用极其克制的 `white/10`。

### 2. 导航栏交互革命
- **图标化精简**: 移除顶栏所有冗余文字按钮，改为纯图标模式。
- **Tooltips 增强**: 为所有功能图标添加了 `title` 悬浮提示，确保功能直观。
- **可折叠设计**: 增加「收起/展开」切换按钮（`ChevronLeft/Right`），允许用户一键进入极简创作模式。
- **删除冗余**: 移除了右下角笨重的「删除选中」按钮，统一引导用户使用快捷键 `Delete/Backspace` 以保持界面清爽。

### 3. 自定义背景与持久化
- **背景上传**: 增加 `Palette`（调色盘）图标按钮，支持上传图片作为画布背景。
- **持久化方案**: 
  - 在 `CanvasSerialized` 结构中新增 `backgroundUrl` 字段。
  - 画布保存时，背景 URL 会随 `note.content` 一起写入数据库。
  - 初始化时，系统会自动从内容中解析 `backgroundUrl` 并恢复背景，实现画布级别的个性化装扮。

### 4. 构建与同步
- 执行 `npm run build` 生成最新前端产物。
- 同步 `nova-block/dist/*` 到 `frontend_dist/`。

## [2026-04-10] - 修复贴纸/表情/BGM 资源加载极慢（binary file 按行迭代导致超小 chunk）

### 问题根因
- `backend/api/routes.py` 中 `get_sticker_file` / `get_emoticon_file` / `stream_bgm` 通过 `yield from f` 迭代 `rb` 文件对象，实际会按“行”产生大量超小 chunk，导致 StreamingResponse 极慢。

### 修复内容
- `backend/api/routes.py`
  - 三个路由统一改用 `fastapi.responses.FileResponse` 直接下发文件，避免超小 chunk：
    - `/api/stickers/files/{filename}`
    - `/api/emoticons/files/{filename}`
    - `/api/bgm/stream/{filename}`

### 影响面确认
- `list_stickers` 返回的贴纸 URL 为 `/api/stickers/files/...`，前端 `StickerPanel.tsx` 使用该 URL 加载，因此本修复可直接显著降低贴纸加载延迟。

## [2026-04-10] - Canvas 本地文件支持用系统默认软件打开

### 背景
- 画布中添加本地文件后，点击右侧属性栏「一键打开 / 跳转」或点击文件节点，无法用系统默认软件直接打开（容易被浏览器接管或相对路径导致裂开）。

### 修复内容
- `nova-block/src/components/canvas/CanvasEditor.tsx`
  - 为文件节点与属性栏「一键打开 / 跳转」增加智能判断：
    - `source === 'local'` 或 `url` 包含 `/api/media/static/files/` / `/media/static/files/` 时，优先调用 `api.openFile(url)` 交给后端触发系统默认应用打开；失败则回退 `window.open(formatUrl(url), '_blank')`。
    - 其他链接直接 `window.open(formatUrl(url), '_blank')`。

### 构建与同步
- 执行 `nova-block/npm run build`，并同步 `nova-block/dist/*` 到 `frontend_dist/`。

## [2026-04-10] - 修复图片裂开、Slider 本地图片导致 localStorage 爆仓 (QuotaExceededError)

### 问题根因
- Slider 组件将本地图片 `FileReader.readAsDataURL()` 转成 **base64** 存入笔记内容，最终跟随 `App.tsx` 的 `localStorage.setItem('nova-block-notes', ...)` 一起写入，超过浏览器 LocalStorage 配额（~5MB）触发 `QuotaExceededError`。
- 多处媒体渲染直接使用后端返回的相对路径（如 `/api/media/static/files/...`），在 Electron / 非同源场景下会变成“裂开的图片”。

### 修复内容
- `nova-block/src/lib/api.ts`
  - 新增 `formatUrl()`：将 `/api/...` 相对路径统一转为可用的绝对 URL（兼容 strato-https-proxy / Electron）。
- `nova-block/src/components/novablock/extensions/SliderNodeView.tsx`
  - 本地图片上传改为走后端 `api.upload()`，不再写入 base64。
  - Slider 渲染时统一 `formatUrl()`，避免相对路径导致图片裂开。
- `nova-block/src/components/canvas/CanvasEditor.tsx` / `nova-block/src/components/MediaNodeView.tsx`
  - 媒体渲染统一 `formatUrl()`。
- `nova-block/src/components/editor/EmoticonPanel.tsx` / `StickerPanel.tsx` / `NovaBlockEditor.tsx`
  - 统一使用 `formatUrl()`，修复历史表情包/贴纸在非同源环境下裂开。
- `nova-block/src/App.tsx`
  - `localStorage.setItem('nova-block-notes', ...)` 增加 try/catch，避免 QuotaExceededError 直接把应用打崩，并输出更明确的诊断日志。

### 构建与同步
- 已执行 `nova-block/npm run build`，并同步 `nova-block/dist/*` 到 `frontend_dist/`。

## [2026-04-10] - Canvas 禁用右键拖动，修复右键菜单冲突

- `CanvasEditor.tsx`：将 ReactFlow `panOnDrag` 从 `panOnDrag={[1, 2]}` 调整为 `panOnDrag={[1]}`，彻底移除右键拖动画布，避免与右键菜单手势冲突。
- 删除右键拖动相关的冗余手势守卫与事件处理：移除 `rightClickGuardRef`，以及 `handleCanvasMouseDown/Move/Up` 与 wrapper 上的对应 mouse 事件绑定。
- `handleCanvasContextMenu`：确保一进入即 `event.preventDefault()`，并去掉“右键拖动过则不弹菜单”的分支判断，保证自定义右键菜单稳定弹出。

## [2026-04-10] - 修复 Canvas 右键事件冲突：禁用原生菜单且不吞自定义菜单 (v0.14.3)

### 1. 事件冲突排查与修复
- 移除 `CanvasEditor.tsx` 画布 wrapper 上的 `onContextMenuCapture`（捕获阶段拦截），避免误拦截/干扰 ReactFlow 的 `onPaneContextMenu` / `onNodeContextMenu` 等自定义右键逻辑。
- 将右键统一入口 `handleCanvasContextMenu` 调整为「开头立即 `event.preventDefault()`」并移除 `stopPropagation()`，避免右键事件被过度拦截导致自定义菜单偶发不弹出。
- 规范 ReactFlow 右键回调签名并统一转发：`onPaneContextMenu(event)`、`onNodeContextMenu(event, node)`，`onEdgeContextMenu(event, edge)` 仅关闭菜单且不再多余 `stopPropagation()`。

### 2. 构建与同步
- 执行 `npm run build` 并将最新产物同步至 `frontend_dist/`。

## [2026-04-10] - 彻底禁用 Canvas 原生右键菜单 (v0.14.2)

### 1. 右键菜单深度清理
- 修复 `CanvasEditor.tsx` 中 `onPaneContextMenu` 和 `onNodeContextMenu` 漏掉显式调用 `event.preventDefault()` 的问题。
- 在 ReactFlow 容器外层 wrapper 上新增 `onContextMenuCapture` 捕获阶段拦截，确保无论子组件是否阻止冒泡，都能最终拦截原生菜单。
- 将所有 `preventDefault?.()` 的可选调用改为强制调用 `preventDefault()`，确保拦截逻辑的确定性。
- 优化了 `onEdgeContextMenu` 的拦截逻辑。

### 2. 构建与同步
- 执行 `npm run build` 并将最新产物同步至 `frontend_dist/`。

## [2026-04-10] - 修复 Canvas 右键菜单与分组拖拽回归 (v0.14.1)

### 1. 右键菜单：阻止原生浏览器菜单
- 在 `CanvasEditor.tsx` 的画布 wrapper 上补充 `onContextMenu` 兜底 `preventDefault()`，避免右键点击 Group 外部（或右键平移手势过程中）出现浏览器原生菜单。
- 在 `handleCanvasMouseDown`（右键按下）阶段提前 `preventDefault()`，进一步降低不同浏览器对右键菜单触发时机差异带来的漏网情况。

### 2. 分组拖拽：确保分组背景可拖动
- 为 `GroupNode` 外层容器添加 `.canvas-group-drag-handle`，并在 Group 节点数据上统一注入 `dragHandle: '.canvas-group-drag-handle'`（包含新建分组与从存量数据 hydrate）。
- 这样分组的整个背景区域都能作为拖拽手柄，同时通过 `nodrag` 保持输入框/按钮等交互不被拖拽抢占。

### 3. 构建与产物同步
- 已执行 `nova-block/npm run build` 并将产物同步至 `frontend_dist/`。

## [2026-04-10] - Infinite Canvas 分组 (Group) 功能全落地 (v0.14.0)

### 核心功能补完
- **命名与重命名**: `GroupNode` 头部标签重构为无边框 `<input>`。支持本地状态缓存加速输入，并在 `onBlur` 或 `Enter` 时同步至全局数据。
- **解散分组 (Ungroup)**: `GroupNode` 右上角新增 `Unlink` 图标。点击后自动将所有子节点坐标还原为画布绝对坐标，清除 `parentId` 并移除分组容器。
- **收纳与展开 (Collapse/Expand)**: 
  - 分组头部新增 `Chevron` 折叠开关。
  - 折叠时：记录原高度 `expandedHeight`，将组内所有子节点设为 `hidden`，分组高度塌陷至 40px。
  - 展开时：恢复子节点可见性，并将高度还原。
- **智能归组逻辑**:
  - **拖拽自动归组**: 实现 `onNodeDragStop` 监听。当普通卡片中心点落入某个 `GroupNode` 区域时，自动建立父子关系并切换为相对坐标；反之，拖出区域自动脱离。
  - **右键上下文归组**: 增强 `handleCanvasContextMenu`。右键点击分组内部时，产生的“新建文本/引用”等操作会自动将新节点归属于该分组。

### 交互与性能细节
- **拖拽手柄**: 为 `GroupNode` 头部增加了 `.canvas-group-drag-handle` 专用拖拽区域。
- **尺寸控制**: 分组支持 `NodeResizeControl` 调整大小，并在折叠状态下自动限制最小高度。
- **坐标换算**: 深度优化了绝对/相对坐标转换算法，确保归组与解散时卡片在视觉上保持位置不动。
- **构建同步**: 成功执行 `npm run build` 并将产物同步至 `frontend_dist/`。

## [2026-04-10] - 修复画布连线无法连接的严重 Bug (v0.13.3)

### 问题与修复方案
- **连线箭头方向修复**: 由于 `BaseNode` 的 source/target handle 在同一位置渲染，部分情况下 `onConnect` 会拿到反向的 `source/target`，导致箭头（`markerEnd`）指回起点。现在在 `CanvasEditor.tsx` 的 `handleConnect` 中根据 `sourceHandle/targetHandle` 的后缀做归一化：仅当检测到 `*-target -> *-source` 的反向组合时才交换 `source/target`，确保箭头永远指向落点卡片，同时不破坏 ReactFlow 的严格连接校验。
- **左键框选包含连线**: 保持左键框选卡片能力不变；在 `onSelectionChange` 中补齐逻辑：当一组卡片被框选中时，自动将它们之间的边也置为选中态，从而支持一键删除等操作时连线不遗漏。
- **右键画布菜单报错修复**: 修复 `onPaneContextMenu` 事件对象不含 `currentTarget.getBoundingClientRect()` 的兼容性问题，改用 `canvasWrapperRef.getBoundingClientRect()` + `clientX/clientY` 计算菜单定位。

### 核心体验优化
- **左键框选与连线删除**:
  - 在 `CanvasEditor` (ReactFlow) 中开启了 `panOnDrag={[1, 2]}`（允许中键或右键拖拽画布），释放了左键用于框选。
  - 启用了 `selectionOnDrag`、`elementsSelectable` 和 `edgesFocusable`。现在用户可以直接用**鼠标左键拖拽出一个蓝色选框**，框选多个卡片时会**自动同时选中这些卡片之间的连线**，并可按 `Backspace / Delete` 一键删除它们。
- **连线选中高亮反馈**:
  - 在 `novablock-core.css` 中为 `.react-flow__edge.selected .react-flow__edge-path` 增加了高级视觉反馈：选中连线时，连线颜色会变为醒目的橙金色 `#ff9966`，线宽增加至 `3.5px`，并带有柔和的 `drop-shadow(0 0 6px ...)` 发光效果，明确传达“当前该连线已被选中”。
- **连线箭头反向修正**:
  - 用户反馈连线的指向逻辑不符直觉（从 A 连到 B，箭头却反向）。通过在 `handleConnect` 中检查 `Connection.sourceHandle/targetHandle` 的后缀，仅在识别到反向组合时对调 `source/target`，保证视觉拖拽方向与箭头指向一致。
- **画布右键菜单稳定性**:
  - 修复右键菜单报错 `getBoundingClientRect is not a function`，改用 `canvasWrapperRef` 计算相对位置，避免事件对象差异导致的运行时异常。
- **命中热区 (Hitbox) 放大**:
  - **缩放把手**: 将卡片右下角的缩放控件 (`NodeResizeControl`) 的容器 `w/h` 加大至 `24px` (`w-6 h-6`)，并增加了内部偏移和 `cursor-se-resize`，解决原先难以精确抓住光标进行缩放的问题（视觉依然保留精致小圆点）。
  - **连线触点**: 将四面的 `Handle` 组件热区加大到 `20px` (`w-5 h-5`)，同样保持视觉圆点小巧（10px），但外部包裹了一层透明可交互的扩大区域。
  - **连线本体**: 通过给 `.react-flow__edge-interaction` 设置 `stroke-width: 24px`，让细长连线的有效点击宽度扩大，即使不放大画布也能轻松选中连线。

## [2026-04-10] - 画布媒体预览全面支持与线上构建同步 (v0.13.1)

### 核心改进
- **修复在线链接解析（URL & 图片匹配）**:
  - 修复了粘贴不带 `http://` 协议头的链接时，`new URL()` 解析报错导致直接走入 "无效的 URL 地址" 异常捕获的问题。现在会自动尝试补全 `https://` 协议头进行解析。
  - **B站短链/分享链接强化**：增强了 Bilibili 的正则表达式，除了常规的 `bilibili.com/video/BV...`，现在还能精准匹配 `b23.tv/BV...` 并且对大小写不敏感（`i` flag），解决了用户反馈粘贴 B 站链接依然报错或无法转为嵌入视频的问题。
  - **全图片后缀支持**：图片资源类型的白名单补全了更多后缀名，不再局限于 `.png`，现已涵盖 `['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'jfif', 'pjpeg', 'pjp']`。
  - **图床链接回退推断**：对于部分图床不带扩展名的图片直链（例如 `https://images.unsplash.com/photo-12345`），由于在路径中不含 `.jpg`，现加入了 URL 关键词试探逻辑：如果链接包含 `image`, `img`, `picture`, `webp` 之一，则作为兜底策略优先将该链接以“图片媒体卡片”呈现，总比呈现一串干瘪的文字链接强。

- **画布媒体全类型预览支持**:
  - 在画布编辑器 (`CanvasEditor.tsx`) 和媒体节点视图 (`BaseNode.tsx` 依赖的 `MediaNode` 渲染逻辑) 中，彻底打通了对图片、视频、音频及嵌入式网页（B站/YouTube等）的渲染支持。
  - **音频支持**: 为音频文件新增了原生 `<audio controls />` 播放器面板。
  - **视频支持**: 视频现在可以静音自动内联播放 (`controls muted playsInline`)，不再只是显示占位。
  - **在线媒体解析**: 重构了 `handleInsertLink`，当用户粘贴 B站、YouTube 链接，或以 `.mp4`, `.mp3`, `.png` 等结尾的直链时，自动识别并创建为**媒体预览节点**（带有对应播放器/图片视图），而非普通的文字链接节点。
  - **交互体验**: 对 `iframe` 嵌入视频增加了交互锁定/解锁遮罩（点击解锁交互，解锁后可通过右上角按钮重新锁定以方便拖拽排版），防止 iframe 捕获所有的鼠标事件导致画布元素无法拖动。

- **资源物理隔离与 Note ID 透传**:
  - 修复了拖拽上传（Drag & Drop）和右键菜单上传时 `api.upload(files, note?.id)` 中 `note.id` 的参数传递，确保上传的任何类型附件都会准确路由到 `data/media/{note_id}/` 专属目录下。

- **稳定性修复**:
  - 修复了 TypeScript 编译阶段 `CanvasEditor.tsx` 中 `note.id` 可能为 null 导致的构建失败报错（`error TS18047: 'note' is possibly 'null'.`）。引入可选链 `note?.id` 确保编译通过。

### 构建与同步
- 成功执行 `npm run build`，清理了类型报错。
- 已将最新构建产物 `dist/*` 手动同步至 `frontend_dist/` 目录，确保云预览环境能加载到最新的前端代码。


## [2026-04-09] - 侧边栏图标化增强与收起动画深度优化 (v0.12)

### 核心改进
- **统一侧边栏图标模式**:
  - 移除并隐藏了展开状态下“文件树”和“全局搜索”的文字按钮，统一为带有精致 Tooltip 的 18px 图标。
  - 即使在展开状态下，顶部的功能切换也保持图标化，使视觉重心更集中于笔记内容。
- **侧边栏收起动画极致丝滑化**:
  - **消除布局跳变**: 移除了动画过程中 `justify-between` 到 `justify-center` 的突变，改用稳定的 `flex` 布局配合 `transition-all` 处理边距过渡。
  - **固定容器尺寸**: 为 Header 和功能按钮容器设置了固定的最小高度与 `w-full` 布局，确保在宽度动态变化时，内部元素（如 Layers 图标）位置保持相对稳定。
  - **动画同步优化**: 移除了 `AnimatedLabel` 的 `mode="wait"`，使文字在侧边栏收缩/展开时能立即开始同步的淡入淡出与缩放，彻底消除了最后 1s 的对齐卡顿。
  - **图标绝对居中**: 在收起状态下，通过 `mx-auto` 和固定的图标容器宽度，确保 64px 侧边栏内的所有图标完美垂直对齐，不再有微小的偏移抖动。
- **UI 细节优化**:
  - 为“快速搜索”增加了带有平滑显隐效果的 `kbd` 快捷键提示。
  - 统一了侧边栏所有区域（Header, Actions, Tree, Footer）的横向 `padding` 为 `px-3`，确保视觉一致性。

### 技术实现细节
- **Framer Motion**: 优化了 `AnimatePresence` 的触发机制，确保文字与容器动画完全同步。
- **CSS Transition**: 运用 `transition-all` 配合 `ml-1` / `mx-auto` 切换，实现了图标位置的平滑补间。

### 校验与构建
- **类型安全**: 已通过 `npx tsc SidebarTree.tsx` 严格类型检查。
- **交互验证**: 侧边栏收缩与展开过程丝滑无顿挫，Tooltip 弹出位置准确。

## [2026-04-09] - 侧边栏图标化与丝滑文字动画优化 (v0.11)

### 核心改进
- **文件树与全局搜索按钮图标化**:
  - 将侧边栏顶部的“文件树”和“全局搜索”长条文字按钮重构为精致的图标按钮。
  - 在展开状态下保持图标与文字并排，在收起状态下自动切换为纯图标模式，视觉更加轻盈。
  - **智能 Tooltips**: 为收起状态下的图标按钮增加了侧向弹出的悬浮提示（Tooltips），采用毛玻璃背景与即时反馈，确保功能直观可见。
- **丝滑文字展示动画**:
  - 引入了自定义的 `AnimatedLabel` 组件，利用 `framer-motion` 的 `AnimatePresence` 处理侧边栏收起/展开时的文字显隐。
  - 动效组合：采用 `opacity (0 -> 1)` + `x (-10 -> 0)` + `width (0 -> auto)` 的复合动画，确保文字在侧边栏变宽/变窄时顺滑“流出”或“收回”，而非突兀的闪现。
  - 统一贝塞尔曲线：所有动画均同步使用高级贝塞尔曲线 `[0.32, 0.72, 0, 1]`，保持与主页面缩放动效的节奏一致。
- **侧边栏结构性能重构**:
  - 废弃了原本通过两个大条件判断块（`!isCollapsed` / `isCollapsed`）分别渲染两套 UI 的旧方案。
  - 采用 **“单路径响应式结构”**：侧边栏容器内的所有子组件（Header, Tabs, Quick Actions, Footer）现在共用一套 DOM 树，通过内部组件感知 `isCollapsed` 状态并自适应样式与动画。
  - **优势**: 彻底解决了切换状态时组件被频繁卸载/重新挂载导致的动画断层和性能开销，实现了真正的全量平滑过渡。

### 技术实现细节
- **Framer Motion 深度集成**: 使用 `initial`, `animate`, `exit` 完整生命周期管理文字动画。
- **CSS 细节抛光**:
  - 为收起状态下的图标添加了 `group-hover` 缩放反馈。
  - 优化了侧边栏收起后的 `Chevron` 切换按钮位置，使其以半圆浮窗形式吸附在边缘，更具设计感。
  - 修复了侧边栏收起时，底部设置按钮文字溢出的边界问题。

### 校验与构建
- **类型安全**: 已通过 `npx tsc SidebarTree.tsx` 严格类型检查。
- **静态校验**: 已通过 `npm run lint` 验证，确保无新增语法与逻辑错误。
- **构建测试**: `npm run build` 环境下渲染逻辑正常，无动画性能抖动。

## [2026-04-09] - 版本升级 (v0.10.2)

- 统一同步各模块版本号，并进行最小版本例行升级。

## [2026-04-09] - 修复编辑器异常与媒体路由 404 (v0.10.1)

### 修复问题列表
1. **表情包被渲染为巨型块级媒体卡片**
   - **根因**: Tiptap 扩展注册与解析的优先级冲突。我们之前的 `ResizableImage` 扩展通过 `img[src]` 捕获了所有的图片标签，包括表情包，导致带有 `data-emoticon` 的内联表情被错误地解析并套用了块级图片卡片的组件与样式（包括拖拽和缩放 UI）。
   - **修复**: 
     - 在 `nova-block/src/components/novablock/extensions/Emoticon.ts` 中，为表情包增加 `priority: 100` 的解析权重，并确保不仅匹配 `[data-emoticon]` 也能匹配所有后端的 `/api/emoticons/` 资源链接。
     - 在 `nova-block/src/lib/tiptapExtensions.ts` 的 `ResizableImage` 中，显式排除了表情包的匹配特征：`tag: 'img[src]:not([data-emoticon]):not([src*="/api/emoticons/"])'`。
     - 这保证了普通的内联表情和块级插图渲染各司其职，不会混淆拉伸。
2. **媒体接口 404 报错 (`/api/media/files/...`)**
   - **根因**: 之前的路由重构时，由于 fastapi 的路由优先级问题，`/api/media/files` 被匹配到了 `/api/media/music-library` 或者其他具体的路由中，导致旧版本的链接请求 404。
   - **修复**: 在 `backend/main.py` 中将旧路由 `app.mount("/api/media/files")` 挂载优先级提前，放置于新静态资源路由之前。
3. **编辑器控制台重复注册及 Tippy 报错**
   - **根因 1 (tiptap warn)**: `Duplicate extension names found: ['link', 'underline']` 是因为 `StarterKit` 默认包含了 `link` 和 `underline`（在较新版本的 `@tiptap/starter-kit` 中），而我们又在 `extensions` 数组中显式地引入并配置了 `Link.configure` 和 `UnderlineExtension`。
   - **修复 1 (tiptap warn)**: 在 `StarterKit.configure` 中明确禁用 `link: false` 和 `underline: false`，避免和自定义配置版本冲突。
   - **根因 2 (tippy warn)**: `tippy.js destroy() was called on an already-destroyed instance.` 这是由于 React 的严格模式或频繁重渲染导致的，之前引入 `tippyInstances` 全局引用池（`useRef(new Set())`）的方案反而加剧了生命周期混乱。
   - **修复 2 (tippy warn)**: 直接移除手动的 `tippyInstances` 管理逻辑。Tiptap 的 BubbleMenu 本身会自动管理 tippy 实例，交给底层组件处理即可，去掉画蛇添足的 `onMount/onHidden` 手动收集销毁代码。

## [2026-04-09] - 侧边栏与主页面空间纵深联动动效 (v0.10)

### 核心物理动效重构
- **主页面空间纵深感 (Depth Effect)**：
  - 当侧边栏展开时，主页面容器不再仅仅是被推开，而是伴随平滑的 **`scale(0.95)`** 缩放和 **`16px`** 圆角过渡。
  - 引入了 **`bg-black/5` 柔和遮罩层**，在侧边栏展开时自动显现，增强了主页面被推入屏幕深处的 3D 空间感。
  - 侧边栏收起时，主页面顺滑恢复 `scale(1)`、直角状态并移除遮罩。
- **高级贝塞尔曲线 (Easing)**：
  - 统一采用极度丝滑的 **`cubic-bezier(0.32, 0.72, 0, 1)`** 曲线，替代了原有的 linear/ease-in-out，确保动效利落且高级。
  - 整体时长设定为 **0.4s**，实现了快准狠的交互反馈。
- **状态提升与多组件联动**：
  - 将侧边栏的 `isCollapsed` 状态从 `SidebarTree` 内部提升至 `App.tsx` 全局管理，实现了侧边栏与主编辑区 (`<main>`) 的完美同步动画。

### 技术实现细节
- **Framer Motion 深度应用**：使用 `motion.main` 和 `motion.aside` 容器，通过 `animate` 属性实时响应全局状态。
- **性能优化**：为主容器添加了 `origin-left` 和 `shadow-2xl`，确保缩放过程中的视觉重心稳定且层次分明。
- **构建验证**：已通过 `npm run build` 测试，确保所有新增的 `motion` 组件和状态提升逻辑无报错。

## v0.09 - 动态表情包系统与快捷面板唤起 [2026-04-09]

### 表情包面板完全体
- **彻底脱离 BubbleMenu**：重构了表情包面板的挂载结构，将其从容易被 Tiptap 拦截销毁的 `BubbleMenu` 中抽离，采用 `fixed` 全局居中挂载与 `z-[99999]` 高层级，解决了点击笑脸按钮面板瞬间闪退的 Bug。
- **预装动态表情**：在 `data/emoticons/` 目录下预装了 Google Noto Animated Emojis，使用高品质 WebP 动态表情替换了原先的测试动图，支持面板秒开即用与点击插入。
- **合规合规声明**：新建 `CREDITS.md` 以确保 Google Noto 动态表情的 CC BY 4.0 商用合规声明。
- **极客唤醒快捷键**：拦截编辑器键盘事件，实现打字时敲击 `/e + 回车`，瞬间删除 `/e` 并唤起表情面板。

### [2026-04-09] - 接入 Google Noto Animated Emojis

- **高品质 WebP 支持**：编写批量下载脚本 `nova_repo/scripts/download_noto_emojis.py`，从 Google 官方 CDN 定向拉取 40+ 个常用高频表情的 512px 高品质 WebP 动态文件。
- **语义化命名**：所有下载文件均采用 `{unicode}_{name}.webp` 格式命名（如 `1f602_joy.webp`），确保后端能够精准识别并按语义排序。
- **清理测试数据**：删除了 `data/emoticons/` 下原有的 `test_bounce.gif` 等 3 个临时测试动图，完成从 Demo 到 Production 级表情资源的平滑过渡。


## [2026-04-09] - 表情包体验补全：预装动态 GIF & `/e` 快捷唤起

### 预装测试用动态表情包 (GIF)
- 新增脚本 `nova_repo/scripts/generate_test_emoticons.py`（Pillow）用于生成测试表情资源。
- 在 `nova_repo/data/emoticons/` 目录预置 3 个动态 GIF：
  - `test_color_blink.gif`
  - `test_bounce.gif`
  - `test_text_flash.gif`
- 可被后端 `/api/emoticons/list` 正常扫描，并可通过 `/api/emoticons/static/files/<filename>` 访问。

### `/e` + 回车 快捷唤起表情面板
- 在 `nova_repo/nova-block/src/components/novablock/NovaBlockEditor.tsx` 中新增 `editorProps.handleKeyDown` 拦截逻辑：
  - 当光标前 2 个字符为 `/e` 时：`preventDefault()` 阻止换行、派发 `delete` transaction 自动删除 `/e`，并 `setIsEmoticonPanelOpen(true)` 打开表情面板。

## [2026-04-08] - 彻底排查并修复表情包接口 404 及静态资源冲突 (v0.13)

### 核心修复与深度联调
- **后端配置补全 (config.py)**: 修复了 `nova_repo/backend/config.py` 中缺失 `emoticons_path` 属性的问题，确保 `data/emoticons` 路径解析正确。
- **静态资源挂载 (main.py)**: 
  - 在 `main.py` 中新增了表情包静态目录挂载 `/api/emoticons/static/files`。
  - **重要修复**: 将静态挂载路径与 API 路由路径分离，避免了 `/api/emoticons/files` 路径既作为 API 又作为静态目录导致的路由冲突。
- **接口路由重构 (routes.py)**:
  - 将 `/emoticons/list` 接口移动至路由定义前方，排除了潜在的路由拦截风险。
  - 更新了 `list_emoticons` 和 `upload_emoticon` 的返回逻辑，将图片 URL 统一指向新的静态挂载点 `/api/emoticons/static/files/`。
- **前端代理修复 (vite.config.ts)**:
  - 在 `nova_repo/nova-block/vite.config.ts` 中补齐了缺失的 `/api` proxy 配置，确保前端请求能正确转发至后端 8765 端口。
- **接口联调验证**:
  - 成功通过 `curl http://127.0.0.1:8765/api/emoticons/list` 验证，返回结果为标准的 JSON 列表格式（200 OK）。
  - 验证了图片 URL 拼接逻辑与前端 `EmoticonPanel.tsx` 的兼容性，确保表情包能正常显示。

---

## v0.08 - 贴纸系统完全体 (修复全局404、实现拖拽与体验微调)

### 核心修复与优化 (Sticker System & API)
- **后端 API 全面修复**：解决了后端 IPv6/IPv4 端口冲突导致的 404 错误，重构了 SPA 拦截逻辑，确保 API 请求（如 `/api/stickers/list`）不再被错误重定向至 `index.html`。
- **内网穿透适配**：改写前端 fetch 请求逻辑，引入 `getApiBase()` 动态识别环境，完美适配内网穿透与远程访问场景。
- **原生拖拽上墙 (Drag & Drop)**：在贴纸面板实现 HTML5 原生拖拽，支持将贴纸库资源直接拖拽至编辑器任意位置，并实现“落点即中心”的精准放置。
- **解决无限循环渲染**：重构了 `StickerLayer` 与 `NovaBlockEditor` 的通讯机制，将回调函数移出 React 状态更新周期，彻底消除了由于状态竞争导致的崩溃与白屏报错。
- **独立透明度与样式分离**：为贴纸引入独立的透明度调节功能，并与便利贴（Sticky Notes）实现架构层面的彻底分离，互不干扰。
- **防状态重置保护**：优化了数据保存与读取逻辑，确保在编辑器重渲染或切换笔记时，贴纸的位置、旋转角度、缩放比例及透明度得到持久化保留。

### UI/UX 体验升级
- **悬浮操作菜单**：将贴纸操作从“悬停触发”改为“点击选中”，避免鼠标经过时的视觉干扰。选中后唤起带有毛玻璃效果的精致控制面板。
- **头部按钮 Hover 菜单**：在编辑器顶部工具栏新增 Hover 悬浮菜单，集成一键清理、层级切换等快捷操作。
- **视觉反馈增强**：为选中的贴纸添加蓝色光晕外框与动态高层级阴影，提升交互的确定感。

### 2026-04-08 表情包系统 (Emoticon System) 404 修复与容错加强 (v0.12)

**修复表情包接口失效与前端渲染崩溃问题**

- **后端修复 (API Fixes)**:
  - **补全缺失路由**: 在 `backend/api/routes.py` 中新增了完整的表情包管理接口，包括 `/emoticons/list` (列表查询)、`/emoticons/upload` (图片上传)、`/emoticons/files/{filename}` (文件流式获取) 及 `/emoticons/files/{filename}` (物理删除)。
  - **自动化存储管理**: 接口会自动在 `data/emoticons` 目录下管理资源，并支持 `.png, .jpg, .jpeg, .gif, .webp, .svg` 等主流格式的扫描与下发。
  - **解决 404 报错**: 确保了前端请求的路径与后端注册路由完全匹配，杜绝了因路由缺失导致的 API 调用失败。

- **前端容错处理 (Frontend Robustness)**:
  - **防崩溃校验**: 在 `EmoticonPanel.tsx` 中对所有涉及 `emoticons` 数组的操作（`filter`, `map` 等）前增加了 `Array.isArray()` 严格校验。
  - **空数据兜底**: 将 `emoticons` 的初始状态及异常捕获后的状态统一强制设为空数组 `[]`，彻底解决了 `emoticons.filter is not a function` 导致的页面白屏或组件崩溃。
  - **渲染性能与安全**: 优化了删除操作后的状态更新逻辑，确保 UI 响应灵敏且不会触发无效的重渲染。

- **结果**:
  - 表情包面板现在可以正常加载、上传和删除资源。
  - 即使后端接口返回异常数据，前端也能优雅降级显示“没有找到表情”，而非直接报错崩溃。

### 2026-04-08 贴纸系统交互细节深度修复 (v0.11)

**修复贴纸透明度层级与操作状态下的状态冲突**

- **修复需求 1: 透明度应用层级纠正**
  - **问题**: 原先 `opacity` 应用在整个 `StickerItem` 容器上，导致贴纸变透明时，删除按钮、缩放把手等操作工具也随之变淡，甚至不可见。
  - **修复**: 将 `opacity` 样式从 `motion.div` 容器移除，**仅应用在内部的 `<img />` 元素上**。
  - **结果**: 无论图片透明度调得多低，悬浮的操作菜单和把手始终保持 100% 不透明度，确保编辑体验始终清晰。

- **修复需求 2: 操作状态锁定机制**
  - **问题**: 在拖拽、旋转或缩放贴纸时，若触发自动保存（外部 `sticker` prop 更新），内部 `useEffect` 会强制将 `localSticker` 重置为外部状态，导致操作过程中的实时位置/角度被瞬间“拉回”或重置。
  - **修复**: 在 `StickerItem` 的 `useEffect` 中引入 `activeAction` 判定。**当处于操作中（activeAction !== null）时，拒绝接受外部 prop 的同步更新**，锁定本地状态。
  - **结果**: 彻底解决了自动保存与手动操作之间的状态竞争问题，操作过程丝滑无干扰。

### 2026-04-08 贴纸系统交互与渲染修复 (v0.10)

**修复贴纸拖拽时的无限循环渲染 (Maximum update depth exceeded) 及显示异常**

- **问题根源**：
  1. **渲染死循环**：`StickerItem` 在 `mousemove` 期间直接触发父组件的 `onUpdate` 修改全局 state。由于 `NovaBlockEditor` 的 state 更新会触发整个编辑器的重渲染，在高频移动下引发了 React 的 `Maximum update depth exceeded` 报错，导致页面卡死。
  2. **URL 拼接缺失**：贴纸图片的 `src` 未经过 `getApiBase()` 处理，导致在跨域或内网穿透环境下无法加载图片（显示异常）。
  3. **层级与性能**：缺乏显式的 `zIndex` 管理和硬件加速，导致拖拽时可能被其他组件遮挡或出现视觉闪烁。

- **修复措施**：
  1. **局部状态隔离 (State Isolation)**：在 `StickerItem` 内部引入 `localSticker` 状态。拖拽、缩放、旋转及透明度调整过程中，**仅更新局部状态**，完全杜绝 `mousemove` 期间对父组件 `onUpdate` 的调用。
  2. **批量同步机制**：仅在 `mouseup`（拖拽结束）时，才调用一次 `onUpdate` 将最终位置和属性同步到全局 Note 数据源中，大幅降低了 React 协调压力。
  3. **API 路径加固**：在 `StickerLayer.tsx` 中引入 `getApiBase()`，对所有非绝对路径的贴纸 URL 进行智能拼接，确保图片在任何网络环境下均能秒开。
  4. **视觉与性能增强 (ui-pro-max)**：
     - 为贴纸容器添加 `will-change-transform` 和 `translateZ(0)`，强制开启 GPU 硬件加速，确保 60fps 的极致拖拽流畅度。
     - 动态管理 `zIndex`：拖拽激活时 `zIndex` 提升至 `100`，确保其始终位于最顶层，不会被 Tiptap 文本或便利贴遮挡。
     - 优化了图片样式，设置 `max-w-[200px]` 及 `h-auto`，配合 `pointer-events: none` 确保点击穿透逻辑正确。

- **结果**：
  - 彻底解决了贴纸拖拽导致的编辑器崩溃问题。
  - 贴纸在笔记中显示正常，路径解析正确。
  - 交互手感极大提升，拖拽响应达到原生级别。

### 2026-04-08 (v0.08)
- **Feature**: 推出“手账风贴纸系统 (Sticker System)”，实现极致性能的数字手账装饰体验。
- **Fix**: 修复贴纸系统 API 404 和 JSON 解析错误。
  - **根本原因**: 后端 `auth_middleware` 未豁免贴纸路径，且 `main.py` 中的静态文件 `mount` 与 `routes.py` 中的动态路由冲突，导致请求被 SPA Fallback 拦截并返回 HTML 导致 JSON 解析失败。
  - **修复方案**: 在鉴权中间件中增加 `/api/stickers` 豁免，移除 `main.py` 中冗余的 `mount` 配置，确保路由由 `routes.py` 统一处理。
- **三层架构布局**: 
  - **Level 1 (Top)**: 文字编辑与组件卡片层（Tiptap），支持文字覆盖贴纸。
  - **Level 2 (Middle)**: 动态贴纸层，支持图片与文字贴纸。
  - **Level 3 (Bottom)**: 笔记背景层。
- **交互模式隔离**: 引入“贴纸模式 (Sticker Mode)”开关。开启时可对贴纸进行新增、移动、缩放、旋转及透明度调整；关闭时贴纸层完全静默（`pointer-events: none`），不占用 CPU 事件负载。
- **性能优化 (ui-ux-pro-max)**:
  - 贴纸操作全面采用 **CSS `translate3d` 硬件加速**，避免重排与重绘。
  - 采用 `will-change-transform` 优化渲染链路。
  - 非编辑模式下禁用 React 事件监听，确保长笔记流畅度。
- **本地资源库**: 
  - 深度联动 Python 后端，自动扫描 `data/stickers` 目录。
  - 支持从本地直接上传图片至贴纸库，实现 100% 本地化数字资产管理。
- **精致新拟态面板**: 开发了带有毛玻璃效果 (`backdrop-blur-2xl`)、大圆角及优雅补间动画的贴纸选择面板。

### 2026-04-08 (v0.07)
 - **Release**: 版本升级至 0.07。
 - **Feature**: 深度重构倒计时 (Countdown) 为物理翻转时钟 (Flip Clock) 效果，采用纯 CSS 动画解决数字重叠与物理穿帮问题。
 - **Fix**: 修复 TodoWidget 的接口导出错误及环境同步问题。
 - **UI/UX**: 打卡日历 (HabitTrackerComponent) 重构为 Hobonichi 清冷手账风，引入虚拟印章打卡交互与杂志级排版。

 ### 2026-04-08 (v0.06)
 - **Release**: 版本升级至 0.06，包含打卡日历 (HabitTrackerComponent) 的 Hobonichi 杂志风重构、TodoWidget 的状态修复等功能更新。
 
 ## [2026-04-04] - 高级极简主义大纲目录 (TOC) 组件实现

### 核心功能
- **极简设计**：在静止状态下仅显示代表标题等级的水平横线，不占用正文空间。
- **动态交互**：鼠标悬停时平滑展开，显示标题文字，伴随毛玻璃效果和贝塞尔曲线动画。
- **自动提取**：集成 Tiptap 的标题提取逻辑，自动构建 H1-H3 层级树。
- **同步高亮**：利用 `IntersectionObserver` 实现滚动时的实时位置跟踪与高亮。
- **平滑滚动**：点击目录项可平滑跳转至对应正文位置。

### 技术栈
- **React**: 组件化开发。
- **Framer Motion**: 高级补间动画与状态切换。
- **Tailwind CSS**: 基础布局与响应式样式。
- **IntersectionObserver API**: 高性能的可见性追踪。

### 视觉细节 (ui-ux-pro-max)
- 使用 `cubic-bezier(0.4, 0, 0.2, 1)` 贝塞尔曲线。
- 采用 1.5px 的精致线条和 `text-[11px]` 的极简字体。
- 实现了展开时的模糊滤镜 (`backdrop-blur`) 和文字渐入 (`opacity + blur`) 效果。

## [2026-04-06] - 修复组件输入消失问题 & 还原 Blockquote 样式

### 核心修复
- **修复组件消失**: 修复了在 CodeBlock、Sticky Note 和 Footnote 中输入时导致组件消失的 Bug。主要原因是 `NovaBlockEditor.tsx` 中的状态同步逻辑在每次按键时不断调用 `setContent`，导致 ProseMirror 销毁并重建 NodeViews。现已将同步逻辑改为仅在 `note.id` 改变时触发。
- **严格 DOM 映射**: 重构了 `CodeBlockComponent.tsx` 和 `FootnoteComponent.tsx`，使其 React `NodeViewWrapper` 和 `NodeViewContent` 严格使用 `code` 和 `span` 标签，与 Tiptap 的 `renderHTML` 架构定义完美匹配，防止 ProseMirror 丢弃“无效”的嵌套节点。
- **拖拽事件冒泡**: 在 `StickyNoteComponent.tsx` 中重写了拖拽手柄的事件处理逻辑，严格执行 `e.preventDefault()` 和 `e.stopPropagation()`，并确保 `draggable={true}` 以允许正常拖拽。

### 样式调整
- **Blockquote 还原**: 更新了 `novablock-core.css`，将 Blockquote 的样式还原为最初的设计（`font-style: italic !important;` 以及固定的段落边距），符合用户的“初始实现样式”偏好。

## [2026-04-06] - Tiptap 注脚 (Footnote) 组件重构与自动序号系统实现

### 核心功能
- **全自动序号重排**: 实现 ProseMirror 插件 `footnote-reindexer`，通过 `appendTransaction` 实时监听文档变更。无论是插入、删除还是移动注脚，所有序号都会在毫秒级内自动重新计算并同步（[1], [2], [3]...）。
- **交互状态分离**: 
  - **View Mode**: 默认仅显示蓝色的数字序号 `[n]`，保持正文排版极致整洁。
  - **Edit Mode**: 双击序号即可唤起精致的编辑气泡框，支持实时内容修改。
- **高级悬停提示 (Tooltip)**: 鼠标悬停在序号上时，显示带有 **毛玻璃背景 (`backdrop-blur`)** 和 **平滑缩放/淡入动画** 的 Tooltip，优雅呈现注脚全文。
- **内联排版优化**: 严格遵循行内元素规范，采用 `inline-flex` 布局，确保在不同字号和行高下均能完美对齐。

### 技术栈与 UI/UX 设计
- **ProseMirror Plugin**: 负责底层文档树遍历与属性原子化更新。
- **Framer Motion**: 处理 Tooltip 和编辑框的所有补间动画，采用 `easeOut` 曲线。
- **UI-UX Pro Max**: 
  - 编辑框支持 `Cmd/Ctrl + Enter` 快捷保存。
  - Tooltip 采用 `bg-white/90` 半透明设计，增加 `shadow-[0_20px_50px_rgba(0,0,0,0.15)]` 增强悬浮感。
  - 蓝色序号在悬停时具备 `scale-110` 的动态反馈。

### 热修复
- **修复加粗字体颜色与主题适配**: 重构了 `strong` / `b` 标签在 `novablock-core.css` 中的样式，使其不再被不当的全局规则继承为白色。使用了可扩展的主题语义变量（`color: var(--text-primary, #111827)`）来保证其在当前的浅色背景（如 `bg-white`）下保持清晰可读，同时也能完美向前兼容后续即将开发的深浅色/自定义主题系统。不再依赖写死的白字或强制的 `!important`。

### UI 优化
- **待办事项完成动画**: 为 Tiptap TaskList 添加了纯 CSS 的完成效果。当勾选待办事项（`[data-checked="true"]`）时，文字会带有丝滑的过渡动画（`cubic-bezier`）并显示删除线、颜色变浅和透明度降低，增强“划掉待办”的视觉反馈。

### UI 优化
- **TOC 语义化主题变量与可见性修复**: 修复了 TOC（大纲目录）在浅色背景下非悬停状态横线几乎不可见的问题。通过引入语义化 CSS 变量（`--toc-line-muted` / `--toc-line-hover` / `--toc-line-active` 等），并结合 `@media (prefers-color-scheme: dark)` 为不同模式提供合理的默认值。
  - **设计提升**: 浅色模式下，非激活状态的横线可见度从 30% 提升至 40% (rgba(120, 113, 108, 0.4))，确保在白色背景下依然清晰可辨。
  - **健壮性**: 采用 CSS 变量方案，支持未来一键切换主题或自定义背景，且改动仅局限在 TOC 容器内，不影响全局。
  - **性能**: 保持原有的 `IntersectionObserver` 逻辑，无冗余 re-render。

### 热修复
- **TOC 静默状态对比度微调**: 重新调整了浅色模式下目录横线的基准变量（从使用 `stone-500` 透明度调整为直接使用基于黑色的 `rgba(0,0,0,0.15)`），解决部分浅色背景下横线对比度依旧偏低的问题。深色模式则使用 `rgba(255,255,255,0.3)` 来确保良好的辨识度。

### 热修复
- **TOC 悬停状态恢复**: 响应用户反馈，恢复了 TOC 在【鼠标悬停展开时】的高级视觉效果（毛玻璃背板 `backdrop-blur`、投影、以及圆角背景框），确保展开后目录层级清晰且具有原先受青睐的美感。同时保留了【非悬停静默状态】下无背景的极简设定，并进一步固化了主题 token 对深浅色双模式的支持。

### 热修复
- **TOC 非悬停可见度终极调整**: 彻底去除了 TOC 的所有背景颜色（无论是悬停还是非悬停），在悬停时仅保留纯净的 `backdrop-blur(12px)` 毛玻璃滤镜。同时，大幅提升了非悬停状态下的横线不透明度（达到 `0.35`），确保在没有背景衬托的浅色环境中也能清晰辨认。

### 热修复
- **TOC 非悬停可见度终极修复**: 找到了导致 TOC 在非悬停状态下隐藏横线的底层原因——原先的组件由于内部强加的 `overflow-hidden` 和固定宽度在失去背景板后导致了元素的布局截断。我们解除了强制隐藏与冗余 `padding`，将非悬停宽度从 40px 微调到 48px，并在内层 `div` 取消了 `overflow-hidden`，确保横线能够自然展现而不被裁剪缩回。

### UI 微调
- **TOC 静默状态视觉弱化**: 听取用户对于极简美学的要求，将非活跃状态的横线透明度降至极低的 `0.12`（深色模式 `0.15`），呈现“隐隐约约”的视觉边缘存在感。当用户滚动到特定区域时，当前标题的横线高亮才会真正脱颖而出，从而在“指示”与“不打扰”之间找到了最优雅的平衡。

### 交互优化
- **侧边栏悬停展示完整标题**: 解决了侧边栏笔记标题过长被隐藏的问题。添加了浏览器原生的 `title` 属性，当鼠标悬停在被截断的标题上时，可以显示出完整的笔记名称，既保持了侧边栏的整洁，又提升了信息可读性。

## [2026-04-06] - Sticky Note (便利贴) 体验优化

### 核心功能与交互
- **光标处流式插入**: 将便利贴的默认定位从绝对定位 (`position: absolute`) 改为相对流式定位 (`position: relative` + `inline-block`)。现在通过 `/` 斜杠菜单插入便利贴时，它会完美出现在当前光标所在的文档流位置，无需再从顶部固定位置拖拽。
- **内部滚动条 (防溢出)**: 为便利贴的内容区域添加了 `max-h-[260px]` 和优雅的内部滚动条 (`overflow-y-auto custom-scrollbar`)。当输入超长文本时，便利贴本身的大小不再无限撑大，而是保持精致的卡片比例。
- **隐藏式多巴胺/马卡龙色卡**: 
  - 在便利贴右上角新增了一个悬浮呼出的调色板图标 (`Palette`)。
  - 点击即可展开带有 Framer Motion 平滑动画的色卡面板。
  - 内置 12 种精心调配的马卡龙/多巴胺配色（阳光黄、樱花粉、薄荷绿、海冻蓝、香芋紫、蜜桃橘），每种颜色均提供“纯色”与“微透 (0.6 opacity)”两种质感，并支持实时无缝切换。

## [2026-04-06] - 修复文件拖拽功能 Bug 与 Heading 稳定性增强

### 核心修复
- **修复 `ensureHeadingIds` 报错**：在 `CollapsibleHeading.tsx` 扩展中显式实现了 `ensureHeadingIds` 命令，通过遍历文档树为缺失 ID 的标题自动生成基于内容的 Safe Slug 或随机 ID，解决了 `NovaBlockEditor.tsx` 在 `onCreate` 阶段因找不到该命令导致的崩溃。
- **修复 `NodeViewWrapper` 缺失报错**：重构了 `tiptapExtensions.ts` 中的 `FilePlaceholder` 组件，将原始 `div` 渲染修改为使用 `@tiptap/react` 提供的 `NodeViewWrapper` 包裹。这符合 Tiptap React NodeView 的架构要求，消除了控制台中的 `Please use the NodeViewWrapper component` 错误。
- **修复上传接口路径与多文件支持**：
  - 修正了 `api.ts` 中 `upload` 方法的请求路径（从 `/api/upload` 更改为后端实际挂载的 `/api/media/upload`）。
  - 重构了上传逻辑，支持并发处理多文件上传，并将字段名统一为后端期望的 `file`。
  - 在 `handleFilesUpload` 中添加了详细的错误处理和用户提示（Alert），当后端未启动或连接失败（`ERR_CONNECTION_REFUSED`）时，能够自动清理无效的占位符并告知用户。

### 细节优化
- **增强 ID 生成逻辑**：标题 ID 生成现在支持中文字符过滤（Safe Slug），并具备自动冲突检测（Counter 递增），确保 TOC 锚点跳转的唯一性。
- **文件卡片元数据同步**：修复了上传完成后 `FileNode` 属性（size, type）未能正确从后端返回结果中同步的问题。
- **UI/UX 鲁棒性**：增强了上传失败时的回滚机制，确保编辑器状态在网络异常时仍能保持干净、一致。

## [2026-04-06] - 万物皆可拖拽与本地文件预览 (Universal Drag & Drop)

### 核心功能
- **智能拖拽与粘贴 (Drag & Paste)**：深度集成 Tiptap 扩展，支持从系统资源管理器直接拖入文件或从剪贴板粘贴。
- **分类自动化处理**：
  - **图片/视频/音频**：上传后自动识别 MIME 类型，分别渲染为 `ResizableImage`、`VideoNode` 或 `AudioNode`，实现即时预览。
  - **通用文件 (PDF/Word/Excel 等)**：渲染为精美的 **「文件卡片 (File Card)」**，展示图标、文件名和格式化大小。
- **上传占位加载 UX (Placeholder)**：在文件上传期间，在编辑器内插入带有**脉冲动画 (Pulse Animation)** 和进度条提示的临时卡片，上传完成后无缝替换为实际内容，确保流畅的写作节奏。
- **本地程序唤起 (Open-in-System)**：点击文件卡片时，通过后端 `open-file` API 调用操作系统默认关联程序（Windows: `os.startfile`, macOS: `open`, Linux: `xdg-open`）打开文件，实现真正的本地联动。

### 技术栈与 UI/UX 设计
- **后端 (Python/FastAPI)**：
  - 新增 `/api/system/open-file` 接口，支持绝对路径与相对上传目录的安全解析。
  - 已有 `/api/media/upload` 与静态文件挂载逻辑。
- **前端 (NovaBlock/React)**：
  - **ProseMirror Plugin**: 拦截 `drop` 和 `paste` 事件，处理 `File` 对象队列。
  - **Tailwind CSS & Lucide**: 
    - File Card 采用 **Notion/Linear 风格** 的现代极简设计：`rounded-xl` 大圆角、`shadow-sm` 微阴影。
    - 增加 Hover 时的 `scale-105` 缩放反馈与背景色微变 (`transition-all duration-200`)。
    - 支持暗色模式 (`dark:bg-stone-900`)，保持灰阶克制。

### 细节优化
- **安全性**: 限制 `open-file` 仅能访问本地已存在的文件，并优先匹配上传目录。
- **UI Pro Max**: 文件类型标签 (Type Tag) 采用全大写字母与 `tracking-wider` 间距，增强专业感。
- **交互**: 在 File Card 右侧添加 `ExternalLink` 图标，暗示点击即可在外部打开。

## [2026-04-06] - v0.01 发布：拍立得风格 UI 与云端环境适配

### 核心更新
- **发布 v0.01**：正式发布项目初始版本，包含完整的块级编辑器脚手架。
- **“拍立得”风格 UI 上线**：彻底重构了多媒体卡片（图片、视频、音频）的展示 UI。引入了类似拍立得照片的视觉风格，包含精致的边框、阴影以及鼠标悬停时的微位移/缩放交互效果。
- **修复云端 500 错误**：修复了在云端代理（Strato Proxy）环境下，图片上传因 Content-Length 或路径解析问题导致的 500 内部服务器错误。
- **环境自适应**：完善了 `getApiBase` 逻辑，支持本地与云端环境的动态切换。

## [2026-04-07] - 发布 v0.02 版本：极速保存与拖拽性能优化

### 核心功能与修复
- **v0.02 版本发布**: 正式将版本更新为 0.02，专注于极致流畅度的编辑器底座打磨。
- **修复 React 渲染栈溢出 (Maximum update depth exceeded)**: 彻底重构了拖拽便利贴 (`StickyNoteItem`) 时的保存逻辑。拖拽的 60fps 坐标变化现已彻底脱离全局 `onSave` 渲染树，改为本地高频更新与统一的 3 秒 Debounce 后台静默合并保存。杜绝了因高频拖拽导致的页面死锁与崩溃。
- **修复 `onFlushSave` 解构遗漏**: 修复了属性面板（`PropertyPanel.tsx`）中 `ReferenceError: onFlushSave is not defined` 的报错，使得天气/心情等元数据的修改能够立即“Flush”当前笔记状态，实现保存的极速响应（所见即所存）。
- **同步机制升级 (Flush 模式)**: 确立了 "编辑器内部修改走 Debounce（防抖），外部元数据修改走 Flush（立即刷新）" 的高性能双轨保存架构。

### 规范与流程
- **约定 Commit Message 语言**: 根据用户偏好，今后涉及到 GitHub 提交、Release 注释以及更新说明的撰写，将全面采用**中文**，以便于后续回顾与文档同步。
## [2026-04-07] - 发布 v0.03 版本：Obsidian 级全局搜索体验 (Global Search & Quick Switcher)

### 核心功能与修复
- **v0.03 版本发布**: 正式将版本更新为 0.03，专注于知识库的全局检索与直觉导航体验打磨。
- **全局搜索侧边栏 (Global Search Tab)**: 
  - 在左侧边栏新增全局全文搜索面板，完美复刻 Obsidian。
  - 支持检索笔记正文、标题、便利贴 (Sticky Notes) 内容以及元数据标签 (Tags)。
  - 搜索结果自动提取匹配段落 (Snippet)，并对关键词进行毛玻璃高亮处理，点击可瞬间跳转至对应笔记。
- **极速命令面板 (Command Palette ⌘K)**: 
  - 引入了 Raycast / Mac Spotlight 级别的居中浮层搜索面板。
  - 支持快捷键 `Cmd/Ctrl + K` 随时唤醒。
  - 支持对标题与标签进行极速模糊匹配，支持上下方向键导航及回车一键跳转，极大地提高了键盘流效率。
- **修复**: 
  - 修复了因为直接从文件中导入 TypeScript 纯类型引发的 `Uncaught SyntaxError` 导致 Vite 白屏的 Bug。
  - 从 Git 追踪记录中剥离了 `__pycache__` 并统一配置了 `.gitignore`，一劳永逸解决了拉取代码时的冲突与缓存覆盖问题。
## [2026-04-07] - 手账风精致小组件 (Widgets) Phase 1

### 核心功能
- **倒计时 (Countdown)**: 马卡龙配色倒计时卡片，支持设置目标日期面板，实时显示天/时/分/秒。
- **黑胶播放器 (Music Player)**: 莫兰迪色系的可爱版音乐播放器，支持直接输入音频直链或上传，播放时带有 Framer Motion 驱动的丝滑黑胶唱片旋转动画。
- **迷你日历 (Mini Calendar)**: 基于 `date-fns` 的极简月历打卡组件。
- **斜杠菜单集成**: 已统一注册至编辑器 `/` 菜单的 "🧩 精致小组件" 分组下。

### 技术栈与 UI/UX 设计
- 深度利用 Tiptap React NodeView 架构，组件状态（日期、音频链接等）直接与底层 Node attributes 绑定，确保随文档实时无缝保存。
- 视觉严格遵循“手账/可爱”约束：`rounded-2xl` / `3xl` 超大圆角、马卡龙渐变底色、柔和阴影 (`shadow-sm` + `shadow-black/5`)，以及悬停时的轻盈浮动交互 (`-translate-y-1` + `transition-all`)。
## [2026-04-07] - 手账风精致小组件 (Widgets) Phase 2: 多列看板

### 核心功能
- **多列看板 (Kanban)**: 实现了一个完整的多列任务看板小组件，支持 "Todo"、"In Progress"、"Done" 等自定义列状态。
- **全局进度条**: 顶部集成了醒目的全局进度条 (Progress Bar)，实时计算并展示整体任务完成率。
- **任务管理交互**:
  - 支持在各列底部快速添加新任务。
  - 支持任务卡片在不同列之间左右流转（通过悬停时出现的左右箭头按钮操作）。
  - 支持任务勾选完成状态与一键移除。

### 技术栈与 UI/UX 设计
- **状态同步**: 通过 Tiptap 的 `updateAttributes` 实时将 React 级别的任务列表、列状态序列化并写入文档 Node 的 `attrs`，实现 0 延迟的持久化保存。
- **极致视觉体验 (ui-ux-pro-max)**:
  - 延续手账/可爱风格约束，采用莫兰迪色系渐变、`rounded-2xl` 大圆角卡片。
  - 运用 `shadow-sm shadow-black/5` 营造柔和的纸质层级感。
  - 任务卡片 hover 时具备轻微的 `-translate-y-1` 悬浮反馈与丝滑过渡 (`transition-all`)。
## [2026-04-07] - 手账风精致小组件 (Widgets) Phase 3: 倒计时组件 UI 深度重构

### 核心功能
- **重构时间输入面板**: 完全还原了视频演示中的倒计时设置面板交互，摒弃了之前的简易快捷按钮。
- **双输入模式**:
  - **倒计时时长模式**: 提供四个独立的精致数字输入框（天、时、分、秒），支持直接输入数字或通过微调器增减，自动换算为目标日期。
  - **具体日期模式**: 深度美化的原生 `datetime-local` 输入框（配有右侧日历图标），无边框沉浸式设计，支持精准到分钟的选择。
- **配置持久化**: 新增了“倒计时结束时显示气泡提醒”的 Checkbox 选项，并将配置状态 (`showBubble`) 连同 `targetDate` 统一保存在 Tiptap 的 Node attributes 中。

### 技术栈与 UI/UX 设计
- **受控状态管理**: 使用 React 内部 `useState` 管理面板的临时配置，只有在点击“确定”按钮后，才会调用 `updateAttributes` 将最终确认的数据序列化到文档节点，点击“取消”则无损回滚。
- **沉浸式内嵌面板**: 设置面板在激活时以内嵌浮层的方式覆盖卡片下半部，由 Framer Motion 驱动 `opacity` 与 `height` 的平滑展开动画。
- **视觉风格**: 维持 `bg-[#F6F3EF]` 莫兰迪底色，卡片采用 `bg-white/70 backdrop-blur` 毛玻璃材质，配合 `rounded-3xl` 和 `rounded-2xl`，将视频中精致的 UI 质感与现有的手账风格完美融合。
## [2026-04-07] - 音乐播放器 (Music Player) 究极进化：全局无缝播放架构

### 核心重构与痛点解决
- **全局无缝播放 (Seamless Playback)**: 将 `<audio>` 播放器内核从 Tiptap 的 NodeView 中彻底抽离，挂载到 React 整个应用的最外层 (`MusicContext`)。现在从 A 笔记切换到 B 笔记，音乐**绝对不会中断**，实现了真正的沉浸式后台播放体验。
- **全局悬浮胶囊 (Floating Music Capsule)**: 
  - 为解决用户“找不到去哪关音乐”的致命痛点，在软件右下角新增了一个全局悬浮的极简音乐胶囊。
  - 只要后台有音乐在播放（或暂停），胶囊就会自动浮现，包含微缩的旋转黑胶、歌名跑马灯、以及切歌/暂停/关闭按钮。
  - 关闭胶囊即可彻底停止音乐并清空后台状态，优雅且高效。
- **沉浸式收纳 UI**: 笔记内部的 `MusicPlayerComponent` 现已降级为“全局播放器的遥控器”。默认状态下自动收纳，隐藏繁琐的配置输入框，仅展示精美的旋转唱片机和基础播放控制。点击右上角设置按钮方可展开高级配置面板。

### 后端联动：本地专属音乐库
- **自动扫描与封面匹配**: 在 Python 后端 (FastAPI) 新增了 `/api/media/music-library` 接口，专门用于监控本地 `data/music/` 目录。
- **智能元数据提取**:
  - 自动识别目录下的 `.mp3`, `.wav`, `.flac` 文件，并自动以“去除后缀的文件名”作为歌名。
  - 自动匹配同名封面：如果目录下同时存在 `周杰伦-晴天.mp3` 和 `周杰伦-晴天.jpg`，系统会自动将该图片绑定为该歌曲的黑胶封面，无需用户手动配置，体验拉满。

### 动效修复
- **无缝黑胶旋转**: 修复了之前使用 Framer Motion 导致黑胶旋转不连贯、卡顿、以及进度重置的问题。现已全面改用纯 CSS 的 `linear infinite` 关键帧动画，确保唱片机的旋转如丝般顺滑。
## [2026-04-07] - 音乐播放器 (Music Player) 究极进化 Phase 2: 吸附收纳与统一库

### 核心功能与 UX 进化
- **全局胶囊边缘吸附 (Edge Snapping)**: 
  - 全局音乐胶囊现在支持使用鼠标自由拖拽。
  - 当拖拽靠近屏幕左右边缘时，胶囊会自动吸附并进入**“半显收纳状态”**（仅露出半个旋转的小黑胶）。
  - 鼠标悬停时平滑展开完整控制面板，移开后自动收回。极大地节省了屏幕空间，实现了真正的“沉浸式但不丢失控制”。
- **统一音乐库 (Unified Music Library)**:
  - 彻底改变了笔记内播放器的逻辑：所有音乐（无论是本地上传还是网络直链）都会被**永久收口保存到后端的 `data/music/` 文件夹中**。
  - **网络直链转 JSON**: 用户在笔记内填写的网络直链（如网易云/QQ音乐外链）及封面，会被后端保存为 `歌曲名.json` 文件。
  - 后端扫描接口 (`/api/media/music-library`) 现已支持同时解析实体音频文件 (`.mp3`, `.flac`, `.wav` 等) 和虚拟直链文件 (`.json`)，混合生成全局统一的播放列表。
- **全量控制按钮**: 笔记内的播放组件和全局胶囊均已补齐了完整的控制套件（上一首、播放/暂停、下一首、列表）。
- **马卡龙色悬浮列表 (Playlist Popover)**:
  - 新增了全局复用的 `PlaylistPopover` 组件。点击“列表”按钮即可在对应组件上方/下方弹出一个精美的悬浮列表。
  - 列表内展示所有歌曲，标注了当前播放状态，并区分了“本地实体”与“网络直链”来源，支持滚动和一键切歌。

### 格式与架构支持
- 后端扫描全面放开了格式限制，目前完美支持 `.mp3, .flac, .wav, .ogg, .m4a, .aac`。
- 新增了 `/api/media/music-link` (保存 JSON) 和 `/api/media/music-upload` (直传至 music 目录) 两个专属后端接口。
## [2026-04-07] - 音乐播放器 (Music Player) 究极进化 Phase 3: 体验打磨与链路打通

### 核心体验打磨
- **解决胶囊拖拽卡顿 (60fps 优化)**: 
  - **病因分析**: 原先 `framer-motion` 的拖拽组件和音频的 `progress`（每秒更新）绑定在同一个 Context 中，导致拖拽时发生严重的高频重渲染冲突（掉帧）。
  - **重构分离**: 运用 React 性能优化的极致手段，将高频变化的 `progress` 状态与低频变化的 `isPlaying / currentTrack` 状态从顶层剥离。悬浮胶囊现在变为纯 GPU 硬件加速的拖拽组件，彻底杜绝卡顿，如丝般顺滑。
- **修复胶囊吸附消失与断流问题**:
  - 重写了 `FloatingMusicCapsule` 的边缘吸附数学逻辑。现在当胶囊拖至左右边缘时，只会使用 `translateX` 将自身隐藏 80%，始终保留约 20px 的“半掩面”在屏幕可见区域内，防止被浏览器误判移出视口而强行卸载。
  - `<audio>` 内核被提升为真正的“不死之身”，常驻在 `MusicProvider` 的根节点，即使悬浮胶囊被完全隐藏，音乐也绝不中断。
- **攻破防盗链 (403 Forbidden)**:
  - 针对用户反馈的网易云等外链 403 报错，在 `index.html` 注入了隐形的 `<meta name="referrer" content="no-referrer" />` 黑科技。
  - 强制掐断了所有前端请求的来源追踪 (Referer)，完美绕过绝大多数国内音乐平台的简易防盗墙，使得网易云、QQ音乐的直链可以畅通无阻地在我们的黑胶唱片机上播放。
- **列表滚动体验**: 为悬浮的马卡龙色播放列表 (`PlaylistPopover`) 添加了 `max-h-[300px] overflow-y-auto` 与自定义的 `custom-scrollbar`，确保曲库丰富时的浏览体验。

### 本地音乐库全链路打通 (Hotfix)
- **后端 `main.py` 鲁棒性增强**：
  - 修复了 `upload_music` 接口的文件写入逻辑，增加了对 `FastAPI.UploadFile` 的安全文件名处理 (`Path(file.filename).name`)，防止非法路径溢出。
  - 确保上传文件流被完整读取并写入 `data/music/` 目录，并增加了目录自动创建逻辑。
  - 修正了 `/api/media/music-library` 返回的静态资源 URL 路径，解决了前端拼接时可能出现的双重 `/api` 导致 404 的问题。
- **IPC Bridge 指令补全**：
  - 为 `ipc_bridge.py` 补齐了 `media:music-library` 和 `media:music-link` 指令。这确保了在 Electron 环境下，即使 Python 后端未完全启动，前端也能通过 IPC 进程直接扫描和管理本地 `data/music/` 文件夹。
- **前端 `MusicContext` 链路打通**：
  - **强制初始化扫描**：修复了 `useEffect` 中的初始化逻辑，确保组件挂载时立即触发 `refreshPlaylist()`，从后端获取最新的全局曲库。
  - **URL 拼接优化**：重构了 `refreshPlaylist` 的地址转换逻辑，能够智能识别并适配本地 `127.0.0.1` 与云端代理环境下的静态资源访问路径。
- **前端 `api.ts` 策略调整**：
  - 将 `listMusicLibrary` 调整为高优先级的 `fetch` 模式，确保库扫描始终能够穿透到最真实的后端目录，解决了部分环境下本地库显示为空的顽疾。
- **上传反馈闭环**：
  - 确保 `MusicPlayerComponent.tsx` 在上传成功后立即触发全局 `refreshPlaylist()`，实现了“上传即看到，看到即播放”的无缝体验。
## [2026-04-07] - 音乐播放器 (Music Player) 究极进化 Phase 4: UI/UX 体验极客级抛光

### 核心体验抛光
- **黑胶封面全息映射 (Vinyl Cover Mapping)**: 
  - 修复了全局胶囊与笔记内组件的黑胶转盘封面未同步的问题。现在，无论在哪一个控制端，只要有歌曲播放，黑胶中心的圆盘都会精准映射该歌曲的专属封面 (`currentTrack.cover`)。
  - 对于没有配置封面的本地歌曲，精心设计了一款**马卡龙粉红渐变**的缺省黑胶中心图，彻底告别单调的硬编码灰度占位符。
- **胶囊边缘吸附算法重构 (Edge Snapping Logic)**:
  - 彻底重写了悬浮胶囊在拖拽松手时的物理边界计算逻辑。
  - **动态阈值判定**: 引入了基于胶囊当前中心点 (`centerX`) 与当前屏幕视口宽度 (`window.innerWidth`) 的相对距离计算。只有当胶囊被拖拽至距离屏幕绝对左右物理边缘极近的范围（`SNAP_THRESHOLD` 缩紧至 `80px` 以内）时，才会触发“半掩面”吸附效果。
  - 彻底解决了在宽屏显示器下“明明距离右侧边框还有很远，却提前早泄吸附”的严重误判 bug。
- **解决播放列表“腰斩”遮挡 (Portal Rendering)**:
  - 修复了在 Tiptap 笔记编辑器内点击“列表”按钮时，弹出的马卡龙悬浮列表被编辑器自带的 `overflow: hidden` 截断或遮挡的致命问题。
  - 运用了 React 最顶级的渲染魔法 **`createPortal`**，强行将整个 `PlaylistPopover` 弹窗传送并挂载到了网页的最顶层 (`document.body`)。
  - 配合 `getBoundingClientRect` 动态计算触发按钮的物理坐标，确保列表弹窗不仅拥有凌驾于一切组件之上的最高 `z-index` 永不被遮挡，还能像长了眼睛一样精准地贴合在触发按钮的附近。
## [2026-04-07] - 音乐播放器 (Music Player) 究极进化 Phase 5: 核心交互与显示 Bug 修复 (待验证)

### 修复内容详情
- **修复组件冲突与列表打开异常**：
  - 重构了 `MusicContext.tsx` 中的 `togglePlaylist` 逻辑，通过 `DOMRect` 坐标精确对比触发源，解决了胶囊与笔记组件同时存在时的交互冲突。
  - 确保所有触发按钮均传递 `e.currentTarget.getBoundingClientRect()`。
- **列表弹出位置与边界检测**：
  - 在 `PlaylistPopover.tsx` 中实现了智能定位算法。当列表弹出位置超出屏幕右侧或下方时，会自动向内偏移或向上弹出，确保 100% 可见。
- **封面映射错误修复**：
  - 修正了 `MusicPlayerComponent.tsx` 中的黑胶封面渲染逻辑，优先读取全局状态 `currentTrack.cover`，确保“全局单例遥控器”的视觉一致性。
- **本地音乐来源标识修复**：
  - **后端**：修改了 `/api/media/music-library` 和 `/api/media/music-link` 接口，扫描本地文件时显式打上 `source: 'local'` 标签，网络直链打上 `source: 'network'` 标签。
  - **前端**：`PlaylistPopover` 根据 `source` 字段精准显示“本地文件”或“网络直链”，不再单纯依赖 URL 字符串判断。

### Phase 5 追加修复 (Hotfix)
- **修复播放列表溢出视口顶部**：增强了 `PlaylistPopover.tsx` 中的边界检测算法。当下边界不足弹到上方，且上边界也依然超出视口时，强行将其固定在 `top: 10px` 的安全区，利用内部滚动条防止顶部被“腰斩”。
- **笔记组件封面全息同步**：移除了 `MusicPlayerComponent.tsx` 中自作聪明的 `isCurrent` 判断。现在即使该笔记配置的音频并未在播放，其黑胶封面也会被强制接管并显示全局正在播放的封面，真正实现了 100% “全局大脑遥控器”。

### Phase 5 终极追加 (Hotfix 2)
- **彻底切断笔记组件旧封面在无全局封面时的错误回退 (Ternary Fallback Leak)**：修复了当全局播放一首“无封面”的歌曲时，由于三元运算符的漏洞，导致 `MusicPlayerComponent` 错误地降级显示节点自身旧封面的 Bug。现在只要全局有歌曲播放，组件会无条件强制显示全局状态（包含没封面时的马卡龙默认底色），完全隔离了局部旧状态的干扰。

- [x] **Music Player Widget 重构 (2026-04-07)**: 彻底清理了 `MusicPlayerComponent.tsx` 中的初版局部数据 (`node.attrs.src` 等)。现在笔记内的播放器组件已升格为“纯粹的全局状态镜像遥控器”，完美与全局 `MusicContext` 同步，彻底修复了切歌后笔记组件UI“装死”的Bug。

- [x] **版本发布 (2026-04-07)**: 发布 v0.04 版本，解决了音乐播放器无法同步全局播放状态的遗留 Bug，提升了桌面小组件的稳定性和全息同步体验。
- [x] **打卡日历史诗级升级 (2026-04-07)**: 将打卡组件从局部数据孤岛彻底重构为基于 `HabitContext` 的全局状态镜像。全新设计了混合视觉（高级磨砂台历 + 马卡龙色 + 游戏化连胜火焰 🔥）。引入了多段进度打卡（如喝水8次）和 `framer-motion` Q弹动效，当达成单日目标时会触发 `canvas-confetti` 全屏撒花特效 🎉，支持历史日期补签。
- [x] **打卡组件深度修复与体验优化 (2026-04-07)**: 修复了 `HabitContext` 初始化时覆盖 LocalStorage 导致的刷新数据清空 BUG（改为惰性初始化）。为打卡组件增加了明显的下拉切换箭头。开放了设置面板的实时编辑能力（支持修改习惯名称、图标、马卡龙颜色和目标次数）。改进了打卡格子的交互逻辑：左键点击只增不减（封顶），右键点击撤销/减少，并为多目标习惯（如喝水8杯）增加了微型进度标识（如 `3/8`）。
- [x] **打卡日历手绘风爆改 (2026-04-07)**: 将打卡组件的 UI 彻底重构为带有纸张质感、粗犷描边与硬阴影的“新粗野主义手绘手账风 (Neo-brutalist / Hand-drawn)”。首创“表情包渐进式绘制”打卡法：格子内核心显示习惯图标的灰度线稿，随着点击打卡次数增加，全彩表情包利用 `clip-path` 从底部逐渐像“倒水”或“涂色”一样显形。点满后背景呈现高光蜡笔黄，并伴随 Q 弹放大与纸屑特效，全面提升了个人打卡的趣味性和情绪价值。
- [x] **打卡日历性能优化与高度自定义 (2026-04-07)**: 将打卡组件的每个独立格子剥离为 `<HabitCell />` 并使用 `React.memo()` 缓存，配合 `useMemo` 构建每日日志映射表 (O(1) 查表)，彻底解决了连续点击打卡时引发的严重掉帧问题。新增了“自定义打卡图标 (表情包)”与“自定义日历背景壁纸”的上传功能。上传的素材将优先调用本地 Python 服务的 `/api/media/upload` 接口物理保存到本地文件夹（断网或接口不可用时无缝降级为 Base64 存储至 localStorage）。不同的习惯可以配置完全不同的专属壁纸和打卡贴纸，极大地增强了数字资产的私有化属性与情绪价值。- [x] **版本发布 (2026-04-07)**: 发布 v0.05 版本，升级 HabitTrackerComponent 为新粗野主义手绘风，支持自定义图标、背景壁纸与多巴胺卡片颜色，并深度优化了渲染性能。
- [x] **待办组件全局化改造 (2026-04-07)**: 将待办组件（Todo Widget）升级为全局数据中心管理模式。新建 `TodoContext` 管理多清单（工作、生活、学习等），在不同笔记中插入的同个清单实时共享状态。重构 UI 采用手账风大圆角、弥散阴影与莫兰迪配色，增加勾选时的平滑颜色渐变与文字删除线动画。通过 `React.memo` 进行了性能优化，确保打钩丝滑不掉帧。

## [2026-04-08] - 倒计时 (Countdown) 翻转时钟深度修复与物理动效重构

### 核心修复
- **物理动画修正**: 彻底重写了 `FlipUnit` 的 DOM 结构与层级逻辑。新上半部（底板）在翻页前就已就位，翻页正面携带旧上半部折叠，露出背面携带的新下半部，完美遮挡旧下半部（底板）。彻底解决了之前“翻页背面显示错误”和“翻折瞬间数字跳变”的物理穿帮问题。
- **解决分钟花屏/重叠**: 
  - 优化了数据流向，将 `pad2` 补零和 `String` 转换逻辑从 `FlipUnit` 内部提升至父组件的 `useMemo` 中统一处理。
  - 确保传递给 `FlipUnit` 的 `value` 始终是格式化后的纯净字符串，杜绝了组件内部因多重状态竞争（current/old）引发的字符重叠。
- **纯 CSS 动画升级**: 废弃了 Framer Motion 驱动的动态 transform，改用极其稳定的 CSS `@keyframes flipDown`。配合 React `useEffect` + `setTimeout` 精确控制 `isFlipping` 状态，确保在 60fps 环境下动画逻辑与视觉状态严格同步。

### UI/UX 优化
- **物理遮挡增强**: 明确了四层渲染层级（新上、旧下、旧上翻折、新下翻折），增加了中间缝隙阴影的视觉引导，增强了“卡片翻转”的体量感。
- **鲁棒性**: 动画结束后自动清理 `isFlipping`标记，并同步 `prevValue`，为下一次翻页做好零延迟准备。

## [2026-04-08] - 修复 Todo 模块导出错误与环境重置

### 核心修复
- **修复 `Uncaught SyntaxError`**: 修复了 `TodoWidget.tsx` 中因为直接以“值”形式导入 TypeScript 接口 (`TodoTask`, `TodoList`) 导致的 Vite 运行时报错。现已统一改为 `import type` 显式声明，确保编译后的 JS 模块中不再包含不存在的导出引用。
- **环境对齐**: 将代码库硬重置 (git reset --hard) 至指定 commit `87a34572`，确保开发基准与生产预期完全一致。

## [2026-04-08] - 打卡日历 Hobonichi 清冷手账风重构

### 视觉与排版 (ui-ux-pro-max)
- **杂志级排版**: 摒弃传统单列设计，重构为左右图文排版。左侧展示习惯详情、莫兰迪色统计卡片及格言；右侧展示宽阔的日历打卡区。
- **清冷治愈色调**: 采用 `#FDFCFB` 奶油色纸张底纹，配合淡淡的 20px 间距点阵 (`bg-[radial-gradient]`)，营造静谧的手写质感。
- **复古印章打卡**: 首创“虚拟印章”视觉反馈。当打卡达成时，在格子中央落下类似红色油墨的 "DONE" 戳印，带有随机旋转角度和噪点滤镜，真实还原纸质手账的打卡爽感。
- **全篇衬线字体**: 强行应用 `font-serif` 衬线体，提升视觉层级与专业排版美感。

### 技术实现
- **响应式架构**: 采用 `flex-col md:flex-row` 确保在不同尺寸屏幕下依然保持完美的杂志比例。
- **动态印章组件**: 运用 `framer-motion` 模拟印章“盖下”时的缩放与震颤动效。
- **统计增强**: 新增月度达成率 (%) 和连胜统计的莫兰迪风格预览块。
- **配置持久化**: 深度集成 `HabitContext`，支持实时切换习惯、自定义主题色（Ink）及图标。


Fixed Flip Clock animation pure CSS

## [2026-04-09] - 修复 Media 静态文件 404 及 Tiptap/Tippy 警告

### 核心修复
- **修复 Media 静态路由被 SPA 拦截 (404 Not Found)**: 
  - **问题现象**: 请求 `/api/media/files/...` 返回了 `{"detail": "API endpoint not found"}` 的 404 错误，而不是预期的文件。
  - **根本原因**: 在 `backend/main.py` 中，SPA fallback 路由 (`/{full_path:path}`) 及全局的 `/api` 前缀拦截逻辑被放置在了 `app.mount("/api/media/files", StaticFiles(...))` 之前。导致所有到达 FastAPI 的媒体文件请求被错误判定为“未注册的 API 接口”而直接返回 404 JSON。
  - **解决方案**: 调整了 FastAPI 的中间件和路由挂载顺序。将 `app.mount` 静态文件挂载逻辑提前至 `app.include_router(router)` 和 SPA fallback 路由之前。确保静态文件请求能够被 `StaticFiles` 正确接管并处理。
- **修复 Tiptap Duplicate Extension 警告**: 
  - **问题现象**: 控制台持续输出 `Duplicate extension names found: ['link', 'underline']` 警告。
  - **解决方案**: 在 `NovaBlockEditor.tsx` 的 `StarterKit.configure` 中显式添加 `link: false` 和 `underline: false`，因为我们已经独立注册了自定义的 `Link` 和 `Underline` 扩展。
- **修复 Tippy.js Memory Leak 警告**: 
  - **问题现象**: 控制台输出 `tippy.js destroy() was called on an already-destroyed instance` 警告。
  - **解决方案**: 移除了 `NovaBlockEditor.tsx` 中手动维护的 `tippyInstances` `useRef` 追踪器及相关的 `onDestroy` 清理逻辑。Tiptap 的 `BubbleMenu` 内部已经完善地处理了 Tippy 实例的生命周期，移除多余的手动干预后，警告彻底消除。

### 细节优化
- **Media NodeView 兼容性**: 
  - 更新了前端 `nova_repo/nova-block/src/components/MediaNodeView.tsx` 中的路径解析逻辑。
  - 现已同时兼容旧版硬编码的 `/api/media/files/` 路径以及新版标准的 `/api/media/static/files/` 路径，确保旧笔记中的媒体文件也能正常渲染，无需进行数据库批量迁移。

### 遗留提示
- 路由已修复，目前请求不存在的文件会返回标准的 404 HTML/Text 而非 API JSON 错误。但是，对于特定的历史图片（如 `b714d05c-a849-4f33-b153-37bc2a15794a.png`），由于其在本地 `data/uploads/` 目录中确实**物理缺失**，依然会显示裂图。需要用户同步或重新上传缺失的实体文件。

## [2026-04-09] - 修复输入性能瓶颈与 React 无限循环崩溃 (Maximum update depth exceeded)

### 核心修复
- **修复输入卡顿与崩溃**: 
  - **现象**: 在包含较多内容或多次快速输入时，编辑器出现明显掉帧甚至触发 `Maximum update depth exceeded` 导致白屏崩溃。
  - **根因 1 (死亡螺旋重绘)**: 发现之前我们在 Tiptap 的 `onUpdate` 钩子中，每次按键都会**无条件**执行 `setIsDirty(true)`。这触发了 React 的重绘，而此时大纲或渲染管线同时处理状态，又间接触发了编辑器更新，陷入死循环。
  - **修复**: 在 `onUpdate` 和 `handleStickersChange` 中加入了保护屏障 `if (!isDirty) setIsDirty(true)`，一旦标记完成便不再重复触发多余的 `setState`。
- **性能重构: 剥离 `onUpdate` 同步保存**: 废弃了每次 `onUpdate` 直接 await `onSave()` 的高开销行为。现在输入时只维护本地 Ref 状态。真正的保存动作完全交由 `useRef` 控制的 3 秒 Debounce 防抖逻辑后台静默接管。极大提升了打字流畅度，杜绝打字过程中的粘滞感与意外的丢字覆盖。
- **引入大纲 TOC 防抖 (Debounce)**: 给原本同步提取标题大纲的 `updateOutline` 函数包裹了 `500ms` 的延迟执行。彻底解放主线程，不再因为寻找和生成锚点 ID 而拖慢每次按键的响应速度。

### 细节优化
- 完善了 `handleSave` 结尾的脏状态 (`isDirty`) 清除逻辑，现在会判断当前编辑器 DOM 中的内容是否与准备保存时完全一致，避免由于网络延迟，将用户在这 3 秒防抖期间新打入的内容误判为已保存。

## [2026-04-09] - 修复双向链接 (Bi-directional Links) API 404 与 500 错误

### 核心修复
- **修复 API 404 错误**: 
  - 之前侧边栏发出的 `/api/notes/{note_id}/backlinks` 及 `/api/notes/{note_id}/links` 接口抛出了 `404 Not Found`。
  - 在 `backend/api/routes.py` 中补充了对应的接口定义与数据查询逻辑。
- **修复创建笔记时触发的 500 错误 (SQLAlchemy Error)**:
  - 触发了数据库结构不一致问题。新增的双向链接在更新数据库时，由于 `note_links` 表中遗漏了新字段 `link_type` 导致 `sqlite3.OperationalError: no such column: note_links.link_type`。
  - 通过执行 `ALTER TABLE note_links ADD COLUMN link_type VARCHAR DEFAULT 'ai'` 命令修复了 `data/second_brain.db` 实体表的字段缺失问题，消除了创建笔记与访问链接接口时的报错。

## [2026-04-09] - 双向链侧边栏离线优先改造与标题动态同步修复

### 核心修复与重构
- **侧边栏离线优先改造**: 
  - 移除了 `BacklinksPanel.tsx` 中依赖后端 API (`/api/notes/...`) 的异步 `fetch` 逻辑。
  - 完全改为基于全局状态 `window.novaNotes` 的纯前端内存计算，通过正则 (`/data-id="(\d+)"/g`) 实时计算正向链接与反向链接。
  - 彻底解决了当应用以后端分离或纯前端模式运行（如 `nova-block` 独立演示站）时，因后端数据库无数据导致的面板不显示、报错 404/500 等问题。
- **标题动态全息同步**: 
  - 重构了 `NoteLinkNode.tsx` 的显示逻辑。之前 `[[笔记]]` 胶囊一旦插入，即使目标笔记改名，胶囊依然显示旧标题（因标题写死在 `label` 属性中）。
  - 新增 `realLabel` 响应式状态，组件挂载与全局笔记更新（`nova-notes-updated`）时，会自动通过 `data-id` 到全局 `novaNotes` 中查表获取最新的实时标题。
- **修复跳转未知笔记 Bug**:
  - 修复了因为 Tiptap 传出的 `data-id` 为字符串格式，而在 `App.tsx` 的 `handleSelectNoteEvent` 中错误地将其直接赋值给原本期待 `number` 类型的 `currentNoteId`，导致严格比对 (`===`) 找不到笔记从而显示空白页的问题。现已强制转化为 `Number(noteId)`。

### 细节优化
- 在 `App.tsx` 中每当笔记状态变更时，触发全局事件 `window.dispatchEvent(new Event('nova-notes-updated'))`，打通了编辑器扩展与侧边栏的响应式数据流。


## [2026-04-10] - Canvas 右键菜单与分组拖拽体验优化

### 1. Group 拖拽体验优化
- **移除 Group dragHandle 限制**：移除 `createGroupNode` 与 Group 节点初始化的 `dragHandle: '.canvas-group-drag-handle'`，使用户在分组空白区域也能直接拖拽移动。
- **UI 细节**：标题前把手恢复为普通 Icon（去掉 drag handle class），并为解散分组按钮补充 `nodrag`，避免误触拖拽。

### 2. 右键菜单新增「移入/移出分组」
- **ContextMenu 状态增强**：`contextMenu` 新增 `clickedNodeId?: string | null`，右键时记录命中的节点。
- **右键命中逻辑调整**：取消“只允许 group 节点右键”的拦截；在 `handleCanvasContextMenu` 中从 DOM 命中节点拿到 node id 并写入 `clickedNodeId`。
- **编排操作实现**：
  - `handleRemoveFromGroup`：使用绝对坐标换算，将节点从当前分组移出并保持视觉位置不跳动。
  - `handleMoveIntoGroup`：使用绝对坐标换算，将节点移入目标分组并同步 `parentId/extent`。
- **菜单渲染**：当右键点击卡片时，根据 `parentId` 渲染「移出分组」（红色按钮）或「移入分组」（二级菜单列出当前所有分组）。

### 3. 构建与产物同步
- `npm run build` 通过，并同步 `nova-block/dist/*` 到 `frontend_dist/`。

## [2026-04-12] - Ollama 保底引擎体验优化与前端引导提示

### 核心功能
- **完善 CPU 不兼容时的智能降级体验**:
  - 当 `llama-cpp-python` 因硬件指令集缺失（如报 Access Violation 0x0000000000000000）导致崩溃时，系统现已自动拦截该异常，并尝试无缝切换至本地部署的 Ollama 引擎。
  - **增强了 Ollama 连接探测与超时容错**: 将 `httpx.AsyncClient().get("http://127.0.0.1:11434/api/tags")` 的超时时间从 2.0 秒延长至 5.0 秒，避免 Ollama 服务启动较慢时被误判为不可用。
  - **更友好的前端报错与引导提示**: 如果 Ollama 确实未安装或未启动，现在的 Mock Error 模式会明确向用户输出引导文案：“系统未能连接到本地的 Ollama 服务（请检查是否已安装并启动 Ollama）。解决方案：1. 前往 https://ollama.com/ 下载并安装 Ollama (无需配置)。 2. 安装后，重新运行 start_windows.bat。” 彻底消除了用户在面对 C++ 编译报错与 Ollama 连接失败双重困境时的迷茫。
## [2026-04-12] - Ollama 保底引擎体验优化与前端引导提示 (Phase 2 - 零配置内置)

### 核心改进
- **实现“零配置”开箱即用**: 
  - 老大提出了关键要求：“既然是集成到项目里，为什么还要用户自己去下载安装 Ollama？”
  - 完美响应此需求：我们现在将官方的 Ollama 引擎（免安装的绿色独立版）**直接下沉打包进了 Nova 项目本身**！
- **自动获取并部署**:
  - 在项目根目录新增了 `ensure_ollama.py` 自动化脚本。
  - 当 `start_windows.bat` 运行时，会自动检查 `bin/ollama.exe` 是否存在。如果不存在，会自动从 GitHub 官方 Release 极速拉取 `ollama-windows-amd64.zip` (v0.3.14)，并解压到 `nova_repo/bin` 目录中。
- **环境隔离隔离与端口复用**:
  - 为内置的 Ollama 配置了独立的数据目录环境变量：`OLLAMA_MODELS=%cd%\data\ollama_models`。
  - 这个改变意味着不仅引擎是内置的，连转换和缓存出来的模型数据也都被妥善收纳在项目自己的 `data/` 目录中，避免污染用户的 C 盘系统盘，实现真正的便携式（Portable）体验！
- **无缝对接 fallback 机制**:
  - 优化了 `backend/services/local_ai.py` 中对 Ollama 的调用逻辑。现在代码会智能地优先寻找并使用我们内置的 `bin/ollama.exe` 去执行模型注册和响应工作，完美避开了各种环境配置错误。
## [2026-04-12] - 修复内置 Ollama 不兼容新型模型架构问题 (Phase 3)

### 核心修复
- **升级 Ollama 内核版本**: 
  - 老大运行模型时遇到 `unknown model architecture: 'gemma4'` 错误，原因是之前内置在项目里的 Ollama `v0.3.14` 版本过于陈旧，尚不支持最新的 Gemma 2 等模型架构格式。
  - 修改 `ensure_ollama.py` 自动化脚本，将目标版本从 `v0.3.14` 升级为最新的 `v0.5.7`，该版本完美兼容各种最新的模型格式和量化指令集。
- **平滑热更新机制**: 
  - 在 `ensure_ollama.py` 中引入了 `ollama_version.txt` 版本锁机制。
  - 现在当运行 `start_windows.bat` 时，脚本会自动检测内置引擎的版本号，如果发现是旧版本，会自动触发 `Upgrading integrated Ollama engine...` 进行更新替换，无需用户手动删文件。
  - 彻底解决了因为底层引擎落后导致的报错“服务不响应”。
## [2026-04-12] - 自动获取 GitHub 最新版 Ollama 引擎 (Phase 5)
- [x] **动态版本抓取**:
  - 修改 `ensure_ollama.py`，引入 `get_latest_ollama_version` 方法。
  - 通过 `https://api.github.com/repos/ollama/ollama/releases/latest` 接口动态获取最新发布标签（tag_name）。
  - 如果抓取失败（如网络受限或 API 速率限制），则自动回退至硬编码的 `v0.20.5` 稳定版，确保系统鲁棒性。
- [x] **版本同步更新**:
  - 移除了 `ensure_ollama.py` 中写死的 `current_version = "v0.20.5"`。
  - 每次启动 `start_windows.bat` 时都会自动触发版本检查，确保内置 Ollama 引擎始终保持最新状态，无缝兼容后续新增的模型架构。

## [2026-04-12] - 修复 Ollama 引擎版本号笔误 (Phase 4)

### 核心修复
- **更正升级版本号**:
  - 发现前一次热更新中将目标版本号误写为了 `v0.5.7`（2024年的老版本），导致升级后依然无法识别 `gemma4` 架构。
  - 现已在 `ensure_ollama.py` 中将目标版本更正为最新的 `v0.20.5`（支持最新的 Gemma 4 及相关指令集）。用户再次运行 `start_windows.bat` 将自动拉取并应用真正的最新版引擎，彻底解决模型加载失败（`unknown model architecture: 'gemma4'`）的问题。
## [2026-04-12] - 修复 AI 流式输出和无限循环 Bug (Phase 4)

### Bug 原因分析
- 之前的 Fallback 引擎 (Ollama) 在导入 `.gguf` 模型时，未提供对应的 `Modelfile` 模板 (`TEMPLATE`) 和停止词 (`stop words`)。
- 当 AI 没有停止词 (`<end_of_turn>`, `<eos>`) 时，它不知道自己在何处应当停止生成，因此会不断重复提示词，陷入无限循环输出。
- 因为这个无限重复循环包含了用户原样输入的 `Context: 快速测试...`，打破了预期的 XML `<Action>` 输出格式，导致前端只能原样流式输出文字，而未能识别成插入代码块操作。

### 核心修复
- **配置 Modelfile 模板与停止词**: 在 `nova_repo/backend/services/local_ai.py` 中生成 Modelfile 时，针对 Gemma 4 模型显式追加了完整的 `TEMPLATE` 以及 `PARAMETER stop "<end_of_turn>"`。
- **强制覆盖旧模型**: 暂时移除了启动时“如果模型存在就跳过”的逻辑，确保在下一次启动时强制使用带模板的 Modelfile 重新生成并覆盖旧的 `nova-local` 模型。
### 4. Tiptap 拖拽手柄 (Drag Handle) 结构化修复与布局重构 [2026-04-13]
- **彻底消除滚动 Y 轴漂移**: 
  - 在 `NovaBlockEditor.tsx` 中为自定义滚动容器 `.custom-scrollbar` 增加了 `onScroll` 监听。
  - 滚动时主动触发 `window.dispatchEvent(new Event('scroll'))`，强制同步底层 `Tippy.js` 的坐标计算逻辑，解决了长文档滚动下手柄“掉队”或“超前”的顽疾。
- **解决手柄与标题折叠按钮重叠冲突**: 
  - **横向间距重构**: 
    - 将 `DragHandle` 的 `offset` 调整为 `[-4, 44]`（向左偏移 44px），确保其位于最外层边缘。
    - 同步调整 `HeadingView.tsx` 的布局，将 `pl` 从 `1.8rem` 增加至 `2.2rem`，并将折叠按钮固定在 `left-2` (约 8px) 位置。
    - 实现了“手柄 - 折叠按钮 - 文本内容”的三段式横向排布，物理空间完全解耦。
- **优化点击与命中逻辑 (Hit Logic)**: 
  - 通过 `tippyOptions.appendTo: 'parent'` 和显式的 `zIndex: 110` 提升，确保拖拽手柄在交互层级上高于普通文本，但低于全局弹出菜单。
  - 为 `DragHandle` 增加了 `duration: [150, 0]` 配置，进入时平滑淡入，隐藏时即刻消失，消除了快速移动光标时的“残影”现象。
- **增强组件稳定性**: 
  - 在 `HeadingView.tsx` 中为 `NodeViewContent` 增加了 `inline-block w-full` 样式，确保点击标题行内任何空白区域都能正确触发选区，配合手柄进行整块拖拽。

### 5. TableOfContents React Key Duplicate Fix
- **修复背景**: 当编辑器快速输入或 Tiptap 异步生成标题 ID 时，偶尔会出现 `h-pending-X` 临时 ID 重复的情况，导致 `TableOfContents` 组件在映射渲染时触发 React Key 重复报错。
- **具体实现**: 
  - 修改 `NovaBlockEditor.tsx` 中的 `updateOutline` 提取逻辑，为每个 Item 显式构建 `key: baseId + '-' + pos + '-' + currentLevel` 复合唯一 Key，融合了元素 ID、文档绝对位置和层级信息，确保全局唯一。
  - 修改 `TableOfContents.tsx` 组件，优先读取 Item 的 `key` 属性作为 React 渲染 Key，彻底隔离了业务 ID 冲突对 UI 渲染层的影响。

## [2026-04-14] - AI 斜杠菜单加载动图替换与事务错配修复

### 核心功能
- **自定义像素女仆加载动图**: 
  - 响应老大需求，将原有的 AI 思考浮窗替换为直接在光标处插入自定义的像素女仆动图（`img_v3_...webp`）。
  - 使用 `@tiptap/core` 正式注册了自定义行内节点 `aiLoadingPlaceholder`，解决了直接插入 HTML 字符串被 TipTap 清洗过滤导致“只有黑框一闪”的问题。
- **完美流式生命周期**: 
  - 当用户在 Slash 菜单触发 AI 写作时，动图以行内节点形式立即在光标处占位展示。
  - 当 AI 接口返回第一块（First Token）内容时，系统精确查找到该占位节点并将其安全销毁，随后无缝接力流式文本输出。

### 痛点修复
- **修复 `Uncaught RangeError: Applying a mismatched transaction`**: 
  - 之前触发 Slash 菜单命令时会产生事务冲突崩溃。原因是 TipTap 的 Slash 插件内部在执行命令时是一个同步事务流（包含清空触发词等操作），而我们的 `handleAIWrite` 会立即插入图片，直接打断并污染了原来的命令事务。
  - **解决方案**: 将 `ai-write` 的事件派发包裹在一层 `setTimeout(..., 0)` 中，让 TipTap 的前置事务彻底执行完毕后再触发占位图插入，从根本上消除了事务错配报错。
- [x] Fixed Background Paper white screen crash by adding React.memo and setTimeout to defer onSave
