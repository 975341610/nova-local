# Release Notes

## [0.21.9] - 2026-05-01 · Hotfix · ERR_CACHE_OPERATION_NOT_SUPPORTED

> 修复 v0.21.8 打包版本在 Electron 下控制台偶发的资源加载错误:
> `Failed to load resource: net::ERR_CACHE_OPERATION_NOT_SUPPORTED`。

### 🐛 根因

- 页面以 `file://` 协议加载,而 `webRequest.onBeforeRequest` 会把 `file://[drive]:/api/...` 跨协议重定向到 `http://127.0.0.1:8765/api/...`。
- Chromium 的 `disk_cache` 层对某些被重定向的请求/部分方法(PATCH/HEAD 等)会直接返回 `OPERATION_NOT_SUPPORTED`,表现为控制台红字,但请求本身已经拿到结果,不影响功能。

### ✅ 修复

- **electron/main.js**
  - `app.commandLine.appendSwitch('disable-http-cache')`:本地后端无需 HTTP 缓存,整体关闭。
  - 窗口创建后 `webContents.session.clearCache()`:清掉旧版本遗留的磁盘缓存条目。
- **前端 fetch 显式 `cache: 'no-store'`**:覆盖 `apiTransport.ts` / `api.ts` (ai/inline, chat, music-library) / `apiUpload.ts` (5 处) / `EmoticonPanel` / `StickerPanel` / `HabitTrackerComponent` / `tiptapExtensions.ts`,避免浏览器进入条件请求路径。
- 外部 HTTPS 请求 (PlantUML Server) 保留默认缓存策略,不受影响。

### 🔬 质量

- TS build + Vite build 通过 (主包 941.91 kB / gzip 280.83 kB,与 v0.21.8 等量)。
- Vitest 36 files / **182 tests** 全绿 (沙箱进程上限波动,部分批次会出 EAGAIN spawn 错误,为环境噪音,非测试断言失败)。

### 🗂 文件变动

- 修改 `electron/main.js` (`app.commandLine` + `session.clearCache`)
- 修改 `nova-block/src/lib/apiTransport.ts`
- 修改 `nova-block/src/lib/api.ts`
- 修改 `nova-block/src/lib/apiUpload.ts`
- 修改 `nova-block/src/lib/tiptapExtensions.ts`
- 修改 `nova-block/src/components/editor/EmoticonPanel.tsx`
- 修改 `nova-block/src/components/editor/StickerPanel.tsx`
- 修改 `nova-block/src/components/widgets/HabitTrackerComponent.tsx`

---

## [0.21.8] - 2026-05-01 · 白板 A'+B+D · 折点拖动 × data-URL 互通 × 缩略图增强 × 代码瘦身

> 把 v0.21.7 延后的两件补齐并前推两条新线：**A5'** 正交边折点可拖动；**B** 线让画板与 Markdown 直接互通 (data-URL SVG);**D** 线让笔记正文里的画板缩略图能导出/只读预览;**代码瘦身** 把主包从 2.22 MB 切到 941 kB。

### A' · 编辑面补齐

- **A5' 折点拖动 (waypoint drag)**:选中正交边后,中段出现紫色手柄;水平段只拖 Y、垂直段只拖 X;首次拖动插入 waypoint,再拖即就地替换;**双击边** 一键清空所有 waypoints 回到自动布线。
- 新 `routeOrthogonalWithWaypoints(from,to,fromAnchor,toAnchor,waypoints)`:按"上一段方向 H/V 交替"补直角、自动去相邻重复点;空 waypoints 时等价于原 `routeOrthogonal`。

### B · 白板 ↔ 笔记互通

- **B1 data-URL Markdown**:`toMarkdownDataUrlImg(data, alt)` 把当前白板 SVG 以 `data:image/svg+xml;base64,` 编码嵌入 `![alt](...)`;跨编辑器/导出件无外链,纯文本可携带。
- **B2 编辑器下拉菜单追加项**:WhiteboardModal 顶部 "复制 Markdown" 旁增加 "复制 Markdown (data-URL 图)",两种格式各得其所 (内联 SVG 块 vs 真·单行图片)。
- 编码路径:Node 端走 `Buffer`、浏览器端走 `TextEncoder + btoa`,UTF-8 安全。

### D · 笔记中的画板块

