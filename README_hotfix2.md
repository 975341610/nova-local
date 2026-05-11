# Nova v0.22.0-a hotfix2 · History 修复版

## 本次修复的问题

**症状**：打开任意笔记 → 点右上角 🕐 历史 → 列表始终为空，即使编辑保存多次也没有任何快照产生。

**根因**：Nova 的笔记保存走 Electron IPC → `fsBridge.js` 直接写 Markdown 文件，**完全绕过 FastAPI 的 `PUT /notes/{id}` 路由**，所以 `revision_service.maybe_snapshot()` 永远不会被触发。

**修复方案**：
1. 后端新增 `POST /notes/{id}/snapshot` 专职打点接口
2. 前端 `api.captureNoteSnapshot()` 在每次 `updateNote` 成功后 fire-and-forget 触发一次快照
3. 补全鉴权白名单（v0.22.0-a 四个新接口都在 `is_exempt` 链路中豁免）

---

## ⚠ 前置：先关掉 Nova 和后端进程

```powershell
Get-Process | Where-Object { $_.ProcessName -match 'electron|python|nova' } | Stop-Process -Force
```

## 覆盖命令（PowerShell）

```powershell
# 解压 zip 到任意目录,cd 进去
cd C:\path\to\v0.22.0-a-hotfix2

# 项目根
$NOVA = "C:\AI\nova-local-v0.18.0\nova-local"

# 1) 后端两个文件
Copy-Item backend\main.py         "$NOVA\backend\main.py"         -Force
Copy-Item backend\api\routes.py   "$NOVA\backend\api\routes.py"   -Force

# 2) 前端 frontend_dist 整体替换
Remove-Item -Recurse -Force "$NOVA\frontend_dist"
Copy-Item -Recurse frontend_dist "$NOVA\frontend_dist"

# 3) 清缓存
$cache = "$env:APPDATA\nova-block\Cache"
if (Test-Path $cache) { Remove-Item -Recurse -Force $cache }
Get-ChildItem -Path "$NOVA\backend" -Include __pycache__ -Recurse -Directory | Remove-Item -Recurse -Force

# 4) 重启
cd $NOVA
.\start_windows.bat
```

---

## 验证步骤（按顺序）

1. 启动 Nova,打开任意笔记
2. 改一行文字 → 等 ~3 秒自动保存（或 Ctrl+S 手动保存）
3. 点编辑器右上角 🕐 历史图标
4. 应看到至少 1 条快照,徽标显示 **自动** 或 **手动**
5. 继续编辑 → 保存 → 打开历史 → 新增一条（2 分钟内去重同内容,属正常）
6. 任选一条 → 预览 → 回滚 → 正文回到旧版本 ✅

## F12 排查

- Network 看 `POST /api/notes/{id}/snapshot` → 应为 200,response `{"status":"ok","snapshot_id":xxx}`
- 若返回 401 → `main.py` 没覆盖成功
- 若返回 404 → `routes.py` 没覆盖成功
- 若前端没发这个请求 → 前端 `frontend_dist` 没替换或缓存未清
