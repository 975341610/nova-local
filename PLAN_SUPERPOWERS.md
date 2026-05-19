# nova-local · 4 大功能开发计划 (Superpowers TDD)

> 修订版 **v5** · 2026-05-18
> 整合四轮代码审查反馈:
> - **第一轮 (v2)**: 6 项完全采纳 + 1 项升级为完全采纳;新增批 1.5 与批 7
> - **第二轮 (v3)**: 6 项必须修改 + 2 项建议修改全部采纳
> - **第三轮 (v4)**: 5 项必改 + 2 项轻微建议全部采纳
> - **第四轮 (v5)**: 5 项文档级细节全部采纳 (本版本) → **执行许可已发放**
> 分支: `feat/4-features-superpowers`
> 工作目录: `nova-block/` (前端) · 本期不涉及后端改动

---

## 0. 项目背景与约束

- **目标仓库**: `975341610/nova-local` (V9 分支)
- **本地工作分支**: `feat/4-features-superpowers`
- **技术栈**: React 19 + TypeScript 5.9 + Vite 8 + Tiptap v3 (ProseMirror) + Zustand + Vitest 4 + Tailwind CSS 4
- **沙箱基线** (vite.config.ts):
  - `RAYON_NUM_THREADS=1` 避免 Rolldown panic
  - `VITEST_SINGLE_THREAD=1` 触发条件式 `pool: 'threads' / poolOptions.threads.singleThread`
