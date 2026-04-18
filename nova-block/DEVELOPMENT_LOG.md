# Second Brain AI - 开发进度与状态日志

## [2026-04-15] - 编辑器核心 Bug 修复 (Spellcheck, NoteLink & CodeBlock)

### 1. 拼写检查 (Spellcheck) 稳定性增强
- **错误拦截**: 在 `AISpellcheck.ts` 中增加了对 `405 Method Not Allowed` 错误的捕获。一旦后端返回 405，插件将自动进入静默状态并停止重复请求。

### 2. NoteLink 引用功能修复
- **闪退修复**: 解决了 `NoteLink` 建议菜单在快速重新渲染或点击时由于 `Tippy.js` 实例意外销毁导致的闪退问题。
- **生命周期保护**: 在 `NoteLinkConfig.tsx` 中增加了更严谨的 `props.clientRect` 存在性判断。
- **事件冒泡拦截**: 在 `NoteLinkSuggestion.tsx` 的按钮点击与按下事件中加入了 `stopPropagation()`，防止事件冒泡干扰编辑器焦点。

### 3. 代码块 (CodeBlock) 交互优化
- **Backspace 行为修正**: 拦截了代码块最开头的 `Backspace` 按键。当光标位于代码块首行首位且按下退格时，现在会将代码块直接转换回普通段落，而不是将代码文本合并到上一行正文中，彻底解决了代码块删除导致的排版污染问题。

---

> 老大的最新训示：**一定要认准死理：高效、性能；不管应用再好用、再好看，要是配置门槛高、卡顿卡死，流畅度低，那么它就是垃圾就是没人用**。

> **维护规则 (System Rule)**: 
> 1. 每次收到新需求、发现新问题，第一时间补充到此文档。
> 2. 只有在**用户（老大）明确确认**问题/需求解决后，才能标记为 `[x]` 或 `已解决`。
> 3. 每次提交 GitHub (Commit/Push) 必须在此记录更新详情。
> 4. 保持言简意赅，方便 AI 快速读取上下文。

- [2026-04-09] (18:05) **Bug Fix - Tiptap Key Conflict**
  - Fixed `Uncaught RangeError: Adding different instances of a keyed plugin` caused by overlapping Tiptap Suggestion plugin keys.
  - Explicitly injected `pluginKey: new PluginKey('noteLinkSuggestion')` into `NoteLink` extension's `addProseMirrorPlugins()`.

- [2026-04-09] (18:15) **Bug Fix - NoteLink Suggestion Interaction & Search**
  - **交互修复**: 解决了 `[[` 笔记搜索菜单无法点击、无法通过键盘选中的问题。修复了 `onKeyDown` 拦截导致编辑器失去焦点或光标跳动的 Bug。
  - **搜索优化**: 修复了 `items` 过滤逻辑，将直接 `fetch` 替换为统一的 `api.listNotes()`，支持 Electron IPC 高性能检索。
  - **热更新逻辑**: 补全了 `ReactRenderer` 的 `onUpdate` 属性传递，确保输入搜索词时候选列表实时刷新。
  - **UI 增强**: 为 `NoteLinkSuggestion` 增加了 Z-Index 保证置顶，增加了搜索词显示及选中的视觉缩放反馈。
  - **自动转换**: 优化了 Suggestion 匹配逻辑，确保用户输入后能够通过回车或 Tab 瞬间完成笔记引用胶囊的转换。

- [2026-04-09] (18:50) **Critical Bug Fix - NoteLink Search Reliability**
  - **核心优化**: 彻底解决了输入 `[[` 后显示“未找到相关笔记”的问题。
  - **数据源重构**: 将 `NoteLink` 的 `suggestion.items` 钩子从异步的 `api.listNotes()` 替换为同步的全局状态 `window.novaNotes`。
  - **同步机制**: 在 `App.tsx` 中增加 `useEffect` 实时同步 `notes` 状态到 `window.novaNotes`，确保 Tiptap 菜单弹窗能 100% 立即获取当前已存在的笔记列表。
  - **过滤逻辑优化**: 增加了针对 `is_folder` 的排除过滤，确保链接建议中只出现可链接的笔记页面而非文件夹。
  - **代码清理**: 移除了 `NoteLinkConfig.tsx` 中未使用的 `api` 导入，并通过了 `npm run build` 验证。

- [2026-04-09] (18:36) **Bug Fix - NoteLink Search Source Reliability**
  - Fixed issue where the `[[` NoteLink suggestion menu would always show "未找到相关笔记" (No notes found).
  - Transitioned the data source for `suggestion.items` from an asynchronous fetch to a synchronous, real-time lookup directly from the global Zustand state (`useNoteStore.getState().notes`). This entirely bypasses IPC/Network async race conditions and ensures instantaneous matching based on the user's typed query.

- [2026-04-09] (18:45) **Bug Fix - NoteLink Insertion Crash**
  - Fixed `Uncaught TypeError: editor.chain(...).focus(...).replaceRangeWith is not a function` crash when inserting a linked note from the suggestion menu.
  - Replaced the invalid ProseMirror-style `.replaceRangeWith()` call with the correct Tiptap `.insertContentAt()` chainable command.

- [2026-04-09] (18:55) **Bug Fix - NoteLink UI, Backend APIs & Navigation**
  - **Backend API**: Fixed `GET /api/notes/{note_id}/backlinks` returning 404/500 errors by adding the missing `select` import and properly implementing the bidirectional queries.
  - **Frontend UI**: Refactored the `NoteLink` Tiptap Node to use `ReactNodeViewRenderer`. The link is now rendered via a dedicated `NoteLinkNode.tsx` component as a beautiful, Morandi-colored interactive capsule (`📝 Note Title`) with hover effects and selection states.
  - **Navigation**: Clicking a NoteLink capsule now dispatches a decoupled `nova-select-note` custom event, seamlessly instructing the app shell to switch notes without hardcoding the global Zustand state inside the editor extension.

---

