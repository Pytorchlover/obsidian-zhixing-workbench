# 飞书任务提醒

通过 macOS LaunchAgent 每 5 分钟运行 `scripts/task-reminders.py`，使用已登录的 `lark-cli` **机器人身份**向自己的飞书单聊发送通知。检查与发送均不调用语言模型。Obsidian 开启时优先使用工作台自身任务解析，关闭时读取本地笔记；iCloud 文件暂不可读时跳过并在提醒中标注未覆盖数量。Mac 关机或睡眠时不能准点发送。

- 北京时间 09:00 汇总今日重点、今天到期和逾期未完成任务。
- 18:00 汇总已到期但未完成的任务。
- `- [ ] 任务 📅 YYYY-MM-DD HH:MM` 在截止前一小时内提醒一次。
- 只有日期的任务进入早晚汇总，不擅自赋予截止时间。
- 已完成任务不再提醒；代码围栏中的示例、raw、模板和插件目录不纳入检查。
- 同一期消息由本地状态和 CLI 幂等键去重。发送结果不明确且超过 CLI 一小时幂等窗口时停止重发，等待核对。

## 本机配置

在知识库外建立专用目录，保存脚本副本与权限 0600 的 `config.json`：

```json
{
  "vault": "/absolute/path/to/vault",
  "cli": "/absolute/path/to/lark-cli",
  "profile": "your-profile",
  "recipient": "ou_your_open_id",
  "path": "/opt/homebrew/bin:/usr/bin:/bin"
}
```

配置可选填 obsidian 字段，指向官方 CLI 绝对路径，以优先复用工作台解析。配置不保存 appSecret 或 token；凭证继续由飞书 CLI 管理。建议使用 Python 3.13（仅标准库）。

```sh
python3.13 task-reminders.py --config config.json --dry-run
python3.13 task-reminders.py --config config.json --send-current
```

`--send-current` 会向配置中的本人发送当前重点，适合接入验证，每天只发送一次。正常定时运行去掉这两个选项。不要把个人配置、state.json、日志或 LaunchAgent 放入公开仓库。

LaunchAgent 采用 `StartInterval=300`、`RunAtLoad=true`，ProgramArguments 填写上述 Python、脚本及配置的绝对路径。工作目录与输出日志均指向知识库外的专用目录。脚本使用文件锁避免重叠执行；失败保留本地 last_error，日志只含统计与错误类型，不打印任务全文或凭证。建议关注本地错误日志；无可用飞书授权时无法通过同一通道报告故障。

## 授权有效期

`lark-cli auth status --json --verify` 可检查服务端状态。个人访问令牌与刷新凭证各有有效期，以当前输出的 expiresAt、refreshExpiresAt 为准；不能将当前刷新凭证日期理解为永久有效。机器人发送使用应用身份，不依赖个人刷新凭证，但仍受应用凭证、权限和可用范围影响。

测试：`python3.13 tests/task_reminders_test.py`。
