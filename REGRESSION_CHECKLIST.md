# Nova v0.22.0 · 回归自检清单

> 用法: 覆盖包安装完成、关闭并重启 Nova 后,按顺序执行以下 checklist。
> 通过条件: 所有 ✅ 项全部满足;任一项不通过立即停下来反馈给我,不要继续后面用例。

---

## 0. 启动与版本

- [ ] 启动 Nova,首屏无白屏/报错
- [ ] `VERSION.txt` 内容为 `0.22.0`
- [ ] F12 → Network → 刷新,主 bundle 为 `index-AnBV-2jQ.js`
- [ ] F12 → Console **无红色错误** (黄色 warn 可忽略)
- [ ] 后端 `http://127.0.0.1:8787/docs` (或实际端口) 可打开,`GET /api/notes` 返回 JSON

---

## 1. 基础 CRUD (smoke)

- [ ] 新建一篇笔记 `回归测试-A`,输入 "hello 123",保存
- [ ] 重启 Nova,能看到 `回归测试-A` 且内容完整
- [ ] 删除笔记 `回归测试-A`,能在回收站找到;还原后重新出现在树上

---

## 2. 版本恢复 (**v0.22.0 核心修复**)

### 2.1 基础恢复流
- [ ] 打开一篇内容较复杂的笔记(含标题、正文段落、列表、`---` 分隔线)
- [ ] 修改内容并保存 5 次以上,让它生成多个历史版本
- [ ] 打开右上角 🕐 历史抽屉 → 看到时间排序的版本列表(非原始 JSON)
- [ ] 选一个中间版本 → 点击恢复
- [ ] **编辑模式正文开头不再出现任何 `--- id: ... uuid: ... ---` YAML 文字**
- [ ] 切换到阅读模式,正文排版正常,**不再出现被转义的 HTML 代码块**
- [ ] 再次打开 🕐 历史,最新一条为 "restore-point" 类型的安全快照

### 2.2 跨笔记双链
- [ ] 创建笔记 A 与笔记 B;在 A 中写入 `[[B]]` 形式的双链;在 B 中保存 ≥ 2 次
- [ ] 打开 B → 回退到较老版本
- [ ] 切回 A → 右侧"双向链接"面板的卡片:
  - [ ] **标题显示为 B 恢复后的标题(非空)**
  - [ ] **摘要显示为 B 恢复后的摘要(非"空笔记")**
- [ ] 点击卡片 → 跳到 B → **看到 B 恢复后的内容,而非空白**
- [ ] GraphView(若使用) 也同步显示新数据

### 2.3 老污染笔记自愈
- [ ] 若有历史上已被污染的笔记,打开 → 随意改动一字符 → 保存 → 重新打开
- [ ] 开头不再出现 YAML 文字;下次启动 Nova 依然干净

---

## 3. 目录树移动 / 拖拽 (**v0.22.0 核心修复**)

- [ ] 正常跨目录拖拽笔记:A 文件夹 → B 文件夹,成功,刷新后位置持久化
- [ ] 正常拖拽排序:调整同层级顺序,`sort_key` 正确
- [ ] 把文件夹 `测试` 拖到**它自己**头上 / 内部 → 应**静默失败**,仅 console 出现 `Cannot move a folder into its own descendant, aborting.`,**不再出现 `EINVAL` 红字**
- [ ] 右键菜单 "移动到…":候选目录中不会列出自身或自身子孙
- [ ] 取消操作 / 失败操作后,左侧树不会残留错误状态 (必要时 `loadNotes` 兜底)

---

## 4. 双向链接渲染

- [ ] 笔记内写 `[[xx]]` / `data-id="nn"` 等形式 → BacklinksPanel 正确抓取
- [ ] BacklinksPanel 卡片展开后:封面图 / 摘要 / 标签 / 更新时间 都正常展示
- [ ] 点击"展开全部 / 收起全部"按钮行为符合预期
- [ ] 对于内容仅有 embedded frontmatter 污染的老笔记,依然能识别其 `data-id`

---

## 5. 阅读模式 (Reader)

- [ ] Tiptap HTML 笔记进入 Reader → 排版正确,图片/视频/音频/代码块/表格/公式 都能渲染
- [ ] Markdown 风格笔记进入 Reader → heading/list/blockquote/code fence 正确
- [ ] Canvas 笔记进入 Reader → 显示 "此笔记为 Canvas 画布" 友好提示
- [ ] 嵌入组件(todo-widget / kanban / countdown / mini-calendar / habit-tracker / timeline / slider / freehand)在阅读模式下有静态只读视图

---

## 6. 其它

- [ ] 搜索栏能找到新增/修改笔记
- [ ] Daily Note 创建正常
- [ ] Graph View / Concept Orbit 打开无报错
- [ ] 关闭 Nova → 重启 → 当前打开的笔记与 UI 状态仍正常恢复

---

## 7. 压力 / 边界

- [ ] 连续对同一笔记点击 10 次"恢复老版本",不会叠出无数 restore-point,列表健康
- [ ] 一篇笔记反复在 A/B 两个版本之间来回恢复,内容始终干净(不再累积 YAML 污染)
- [ ] 在离线环境(断网)下启动 Nova,本地功能正常

---

## 不通过时的排查线索

- 版本回退后仍见 YAML 文字 → 确认 bundle 是 `index-AnBV-2jQ.js`;后端 `vault_store.py` 存在 `strip_embedded_frontmatter` 的正则版本
- A → B 双链仍为空 → Network 中 restore 动作后**没有**重新 `GET /api/notes`,说明 `App.tsx` 没装 `nova:notes-invalidate` 监听(bundle 版本不对)
- 移动仍报 EINVAL → 搜索 `fsBridge.js` 是否存在字符串 `Cannot move a note into itself`;`App.tsx` 是否存在 `isDescendantByNote`