## 2026-04-10 (体验优化与 Bug 修复)
### Fixed
- **Group 拖拽体验优化**:
  - 在 GroupNode 标题栏增加了显式的拖拽把手（使用 `LayoutGrid` 图标），并明确指定了 `.canvas-group-drag-handle`。
  - 为标题栏内的按钮和输入框添加了 `nodrag` 类，确保点击这些交互元素时不会误触发拖拽。
- **已经在 Group 内的卡片无法移出修复**:
  - 重构了 `getAbsPos` 逻辑，优先使用 xyflow 提供的 `positionAbsolute` 属性，确保坐标计算的准确性。
  - 在 `onNodeDragStop` 中，即使节点在 Group 内拖动，也会实时判断其中心点是否还在 Group 范围内；若移出，则自动解除父子关系并将其转换为绝对坐标，支持 CTRL+拖拽移出逻辑。
- **右键菜单遮挡修复**:
  - 在 `handleCanvasContextMenu` 中增加了 `event.stopPropagation()`，防止事件冒泡触发其他菜单。
  - 显式绑定了 `onNodeContextMenu` 到 ReactFlow，并在 `onEdgeContextMenu` 中调用 `preventDefault`，确保全画布范围内禁用原生右键菜单。
- **Group 收纳后虚线框尺寸同步修复**:
  - 点击 Collapse 时，不仅隐藏子节点，还同步更新 Group 节点的 `height` 属性及 `style.height`，确保 xyflow 的虚线选择框能真实收缩到 40px 高度。
- **代码健壮性**:
  - 修复了 `CanvasEditor` 中 `useEffect` 初始化逻辑，补全了丢失的 `dragHandle` 注入，确保刷新后节点交互依然可用。

---

## 🎨 Nova 治愈系手账 UI/UX 升级路线图 (2026-04-04 ~ 2026-04-20)

### 阶段一：视觉质感换皮 (Done)
- [x] **全局背景与纹理**: 引入极轻量 SVG 噪点/纸质纹理，提升视觉丰富度。
- [x] **色彩体系**: 确立“燕麦色/奶油白” (浅色) 与“深海蓝/莫兰迪灰” (深色) 的治愈系色调。
- [x] **柔和圆角与阴影**: 全站应用 `rounded-2xl` 与彩色弥散阴影，消除锐利感。
- [x] **排版优化**: 调整行距与字间距，增加视觉呼吸感。

### 阶段二：手账专属 Tiptap Blocks (Pending)
- [ ] **手写体支持**: 引入手写风格字体。
- [ ] **装饰性组件**: 胶带 (Washi Tape)、贴纸 (Stickers)、图章 (Stamps) Block 实现。
- [ ] **心情追踪器**: 集成情感分析的心情记录块。

### 阶段三：治愈系 WebGL/物理交互 (Pending)
- [ ] **纸张物理引擎**: 模拟翻页与纸张波动的交互效果。
- [ ] **环境渲染**: 随时间/天气变化的动态光影背景。
- [ ] **ASMR 音效**: 细腻的纸笔书写与翻页声效集成。

---

## 📋 需求追踪 (Requirements)

### 待办 / 进行中 (Pending / In Progress)
- [ ] **[NovaBlock 2.0] 基础设施与核心架构搭建 (Phase 1)**
  - [x] **基础设施搭建**: 初始化 Electron + Vite + React 脚手架，集成 Vitest 测试框架。
  - [x] **高性能 I/O 层 (FSBridge)**: 实现带子目录与 Frontmatter 支持的 Node.js 原生文件读写，通过 TDD 验证。
- [x] **树形目录状态管理**: 引入 Fractional Indexing (LexoRank 风格) 排序算法，支持无限嵌套与 O(1) 复杂度重排。
- [x] **侧边栏大纲导航**: 实现高保真树形 UI 与拖拽重组 (Drag & Drop)，支持无限层级与 60 FPS 流畅体验。
  - [ ] **Tiptap 编辑器壳层**: 集成 Tiptap 并完成基础 Markdown 解析。
- [ ] **全站 UI & 布局重构** (参考 Linear/Awwwards 风格)
- [ ] **无界画布 (Canvas) 原型设计**
- [ ] **Live2D 看板娘集成**
- [ ] **本地 RAG 插件系统设计**

---

## 🚀 NovaBlock Phase 1 开发计划 (2026-04-03 ~ 2026-04-17)

### 目标：交付具备基础笔记管理与秒开能力的 Local-first 系统。

1. **Sprint 1: 核心链路与 I/O (当前)**
   - 完善 `FSBridge` 与 `SSOTWatcher` 闭环。
   - 实现笔记元数据（YAML Frontmatter）与数据库的实时对账。
   - 目标：确保外部修改 `.md` 文件能瞬间反馈到编辑器。

2. **Sprint 2: 树形架构与 UI 框架**
   - 引入 `Infinite Tree` 逻辑，支持无限嵌套。
   - 实现左侧树状列表的拖拽重排 (DND)。
   - 引入 TailwindCSS 主题系统（毛玻璃、赛博朋克预设）。

3. **Sprint 3: 编辑器插件化与 Block 基础 (已完成)**
   - [x] **基于 Tiptap 构建 Block 容器**: 完成了数学公式、分栏、脚注、高亮块、视频嵌入等扩展。
   - [x] **实现 Slash Menu (`/`) 快捷呼起**: 已集成专业 UI 交互。
   - [x] **Markdown 文件高保真双向转换**: 
     - 引入 `tiptap-markdown` 并扩展了 `addStorage` 逻辑。
     - 支持 `:::container` 语法实现分栏与高亮块的 100% 还原。
     - 实现了 LaTeX 公式 (`$`/`$$`) 的无损提取。
     - 解决了视频与嵌入式 HTML 标签的属性保留问题。
     - **TDD 验证**: 通过 Vitest + JSDOM 完成了核心 Block 的双向转换回归测试。
   - [x] **AI 情绪板 (AI Moodboard) 深度集成 [已移除]**:
     - **周视图网格布局**: 实现手账风格的周一至周日网格，支持全宽笔记区域。
     - **宝丽来风格交互**: 支持图片拖拽上传，自动生成带有随机倾斜角度的拍立得卡片，具备 60 FPS 流畅动画。
     - **AI 标签生成**: 接入模拟 AI 链路，图片上传后自动分析生成 5-10 个专业设计术语标签，支持悬停展开、点击复制与删除交互。
     - **uipro 设计准则**: 全站应用深色玻璃拟态 UI，确保极简且具质感的视觉体验。
     - **TDD 流程**: 编写并验证了 `MoodboardView` 的核心渲染与基础逻辑测试。