- **D1 缩略图自适应高度**:`minHeight = min(360, 160 + min(nodes,12)*12)`,节点越多预览越高,保持 aspectRatio。
- **D2 快速导出 SVG**:块右上 "⬇ SVG" 按钮,直接下载 `whiteboard-<ts>.svg`,不进编辑器。
- **D3 只读新窗口预览**:"⛶ 预览" 打开 `window.open` 小窗,展示 box-shadow 卡片化 SVG;适合讲解/截图,不占编辑器焦点。
- 双击进入全屏编辑器、原生 atom 选中/删除行为全部保持不变。

### ⚡ 代码分割瘦身

- **vite.config.ts · manualChunks** 按 `node_modules` 路径拆分:
  - `vendor-tiptap` (618 kB) · `@tiptap/*` + `prosemirror-*`
  - `vendor-react` (398 kB) · `react`、`react-dom`
  - `vendor-katex` (257 kB) · `katex`
  - `vendor-shiki` · `shiki`
  - `vendor-compress` (5.75 kB) · `fflate` + `pako`
- **主包**:`2.22 MB / gzip 679.74 kB` → **`941.60 kB / gzip 280.75 kB`**,首屏字节直降 **~59%**。
- `chunkSizeWarningLimit` 调整为 1500。
- **NovaBlockEditor** 去掉对 `../../lib/api` 的动态 `import()`,避免 Vite 动静混用告警。

### 🔬 质量

- TS build + Vite build 通过 (主包 941.60 kB / gzip 280.75 kB)。
- Vitest 38 files / **189 tests** 全绿 (+5 waypoints 路由、+3 Markdown 导出快照)。

### 🗂 文件变动

- 修改 `nova-block/src/lib/whiteboard/types.ts` (`FlowEdge.waypoints?`)
- 修改 `nova-block/src/lib/whiteboard/orthogonalRouter.ts` (新 `routeOrthogonalWithWaypoints`)
- 修改 `nova-block/src/lib/whiteboard/export.ts` (边布线切换)
- 修改 `nova-block/src/lib/whiteboard/markdown.ts` (新 `toMarkdownDataUrlImg` + UTF-8 base64)
- 修改 `nova-block/src/components/whiteboard/Board.tsx` (waypoint 拖动与清空,ResizeHandles 类型收紧)
- 修改 `nova-block/src/components/whiteboard/WhiteboardModal.tsx` (下拉新增 data-URL 项)
- 修改 `nova-block/src/components/novablock/extensions/FreehandNodeView.tsx` (D 线三按钮)
- 修改 `nova-block/src/components/novablock/NovaBlockEditor.tsx` (静态 import api)
- 修改 `nova-block/vite.config.ts` (manualChunks)
- 新增 `nova-block/src/test/whiteboard/waypoints-router.test.ts`
- 新增 `nova-block/src/test/whiteboard/markdown-export.test.ts`

---

## [0.21.7] - 2026-05-01 · 白板 A+C · PlantUML 实渲 × 导出 × 快照兼容

> 在 v0.21.5 / .6 白板骨架上再补 9 件:把 PlantUML 从占位变为真图,给节点加上缩放 / 对齐 / 分布,接入模板库与 Mini-map,打通 SVG / PNG / Markdown 导出,并用快照测试锁死 v1→v2 迁移。

### A · 编辑面体验

- **A1 PlantUML 真渲染**:走公共 PlantUML Server (`/svg/<encoded>`);自建 base64 字母表 + fflate `deflateSync`,内容哈希缓存,foreignObject 注入 SVG。
- **A2 节点缩放句柄**:8 方向手柄,Shift 等比,Alt 不吸附。
- **A3 对齐与分布**:以选中 bbox 为锚,6 对齐;水平 / 垂直分布需 ≥3 节点。
- **A4 模板库**:流程图 / 鱼骨 / SWOT / 泳道 四款,空画布显 EmptyState。
- **A5 吸附引导线**:拖拽时边 / 中线在 6px/zoom 阈内高亮紫色虚线。
- **A6 Mini-map + ⌘0/⌘1**:160×100 缩略图,红框视口,点击平移;⌘0 fit-to-content,⌘1 reset 100%。

### C · 导出与兼容

