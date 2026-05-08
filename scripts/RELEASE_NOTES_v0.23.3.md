# Nova v0.23.3 Release Notes

发布日期：2026-05-05
通道：stable
最低基线：v0.23.0

## 关键修复（继承自 v0.23.2 hotfix）

- **更新功能可用**：修复 `electron/updaterBridge.js` 调用 `python -m
  backend.services.updater_cli` 时在 Windows + venv 下出现
  `ModuleNotFoundError: No module named 'backend'` 的问题。子进程现在显式注入
  `PYTHONPATH=<current_slot|appRoot>`，并优先调用新的 `start_updater_cli.py`
  shim（自包含 sys.path 解析），失败再回退到 `-m` 形式。
- **设置面板「更新」标签样式**：补齐 `nova-block/src/styles/updater.css`，
  之前 v0.23.2 因为无样式表渲染成无样式纯文本。

## 新增（v0.23.3）

- **在线检查更新**：「设置 → 更新 → 检查更新」新增"检查在线更新"按钮。
  在 `data/updater_config.json` 中配置 feed URL 即可启用：
  ```json
  {
    "feed_url": "https://example.com/nova/updates/latest.json",
    "channel": "stable"
  }
  ```
  feed JSON 形如：
  ```json
  {
    "version": "0.23.4",
    "channel": "stable",
    "package_url": "https://example.com/nova/nova-v0.23.4-full.nova-update",
    "release_notes_md": "...",
    "released_at": "2026-05-12T00:00:00Z"
  }
  ```
  发现新版本后一键下载 + 校验 + 安装，重启即生效。所有包仍走 ed25519 签名校验
  （`nova-release-2026-05`）。

- **`start_updater_cli.py` shim**：与 `start_backend.py` 共享 sys.path 解析策略，
  让 updater CLI 在任何 cwd 都能找到 `backend/`，宿主进程注入 PYTHONPATH 不再是
  唯一防线。

- **payload 自带 electron 生产依赖**：`scripts/release.ps1` 现在会按
  `electron/package.json::dependencies` 把 `yaml`、`chokidar` 等运行时依赖打进
  payload，避免新机器从未跑过 `npm install` 就崩在
  `Cannot find module 'yaml'`。

- **`start_windows.bat` 自愈**：检测到 `electron\node_modules\yaml` 缺失时自动
  `npm install --omit=dev` 兜底；npm 不在 PATH 时给出清晰指引。

## 后续

- 增量包（差分 `.nova-update`）规划中。
- 安装前 `data/` 自动备份点。
- `callPyUpdater` PYTHONPATH 拼接的单元测试。

## 升级路径

- 已在 v0.23.2：直接通过「设置 → 更新」选择 `nova-v0.23.3-full.nova-update`
  安装即可（修复后的 updater 已经能正常工作）。
- 老于 v0.23.2：先把本次发布说明附带的 `electron/updaterBridge.js` 补丁
  覆盖到 `<NovaRoot>\electron\updaterBridge.js`，重启后再走在线/离线更新。

签名：`nova-release-2026-05`