- **基线测试** (审查 v2-#7 已修正):
  - **Vitest: 349 / 349 通过**
  - **Electron 测试**: 1 个历史失败,**排除本次验收**
- **方法论**: Superpowers TDD - 严格 RED → GREEN → REFACTOR → COMMIT

---

## 1. 4 大功能总览

| # | 功能 | Phase 0 决议 |
|---|---|---|
| F1 | 编辑器查找替换 | 方案 A (ProseMirror 插件);三开关 (区分大小写/全字/正则);Ctrl+H;面板 absolute top-right;仅当前笔记 |
| F2 | 文件树增强 | (a) 空白处右键菜单 / (b) Ctrl+点击多选 + 批量移动/删除 (拖拽 + 弹窗) / (c) 排序: 创建/修改/打开时间 |
| F3 | 选区 AI 浮窗 | BubbleMenu 加 AI 按钮;命令: 改写/润色/翻译为英文/转为表格 + 自由输入;预览后用户确认替换;边缘防溢出 |
| F4 | 取消媒体相框 | 仅 image/video;**保留** 圆角 + 悬停上移 |

---

## 2. 分批交付

| 批 | 内容 | 状态 |
|---|---|---|
| **批 1** | F4-T1 (取消相框) + F1-T1 v1 (textblock 级扫描) | ✅ 已交付 (8 + 3 测试通过) |
| **批 1.5** | F1-T1 v2: 重写为 text-node-level + charIndex→docPos 映射表;补审查建议测试 | ⏳ 即将开始 |
| **批 2** | F1-T2 FindReplacePanel + F1-T3 EditorHeader 集成 + Ctrl+H 快捷键 | 待办 |
| **批 3** | F2a 空白区右键菜单 (前置: 给 TreeNodeItem 加 `data-tree-node-id`) | 待办 |
| **批 4-pre** | **F2b 重构前置**: 从 `SidebarTree` 移出 `updateNote` 持久化职责 | 待办 |
| **批 4** | F2b 多选 + 批量删除/移动 + 新增 MoveToDialog + selectedRoots 归一化 | 待办 |
| **批 5** | F2c 排序 + localStorage 打开历史 overlay | 待办 |
| **批 6** | F3 AI BubbleMenu (position: fixed + 复用 api.streamInlineAI + Markdown table 解析) | 待办 |
| **批 7** | 冒烟回归测试套件 (UI 基线 10 个检查点) | 待办 |

---

## 3. 任务分解

### F1 · 查找替换

#### F1-T1 v1 ✅ (批 1 已完成)
- 文件: `src/lib/novablock/findReplacePlugin.ts` + `src/test/findReplacePlugin.test.ts`
- 已实现: PluginKey state / setQuery / gotoNext/Prev / replaceCurrent / replaceAll
- 已实现: Tiptap `Extension.create` 包装 (`FindReplaceExtension`)
- 8 测试通过

#### F1-T1 v2 ⏳ (批 1.5)

**问题** (审查 v1-#5): 当前 `findMatches` 用 `node.isTextblock` + `node.textContent`,对于段落内含原子 inline 节点 (mention、math、emoji 等) 时,`pos + 1 + m.index` 与真实 doc 偏移不一致。

**修复方案**: text-node-level 扫描 + 每个 textblock 维护 `idx2pos: number[]` 映射表 + **atomic 节点占位符** (审查 v4-#1)。

```ts
// 伪代码
const ATOMIC_PLACEHOLDER = '￼'  // OBJECT REPLACEMENT CHARACTER
state.doc.descendants((block, blockPos) => {
  if (!block.isTextblock) return
  let acc = ''
  const idx2pos: number[] = []
  let cursor = blockPos + 1
  block.forEach(child => {
    if (child.isText) {
      const t = child.text!
      for (let i = 0; i < t.length; i++) idx2pos.push(cursor + i)
      acc += t
    } else {
      // 审查 v4-#1: atomic inline 节点 (mention/math/emoji 等) 写入占位符,
      // 防止搜索 "foobar" 跨过 [emoji] 误命中 "foo[emoji]bar"
      acc += ATOMIC_PLACEHOLDER
      idx2pos.push(cursor)
    }
    cursor += child.nodeSize
  })
  // regex 在 acc 上匹配,用 idx2pos[m.index] / idx2pos[m.index + m[0].length - 1] + 1 还原 doc 偏移
})
```

**零宽正则保护** (审查 v2-#5):

```ts
if (m[0].length === 0) {
  re.lastIndex += 1
  continue
}
```

**零宽替换禁止** (审查 v4-#2 新增):

```ts
// replaceCurrent / replaceAll: 跳过 from === to 的 zero-width match
export function replaceCurrent(view, replacement) {
  const m = state.matches[state.current]
  if (m.from === m.to) {
    return  // 不替换零宽 match
  }
  // ... 原逻辑
}
export function replaceAll(view, replacement): number {
  const valid = state.matches.filter(m => m.from !== m.to)
  if (valid.length === 0) return 0
  // ... 仅对非零宽 match 执行替换
  return valid.length
}
```

**新增 7 个测试** (v3 4 条 + v4 新增 3 条):

1. `cross-paragraph search`: `<p>foo</p><p>foo</p>` 两段都命中
2. `heading + body same word`: `<h1>foo</h1><p>foo</p>` 两处都命中,顺序正确
3. `invalid regex doesn't crash`: 输入 `[`,`matches=[]`,不抛错
4. `zero-width regex doesn't infinite loop`: 输入 `(?=f)` (regex=true),文档 `<p>foo bar fizz</p>`,**不死循环**,matches 数量等于文档中 `f` 出现次数 (本例 = 2),且每个 match 的 `from === to`
5. **`atomic inline node prevents cross-match`** (审查 v4-#1): 构造文档 `<p>foo<span data-atomic>X</span>bar</p>` (用一个 atomic 自定义 node),搜索 `foobar` → matches=0;搜索 `foo` → matches=1
6. **`replaceCurrent on zero-width match does not modify doc`** (审查 v4-#2): 设置 `(?=f)` query → `replaceCurrent('Z')` → 文档不变
7. **`replaceAll on zero-width match returns 0`** (审查 v4-#2): 设置 `(?=f)` query → `replaceAll('Z')` 返回 `0` 且文档不变

**Definition of Done**: 8 + 7 = 15 测试全绿;F1-T1 v1 的所有断言依然通过。

---

#### F1-T2 FindReplacePanel (批 2)
- 文件: `src/components/editor/FindReplacePanel.tsx` + 单测
- React 组件: 查找输入 / 替换输入 / 三开关 checkbox / 上一个 / 下一个 / 替换 / 全部替换 / `n / total` 计数 / 关闭 (×)
- 受控开/关 props: `open`, `onClose`, `editor: Editor | null`
- `useEffect` 把 query 同步到 plugin: `setFindQuery(editor.view, query, options)`
- 样式: `position: absolute`, `top-2 right-2`, `z-40`

#### F1-T3 集成到 EditorHeader (批 2)
- 文件: `src/components/editor/EditorHeader.tsx`
- 在打字机按钮 (L182-195) 之前插入 "查找替换" 按钮 (lucide `Search`)
- `useState<boolean>` 控制 panel 开关
- `useEffect` 注册 Ctrl+H (preventDefault) 切换 panel

---

### F4 · 取消媒体相框 ✅ (批 1)

#### F4-T1 ✅
- 文件: `src/components/MediaNodeView.tsx` L122-131
- 已删除 `bg-white / shadow-sm / p-2 / pb-8 / border-stone-200`
- 已保留 `rounded-xl / hover:-translate-y-0.5 / transition-transform`
- 仅 image/video;audio 维持原样
- 3 测试通过

---

### F2 · 文件树增强

#### F2-T0 · 给 TreeNodeItem 加可寻址锚点 (批 3 起首)

**审查 v1-#1**: TreeNodeItem 当前只有 `data-testid/data-depth/data-selected/data-folder`,没有 `data-tree-node-id`。

- 文件: `src/components/sidebar/TreeNodeItem.tsx`
- 在最外层 `<div>` 加 `data-tree-node-id={node.id}` (string)

#### F2a · 空白区右键菜单 (批 3)

**审查 v4-#3**: 不能挂在 SidebarTree 根容器,因为 V9 的 SidebarTree 还包含品牌区 / tab 切换 / 全局搜索 / 双向链接 / AI tab / "我的手账"标题 / 右上新增按钮。挂太外层会让用户右键这些区域也弹出"新建文件夹/笔记/画布"菜单。

**实现规则** (写死):
- 在树滚动列表的容器外层加一个明确的 wrapper: `<div data-sidebar-tree-canvas onContextMenu={...}>`
- handler 中:
  - `event.target.closest('[data-tree-node-id]')` 命中 → 让节点级菜单接管,**不弹空白菜单**
  - `event.target.closest('[data-sidebar-tree-canvas]')` 不命中 → return (说明根本不在树区域)
  - 都不命中节点 → 弹空白区菜单 (新建文件夹 / 笔记 / 画布)
- **复用现有 prop** (审查 v5-#3): V9 的 `SidebarTreeProps` 已有 `onNodeAdd?: (parentId: string | null, type?: 'file' | 'folder' | 'canvas') => void`,空白区菜单点击直接调:
  - 新建文件夹 → `onNodeAdd?.(null, 'folder')`
  - 新建笔记 → `onNodeAdd?.(null, 'file')`
  - 新建画布 → `onNodeAdd?.(null, 'canvas')`
- **不新增** `onBlankAreaCreate` prop,改动面更小

**测试** (审查 v4-#3 强制):
- `SidebarTree.contextmenu.test.tsx`:
  1. 右键空白区 → 弹空白菜单
  2. 右键节点 → **不**弹空白菜单 (节点级菜单接管)
  3. 右键 sidebar header / tab 切换 / 全局搜索框 / 新建按钮 → **不**弹空白菜单

#### F2b-pre · 重构前置 · 移除 SidebarTree 内部持久化职责 (批 4-pre)

**审查 v2-#2**: V9 当前 `SidebarTree.handleMove` (L156) 直接调用 `updateNote(parseInt(nodeId, 10), { parent_id, position })` 改 Zustand,这与"props 上抛"原则冲突。

**重构规则**:

| 层 | 职责 |
|---|---|
| `SidebarTree` | (1) 计算目标 `parentId` / `sortKey`<br>(2) 做循环移动拦截 (不能拖到自己的子孙)<br>(3) **只**调用 `onNodeMove(nodeId, parentId, sortKey)` / `onBulkMove(...)` |
| `App.tsx` | (1) 调 `api.moveNote` / `api.bulkMoveNotes` / `api.deleteNote` / `api.bulkDeleteNotes`<br>(2) 成功后**安全刷新**(见下) <br>(3) 失败 toast/`onNotify`,**不污染本地 store** |

**审查 v4-#4 修正**: 单个 `api.moveNote` 类型上没保证返回 `{ notes }`,不能照搬批量接口的处理。

**安全刷新策略**:

```ts
// 单条移动 / 删除: 不假设返回值,统一重新拉取
async function handleNodeMove(nodeId, parentId, sortKey) {
  await api.moveNote(parseInt(nodeId, 10), {
    parent_id: parentId ? parseInt(parentId, 10) : null,
    position: parseFloat(sortKey),
    notebook_id: null,
  })
  const fresh = await api.listNotes(false)
  setNotes(fresh)
}

// 批量移动 / 删除: 接口已明确返回 { notes },直接 setNotes
async function handleBulkMove(ids, parentId) {
  const { notes } = await api.bulkMoveNotes({ ... })
  setNotes(notes)
}
```

- 文件: `SidebarTree.tsx` 删除 L61 `const updateNote = useNoteStore(...)` 与 L156 处的本地 `updateNote(...)` 调用
- 此重构作为**独立 commit** 在批 4 之前提交,便于回退

#### F2b · Ctrl+点击多选 + 批量 (批 4)

**审查 v1-#2/#3 + v2-#1/#3/#4** 全部并入。

##### F2b-T1 · 多选 state + 命中规则
- 文件: `SidebarTree.tsx`
- `selectedIds: Set<string>` (审查 v1-#2: 必须 string,因 TreeNode.id 是 string)
- 单击: 清空多选并设为单选
- Ctrl/Cmd + 单击: toggle 进出 set
- Shift + 单击: 区间选择 (按可视扁平顺序)
- 选中 ≥ 2 时显示浮动操作条 (批量删除 / 移动到...)
- 拖拽: 起始节点在 set 内 → 拖全部 set;否则只拖当前

##### F2b-T2 · 选择归一化 `normalizeSelectedRoots` (审查 v2-#4 新增)

**问题**: 用户同时选中父文件夹 A 与子节点 B。直接对二者执行删除/移动,会出现:
- 删父成功 → 删子失败 (子已不存在)
- 移父成功 → 移子导致结构错乱

**前置: `toTreeNodes` 共享工具** (审查 v5-#2 新增):

V9 当前 `nodes: TreeNode[]` 是 `SidebarTree` 内部用 `notes.map(...)` 生成的局部变量,App 层没有现成 nodes。为避免两侧各写一套映射,先抽出共享工具:

- **新文件**: `src/lib/novablock/treeNodes.ts`
  ```ts
  export function toTreeNodes(notes: Note[]): TreeNode[]
  ```
- `SidebarTree.tsx` 与 `App.tsx` 共用此工具

**`normalizeSelectedRoots` 实现**:

- 新文件: `src/lib/novablock/selectionUtils.ts`
- `normalizeSelectedRoots(selectedIds: Set<string>, nodes: TreeNode[]): string[]`
- 规则: 对每个被选中的 id,如果它的某个祖先也在 set 内,则**剔除自己**;最终返回顶层根的 id 列表

##### F2b-T3 · 抽取 MoveToDialog (审查 v4-轻微#1: 从 inline 抽取,非全新)

**事实核对**: V9 的 `SidebarTree.tsx` L600-655 已有一段 inline 的 Move To Modal (`moveToModal` state + JSX),但**没有**独立的 `MoveToDialog` 组件文件。

- **新文件**: `src/components/sidebar/MoveToDialog.tsx`
- **实现路径**:
  1. **先抽取**: 把 SidebarTree.tsx L600-655 的 inline Move To Modal 完整搬到新组件,保持视觉风格一致
  2. **再扩展**: 把"单条移动" 拓展为"批量移动" (props 改为 `selectedIds: string[]`)
- props: `open`, `onClose`, `selectedIds: string[]`, `allNodes: TreeNode[]`, `onConfirm(targetParentId: string | null)`
- 渲染**仅文件夹**的折叠树
- **过滤规则**: 隐藏 `selectedIds` 自身及其所有子孙 (复用现有 `isDescendant` 工具,见 L636)
- 确认时调 `onConfirm` (App 层负责 `api.bulkMoveNotes`)
- 配套 `MoveToDialog.test.tsx`: 验证子孙过滤、folder-only 过滤、cancel/confirm 行为

##### F2b-T4 · App.tsx 批量接入 (审查 v2-#3)

**强制使用批量 API,禁止循环单条调用**:

```ts
// 审查 v5-#2: App 层先把 notes 转成 TreeNode[] 再做归一化
import { toTreeNodes } from '../lib/novablock/treeNodes'
import { normalizeSelectedRoots } from '../lib/novablock/selectionUtils'

const handleBulkDelete = async (ids: string[]) => {
  const treeNodes = toTreeNodes(notes)
  const roots = normalizeSelectedRoots(new Set(ids), treeNodes)
  const note_ids = roots.map(s => parseInt(s, 10))
  const { notes: fresh } = await api.bulkDeleteNotes({ note_ids })
  setNotes(fresh)
}

const handleBulkMove = async (ids: string[], parentId: string | null) => {
  const treeNodes = toTreeNodes(notes)
  const roots = normalizeSelectedRoots(new Set(ids), treeNodes)
  const note_ids = roots.map(s => parseInt(s, 10))
  const position = computeNextSortKey(parentId, treeNodes)
  const { notes: fresh } = await api.bulkMoveNotes({
    note_ids,
    parent_id: parentId ? parseInt(parentId, 10) : null,
    notebook_id: null,
    position,
  })
  setNotes(fresh)
}
```

##### F2b-T5 · 测试 (审查 v2-#4 新增 3 条)
- `selectionUtils.test.ts`:
  1. 选中 folder + child note → `normalizeSelectedRoots` 只返回 folder
  2. 选中 folderA + folderB (无父子关系) → 返回两者
  3. 多层嵌套 (A → B → C) 全选 → 只返回 A
- `SidebarTree.multiselect.test.tsx`:
  4. Ctrl+click 切换 selectedIds
  5. 批量删除时 onBulkDelete 收到的 ids 已被归一化
- `MoveToDialog.test.tsx`:
  6. 选中 folder A,弹窗中 folder A 及其子孙不可见
  7. 确认后回调 `onConfirm` 携带正确 targetParentId
- `App.bulk.test.tsx`:
  8. mock `api.bulkMoveNotes`,验证调用参数 (`note_ids` 已归一化)
  9. mock `api.bulkDeleteNotes`,失败时不污染 store

#### F2c · 排序 + 折叠分组 (批 5)

**审查 v1-#4** + **审查 v2-#8** (排序分组规则写死)。

- **新文件**: `src/lib/openHistory.ts`
  ```ts
  // localStorage key: 'nova-note-last-opened-map'
  // 形态: Record<string, string>  (noteId → ISO timestamp)
  export function getLastOpenedMap(): Record<string, string>
  export function recordOpen(noteId: string): void
  export function getLastOpened(noteId: string): string | undefined
  ```
- App 选中笔记的 effect 内调用 `recordOpen(currentNoteId)`
- `SidebarTree.tsx` 顶部新增排序按钮 (lucide `ArrowUpDown`)
  - 选项: `default` / `created` / `modified` / `opened`
  - 持久化到 localStorage `'nova-tree-sort-mode'`

**分组规则 (审查 v2-#8 写死)**:

| 排序模式 | 行为 |
|---|---|
| `default` | 原有排序,无分组 |
| `created` | 仅按时间排序,**无分组** |
| `modified` | 排序 + 分组 (今天 / 昨天 / 更早) |
| `opened` | 排序 + 分组 (今天 / 昨天 / 更早) |

- 分组 header 可折叠
- 测试: `openHistory.test.ts` (mock localStorage) + `SidebarTree.sort.test.tsx` (DOM 顺序 + 分组存在性断言)

---

### F3 · 选区 AI 浮窗 (批 6)

**审查 v1-#6/#7 + v2-#6** 全部并入。

#### F3-T1 AiBubbleMenu 组件
- 新文件: `src/components/editor/AiBubbleMenu.tsx`
- props: `editor: Editor | null`, `onNotify?: (text, tone) => void` (审查 v4-#5b: 复用 NovaBlockEditor:635 已有的 `onNotify` 通道,**不**新增 toast 依赖)
- 监听 `editor.on('selectionUpdate')`:
  - 选区非空 → 计算 `editor.view.coordsAtPos(selection.from)` 屏幕坐标
  - 边缘检测: 右溢出 → 左移;下溢出 → 改向上
- **Listener cleanup** (审查 v5-#5): 必须在 `useEffect` 中绑/解,防止重复挂载导致状态抖动:
  ```ts
  useEffect(() => {
    if (!editor) return
    const handler = () => { /* update selection state */ }
    editor.on('selectionUpdate', handler)
    return () => { editor.off('selectionUpdate', handler) }
  }, [editor])
  ```
- 容器使用 `position: fixed` (审查 v1-#6)
- 渲染:
  - 快捷按钮: 改写 / 润色 / 翻译为英文 / 转为表格
  - 自由输入框 + 提交按钮
  - 提交后弹预览面板:左原文 / 右流式生成结果 / 接受 / 取消

**Freeze Selection** (审查 v4-轻微#2):

```ts
// 用户点 AI 按钮的瞬间冻结选区,防止后续输入 prompt / 等待流式时焦点漂移
function onTriggerAi(action) {
  const { from, to } = editor.state.selection
  const savedRange = { from, to }
  const savedText = editor.state.doc.textBetween(from, to)
  setPendingApply({ savedRange, savedText, action })
  // 后续所有读 selection 的地方都用 savedRange,不再读 editor.state.selection
}
```

#### F3-T2 提交 & 应用 (复用现有 API)

```ts
// 审查 v1-#7: 复用 lib/api.ts:154 的 api.streamInlineAI
api.streamInlineAI(
  { prompt, context: pendingApply.savedText, action: pendingApply.action },
  chunk => setStreaming(s => s + chunk),
)
```

#### F3-T3 接受结果时的 action-aware 应用 (审查 v2-#6 + v4-#5)

**问题**: `insertContent(streaming)` 对 "转为表格" 不够,Tiptap 不会自动把 Markdown 表格字符串解析成 table node。

**实现策略**:

```ts
async function applyResult(action, streaming, savedRange) {
  if (action === 'table') {
    const html = parseMarkdownTableToHtml(streaming)  // 见下
    if (html) {
      editor.chain().focus().deleteRange(savedRange).insertContent(html).run()
      return
    }
    // 审查 v4-#5b: 用 onNotify,不引入 toast 依赖
    onNotify?.('未能识别为表格,已按原样插入文本', 'info')
  }
  editor.chain().focus().deleteRange(savedRange).insertContent(streaming).run()
}
```

- **新增 util**: `src/lib/novablock/markdownTableParser.ts`
  - 正则识别 `| col | col |` + `| --- | --- |` 行
  - **审查 v4-#5a 强制 HTML escape**:
    ```ts
    function escapeHtml(s: string): string {
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }
    ```
  - **白名单标签**: 仅生成 `<table><thead><tr><th>...</th></tr></thead><tbody><tr><td>...</td></tr></tbody></table>`,所有 cell 文本必须经 `escapeHtml`
  - 解析失败返回 `null`
  - V9 已有的 Tiptap table 扩展 + tiptap-markdown 依赖会负责把该 HTML 渲染成 table node

#### F3-T4 测试
- `AiBubbleMenu.test.tsx`: mock `api.streamInlineAI`,验证按钮触发参数正确,流式 chunk 反映到预览;空选区不显示;预览取消不改文档
- **`AiBubbleMenu.frozen-selection.test.tsx`** (审查 v4-轻微#2): 点 AI 按钮后人为修改 `editor.state.selection`,接受时 `deleteRange` 仍用最初冻结的 range
- `markdownTableParser.test.ts`:
  1. 标准 3x3 markdown table → 正确 HTML
  2. 非表格文本 → 返回 null
  3. 仅有表头无分隔线 → 返回 null
  4. **审查 v4-#5a**: 单元格内容含 `<script>alert(1)</script>` → 输出 HTML 中应为 `&lt;script&gt;alert(1)&lt;/script&gt;`,且 `<script>` 字面量不存在
  5. **审查 v4-#5a**: 单元格内容含 `&` `"` `'` `<` `>` → 全部正确 escape
- `AiBubbleMenu.table.test.tsx`: action='table' 且文本是 markdown table → `insertContent` 参数为 HTML;action='table' 但文本是普通段落 → 降级 + `onNotify` 被调用

---

### 批 7 · 冒烟回归测试套件

**审查 v1-#8 衍生**: 一次性端到端冒烟,保住基线 UI。

- 新文件: `src/test/qingzhi-regression-smoke.test.tsx`
- 10 个检查点:
  1. App 渲染不抛错
  2. EditorHeader 出现打字机按钮
  3. EditorHeader 出现查找替换按钮 (F1)
  4. SidebarTree 至少 1 个 `[data-tree-node-id]`
  5. SidebarTree 顶部出现排序按钮 (F2c)
  6. MediaNodeView (image) 不含 `bg-white/shadow-sm/p-2` (F4)
  7. MediaNodeView (image) 含 `rounded-xl` 与 `hover:-translate-y-0.5`
  8. NovaBlockEditor 渲染时含 BubbleMenu 容器
  9. AiBubbleMenu 在选区为空时不渲染面板
  10. localStorage `'nova-note-last-opened-map'` 在打开笔记后被写入

---

## 4. 验收标准

- 所有新增测试在 `VITEST_SINGLE_THREAD=1 RAYON_NUM_THREADS=1 npx vitest run` 下绿
- 不破坏 Vitest 基线 349 (Electron 历史失败排除)
- 每批结束: `git format-patch` 系列 + 上传给用户
- 每批 commit message 规范: `feat(<scope>): <subject>` / `test(<scope>): <subject>` / `refactor(<scope>): <subject>`

---

## 5. 风险与回退

| 风险 | 缓解 |
|---|---|
| F1 text-node 映射对极端文档 (空段、全 atomic) 出错 | **7 个新增测试** (含 atomic 跨节点 / 零宽替换) + 现有 8 测试覆盖 |
| F2b 重构改动 SidebarTree + App.tsx 影响范围大 | 批 4-pre 单独 commit;批 4 紧随其后,问题定位粒度小 |
| 批量 API 半成功 (部分成功 + 部分失败) | App handler 用返回的 `notes` 整体 setNotes,以服务端为权威 |
| Markdown table 解析覆盖不全 | 失败时降级插入文本 + **`onNotify` 提示**,不阻塞主流程 |
| F3 BubbleMenu 与现有 BubbleMenu 冲突 | 复用同一容器,只加按钮和受控子面板 |
| 沙箱 Vitest 不稳 | 始终带 `VITEST_SINGLE_THREAD=1`;失败再排查 |

---

## 6. 代码审查反馈采纳清单

### 第一轮 (v1)

| # | 审查点 | 状态 | 落点 |
|---|---|---|---|
| 1 | TreeNodeItem 缺 `data-tree-node-id` | ✅ | F2-T0 (批 3) |
| 2 | 多选用 `Set<string>` | ✅ | F2b-T1 (批 4) |
| 3 | useNoteStore 无批量方法 → props 上提 | ✅ | F2b-pre (批 4-pre) |
| 4 | lastOpenedAt 用 localStorage overlay | ✅ | F2c (批 5) `openHistory.ts` |
| 5 | F1 位置映射应 text-node 级 | ✅ | 批 1.5 |
| 6 | AI 面板用 `position: fixed` | ✅ | F3-T1 (批 6) |
| 7 | 复用 `api.streamInlineAI` | ✅ | F3-T2 (批 6) |
| 8 | F4 范围 (仅 image/video) | ✅ | 批 1 已完成 |

### 第二轮 (v3 · 上一轮采纳)

| # | 审查点 | 状态 | 落点 |
|---|---|---|---|
| 1 | MoveToDialog 改"新增"非"复用" | ✅ | F2b-T3 (批 4) |
| 2 | 移除 SidebarTree 内 `updateNote` 持久化 | ✅ | F2b-pre (批 4-pre) 独立 commit |
| 3 | 强制用 `bulkMoveNotes` / `bulkDeleteNotes` | ✅ | F2b-T4 (批 4) |
| 4 | 新增 `normalizeSelectedRoots` 处理父子同选 | ✅ | F2b-T2 + selectionUtils.ts (批 4) |
| 5 | 零宽正则测试改用 `(?=f)` | ✅ | 批 1.5 第 4 条测试 |
| 6 | "转为表格" 增加 markdown→Tiptap 解析与降级 | ✅ | F3-T3 + markdownTableParser.ts (批 6) |
| 7 | 基线表述: Vitest 349/349 + Electron 排除 | ✅ | §0 已修正 |
| 8 | 排序分组规则写死 (modified/opened 分组,created 不分组) | ✅ | F2c (批 5) 表格 |

### 第三轮 (v4 · 上一轮采纳)

| # | 审查点 | 状态 | 落点 |
|---|---|---|---|
| 1 | F1 atomic 节点用占位符,防跨节点误匹配 | ✅ | 批 1.5 (含新测试 #5) |
| 2 | 零宽 match 禁止 `replaceCurrent/All`,返回 0 | ✅ | 批 1.5 (含新测试 #6/#7) |
| 3 | F2a 右键菜单挂载范围限定到树滚动列表 | ✅ | F2a (批 3) `[data-sidebar-tree-canvas]` + 测试 |
| 4 | `api.moveNote` 不假设返回值,改 `await listNotes` | ✅ | F2b-pre (批 4-pre) |
| 5a | parseMarkdownTableToHtml 必须 escape + 白名单 | ✅ | F3-T3 + 测试 #4/#5 |
| 5b | 提示用现有 `onNotify`,不引入 toast | ✅ | F3-T1 / T3 |
| 轻微 1 | MoveToDialog 从 inline modal 抽取,非全新 | ✅ | F2b-T3 (步骤化: 先抽取再扩展) |
| 轻微 2 | F3 打开面板时 freeze selection range | ✅ | F3-T1 + `frozen-selection` 测试 |

### 第四轮 (v5 · 本次新增 · 文档级细节)

| # | 审查点 | 状态 | 落点 |
|---|---|---|---|
| 1 | F1 测试数量改为 7 条,DoD 改为 8+7=15 | ✅ | 批 1.5 |
| 2 | 新增 `toTreeNodes(notes)` 共享工具,App 与 SidebarTree 共用 | ✅ | F2b-T2 + `lib/novablock/treeNodes.ts` |
| 3 | F2a 复用现有 `onNodeAdd?.(null, type)`,不新增 prop | ✅ | F2a (批 3) |
| 4 | 风险表同步 (7 测试 + onNotify 不再用 toast) | ✅ | §5 |
| 5 | F3 selectionUpdate 监听必须在 useEffect 中 cleanup | ✅ | F3-T1 |

## 7. 执行纪律 (审查 v5 发放执行许可)

| 纪律 | 内容 |
|---|---|
| **批次顺序** | 批 1.5 → 批 2 → 批 3 → 批 4-pre → 批 4 → 批 5 → 批 6 → 批 7 |
| **批 4-pre 必须独立 commit** | 与批 4 分开,出问题可单独回退 |
| **不得混批** | 批 4 不得和 5/6 合并提交 |
| **守住两条核心纪律** | 1. SidebarTree **绝不**直接污染本地 store,持久化统一交给 App<br>2. F3 AI 替换永远使用 frozen `savedRange`,不重新读 `editor.state.selection` |

---

*Generated by Mira · Superpowers TDD methodology · 2026-05-18 · v5 (执行许可)*