- **C1 导出**:SVG / PNG 2x / ClipboardItem 复制;PlantUML 导出为虚线占位避免 cross-origin 污染 canvas。
- **C2 Markdown 导出**:`toMarkdownInlineSvg()` 包 `<div class="whiteboard">` 块;`FreehandExtension.renderHTML` 额外带 `data-svg` 属性。
- **C3 v1→v2 快照兼容测试**:覆盖 version 补齐、color→fill 双写、edge 默认 `routing: 'orthogonal'`、幂等性、已设 v2 字段保留。

### 🔬 质量

- TS build + Vite build 通过 (主包 2.22 MB / gzip 679.74 kB)。
- Vitest 37 files / 184 tests 全绿。

### ⏭ 延后

- A5 正交边**折点拖动** (waypoint 中点拖动) 本轮只出引导线,下版补。
- 主包 chunk 分割与 `src/lib/api.ts` 动静混用告警未处理。

---

## [0.19.0] - 2026-04-30 · 观照 · Ask / Backlinks / Recap × 环境音 × 任务镜像

> 在 v0.18 "墨境" 视觉语言之上，v0.19 "观照" 把笔记本从"写的地方"推向"能与你对话的场域"。一条 A 线让笔记能被本地检索并回答问题，一条 B 线让写作环境能随节奏呼吸，一条 D 线把 Tiptap 的表达面打开，再用 C1 给你一个可离线分发的静态笔记站。

### 🔍 A 线 · 本地检索与回响 (Ask · Backlinks · Auto-tag · Recap)

- **A1 Ask My Notes (`⌘⇧A`)**：全本地 TF-IDF + 2-gram 中文分词；cos 相似度 > 0.05 的 Top-6 片段带高亮 snippet 与命中比例，点击直达原文。
- **A2 Backlinks 面板**：嵌入 InspectorPanel，基于 TF-IDF 反向推荐"语义相近的笔记"，展示标题 + 片段 + 分数。
- **A3 Auto-tag 建议**：对当前笔记抽取高权 token，推荐未采纳的标签与备用标题；一键"采用"写回 `tags` / `title`。
- **A4 Daily Recap**：识别标题为 `YYYY-MM-DD` / `YYYY/MM/DD` 的日记，7/30 天可切换；字数 sparkline、连续天数 Flame、亮点 bullets 提取。

### 🌿 B 线 · 节奏与氛围 (Focus · Ambient · Cadence · Pomodoro · Page-turn)

- **B1/B2 环境音 Dock**：Web Audio 合成的白噪 / 雨声 / 海浪 / 森林 / 火塘；本地合成不加载外部音频，支持独立音量与淡入淡出。
- **B3 Cadence Meter**：根据最近 30 秒敲键频率推断"墨境 / 涌泉 / 湍流"三档节奏，右下胶囊轻柔提示写作节奏。
- **B4 Pomodoro Ring (`⌘⇧P`)**：SVG 环形倒计时 + 朱砂辉光，25/5 默认，可停可续，结束轻振铃。
- **B5 Alt+←/→ Page-turn**：`rotateY(±40deg) + transformPerspective(1600px)` 模拟翻页，前后切换笔记时纸页翻动。

### 🧩 D 线 · 表达块 (Slash · Callout · Timeline · Shiki · TaskMirror)

- **D1 Callout / 提示块**：6 种语气 —— 墨色纸片 / 信息 / 警告 / 引语 / 思考 / 成就 —— 通过 `/提示·xx` 插入，走 Tiptap Node。
- **D2 Timeline Node**：`/时间线` 插入带 ISO 日期种子的时间线节点，可在编辑区增删节点。
- **D3 Callout / Timeline tone attr**：Tiptap 自定义 Node 支持 `data-tone` / `data-date`，复制粘贴仍保留样式。
- **D5 Shiki 代码高亮**：编辑器代码块默认走 Shiki 语法高亮，沿用当前主题 palette。
- **D6 Task Mirror (`⌘⇧M`)**：跨笔记聚合所有 `TaskItem`；按状态 / 关键词 / `@人` / `#标签` / `note:` 前缀过滤；按笔记分组，点击跳转原文。

### 📦 C1 · Vault Export (`⌘⇧E`)

- 一键把整个笔记库导出为 **单文件 HTML**：嵌入 JSON、内建搜索、主题切换、目录树；不依赖 CDN；可离线浏览或直接分发。

