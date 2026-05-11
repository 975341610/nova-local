# Nova 更新包打包流程

这个工具用于把当前项目内容打成 `.nova-update` 更新包，供软件内 `设置 -> 更新` 使用。

## 正式发布

正式发布必须生成签名包。先设置签名密钥环境变量：

```bat
set SIGN_KEY=C:\keys\nova-release.pem
set SIGNING_KEY_ID=nova-release-2026a
set PUBLIC_BASE_URL=https://example.com/nova/updates
package_release.bat 0.24.0 release
```

本机如果存在已 pin 的开发发布私钥，`package_release.bat 版本号 release` 会自动使用：

```text
dist\keys\nova-release-2026-05.pem
signing_key_id = nova-release-2026-05
```

正式发布流水线仍建议显式设置 `SIGN_KEY` 和 `SIGNING_KEY_ID`。环境变量会覆盖本机默认值，便于后续密钥轮换或在安全 secret store 中运行。

也可以直接运行 PowerShell 脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package_release.ps1 -Version 0.24.0 -ReleaseNotes .\scripts\RELEASE_NOTES_v0.24.0.md -SignKey C:\keys\nova-release.pem -SigningKeyId nova-release-2026a
```

输出文件位于：

```text
dist\releases\nova-v版本号-full.nova-update
dist\releases\latest.json
```

`latest.json` 是软件内远程检查更新使用的发布索引。把它和 `.nova-update` 包放在同一个静态目录，然后在用户机器的 `data\updater_config.json` 中配置：

```json
{
  "feed_url": "https://example.com/nova/updates/latest.json",
  "channel": "stable"
}
```

## 本地开发测试

未签名包只能用于本地检查打包流程：

```bat
package_release.bat 0.24.0 dev
```

`一键打包更新包.bat` 是中文便捷入口，内部会转到 `package_release.bat`。

已签名客户端会拒绝未签名包，所以不要把 dev 模式生成的包用于 `设置 -> 更新`。

如果要验证软件内完整升级流程，必须使用 `release` 模式生成签名包，并保证客户端信任对应的 `SIGNING_KEY_ID` 和公钥。
`dev` 模式生成的包适合检查“能否成功打包、索引是否正确、包内容是否完整”，但正式前端更新入口会按签名策略拒绝它。

## 打包自检

脚本会自动执行这些检查：

- 重新执行前端生产构建，避免继续使用旧的 `frontend_dist`。
- 检查版本号、release notes、签名参数和关键启动文件。
- 检查更新包内包含版本历史和更新入口相关代码标记。
- 检查 Electron 生产依赖已经入包，例如 `chokidar` 和 `yaml`。
- 拒绝把运行时状态或备份内容打入更新包。
- 生成 `latest.json`，包含版本、渠道、包地址、sha256、包大小和发布时间。

这些目录不会进入更新包，也不应该提交到 Git：

```text
cache/
current/
versions/
data/
electron/runtime/
```

## 失败排查

每次运行都会写入详细日志：

```text
logs\package-release\package-v版本号-时间.log
```

失败时控制台和日志都会包含：

- `FAILED stage`：失败阶段。
- `Reason`：明确失败原因。
- `Path`：相关文件或目录。
- `Command`：失败命令。
- `Suggested fix`：建议修复方式。
- `Full diagnostic log`：完整日志路径。

如果软件内更新失败，优先回查本次打包日志，再确认生成的包是否为签名 release 包。

软件内安装阶段失败时，后端会尝试自动回到上一个稳定版本，并把详细原因写入：

```text
data\logs\updater-install-failures.log
data\logs\crash.log
```

这些日志会记录失败阶段、目标版本、上一版本、回滚结果、缓存包路径和完整 traceback。`设置 -> 更新` 的崩溃/失败日志入口会合并展示这些信息，方便定位是签名、下载校验、解包、迁移、切换版本还是启动健康检查失败。
