# Nova v0.22.0 · CHANGELOG

> 发布日期: 2026-05-04
> 基线: v0.22.0-a + hotfix1~11 全量合并
> 主要投入: **版本恢复 / 双向链接 / 目录树稳健性** 三条线

---

## ✨ 亮点一句话总结

1. **版本恢复**不会再导致笔记开头残留 YAML 文字、阅读模式排版错乱、双链丢失这三类连锁症状;
2. **跨笔记双向链接**在被链接笔记执行版本回退后仍然稳定;
3. **目录树拖拽/移动**绝不会把节点搬进自己,Windows 不再冒 EINVAL 红字。

---

## 🐛 Bug 修复

### A. 版本恢复链路 (hotfix2 / 6 / 7 / 8 / 9 / 10)

| 症状 | 修复摘要 | 对应 hotfix |
|---|---|---|
| `GET /api/notes/:id/revisions` 返回 404 | 路由/服务注册修复 | hotfix2 / 6 |
| `RevisionHistoryDrawer` 打开后显示原始 JSON | 抽屉改为结构化卡片展示 | hotfix6 |
| `revision_service` 取值时抛异常 | 字段兼容与空值防护 | hotfix7 |
| 恢复后 Tiptap 没重新 `setContent` | `onRestored` 回调内显式设置 | hotfix8 |
| 恢复后笔记开头被渲染为转义 HTML 代码块 | `looksLikeHtml` 之前先剥离 YAML frontmatter | hotfix9 |
| 恢复后笔记开头仍出现 `--- id: 11 uuid: ... ---` 文字 (hotfix9 未覆盖变体) | 剥离逻辑重写为正则 + CRLF 归一化 + 5 层循环,覆盖 4 类历史污染格式 | **hotfix10** |

### B. 双向链接链路 (hotfix10)

| 症状 | 修复摘要 |
|---|---|
| A 笔记引用 B,B 版本回退后 A 的双链卡片标题/摘要变空 | `BacklinksPanel.extractLinkedIds` 对 `note.content` 先做宽松 frontmatter 剥离再跑 `data-id=` 扫描 |
| 点击双链跳转到"空笔记" | `NovaBlockEditor.onRestored` 派发 `nova:notes-invalidate` 事件 → `App.tsx` 监听并触发 `loadNotes(preferredId)`,强制刷新全局 `notes[]` |

### C. 目录树稳健性 (hotfix11)

| 症状 | 修复摘要 |
|---|---|
| 拖拽节点到自身或自身子孙 → `EINVAL: invalid argument, rename X -> X\...` | **三层硬防护**:<br>① `App.tsx::handleNodeMove` 前端兜底<br>② `electron/fsBridge.js::updateNote` Electron 入口拦截<br>③ `backend/services/vault_store.py::move_note` HTTP 后端拦截<br>三道防线任一失守上游,下游都不会碰磁盘。 |

### D. 其它小修 (hotfix1~5)

- `backend/main.py` 启动流程与 VAULT_ROOT 解析修复 (hotfix1/2)
- 前端 bundle 多次重建以同步发布 (hotfix3/4/5)

---

## 🔬 关键技术改动

### `stripEmbeddedFrontmatter` 统一版 (6 处同步)
```ts
// 宽松正则, CRLF 归一化, 允许前置空白/尾部无换行, 最多剥 5 层
const pattern = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/
```
落点:
- `backend/services/vault_store.py::strip_embedded_frontmatter`
- `backend/services/revision_service.py::_strip_embedded_frontmatter`
- `electron/fsBridge.js::stripEmbeddedFrontmatter`
- `nova-block/src/lib/readerContent.ts::stripEmbeddedFrontmatter`
- `nova-block/src/components/sidebar/BacklinksPanel.tsx::extractLinkedIds`
- `nova-block/src/components/novablock/NovaBlockEditor.tsx::onRestored`

### `nova:notes-invalidate` 自定义事件
- 派发方: `NovaBlockEditor.onRestored`
- 订阅方: `App.tsx useEffect` → `loadNotes(preferredId)`
- 用途: 一次版本恢复 → 全局 `notes[]` 重拉 → `BacklinksPanel` / `GraphView` / `ConceptOrbit` 全链路刷新

### `move_note` / `updateNote` 循环防护
- 前后端都用 "target 目录是否等于/包含 current._path" 的归一化路径判断
- 异常命名统一:`Cannot move a note into itself` / `Cannot move a folder into itself or its descendant`

---

## 📦 变更文件清单 (累计)

| 文件 | 说明 |
|---|---|
| `backend/main.py` | 启动与路径修复 (hotfix1/2) |
| `backend/api/routes.py` | revision API 与错误处理 (hotfix2/6/7/8/10) |
| `backend/services/revision_service.py` | revision 服务 + frontmatter 剥离 (hotfix7/9/10) |
| `backend/services/vault_store.py` | vault IO + frontmatter 剥离 + move 防护 (hotfix9/10/11) |
| `backend/models/db_models.py` | 数据模型兼容 (full base) |
| `electron/fsBridge.js` | Electron IPC + frontmatter 剥离 + move 防护 (hotfix9/10/11) |
| `frontend_dist/` | 多次重建,v0.22.0 最终 bundle: `index-AnBV-2jQ.js` |
| `VERSION.txt` | `0.22.0` |

---

## 🔁 升级路径

- 之前用 hotfix1~11 手动叠包的用户 → 本 `v0.22.0-full.zip` 一次性覆盖即可,无需叠补丁。
- 数据(`data/vault/`)无 schema 变更,兼容回退到任意 v0.22.0-a-hotfix* 版本。
- 老污染笔记(含 embedded YAML)打开任意编辑 + 保存一次即可自愈。

---

## ➡️ 下一版计划 (v0.23.0 方向)

- **离线更新与版本管理**: 软件内选择更新包 → 校验 → 安装,并支持失败时一键回退到稳定版 (详见 `docs/v0.23.0-updater-design.md`)
- Vault 批量自愈脚本(一次性清洗所有历史污染 `.md`)
- 版本回退成功后的 UI toast 反馈