### ⌨️ v0.19 快捷键追加

| 快捷键 | 功能 |
|---|---|
| `⌘⇧A` | Ask My Notes 面板 |
| `⌘⇧M` | 任务镜像 |
| `⌘⇧P` | Pomodoro 启停 |
| `⌘⇧E` | 导出静态站 |
| `Alt + ←/→` | 上一篇 / 下一篇笔记（翻页动画） |

### 🗂 文件变动

- 新增 `nova-block/src/components/panels/AskMyNotesPanel.tsx`
- 新增 `nova-block/src/components/panels/DailyRecapPanel.tsx`
- 新增 `nova-block/src/components/panels/TaskMirror.tsx`
- 新增 `nova-block/src/components/panels/VaultExportDialog.tsx`
- 新增 `nova-block/src/components/widgets/AmbientSoundDock.tsx` / `PomodoroRing.tsx` / `CadenceMeter.tsx`
- 新增 `nova-block/src/contexts/AmbientSoundContext.tsx` / `PomodoroContext.tsx`
- 新增 `nova-block/src/lib/backlinks.ts` / `autoTag.ts` / `novablock/extensions/TimelineNode.ts`
- 追加 `nova-block/src/styles/v019.css`（面板 shell / ask / recap / export / taskmirror 样式）
- 修改 `nova-block/src/App.tsx`：provider 嵌套、⌘⇧A/M/P/E 与 Alt+←/→ 键位、InspectorPanel 注入 A2/A3、widgets 挂载
- 修改 `nova-block/src/components/novablock/NovaBlockEditor.tsx`：墨境块分组的 6 条 slash items

### 🔬 质量

- `npx tsc --noEmit` 通过。
- 翻页、Pomodoro、环境音均遵循 `prefers-reduced-motion`；音频节点懒初始化。
- 所有新增面板键盘可达：`Esc` 关闭、`Enter` 提交、Tab 顺序完整。

### ⏭ 本期延后

- **A5 Concept Orbit**：概念聚类可视化（图力布局 + k-means），留给 v0.20。
- **B6 Margin Notes**：行内批注与边缘注释，留给 v0.20。
- **D4 Excalidraw Freehand**：手绘嵌入块，依赖较重，留给 v0.20。

---

## [0.18.0] - 2026-04-30 · 墨境 · 三境主题 × 检视侧盘 × 打字机模式

> 在 v0.17.1 Ink-on-Paper 的基础上做一次"艺术品级"的体验升级：把"偶尔使用"的能力搬进召唤式检视盘，引入三套氛围主题与翻页换景动画，新增 Reader 进度条 / 章节小点 / 打字机模式 / 统一快捷键体系。

### 🎨 三境主题系统 (Ink · Paper · Bamboo)

- 引入 `NovaThemeProvider` 与 `useNovaTheme()` 钩子，通过 `html[data-nv-theme="..."]` 切换三种氛围主题：
  - **宣纸 (rice-paper)**：象牙白底 + 朱砂重点 + 靛青次强调；晴日之静。
  - **墨夜 (ink-midnight)**：深靛蓝底 + 琥珀重点；深夜之思。
  - **青竹 (bamboo)**：青灰底 + 苔绿重点 + 雨青次强调；雨天之润。
- 每套主题提供独立的 **暖色 / 冷色阴影** (`--nv-shadow-rest/-hover/-float/-lift/-accent`)、字体栈与玻璃态参数。
- **翻页换景动画**：主题切换时插入一块 `perspective(1800px) rotateY(-100deg)` 的全屏纸板，560ms 翻出去，模拟"翻开下一张宣纸"的错觉；遵循 `prefers-reduced-motion` 降级。
- 兼容旧版 `nv-theme`（dark→ink-midnight），并同时写入 `.dark` / `data-theme="dark"` 供 Tailwind dark utilities 使用。

### 🪟 InspectorPanel · 右侧召唤式工具盘（⌘.）

- 新增 `<InspectorPanel>` 组件——类似 Xcode Inspector / macOS 文件简介，从右侧滑出，340px 宽，spring 动画 (stiffness:260, damping:28)。
- 内容分组：
  - **主题氛围**：三张氛围卡片（宣纸 / 墨夜 / 青竹）一键切换，带翻页动画。
  - **笔记信息**：标题 / 创建 / 更新 / 标签 / 字数。
  - **快速动作**：进入阅读模式 / 在图谱中查看 / 存为模板。
  - **快捷键参考**：所有全局键位一目了然。