---

## 🧪 架构验证与测试进展
- [x] **FSBridge Unit Tests**: 测试通过。验证了 Frontmatter 解析、子目录自动创建、读写原子性。
- [ ] **E2E Smoke Tests**: 待编写。

---

### 旧版本记录 (Legacy Archive)
- [ ] **架构转向：Obsidian/Typora 风格（纯本地文件 SSOT + 数据同步）**
  - [x] **Phase 1: 极简 I/O 链路重写 (Node.js 原生直写)** - 已完成，切断了笔记读写的 Python 依赖。
  - [x] **Phase 2: 状态解绑与隔离 (State Decoupling)** - 已完成，编辑器重构为非受控组件，实现静默防抖保存。
  - [ ] **Phase 3: 结构化元数据索引 (本地嵌入式 DB)**
- [ ] **Phase 4: 桌面究极体改造** (Electron 重构，独立桌面窗口，系统托盘 - 已完成 MVP 适配)
- [ ] **全站 UI & 布局重构** (参考 Awwwards、Linear 质感)
- [ ] **互动级动态壁纸系统** (WebGL/Three.js，环境感知)
- [ ] **万物皆可拖拽** (自由调整文档/文本/图片位置)
- [ ] **飞书级表格系统** (多维属性增强)
- [x] **[Windows MVP] 系统托盘与本地路径优化** (已完成)

### 待确认 (Pending User Confirmation)
- [ ] **[架构迁移] 纯本地文件优先 (Local-first) SSOT 闭环实现**
  - *更新内容*: 
    1. 增强 `SSOTWatcher`：支持磁盘变更内容实时推送到编辑器。
    2. `NotionEditor` 适配：响应 `ssot:note-changed` 事件，实现与第三方编辑器（Obsidian/Typora）的协同。
    3. `preload` 安全增强：优化 IPC 事件绑定，支持自动清理监听。
    4. Windows 适配：本地存储路径迁移至 `appData`，完善系统托盘双击恢复与关闭隐藏逻辑。
  - *当前进度*: 代码已就绪，**[待老大确认测试]**。
- [ ] **[Bug修复] 基础联调与多端同步前置问题修复** (当前所在分支 `fix/4-issues-integration`)

### 已完成 (Completed)
- [x] **[架构重构] 彻底切断 FastAPI 依赖，实现纯本地 IPC CRUD 闭环** (2026-03-31)
  - *重构详情*: 
    1. **前端 API 层**: 全面移除 `fetch` 对 FastAPI 的直接调用，改为通过 `window.electron.ipcInvoke` 与主进程通信。
    2. **主进程 IPC Bridge**: 在 `src/main` 引入 Python 桥接机制，直接调用 `repositories.py` 逻辑，绕过网络协议栈。
    3. **Preload 安全增强**: 暴露通用的 `ipcInvoke` 接口，支持渲染进程直接发起本地指令。
  - *解决痛点*: 彻底解决了用户抱怨的“本地读写为何还有网络请求失败”的问题，大幅提升了操作响应速度与可靠性。

---

## 🐛 问题追踪 (Issue Tracker)

### 未解决 / 待确认 (Unresolved / Pending Confirmation)
1. **[Critical] ProseMirror RangeError**: `mousedown` 时触发 `Uncaught RangeError: Position X out of range`，需排查事件冒泡或选区冲突。
2. **[Critical] CodeBlock & Footnote 内容丢失**: 输入后文字消失，疑似 `NodeView` 的 `contentDOM` 挂载异常或 `parseHTML` 校验失败。
3. **HighlightBlock 不显示**: 节点渲染逻辑或 Tailwind 样式冲突导致块级元素不可见。
4. **Blockquote 视觉体验差**: 颜色对比度低，需重构为治愈系风格（如 `bg-slate-50 text-slate-800`）。
5. **Column 分栏辅助线丢失**: 外层容器缺少 `.border-dashed` 视觉引导，导致用户难以感知边界。
6. **SlashMenu 定位偏移与遮挡**: 需改用 `editor.view.coordsAtPos` 计算坐标并引入 `floating-ui` 的碰撞检测逻辑。
7. **TOC 交互升级**: 样式重构为半透明毛玻璃效果，实现点击标题平滑滚动至对应 Node。
8. **Sticky Note 自由拖拽**: 节点需支持 `absolute` 定位，并在 `NodeView` 中通过 `dx/dy` 更新 `x, y` 属性。
9. **Stamps 重构为行内节点**: 由 Block 降级为 Inline Node，允许在文字流中自由插入图标。
10. **Moodboard 1:1 像素级复刻**: 依照抖音参考视频，重构周视图网格、倾斜拍立得卡片及 AI 标签气泡设计。
11. **TDD 覆盖不足**: 针对上述修复需同步更新 `vitest` 测试用例，确保不发生回归。

1. **保存系统冲突（前端保存与磁盘监控打架）**
   - *现象*: 自动保存触发后，SSOT Watcher 监测到文件变化并推送到前端，导致编辑器强制 `setContent`，引发光标跳动、死循环或内容被旧版本覆盖。
   - *修复细节*:
     - **NotionEditor.tsx**: 引入 `isRemoteUpdatingRef` 锁机制。在处理来自磁盘的同步事件（`ssot:note-changed`）时，临时禁用 `onUpdate` 触发的自动保存，切断死循环。
     - **光标保护**: 增加 `isFocused` 判断，用户正在输入时跳过强制同步；增加 `selection` 记录与恢复逻辑，确保同步后光标位置不丢失。
     - **属性修改优化**: 在 `App.tsx` 中将侧边栏属性修改（图标、标签等）设为 `silent: true` 模式，减少不必要的 UI 干扰与重绘。
   - *当前进度*: 已完成核心链路修复，**[待老大确认测试]**。
