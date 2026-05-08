# Nova v0.22.0-a hotfix9 · 彻底修复"版本恢复后笔记被 YAML frontmatter 污染"

## 本次修复的问题

**症状（hotfix8 之后仍存在）**：

1. 打开任意笔记 → 🕐 历史 → 选一条老版本 → 恢复 → 编辑器顶部突然出现下面这种文字:
   ```
   --- id: 8 uuid: a2d99ea5-... title: 测试02 ... links: - 9 ai_links: [] ---
   ```
   紧跟着才是原本的标题和正文。
2. 切到阅读模式后，页面只显示一堆 `<h1 id="h-测试02">测试02</h1><p></p><img src=...` 的**文本代码**，而不是渲染后的正文。
3. 侧边栏"双向链接"面板变空（反向链接 + 正向链接都消失）。
4. 每次再保存，frontmatter 会被再嵌套一层，越滚越大。

## 根因（最关键）

这是一条**污染链**，由以下合力形成:

| 环节 | 原本做法 | 出问题的地方 |
|---|---|---|
| 版本快照写入 `revision_service.maybe_snapshot` | 直接把传入的 `content` gzip 存库 | 若上游给的 `content` 是"完整 .md 文件内容"(含 frontmatter), 快照里也会带上 |
| `restore_revision` 返回目标版本 | 原样返回 snapshot content | 污染被原样取出 |
| 后端 `update_note` / vault `_write_note_file` | `body = f"---\n{fm}---\n\n{note.content}"` | 如果 `note.content` 本身已带 frontmatter, 文件就被嵌套两层 `---` |
| Electron `fsBridge.parseNoteFile` 读盘 | `splitFrontmatter` 只剥一层 | 剩下内层的 `---\nid: ...---\n` 留在 body, 送到前端 |
| 前端 Reader `looksLikeHtml` | 只判断前 200 字符是否以 HTML 标签开头 | 一开头是 `---` 就判为 markdown → 走 `lightMarkdownToHtml` → 把 HTML 标签 escape 成文本 |
| 前端 BacklinksPanel `extractLinkedIds` | 在 `note.content` 里正则抓 `data-id="(\d+)"` | 内容被污染后正则抓不到, 双向链接空 |

## 修复思路：**幂等防御 × 五道闸**

污染已经在历史快照里 "bake in" 了 — 不能指望用户重建数据。唯一能治本的做法是在**读/写/渲染的每一道关口**都做一次 `stripEmbeddedFrontmatter()` 幂等清洗:

| 闸 | 文件 | 作用 |
|---|---|---|
| 1. 后端落盘 | `vault_store._write_note_file` | 最终兜底, 落盘前剥掉 body 内嵌 frontmatter |
| 2. 后端读盘 | `vault_store._parse_note_file` | 读盘后, body 内若残留嵌套 frontmatter 继续剥 |
| 3. 快照服务 | `revision_service.maybe_snapshot` / `get_revision` / `restore_revision` | 写入前 + 读取时双向清洗, 让旧的脏快照也能自愈 |
| 4. Electron | `fsBridge.js::parseNoteFile` + `writeNoteFile` + `updateNote` | IPC 保存路径, 和后端 vault_store 对称处理 |
| 5. 前端 | `readerContent.ts::renderReaderHtml` / `NovaBlockEditor.onRestored` / `BacklinksPanel.extractLinkedIds` | Reader 渲染前、恢复回调里、双向链接扫描前都清洗一次 |

函数逻辑：
```js
// 幂等剥离 body 开头可能存在的多层 frontmatter (---\n ... \n---\n)
function stripEmbeddedFrontmatter(content) {
  let body = content || '';
  for (let i = 0; i < 3; i++) {
    if (!body.startsWith('---\n')) break;
    const sep = body.indexOf('\n---\n', 4);
    if (sep === -1) break;
    body = body.slice(sep + 5).replace(/^\n+/, '');
  }
  return body;
}
```

> 幂等意味着干净内容调用任意多次都不变；每一道闸独立有效，任一层都能救回污染的数据。

## 其他一并加固的点