- 打开：`⌘.` / 点击 Dock 右侧 Inspector 按钮；关闭：`Esc` / 点击遮罩。
- 视觉语言与全局一致：`var(--nv-glass-bg)` 玻璃背景、`backdrop-filter: blur(22px) saturate(180%)`。

### 📖 Reader 模式升级

- **顶部朱砂进度条** (2px 高)：实时反映阅读位置，带朱砂辉光。
- **右侧章节小点**：自动扫描 h1/h2/h3，为每一章渲染一颗导航小点，点击平滑滚动到该章节；当前章节小点放大并变为朱砂色。
- **工具栏百分比**：显示当前阅读进度（0 → 100%）。

### ⌨️ 打字机模式（⌘T）

- 编辑区自动增加 42vh 上下呼吸空间，将当前段落稳定在视口中央。
- 非当前段落以 `opacity: 0.38 + blur(0.4px)` 衰减，聚焦当前行。
- 光标颜色替换为 `--nv-color-accent`（朱砂 / 琥珀 / 苔绿——随主题变化）。
- 左下朱砂胶囊指示器提示当前模式及退出键位。

### 🧭 Dock 重构

- `QuickActionsBar` 接入 `useNovaTheme`：主题按钮不再是 Sun↔Moon 二值切换，而是 `rice-paper → ink-midnight → bamboo` 三境循环，图标与当前主题的 emoji (`☀️ / 🌙 / 🌿`) 保持一致。
- 新增 **Inspector 入口按钮**（⌘.），与命令面板 / Daily / 图谱 / 阅读 / 主题并列。
- 图标随主题切换带 `rotate + scale + opacity` 过渡 (280ms)。

### ⌨️ 快捷键总览（v0.18）

| 快捷键 | 功能 |
|---|---|
| `⌘K` | 打开命令面板 |
| `⌘.` | 切换检视侧盘 |
| `⌘T` | 切换打字机模式 |
| `⌘⇧R` | 阅读模式 |
| `⌘⇧G` | 图谱视图 |
| `⌘⇧D` | Daily Notes 日历 |
| `[` / `]` | 阅读模式内字号 |
| `T` | 阅读模式内切换衬线/无衬线 |

### 🗂 文件变动

- 新增 `nova-block/src/styles/themes.css`（三境主题定义 + 翻页覆盖层）
- 新增 `nova-block/src/contexts/ThemeContext.tsx`（NovaThemeProvider · cycleTheme · pageFlipTransition）
- 新增 `nova-block/src/components/inspector/InspectorPanel.tsx`（右侧召唤盘）
- 重写 `nova-block/src/components/widgets/QuickActionsBar.tsx`（接入 useNovaTheme + Inspector 按钮）
- 升级 `nova-block/src/components/reader/ReaderMode.tsx`（进度条 + 章节点）
- 追加 `nova-block/src/styles/design-tokens.css`（打字机模式样式）
- 修改 `nova-block/src/main.tsx`（挂载 NovaThemeProvider）
- 修改 `nova-block/src/App.tsx`（接入 Inspector + ⌘. / ⌘T 快捷键 + Typewriter 指示器 + NoteInspectorContent）
- 修改 `nova-block/src/index.css`（引入 themes.css）

### 🔬 质量

- `npx tsc --noEmit` 通过。
- 所有新增动效均支持 `prefers-reduced-motion` 降级。
- InspectorPanel / ReaderMode 全程键盘可达；ARIA role / label 齐全。

---

## [0.17.1] - 2026-04-30 · Ink-on-Paper 视觉大修


> 针对 v0.17.0 上线后暴露的布局冲突与视觉不统一问题，进行一次深度 UI/配色/动效重构。

### 🎨 全新视觉语言 "Ink on Paper"（墨迹宣纸）