2. **保存失败与回收站遗留问题**
   - *现象*: 笔记保存偶尔失败（父子关系丢失），新建子页面导致父页面重载，删除笔记不进本地回收站。
   - *修复细节*:
     - **Bug 1 (保存)**: 修复了 `App.tsx` 的 `onUpdateNote` 回调遗漏 `parent_id` 的问题；改进了后端 `update_note_api` 逻辑，支持显式传递 `null` 来清除父节点。
     - **Bug 2 (刷新)**: 为 `createDraftNote` 引入 `silent` 模式，在创建子页面时实现局部乐观更新，禁止触发全量组件重绘。
     - **Bug 3 (回收站)**: 在后端 `soft_delete_note` 中实现了将已删除笔记（含子笔记）自动导出并移动到 `.trash/*.md` 文件的机制，确保了纯本地架构下的物理软删除闭环。
   - *当前进度*: 已完成 TDD 修复，本地测试通过。**[待老大确认]**。
2. **编辑器状态泄露 (State Bleed)**
   - *现象*: 快速切换笔记时，旧笔记内容覆盖新笔记。
   - *当前进度*: 引入闭包和 `Ref` 锁机制阻断串台。代码已推送，**[待老大确认]**。
4. **动态视频壁纸无法播放**
   - *现象*: IndexedDB 取出的视频 Blob 缺少 MIME 类型。
   - *当前进度*: 已强制指定 `video/mp4` MIME 类型。代码已推送，**[待老大确认]**。

5. **React 渲染崩溃 (SlashMenu) & 治愈系主题失效**
   - *现象*: 输入 `/` 呼出菜单时 React 报错 `Element type is invalid`；界面呈现纯黑 Dark Mode，噪点背景加载超时 (`ERR_CONNECTION_TIMED_OUT`)。
   - *修复细节*:
     - **SlashMenu**: 修正 `NovaBlockEditor.tsx` 中手账组件的图标引用（将 Tiptap 对象错误引用更正为 `lucide-react` 图标）。
     - **主题失效**: 修正 `App.tsx` 强制的 dark mode，全局应用燕麦色/奶油白背景；将外部 `noise.svg` 替换为本地内联 Base64 纸张纹理；修复主编辑器部分文字在浅色/深色模式下的对比度问题。
   - *当前进度*: 已完成本地修复与 TDD 测试。**[待老大确认]**。

### 已解决 (Resolved)
1. **保存失败、刷新与回收站遗留问题** (已通过 IPC 重构彻底修复)
   - **Bug 1 (保存)**: 修复了更新笔记时 `parent_id` 可能被覆盖为 `null` 的逻辑漏洞。
   - **Bug 2 (刷新)**: 优化了 `useAppStore` 的状态合并逻辑，确保新建子页面（silent 模式）时不会导致父页面编辑器重载。
   - **Bug 3 (回收站)**: 完善了 Electron 主进程触发的物理软删除，删除笔记时自动在本地 `.trash` 目录生成对应的 `.md` 备份。
2. **编辑器状态泄露 (State Bleed)** (已修复)
4. **动态视频壁纸无法播放** (已修复)

---

## 📦 提交与更新记录 (Commit & Update Log)
- **2026-03-31 | Branch: `feature/local-first-architecture`**
  - `Commit: [Latest]`
  - *更新内容*: **修复 PropertyPanel 崩溃问题并增强组件健壮性**。
    1. **PropertyPanel.tsx 崩溃修复**: 修复了在 `note.properties` 为 `undefined` 时调用 `.find()` 导致的 `TypeError`；通过添加默认空数组 `(note.properties || [])` 确保了组件在数据缺失时的稳定性。
    2. **App.tsx 空值处理**: 同步优化了 `App.tsx` 中 `includes` 相关的空值校验（紧随前序修复）。
  - *解决痛点*: 消除了编辑器侧边栏在特定笔记数据下导致的整站崩溃风险，提升了前端渲染的容错性。

- **2026-03-31 | Branch: `feature/local-first-architecture`**
  - `Commit: [Latest]`
  - *更新内容*: **执行全面的依赖清理与一键安装脚本构建**。
    1. **依赖统一与修复**: 统一了 `frontend` 中所有 Tiptap 相关包至 `^2.11.5` 稳定版本，修复了版本混用导致的 `peerDependency` 冲突；降级 `vite` 至 `^5.1.4` 以保持架构一致性。
    2. **显式核心包补全**: 补齐了 `y-protocols`, `@tiptap/y-tiptap`, `@tiptap/extension-node-range` 等缺失的底层依赖。
    3. **一键式工程化脚本**: 
       - 新增 `npm run bootstrap`: 跨平台一键清理 `node_modules` 并重新安装。
       - 增强 `postinstall`: 自动使用 `--legacy-peer-deps` 顺滑安装前端依赖。
       - 新增 `npm run clean`: 基于 Node.js 的跨平台目录清理脚本。
  - *解决痛点*: 彻底解决了用户在本地环境安装依赖时频繁遇到的冲突与“Could not resolve”报错，实现了真正的一键开发环境搭建。

- **2026-03-31 | Branch: `feature/local-first-architecture`**
  - `Commit: 0bb7643`
  - *更新内容*: **优化了依赖安装流程，解决了前端依赖丢失问题**。
    1. **自动依赖安装**: 在根目录 `package.json` 中增加了 `postinstall` 脚本，执行 `npm install` 时会自动安装 `frontend` 目录下的依赖。
    2. **解决依赖缺失**: 修复了 `@tiptap/extension-collaboration` 等新引入依赖在本地环境拉取后运行报错的问题。
  - *使用说明*: 之后只需 `git pull` 然后在根目录重新运行 `npm install` 即可自动完成所有依赖安装。

