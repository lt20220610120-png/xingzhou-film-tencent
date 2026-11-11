# Hermes 协作进度档案

本文件是 Hermes 与 Codex 共用行舟影视项目时的固定交接入口。Codex 开始后续任务前必须读取本文件，并继续核对实际 Git、代码、测试和公开发布状态；不要仅凭本文件快照作结论。

## 当前状态（2026-11-11）

- 当前执行代理：Hermes。后续修改由 Hermes 直接实施，不要求 Codex 后台进程保持运行。
- 当前正式版本：**2.8.148**，已发布并完成官网、GitHub 和软件内更新核验。
- 当前源码工作区：`D:/AI/Qwen3-TTS/xingzhou-release`。
- 当前分支：`codex/character-voice-workflow`。
- 2.8.148 实现提交：`cc376a7`；发布文档提交：`eb4eb96`。
- 外层工作区 `C:/Users/11599/Documents/ChatGPT/行舟影视` 保存用户资料、外层约定及 `软件更新记忆.md`，其 `tencent/` 和根目录提交可能落后于独立发布工作区，不得误当成最新源码基线。

## 2.8.148 已完成内容

1. 修复安装包漏装 11 个项目协作运行模块，避免项目列表、分镜素材和 WorkBuddy 初始化中断；打包清单和最终 ASAR 均做完整性核验。
2. 完整移除“网络分流”、TUN 兼容、物理网卡/DNS 选择及相关 IPC；云端、COS、素材和更新恢复原系统网络与代理行为。
3. 保留固定证书备用、安全 CONNECT、写入结果不明确时不重放等保护。
4. 全量测试 **3010/3010**、构建、三档真实 React 界面、NSIS 实际启动、项目列表及 WorkBuddy 真实 IPC 回归通过。
5. 当前系统网络下真实只读 17 集项目成功；未改写真实项目、未付费生成、未修改 Clash/TUN/系统代理。
6. 官网整包、GitHub digest、三份 Ed25519 清单及 2.8.147 正式更新检测通过。

- 安装包大小：104,017,644 字节。
- SHA256：`f354e52c9d474e3bcdd7ebdb731aecf8ac3300de90fdd57895c0e1b3b7032bc7`。
- Release：441610147。
- 官网：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.148.exe
- GitHub：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.148/Xingzhou-Film-Tencent-Setup-2.8.148.exe
- 本机安装包：`D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.148/Xingzhou-Film-Tencent-Setup-2.8.148.exe`
- 验收：`docs/release-verification-2.8.148.md`。

## Hermes 后续工作规则

- 用户的新需求默认由 Hermes 直接完成架构、实现、验证和发布，不停在建议阶段；只有用户明确说“只做方案”时才不修改软件。
- 每次开始先读取 `AGENTS.md`、`docs/开发交接手册.md`、本文件和 `C:/Users/11599/Documents/ChatGPT/行舟影视/软件更新记忆.md`，再检查当前 Git 状态和公开版本。
- 每个重要阶段都在本文件追加日期、需求、实际修改文件、测试证据、提交、发布状态和未完成事项；完成后同步 `docs/开发交接手册.md`、对应验收记录和外层 `软件更新记忆.md`。
- 不覆盖或清理不属于当前任务的未提交修改、未跟踪文件、用户数据和其他 worktree。
- 不记录或输出 API Key、GitHub 凭据或云端秘密。
- 未经用户明确需求，不为“保持进度”而制作空版本。下一版本号及功能由实际任务决定。

## 当前待办

- 等待用户指定 2.8.148 之后的下一项功能或修复需求。
- Codex 接手时，从本文件和最新实际代码继续，不需要重复 2.8.148 已完成工作，也不要重跑旧网络分流修复。