- **浅色主题 · 象牙纸**: 底色 `hsl(38 32% 96%)` 暖白象牙纸；正文 `hsl(222 20% 14%)` 墨色，避免纯黑的塑料感。
- **深色主题 · 墨夜 (Ink Midnight)**: 底色 `hsl(222 28% 9%)` 带一点靛蓝，正文偏暖月光白。
- **主强调 · 朱砂**: `hsl(10 68% 52%)`（深色下提亮为 `hsl(14 78% 62%)`），像印章那一点。
- **次强调 · 靛青墨**: `hsl(222 55% 48%)`，与朱砂互补，用于次级高亮。
- **暖色弥散阴影**: 所有 `--nv-shadow-*` 从冷灰改为 `rgba(60, 35, 25, …)`，阴影带温度。
- **全新工具类**: `.nv-sunken` / `.nv-divider` / `.nv-chip` / `.nv-chip-accent` / `.nv-dock` / `.nv-dock-btn`，贯穿全局。
- **自定义滚动条**: 6px 细滚动条，`border-radius: full`，随主题自适应。
- **::selection**: 使用 `--nv-color-accent-muted` 背景 + `--nv-color-accent-fg` 文字。

### 🧭 布局重构：底部 Dock 取代右上浮条

- **修复**: `QuickActionsBar` 此前 `position: absolute; top: 18; right: 22` 与 `EditorHeader` 的顶栏按钮（保存 / 视图切换 / 背景纸 / 贴纸 / 模板 / 大纲等）发生遮挡。
- **新方案**: 重构为 **底部居中玻璃态胶囊 Dock**，`position: absolute; bottom: 22; left: 50%; translateX(-50%)`。
- **交互**:
  - 默认收敛为纯图标，鼠标悬停整个 Dock 才展开文字标签（framer-motion AnimatePresence 宽度动画）。
  - 每颗按钮带 `title` + `aria-label` + 快捷键提示；`role="toolbar"`。
  - 主题切换按钮用 framer-motion 做 Sun ↔ Moon 的旋转+淡入过渡。
  - 新增命令面板入口按钮（⌘K），与原有 Daily / 图谱 / 阅读 / 主题按钮并列。
- **原有快捷键/功能不变**，Reader 模式下 Dock 仍自动隐藏。

### ✨ 动效细节

- Dock 入场：`y: 24 → 0`, `opacity: 0 → 1`，`delay: 0.15s`，`ease: [0.32, 0.72, 0, 1]`。
- 按钮激活指示点（Dock-btn `::after`）：`scale(0) → 1` + overshoot 缓动。
- 图标按钮按下 `transform: translateY(1px) scale(0.97)`。
- 尊重 `prefers-reduced-motion`：所有过渡降级为 1ms。

### 🔧 文件变动

- 重写 `nova-block/src/styles/design-tokens.css`（v2 Ink-on-Paper）
- 重写 `nova-block/src/components/widgets/QuickActionsBar.tsx`（底部 Dock）
- 修改 `nova-block/src/App.tsx`（接入 `onOpenCommand`）
- 修改 `nova-block/src/index.css`（Tailwind 语义变量 / Note-link capsule 朱砂色）

---

## [0.17.0] - 2026-04-29 · M1 视觉底座 + M2 核心体验

### ✨ 新增 — UI/UX 视觉统一

- **Design Token 层** (`src/styles/design-tokens.css`): 引入 `--nv-*` 统一设计变量体系（颜色 / 圆角 / 阴影 / 动效 / 间距 / 字体），覆盖浅色与深色主题，所有新增组件强制引用。
- **玻璃态 (Glass) 工具类**: `.nv-glass` / `.nv-glass-sm` 统一所有浮层的毛玻璃、阴影、边框与圆角，取代此前各自为政的菜单样式，解决了"视觉拼贴感"问题。
- **主题平滑过渡**: `html/body` 加入 `transition`，主题切换时以 `--nv-motion-slow` 曲线平滑过渡。
- **<kbd> / .nv-kbd**: 统一键盘按键标签样式，贯穿命令面板与帮助提示。
- **深色 / 浅色切换**: `QuickActionsBar` 新增主题切换按钮，持久化到 `localStorage`。

### 🚀 新增 — 核心体验

- **Command Palette 2.0** (`⌘K` / `Ctrl+K`):
  - 从纯笔记跳转升级为 **命令面板 + 笔记搜索** 混合式面板。
  - 内置命令：新建笔记 / 新建画布 / 打开今天的 Daily Note / 打开日历 / 打开 Graph View / 切换阅读模式 / 打开设置。
  - 模糊匹配命令关键词，支持 ↑↓ 选择、Enter 执行、Esc 关闭；沿用并兼容原有的笔记正文 hydration 链路。
  - 面板采用 `.nv-glass` 玻璃态，与整体 Token 一致。