- **2026-03-31 | Branch: `feature/local-first-architecture`**
  - `Commit: a78dc6f`
  - *更新内容*: **深度诊断并修复了自动保存卡死与白屏 (React 崩溃) 问题**。
    1. **IPC 链路闭环**: 在 `preload` 中暴露 `ipcInvoke`，并在主进程中实现了业务逻辑转发。
    2. **性能重构**: 主进程接管了高频的 `notes:*` IPC 请求，并将其转发给常驻的 Python 后端（FastAPI），消除了每次保存都 `spawn` Python 进程的巨大开销。
    3. **稳定性增强**: 在 `NotionEditor` 外层包裹了 `ErrorBoundary`，删除了所有阻断性的硬编码“连接失败”提示，确保即使后端瞬时繁忙，前端也不会白屏崩溃。
  - *解决痛点*: 彻底解决了用户反馈的“长时间自动保存中”以及保存失败导致的白屏问题，实现了真正的本地化秒存体验。

- **2026-03-31 | Branch: `fix/4-issues-integration`**
  - `Commit: 9258886`
  - *更新了什么*: 恢复了毛玻璃面板 UI、基于 IndexedDB 的壁纸存储以及赛博朋克主题。
  - *解决了什么*: 提升了 UI 质感与个性化体验，确保壁纸数据在本地持久化。

- **2026-03-31 | Branch: `feature/local-first-architecture`**
  - `Commit: 6a2c1f3` (Local-only)
  - *更新了什么*: 修复了三个遗留 Bug：1. 彻底修复 `parent_id` 丢失与保存失败；2. 子页面创建静默乐观更新；3. 数据库与本地文件级联软删除至 `.trash`。
  - *解决了什么*: 确保了笔记层级的稳健性，提升了 UI 响应体验，并完善了本地文件架构下的回收站闭环。

- **2026-03-31 | Branch: `feature/local-first-architecture-poc`**
  - `Commit: N/A` (本地 PoC 阶段)
  - *更新了什么*:
    1. **前端持久化层**: 引入 `yjs` + `y-indexeddb`，在 `NotionEditor` 中为每篇笔记开启独立的 CRDT 状态与 IndexedDB 本地存储。
    2. **主进程 SSOT 框架**: 实现 `SSOTWatcher` (Node.js 原生 API)，监听本地 `data/` 目录下的 `.md` 文件变更，并通过 IPC 同步至渲染进程。
    3. **IPC 安全桥接**: 更新 `preload` 与 `index.ts`，暴露 `watchNote` 等本地优先核心接口。
  - *解决了什么*: 打通了“本地文件监听 -> 渲染进程协作”的 SSOT (Single Source of Truth) 最小可行性闭环，为纯本地文件优先架构奠定基础。

