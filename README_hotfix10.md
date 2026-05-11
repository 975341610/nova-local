# Nova v0.22.0-a hotfix10 · 彻底清除版本恢复残留污染 + 修复跨笔记双链丢失

## 本次修复的问题 (hotfix9 之后仍存在)

1. **版本回退后笔记开头仍出现 `--- id: 11 uuid: ... ---` 这类 YAML 文字** — 和 hotfix9 之前的症状类似,但不再被 "escape 成 HTML 代码",而是作为一段普通文字夹在元数据栏和真正的正文之间。
2. **跨笔记双链丢失** — 当笔记 A 里引用笔记 B,对 B 做一次版本恢复后:
   - A 打开时,右侧"双向链接"面板里对 B 的引用变成空(或标题空白);
   - 点击那条链接跳转,进到一个空内容的笔记页。

## 根因

### 问题 1 · hotfix9 的剥离逻辑漏判了真实的污染格式

hotfix9 的 `stripEmbeddedFrontmatter` 只认这种非常严格的格式:

```
---\n         <- 必须是纯 LF, 以 "---\n" 开头
<yaml>\n
---\n         <- 闭合也必须是 "\n---\n"
<body>
```

但实际污染链里同时存在以下变体,hotfix9 会全部静默跳过、污染继续向下游透传:

| 变体 | 触发来源 | hotfix9 行为 |
|---|---|---|
| `---\r\n...\r\n---\r\n` (Windows 换行) | Electron 在 Windows 上 `fs.readFile(..., 'utf8')` 读回的是 CRLF | `startswith("---\n")` 直接 false,完全不剥 |
| 开头有空白/空行再跟 `---` | 部分 Electron 写入后经 YAML 库 `\n---\n\n---\n` 堆叠 | `startswith("---\n")` 判断失败 |
| 尾部 `---` 后**没有换行**直接接内容 | YAML dump 尾 trim 或手工编辑 | `indexOf("\n---\n")` 找不到闭合 |
| 多层嵌套(每次 save 翻一层) | hotfix9 只循环 3 次;污染老数据可能有 4 层以上 | 剥不干净,残留一层 |

### 问题 2 · 版本恢复后前端从未重拉笔记列表

`RevisionHistoryDrawer.onRestore → onRestored(updated)` 只把 `updated` 推给**当前**编辑器,并不会触发 `App.loadNotes()`。于是:

- 全局 `notes[]` 仍然保留 B 恢复**前**的 `content`;
- `BacklinksPanel` 根据这份陈旧的 `notes[]` 渲染 A 的双链列表,卡片标题/摘要可能是空的;
- 点击那张卡片 → `onSelectNote(note)` 用的是陈旧 `note` 对象 → 编辑器拿到空/旧内容。

## 修复思路

### A. 宽松 + 正则化的 `stripEmbeddedFrontmatter` (前后端/Electron 共 4 处同步)

```ts
function stripEmbeddedFrontmatter(content: string): string {
  if (!content) return ''
  let body = content
  // 1. 规范化换行 (CRLF → LF), 解决 Windows 下污染识别不到的问题
  if (body.indexOf('\r') !== -1) body = body.replace(/\r\n?/g, '\n')
  // 2. 允许开头有空白/空行; 允许尾部 --- 不带换行 (用 $ 收尾)
  const pattern = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/
  // 3. 最多剥 5 层, 覆盖历史上反复嵌套的坏数据
  for (let i = 0; i < 5; i++) {
    const stripped = body.replace(/^\s+/, '')
    if (!stripped.startsWith('---')) break
    const match = pattern.exec(stripped)
    if (!match) break
    body = stripped.slice(match[0].length)
  }
  return body.replace(/^\n+/, '')
}
```

同步更新的五个剥离点:

| 位置 | 文件 |
|---|---|
| 后端读盘 / 写盘 / update_note | `backend/services/vault_store.py::strip_embedded_frontmatter` |
| 版本快照服务 存/取/restore-point | `backend/services/revision_service.py::_strip_embedded_frontmatter` |
| Electron parseNoteFile / writeNoteFile / updateNote | `electron/fsBridge.js::stripEmbeddedFrontmatter` |
| Reader Mode 渲染入口 | `frontend_dist/.../readerContent.ts::stripEmbeddedFrontmatter` |
| BacklinksPanel 链接扫描 | `frontend_dist/.../BacklinksPanel.tsx::extractLinkedIds` |
| Editor `onRestored` 回调 | `frontend_dist/.../NovaBlockEditor.tsx` |

### B. 恢复成功后主动触发全局笔记重拉

`NovaBlockEditor.onRestored` 在恢复完成后派发一个自定义事件:

```ts
window.dispatchEvent(new CustomEvent('nova:notes-invalidate', {
  detail: { reason: 'revision-restored', noteId: updated.id },
}))
```

`App.tsx` 监听这个事件并调用 `loadNotes(preferredId)`,把 `notes[]` 整份更新。这样:

- `BacklinksPanel` 拿到新的 `notes[]`,A → B 的卡片会显示恢复后的 B 正确标题和摘要;
- 点击链接跳转到 B 时,B 在全局状态里已经是"恢复后"的新版本,不会再出现空笔记;
- `GraphView`, `ConceptOrbit` 等基于 `notes[]` 渲染的模块也同步刷新。

## 其他一并加固的点

1. **循环次数 3 → 5**:覆盖历史上多次嵌套的坏数据(每次保存都翻一层,3 次不够)。
2. **删除前置 `\s+`**:避免 body 开头混入的空行/BOM 让 `---` 判定失败。
3. **尾部 `(?:\n|$)`**:即便文件末尾没有换行也能成功匹配闭合。

---

## ⚠ 前置:先关闭 Nova 和后端

```powershell
Get-Process | Where-Object { $_.ProcessName -match 'electron|python|nova' } | Stop-Process -Force
```

## 覆盖命令 (PowerShell)

```powershell
cd C:\path\to\v0.22.0-a-hotfix10

$NOVA = "C:\AI\nova-local-v0.18.0\nova-local"

# 1) 后端
Copy-Item backend\api\routes.py "$NOVA\backend\api\routes.py" -Force
Copy-Item backend\services\vault_store.py "$NOVA\backend\services\vault_store.py" -Force
Copy-Item backend\services\revision_service.py "$NOVA\backend\services\revision_service.py" -Force

# 2) Electron 主进程
Copy-Item electron\fsBridge.js "$NOVA\electron\fsBridge.js" -Force

# 3) 前端 frontend_dist 整体替换
Remove-Item -Recurse -Force "$NOVA\frontend_dist"
Copy-Item -Recurse frontend_dist "$NOVA\frontend_dist"

# 4) 清缓存
$cache = "$env:APPDATA\nova-block\Cache"
if (Test-Path $cache) { Remove-Item -Recurse -Force $cache }
Get-ChildItem -Path "$NOVA\backend" -Include __pycache__ -Recurse -Directory | Remove-Item -Recurse -Force

# 5) 重启
cd $NOVA
.\start_windows.bat
```

---

## 验证步骤

### 1. 确认新包 hash 正确

打开 Nova → F12 → Network → 刷新,应加载:

```
index-AshOd2Ax.js   ✅ hotfix10
```

若仍是 `index-zso0wKjl.js` 或更早,说明 `frontend_dist` 没覆盖或 Cache 没清。

### 2. 验证版本回退不再污染

1. 打开一篇内容较复杂的笔记(含 `---` 分隔线、图片、双链都可以)。
2. 🕐 历史 → 选一个较老的版本 → 恢复。
3. 期望:
   - ✅ 编辑器**开头没有**任何 `--- id: ... ---` 文字
   - ✅ 阅读模式正文排版正确
   - ✅ 侧边栏"双向链接"面板显示正常

### 3. 验证跨笔记双链在恢复后不再丢

1. 准备两篇笔记:A 正文里用 `[[B]]` 方式引用 B。
2. 打开 B,做若干次保存,生成至少 2 个历史版本。
3. 把 B 回退到老版本。
4. 切回 A,查看右侧"双向链接":
   - ✅ 指向 B 的卡片**标题正确**、**摘要不为空**
   - ✅ 点击卡片 → 进入 B → **显示 B 恢复后的内容**,而不是空笔记

### 4. 老污染笔记自愈

之前已经被污染的笔记,hotfix10 下只要打开 + 任意改动 + 保存一次,下次重开就干净了(读盘/写盘两道都会剥掉内嵌 frontmatter)。

---

## 变更文件清单

| 文件 | 变更 |
|---|---|
| `backend/services/vault_store.py` | `strip_embedded_frontmatter` 改为正则版本,支持 CRLF/无尾换行/多层嵌套 |
| `backend/services/revision_service.py` | `_strip_embedded_frontmatter` 同步升级 |
| `electron/fsBridge.js` | `stripEmbeddedFrontmatter` 同步升级 |
| `frontend_dist/` | 重建 (新 hash: `index-AshOd2Ax.js`)。`readerContent.ts`、`BacklinksPanel.tsx` 同步升级;`NovaBlockEditor.tsx` `onRestored` 派发 `nova:notes-invalidate`;`App.tsx` 监听该事件并触发 `loadNotes` |

## F12 排查

- **版本回退后仍看到 YAML 文字**:先确认 JS 包 hash 是 `index-AshOd2Ax.js`,再确认后端日志里没有 `_strip_embedded_frontmatter` ImportError。
- **A → B 双链仍然空**:F12 Network 里恢复动作之后看有没有重新发 `GET /api/notes`,没有说明 `nova:notes-invalidate` 事件未绑定,检查 `App.tsx` 是否确实更新。
- **阅读模式排版还是一坨代码**:同样是前端包没更新的老问题,清缓存 + 重启解决。
