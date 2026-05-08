# Nova v0.22.0 覆盖说明 (Windows / PowerShell)

> 这是 v0.22.0-a + hotfix1~11 的累计全量包,覆盖一次即可,无需再叠任何补丁。

## ⚠ 关键路径

Electron 主进程 `electron/main.js` 第 22 行写死:
```js
const FRONTEND_INDEX = path.join(APP_ROOT, 'frontend_dist', 'index.html');
```
所以覆盖 `nova-block/dist/` 无效,**必须覆盖到 `frontend_dist/`**。本包已按 `frontend_dist/` 路径组织。

---

## PowerShell 一键覆盖命令

```powershell
# 1. 切到 zip 解压后的目录 (里面有 backend/ electron/ frontend_dist/ VERSION.txt)
cd C:\path\to\v0.22.0

# 2. 设置项目根
$NOVA = "C:\AI\nova-local-v0.18.0\nova-local"

# 3. 关掉 Nova 与 Python 后端
Get-Process | Where-Object { $_.ProcessName -match 'electron|python|nova' } | Stop-Process -Force

# 4. 覆盖后端
Copy-Item backend\main.py                        "$NOVA\backend\main.py"                        -Force
Copy-Item backend\api\routes.py                  "$NOVA\backend\api\routes.py"                  -Force
Copy-Item backend\services\revision_service.py   "$NOVA\backend\services\revision_service.py"   -Force
Copy-Item backend\services\vault_store.py        "$NOVA\backend\services\vault_store.py"        -Force
Copy-Item backend\models\db_models.py            "$NOVA\backend\models\db_models.py"            -Force

# 5. 覆盖 Electron 主进程
Copy-Item electron\fsBridge.js                   "$NOVA\electron\fsBridge.js"                   -Force

# 6. 前端整体替换 (避免旧 bundle hash 残留)
Remove-Item -Recurse -Force "$NOVA\frontend_dist"
Copy-Item -Recurse frontend_dist                 "$NOVA\frontend_dist"

# 7. 版本号
Copy-Item VERSION.txt                             "$NOVA\VERSION.txt"                            -Force

# 8. 清缓存
$cache = "$env:APPDATA\nova-block\Cache"
if (Test-Path $cache) { Remove-Item -Recurse -Force $cache }
Get-ChildItem -Path "$NOVA\backend" -Include __pycache__ -Recurse -Directory | Remove-Item -Recurse -Force

# 9. 重启
cd $NOVA
.\start_windows.bat
```

---

## 启动后快速验证

- F12 → Network → 刷新,主 bundle 应为 `index-AnBV-2jQ.js`
- 窗口/设置里版本号 `0.22.0`
- `GET /system/revision-settings` 200 OK
- 完整回归检查请打开 `REGRESSION_CHECKLIST.md`

---

## 文档

- `CHANGELOG_v0.22.0.md` — 本次修复完整清单
- `REGRESSION_CHECKLIST.md` — 回归自检清单
- `docs/v0.23.0-updater-design.md` — 下一版离线更新与版本管理设计