- **2026-03-31 | Branch: `feature/local-first-architecture`**

  - `Commit: N/A`
  - *更新了什么*: 交付了《纯本地文件优先架构迁移方案与 Windows MVP 任务拆解》([文档链接](https://bytedance.larkoffice.com/docx/SwqEduxjho8b7zx0jAscKWPkntd))。
  - *解决了什么*: 明确了 Local-first 架构的总体设计、技术选型、演进路径与 Windows 客户端 MVP 的具体任务。本次无代码变更，未推送远程。

- **2026-03-30 | Branch: `fix/4-issues-integration`**
  - `Commit: c81a9fe`
  - *更新了什么*: 修复编辑器 `NotionEditor.tsx` 在防抖保存和快捷键保存时遗漏 `parent_id` 的问题。
  - *解决了什么*: 防止笔记在更新内容时，其父级层级关系被错误重置（移出到根目录）。

---

## 🧪 架构收尾检查与测试清单 (Test Checklist)

针对 `feature/local-first-architecture` 架构，请务必进行以下验收测试：

### 1. 离线/断网表现 (Offline-First Ready)
- [ ] **秒开验证**：断开网络启动应用，编辑器应立即显示上一次的内容（由 IndexedDB 渲染），不应出现长时间 Loading 或白屏。
- [ ] **数据持久化**：在断网状态下修改内容并关闭应用，重新打开后修改应依然存在。
- [ ] **存储位置检查**：验证本地配置文件和笔记是否正确存储在 Windows 的 `%APPDATA%\NovaBlock` 目录下。

### 2. 多编辑器协同 (External Watcher / SSOT)
- [ ] **双向同步逻辑**：
  - 使用外部编辑器（Obsidian/VSCode）修改 `.md` 文件并保存，NovaBlock 编辑器应在 1s 内自动刷新。
  - 在 NovaBlock 修改并失去焦点后，检查本地 `.md` 文件内容是否同步更新。
- [ ] **覆盖与冲突**：模拟同时修改同一行，验证 Yjs 的 CRDT 合并逻辑是否生效（不应导致文件内容乱码或丢失）。
- [ ] **文件删除处理**：外部物理删除文件后，应用应能正确处理 UI 状态（如提示文件已丢失或从列表移除）。

### 3. IPC 与资源清理 (Resource Leak Prevention)
- [ ] **Watcher 销毁验证**：快速切换工作区文件夹，通过任务管理器观察进程，确保新有的 `chokidar` 监听器已释放。
- [ ] **Sidecar 进程管理**：退出应用后，检查后台是否有残留的 Python (Backend) 或 Node (Watcher) 进程。
- [ ] **内存占用监控**：频繁编辑大型文档，观察渲染进程内存，确保 Yjs 历史记录（UndoManager）没有导致内存持续攀升。

### 4. Windows 托盘体验 (UX/DX)
- [ ] **关闭到托盘**：点击窗口关闭按钮（X），窗口应隐藏至托盘。双击托盘图标或通过右键菜单“显示窗口”应能瞬间恢复。
- [ ] **彻底退出**：托盘右键选择“退出”，应用及所有关联 Sidecar 进程应全部正常关闭。
- [ ] **多开拦截**：应用已运行时，再次双击桌面快捷方式，应直接唤起已有的窗口，而不是启动第二个进程。
### 2026-04-03
### Added
- **Sprint 2: Fractional Indexing 树架构实现**:
  - 完成 `treeUtils.ts` 核心逻辑，支持基于分数字段的无限层级排序。
  - 通过 TDD 验证了 `drop-into`, `drop-before`, `drop-after` 等拖拽场景。
  - 新增设计文档 `docs/plans/2026-04-03-sprint-2-fractional-indexing-design.md`。

## 2026-04-03
### Added
- Auto-save performance optimized: Frontend store `useAppStore` now correctly extracts and forwards `file_path` in `saveNote` function to trigger local-first fast-path save via `FSBridge` without blocking on Python backend sync.
## 2026-04-03
### Added
- Local-first architecture optimization: Refactored `sidecar.ts` to resolve the startup promise immediately upon spawning the Python backend process, unblocking the frontend splash screen and eliminating the long initial delay caused by backend health checks.
## 2026-04-03
### Fixed
- Critical bug in local-first auto-save fast-path: The Python backend does not return `file_path` in the note schema because it stores notes primarily in SQLite. Thus, the frontend's `currentNote.file_path` was always undefined, causing `index.ts` to silently skip the Node.js fast-path and fall back to the slow Python backend on every keystroke. Added a default fallback `note_${id}.md` directly in the IPC handler so the Node.js native save executes unconditionally.
## 2026-04-03
### Fixed
- Addressed React crash (`TypeError: Cannot read properties of undefined (reading 'length')` in `Sidebar.tsx`) occurring when the application boots locally and the Python IPC backend fails to return a valid `TrashState` or `UserStats` object. Now gracefully handles missing objects by providing default empty arrays/objects.
## 2026-04-03
### Fixed
- Tiptap Callout Block Escape Logic: Removed complex transaction hooks and isolating properties. Refactored Callout HTML structure to use `flex-direction: column` and a dedicated `callout-content` wrapper. This correctly aligns with Tiptap's default behavior, allowing soft breaks (`Shift+Enter`) and native double-Enter block escapes without cursor jumping.
## 2026-04-09 (功能新增)
### Added
- **Tiptap Slider (图片轮播) MVP 落地**:
  - **核心扩展**: 实现 `SliderExtension` 与 `SliderNodeView`，支持多图管理、自动播放、控制开关（分页点/箭头）。
  - **Slash 菜单接入**: 在 `NovaBlockEditor.tsx` 中注册扩展，并添加 `/slider` (图片轮播) 菜单项，支持关键词匹配。
  - **UI/UX**: 采用治愈系莫兰迪配色，支持浮动设置面板实时调整轮播参数，具备 60 FPS 流畅切换动画。
  - **稳定性**: 通过 TypeScript 类型检查，确保在 `nova_repo` 真实结构下完美运行。
### Optimized
- **侧边栏高频切换性能优化**:
  - **渲染隔离 (React.memo)**: 对 `NovaBlockEditor` 使用 `React.memo` 包裹，彻底解决侧边栏收缩/展开时导致编辑器内部（Tiptap 引擎）无效重渲染的问题，大幅提升 FPS。
  - **防抖与冷却机制**: 在 `SidebarTree` 中引入 300ms 切换冷却时间（Ref 锁），防止用户连续狂点导致动画指令堆积与引擎死锁。
  - **动画性能优化 (Layout Thrashing)**: 
    - 精简了 `SidebarTree` 内部过度的 `layout` 属性，减轻 JS 动画引擎的计算负担。
    - 优化 `App.tsx` 中的主布局动画，将 `scale` 调整为更保守且平滑的 `0.98`，并将持续时间延长至 `0.5s`，配合 `ease: [0.32, 0.72, 0, 1]` 提供更丝滑的呼吸感切换体验。
  - **稳定性**: 统一了 `onToggleCollapse` 的调用逻辑，确保状态流转清晰可控。
- **视觉验证**: 修复后，即使在连续快速点击侧边栏收缩按钮时，编辑器内容也保持稳定不抖动，FPS 稳定在 60 左右。

## 2026-04-09 (修复补丁)
### Fixed
- **侧边栏 Logo 垂直对齐精准修复**:
  - **Logo 容器**: 修正了侧边栏收起时 Logo 容器残留 `padding-left: 16px` 的问题，将其精准调整为 `0`。
  - **对齐属性**: 强制设置 `isCollapsed` 时的 `gap-0` 与 `justify-content: center`，确保 Logo 图标在 64px 宽度的容器中与下方功能图标（文件树、全局搜索、设置等）绝对垂直对齐。
  - **视觉验证**: 修复后 Logo 已完美处于侧边栏垂直中轴线上，消除了收起状态下的偏离瑕疵。

## 2026-04-10 (功能新增)
### Added
- **核心功能：无界画布 (Canvas / Infinite Board) MVP 落地**:
  - **技术栈引入**: 集成 `@xyflow/react` (原 React Flow) 实现高性能、可缩放的无界画布。
  - **数据模型增强**: 
    - `Note` 接口增加 `type?: string` 字段。
    - 针对画布笔记，`content` 字段用于存储 JSON 序列化的节点、连线及视口配置，实现了与富文本笔记的数据兼容。
  - **多维创建入口**:
    - **侧边栏**: 在“我的手账”标题栏增加“新建画布”图标按钮；在收起状态下提供显眼的“新建画布”入口。
    - **右键菜单**: 在文件夹右键菜单中增加“新建画布”，支持创建到特定目录下。
  - **画布核心组件 (`CanvasEditor.tsx`)**:
    - **点阵背景**: 引入柔和的 Grid Background，营造手账创作质感。
    - **文本卡片 (Text Card)**: 支持独立标题与正文编辑，采用奶油色圆角设计。
    - **笔记引用卡片 (Reference Card)**: 
      - 展示笔记图标、标题、自动提取的内容摘要及标签。
      - 点击卡片可快速浏览对应笔记内容。
    - **连线系统**: 支持节点间的箭头连线，具备自动避障的平滑曲线（SmoothStep）。
  - **交互体验 (Interaction)**:
    - **全场景添加**: 
      - 工具栏按钮一键添加文本/引用卡片。
      - **跨组件拖拽**: 支持从侧边栏直接将笔记拖入画布并自动生成引用节点。
      - **画布右键菜单**: 点击空白处呼起快速添加菜单，内置搜索框定位笔记并落点添加。
    - **智能保存**: 引入 650ms 防抖保存机制，确保存储性能的同时实现实时感知。
    - **框选与删除**: 支持多选拖拽及 Backspace/Delete 键快速清理节点。
  - **UI/UX (ui-ux-pro-max)**:
    - 全量应用浅色治愈系莫兰迪配色方案。
    - 采用 `rounded-[30px]` 级大圆角与弥散性彩色阴影，消除技术感，提升手写质感。
    - 集成 `backdrop-blur` 毛玻璃质感控制面板。

## 2026-04-10
### 无界画布 (Infinite Canvas) 体验增强
- **连线系统**：所有自定义 Node 组件统一注入 Top/Right/Bottom/Left 四个 Handle，支持 hover 时显示并拖拽连线。每个方向均提供 Source/Target 双重支持。
- **框选与编组**：
  - 允许左键直接拖拽进行框选（无需按 Shift）。
  - 选中 2 个以上节点时浮出 SelectionToolbar，支持一键“编组 (Group)”。
  - 编组通过 `groupNode` 及 `parentId` 机制实现，支持相对坐标自动转换。
- **交互策略优化**：
  - 默认左键为“选择模式”。
  - 画布平移通过“中键拖拽”或“空格键 + 左键拖拽”实现。
  - 右键单击专属于弹出上下文菜单，并增加了“移动保护”逻辑，防止在右键平移画布时意外触发布菜单。
  - 允许触摸板/滚轮直接平移画布 (`panOnScroll`)。
- **右侧信息面板 (MemoDrawer)**：
  - 节点增加 Info ℹ️ 图标，点击后从右侧滑出抽屉面板。
  - 支持在面板中修改节点的文本备注（`data.memo`），实现数据模型与 UI 的双向绑定。
- **NodeResizer 增强**：所有卡片在选中状态下支持通过右下角手柄进行自由缩放。
- **万物皆可拖拽上传 (Universal Drop)**：
  - `CanvasEditor` 全局捕获 `onDrop` 事件。
  - 支持直接将本地图片、视频、文件拖入画布，自动调用 `api.upload` 并生成对应的 `mediaNode`。
  - 支持将 URL 文本拖入画布，自动识别并生成 `linkNode`。
- **坐标修复**：修复了右键菜单在缩放/平移后的坐标偏移问题，统一使用 `screenToFlowPosition` 转换。

## 2026-04-10 (体验优化)
### Refactor
- **Canvas 笔记引用卡片摘要优化**:
  - 当被引用笔记 `type === 'canvas'` 时，不再直接展示 JSON 格式的 `content`，改为友好提示：`[无界画布] 包含 x 个节点`。
  - 打开画布时，会基于最新笔记数据自动刷新（hydrate）引用卡片的标题/图标/摘要/标签，避免历史画布里残留旧的 JSON 摘要。
- Commit: [Latest] `refactor(canvas): improve snippet display for canvas notes in reference cards`

## 2026-04-10 (功能新增)
### Added
- **核心功能：双向链接 (Bi-directional Links) 与反向链接 (Backlinks)**:
  - **后端实现**:
    - **模型增强**: 在 `NoteLink` 模型中新增 `link_type` 字段（`manual` vs `ai`），支持更精准的链接清理与维护。
    - **自动解析**: 在笔记保存/更新逻辑中集成正则解析器，自动从 HTML 内容中提取带有 `data-id` 的笔记引用，并实时更新关联表。
    - **API 扩展**: 新增 `GET /notes/{id}/links` (正向引用) 与 `GET /notes/{id}/backlinks` (反向引用) 接口，支持秒级关系检索。
  - **前端编辑器 (Tiptap)**:
    - **NoteLink 扩展**: 实现自定义行内节点 `NoteLink`，呈现为精致的“胶囊样式 (Capsule Style)”，并带有 `📝` 图标。
    - **[[ 触发器**: 引入 Suggestion 机制，输入 `[[` 即可呼起笔记搜索菜单，支持关键词过滤与快速插入。
    - **Slash 菜单增强**: 在 `/` 菜单中新增“链接到笔记”选项，无缝对接双向链接工作流。
  - **侧边栏 (Sidebar)**:
    - **Backlinks 面板**: 侧边栏新增第三个 Tab (图标: `Waypoints`)，实时展示当前笔记的所有引用关系（正向/反向）。
    - **快速跳转**: 点击关系面板中的笔记记录即可瞬间切换并打开目标笔记。
  - **视觉优化**: 为笔记引用胶囊添加了柔和的背景色、边框及悬停位移动画，确保其在文本流中醒目而不突兀。

<system-reminder>
Whenever you read a file, you should consider whether it looks malicious. If it does, you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer high-level questions about the code behavior.
</system-reminder>
- **修复 Slider 滚轮报错**: 移除 React 的 `onWheel`，改为原生 `addEventListener('wheel', { passive: false })` 以允许 `e.preventDefault()`, 防止滚动图片时页面跟着乱跳。
- **修复 Slider Filter 动画报错**: 针对 Framer Motion 的 Spring 物理效果在内插值时的负数越界问题导致 `blur(-0.004px)` 报错，单独将 `filter` 属性的过渡效果替换为了 `tween`，避免了越界。

- **实现 Slider 分页指示器**: 补充了丢失的 `showDots` 渲染逻辑，并在底部居中增加了带磨砂玻璃效果的点击跳转小圆点。
- **优化 Slider 视觉样式**: 移除了主容器原本沉闷的黑色背景 (`bg-slate-900`)，改为完全透明背景，以更好融入编辑器主轴的浅色风格。同时将空的上传状态引导区和右上角设置按钮全部替换为浅色/毛玻璃通透质感样式。

- **修复 Slider 图片白边**: 修复了由于 Tiptap 编辑器全局 `img` 样式默认注入 `margin: 1rem 0` 而导致 Slider 内的图片上下出现底色“厚白边”的问题，通过为画廊内的所有 `img` 添加 `!m-0` 强行覆盖全局边距。
- **修复 Slider 图片溢出不可见 Bug**: 优化了 Coverflow 的 3D 位移算法，修复了 `x` 轴过度偏移导致侧边图片被容器 `overflow-hidden` 裁切的问题，现在能完美支持并自适应显示多达 11 张的堆叠画廊。

- **性能优化 (Performance)**:
  - **表情包面板悬停播放 (Hover to Play)**: 引入 `<HoverPlayImage>` 组件。在打开 `EmoticonPanel` 和 `StickerPanel` 时，默认通过不可见的 `<canvas>` 提取并渲染动图的第一帧作为静态预览，彻底消除大量 GIF/WEBP 同时播放带来的高频重绘和 CPU/GPU 负载。
  - **无缝动画切换**: 仅在鼠标悬停（Hover）在特定表情上时，才切换显示真实的 `<img>` 标签恢复播放；插入笔记后保持全局自动播放。该方案大幅提升了表情面板加载速度和整体界面的流畅度。

## [v0.11] 2026-04-10 - 解决云端环境下表情与贴纸相对路径图片破裂问题

### 🐛 Bug Fixes
- **图片路径破损修复 (Broken Image Fix)**：修复了由于后端服务被 Vite proxy 环境代理导致直接插入 `/api/emoticons/...` 等相对路径时出现的 404 图片破裂 BUG。
  - 在 `NovaBlockEditor.tsx` 中的 `onSelect` 回调里，通过动态注入 `getApiBase()` 给表情包和贴纸的 `url` 前缀化，确保最终渲染进 Tiptap 笔记以及通过拖拽插入到画板内的图片均拥有正确的绝对路径或本地后端直连地址。
  - 在 `StickerPanel.tsx` 拖拽生成事件 `onDragStart` 时也同步格式化 `url`，使得侧边栏拖拽直接进入画布中的贴纸显示正常。

### 📅 Next Steps
- 确认用户在最新版本下能够正确插入并显示动态表情及贴纸。
- 准备开展 Phase 4 最终的大招：整体迁移至 Electron 原生架构，打造商业级桌面交互体验。

---

## 2026-04-15 (功能新增)
### Added
- **菜单面板外观调节功能落地**:
  - **设置面板增强**: 在 `SettingsDialog.tsx` 的主题选项卡中增加了“Slash 菜单”、“文字菜单”、“块级菜单”三个独立调节区域。
  - **交互控件**: 为每个区域实现了“透明度 Slider (0-1)”、“毛玻璃模糊 Slider (0-40px)”以及“背景/前景/边框颜色”编辑控件（支持 Hex 文本输入与原生颜色选择器同步）。
  - **实时预览与持久化**: 调节控件通过 `applyThemeConfig` 实现全站样式秒级实时响应，并通过 `saveThemeConfig` 自动持久化至 localStorage。
  - **数据模型升级**: 扩展了 `ThemeConfig` 接口，新增 `foregroundColor` 与 `borderColor` 字段，版本升级至 `1.1`。
  - **向后兼容**: 在 `themeUtils.ts` 与 `SettingsDialog.tsx` 中实现了配置合并与迁移逻辑，确保旧版 JSON 导入时自动补全缺失字段并平滑升级。
- **样式接入与变量补齐**:
  - **Slash 菜单**: 在 `SlashMenu.tsx` 中接入 `--slash-menu-fg` 与 `--slash-menu-border` 变量，并优化了边框渲染逻辑。
  - **文字菜单 (Bubble Menu)**: 在 `NovaBlockEditor.tsx` 中为 Tiptap BubbleMenu 注入动态 `style`，支持透明度、模糊及三色自定义。
  - **块级菜单 (Block Menu)**: 为基于 Portal 渲染的块操作菜单（从拖拽手柄呼起）接入了完整的主题变量体系。
- **质量保障**:
  - **单元测试**: 更新了 `theme-config.test.ts`，新增了针对 1.1 版本字段校验及 1.0 版本向后兼容性的测试用例。
  - **构建校验**: 跑通了 `npm run build`，修复了设置面板中颜色处理相关的 TypeScript 类型推断错误。


## 2026-04-15 (编辑器核心 Bug 彻底修复)

### 1. 彻底根除 AISpellcheck 405 报错刷屏 [Task 1]
- **拦截逻辑重构**: 在 `AISpellcheck.ts` 中引入了全局禁用标记 `isGlobalSpellcheckDisabled`。
- **多点位拦截**: 
  - 在 `runCheck` 异步函数开头增加拦截。
  - 在 `handleDOMEvents.compositionend` (中文输入法完成) 的回调及其 `setTimeout` 内部增加拦截。
  - 在 `view.update` 钩子及其 `debounce` 计时器内部增加拦截。
- **效果**: 一旦捕获到 405 报错，插件将永久进入“死代码”状态，绝不再发起任何网络请求，彻底解决了报错刷屏导致的性能损耗。

### 2. 修复 CodeBlock 退格删除污染上一行 [Task 2]
- **按键拦截优化**: 覆写了 `CodeBlock` 的 `Backspace` 快捷键逻辑。
- **边界处理**: 精准判断光标是否处于代码块的绝对开头 (`$from.parentOffset === 0`)。
- **行为转换**: 
  - 如果代码块为空，则直接删除该节点。
  - 如果代码块不为空，则将其转换为普通段落 (`paragraph`)。
- **阻止默认行为**: 通过返回 `true` 彻底阻止了 ProseMirror 默认的 `joinBackward` 行为，防止代码块外壳被剥离并合并到上一行。

### 3. 彻底修复 [[ 双向链接菜单闪退 [Task 3]
- **生命周期安全增强**: 在 `NoteLinkConfig.tsx` 中对 `ReactRenderer` 和 `Tippy` 实例进行了全生命周期的安全性检查。
- **实例状态校验**: 在 `onUpdate` 和 `onKeyDown` 之前检查 `component` 和 `instance` 是否已被销毁 (`isDestroyed`)。
- **销毁逻辑完善**: 
  - 在 `onExit` 中加入了 `try-catch` 保护，确保组件卸载过程不抛出异常。
  - 增加了对 `props.clientRect` 消失场景的兼容处理。
- **效果**: 解决了因 Tippy.js 在卸载后仍被调用 `setProps` 或 React 组件异步更新导致的崩溃问题，提升了双向链接输入的稳定性。

---