- **Graph View 图谱视图** (`⌘⇧G` / `Ctrl+Shift+G`):
  - 全新基于 Canvas 的双向链接力导向图，零第三方依赖（手写物理模拟，<500 节点平滑运行）。
  - 支持拖拽节点、滚轮缩放（以鼠标为中心）、空白拖动平移、点击节点跳转；节点尺寸随度数（degree）变化，标签智能显示。
- **Daily Notes 日历** (`⌘⇧D` / `Ctrl+Shift+D`):
  - 月视图日历 + 侧栏本月已有列表。
  - 已存在 Daily 的日期显示强调色底；点击不存在的日期自动用模板（今日目标 / 日志 / 关联笔记 / 灵感）创建新笔记。
  - 标题按 `YYYY-MM-DD` 规范化，自动打上 `daily` 标签，纳入全文索引。
- **Reader Mode 阅读模式** (`⌘⇧R` / `Ctrl+Shift+R`):
  - 沉浸式阅读当前笔记：米色阅读底、衬线排版、72ch 窄栏、1.85 行距。
  - 浮动工具条：字号 `[` / `]` 五档、`T` 切换衬线/无衬线、`Esc` 退出。
  - 支持 Tiptap HTML 与轻量 Markdown 混合识别；Canvas 笔记自动跳过；DOMPurify 过滤 XSS。
- **QuickActionsBar**: 主编辑区右上角悬浮玻璃态工具条，一键进入 Daily / Graph / Reader / 主题切换，Reader 模式下自动隐藏。

### ⌨️ 快捷键总览

| 快捷键 | 功能 |
|---|---|
| `⌘K` / `Ctrl+K` | 打开命令面板 |
| `⌘⇧R` / `Ctrl+Shift+R` | 切换阅读模式 |
| `⌘⇧G` / `Ctrl+Shift+G` | 打开 Graph View |
| `⌘⇧D` / `Ctrl+Shift+D` | 打开 Daily Notes 日历 |
| `[` / `]` | 阅读模式内调整字号 |
| `T` | 阅读模式内切换衬线/无衬线 |

### 🗂 文件变动

- 新增 `nova-block/src/styles/design-tokens.css`
- 新增 `nova-block/src/styles/reader-mode.css`
- 新增 `nova-block/src/components/reader/ReaderMode.tsx`
- 新增 `nova-block/src/components/graph/GraphView.tsx`
- 新增 `nova-block/src/components/daily/DailyNotesPanel.tsx`
- 新增 `nova-block/src/components/widgets/QuickActionsBar.tsx`
- 新增 `nova-block/src/lib/readerContent.ts`
- 新增 `nova-block/src/lib/dailyNotes.ts`
- 修改 `nova-block/src/components/search/CommandPalette.tsx` (支持 actions)
- 修改 `nova-block/src/index.css` (引入新样式层)
- 修改 `nova-block/src/App.tsx` (接线 + 全局快捷键 + palette actions)

### 🔬 质量

- `npx tsc --noEmit` 本地通过。
- 所有新文件均提供 Prop 校验 / 键盘可访问性 / `prefers-reduced-motion` 降级。

---

## [0.16.3] - 2026-04-13

### 修复
- **TableOfContents**: 修复了由于 Tiptap 渲染延迟导致大纲 ID 重复引发的 React key 重复报错。
- **具体实现**: 
  - 在大纲提取逻辑中引入了包含 `pos` 和 `level` 的复合唯一 Key，确保 React Key 的绝对唯一性。
  - 增强了 `TableOfContents` 组件的列表渲染稳定性。

## [0.16.1] - 2026-04-13

### 修复
- **UI**: 修复了黑胶播放器播放列表弹出框在滚动内部内容时会自动关闭的问题。
- **具体实现**: 
  - 在 `PlaylistPopover.tsx` 中为容器增加了 `playlist-popover-container` 类名。
  - 在 `MusicContext.tsx` 的全局滚动监听中，增加了对该类名的点击/滚动拦截，确保用户在查看长播放列表时能够顺畅滚动。