1. **Reader Mode 入口清洗** — 即便后端还没来得及清洗, 阅读模式打开瞬间也能显示正确内容, 不再出现"一堆 HTML 代码"。
2. **BacklinksPanel 扫描清洗** — 历史污染笔记的双向链接依然能被解析出来。
3. **`onRestored` 防御** — 回滚成功时立刻在前端剥一层, 避免"恢复瞬间"的编辑器脏态。
4. **`maybe_snapshot` 存入清洗** — 未来所有新快照都是干净的, 污染链从根上断。

---

## ⚠ 前置：先关闭 Nova 和后端

```powershell
Get-Process | Where-Object { $_.ProcessName -match 'electron|python|nova' } | Stop-Process -Force
```

## 覆盖命令 (PowerShell)

```powershell
cd C:\path\to\v0.22.0-a-hotfix9

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

> 本次改动包含 Electron 主进程 `fsBridge.js`, 一定要覆盖到 `electron/` 目录下, 否则 IPC 路径不会清洗.

---

## 验证步骤

### 1. 验证包版本正确

打开 Nova → F12 → Network → 刷新, 确认加载的是:

```
index-zso0wKjl.js  ✅  (hotfix9 新包)
```

如果仍然看到 `index-BkkUSeDM.js` 或其它老 hash —— 说明 `frontend_dist` 没覆盖成功或 Electron Cache 没清掉，回到覆盖命令重做。

### 2. 验证历史回滚不再污染

1. 打开一篇带内容的笔记 (尤其是含图片/表格/双向链接的), 多次保存, 累积一些历史版本.
2. 🕐 历史 → 选一条老版本 → 恢复 → 确认.
3. 期望:
   - ✅ 编辑器**开头没有 `--- id:...` 的文字**
   - ✅ 切到阅读模式, **正文排版正确**(不是一堆 `<h1>...<p>` 代码)
   - ✅ 侧边栏**双向链接恢复显示**
   - ✅ 抽屉自动关闭, 右下角绿字"已恢复到所选版本"
   - ✅ Console 无红字错误

### 3. 自愈已污染的老笔记

即使某篇笔记**已经**被 hotfix9 之前的流程污染了, 这次修复也能让它"下次打开时自动变干净":

1. 打开那篇被污染的笔记
2. 任意编辑一下并保存 (或直接 Ctrl+S)
3. 关闭重开 → 应该恢复正常

### 4. 回归测试

- 普通保存 → 历史列表新增一条 auto 快照 ✓
- 主动触发快照 (Ctrl+Alt+S) → 新增一条 save 快照 ✓
- 再次恢复老版本 → 不再污染 ✓

---

## 变更文件清单

| 文件 | 变更 |
|---|---|
| `backend/api/routes.py` | （与 hotfix8 一致, 无新增变更, 仅保持同步）|
| `backend/services/vault_store.py` | 新增 `strip_embedded_frontmatter`; 在 `_parse_note_file`/`update_note`/`_write_note_file` 三处清洗 |
| `backend/services/revision_service.py` | 新增 `_strip_embedded_frontmatter`; 在 `maybe_snapshot`/`get_revision`/`restore_revision` 三处清洗 |
| `electron/fsBridge.js` | 新增 `stripEmbeddedFrontmatter`; 在 `parseNoteFile`/`writeNoteFile`/`updateNote` 三处清洗 |
| `frontend_dist/` | 重建: `nova-block/src/lib/readerContent.ts`, `BacklinksPanel.tsx`, `NovaBlockEditor.tsx` |

## F12 排查

- **仍看到 frontmatter 在正文**:
  - 检查 Network 的 JS 包 hash 是否为 `index-zso0wKjl.js`
  - 若是老 hash: `frontend_dist` 没覆盖成功, 或 `%APPDATA%\nova-block\Cache` 没清
- **Reader 仍然显示一堆代码**: 同上, 说明前端没更新
- **双向链接仍然空**: 尝试对该笔记手动 Ctrl+S 一次, 或重开; 若依旧空, 检查 F12 Network `/api/notes/list` 返回里这条笔记的 `content` 字段是否已经不含 `---`
