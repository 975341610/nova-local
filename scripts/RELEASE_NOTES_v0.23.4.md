# Nova v0.23.4 Release Notes

发布日期：2026-05-06
通道：stable
最低基线：v0.23.0

## 关键修复（v0.23.3 燎原 bug 全部清零）

- **设置面板「当前版本 —」修复**：`electron/updaterBridge.js::resolveCurrentVersion`
  补齐三级 fallback。当 `current\` 链接缺失、appRoot 没有 `VERSION.txt`、
  slot 自身也漏写 `VERSION.txt` 的"半坏态"安装下，改读
  `versions/.index.json` 的最近一条 healthy 条目作为权威版本号。这是 v0.23.3
  打包过程被中断后用户手动恢复留下的常见状态。

- **设置面板「更新」UI 又裸了**：v0.23.2 → v0.23.3 周期内，
  `nova-block/src/styles/updater.css` 由 `index.css` 中的 `@import` 引入；
  Rolldown 在生产构建中把它当作未被任何模块引用的全局副作用，再次 tree-shake。
  现改为在 `UpdaterPanel.tsx` 顶部直接 `import '../styles/updater.css'`，
  让构建工具把它视作组件依赖，与 UpdaterPanel 一同打入主 chunk。

- **笔记版本历史按钮调用失败**：`electron/main.js::DESKTOP_API_REQUESTS` 现在支持
  `pathPattern` 形式（RegExp）的参数化路径，覆盖
  `/notes/{id}/revisions(/...)` 与 `/notes/{id}/snapshot`。之前所有
  路径都必须文字匹配，导致 `notes:revisions:list` 等 5 个 IPC 通道在白名单
  里有名字、却被 path 校验拒掉，编辑区上方的"版本历史"按钮看似不见了。

- **`backend/services/updater_pkg.py` UnboundLocalError**：拆分签名校验的
  try 块。先单独捕获 `ImportError`(cryptography 缺失) 抛 `SignatureError`，
  再处理 `InvalidSignature`，避免缺包时 `cryptography` 名字未定义触发
  `UnboundLocalError`。

- **`backend/services/updater_service.py::_atomic_switch_current` Windows 兼容**：
  Windows 上 `os.symlink` 需要 `SeCreateSymbolicLinkPrivilege`，且
  `os.replace` 不能覆盖真实目录。改用 NTFS junction（`mklink /J`，无特权要求），
  先 `os.rmdir`/`shutil.rmtree` 清掉旧 `current\` 再创建新 junction。POSIX
  路径保留原 symlink + replace 实现。

- **`scripts/release.ps1` payload 完整性校验**：增加"required staged files"
  与"required staged deps"两步硬校验。`backend/main.py`、
  `electron/main.js`、`frontend_dist/index.html`、
  `electron/node_modules/{yaml,chokidar}` 任一缺失 → `Die`，杜绝
  v0.23.3 那种打出"半空 slot"安装包却仍然签名成功的事故。

- **`start_windows.bat` 依赖再装机制**：把 `.venv\.nova_core_deps_installed`
  从字面值 `ok` 改为 `requirements-core.txt` 的 SHA1 哈希。任何后续更新
  改动 requirements 都会触发 `pip install -r`，防止
  `ModuleNotFoundError: cryptography` 类回归。

## 新增

- **`normalizeDesktopApiRequest` 支持 pathPattern**：`DESKTOP_API_REQUESTS`
  Map 新增 `pathPattern: RegExp` 字段。运行时若条目带 `pathPattern`，
  改用 `regex.test(input.path)`；不带则保持文字 `path` 等值校验，行为完全向后兼容。
  当前已迁移到 pathPattern 的通道：

  - `notes:revisions:list`     → `^/notes/\d+/revisions$`
  - `notes:revisions:get`      → `^/notes/\d+/revisions/\d+$`
  - `notes:revisions:restore`  → `^/notes/\d+/revisions/\d+/restore$`
  - `notes:snapshot`           → `^/notes/\d+/snapshot$`

- **`resolveCurrentVersion` 三级 fallback**：①slot/VERSION.txt → ②flat
  appRoot/VERSION.txt → ③`versions/.index.json` 最末 healthy 条目。
  最后一级专门救援 v0.23.3 那种"junction 已建、slot VERSION.txt 缺、
  appRoot VERSION.txt 已删"的人工恢复态。

## 后续

- 增量差分 `.nova-update` 规划中。
- 启动失败时自动回滚到 `versions/.index.json` 上一条 healthy 条目。
- `callPyUpdater` PYTHONPATH 拼接 + `pathPattern` 校验单元测试。

## 升级路径

- v0.23.x → v0.23.4：直接通过「设置 → 更新」选 `nova-v0.23.4-full.nova-update`
  安装即可。安装后请重启应用。
- 半坏态恢复：如果 v0.23.3 安装时被中途打断、当前安装树里
  `current\` 不存在或 slot 缺 VERSION.txt，直接安装 v0.23.4 即可；
  新版本会自己读取 `.index.json` 解决版本号显示问题，并在写入
  `current\` 时重建 junction。

签名：`nova-release-2026-05`
