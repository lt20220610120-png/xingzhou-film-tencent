# Hermes 协作进度档案

本文件是 Hermes 与 Codex 共用行舟影视项目时的固定交接入口。Codex 开始后续任务前必须读取本文件，并继续核对实际 Git、代码、测试和公开发布状态；不要仅凭本文件快照作结论。

## 当前状态（2026-11-11）

- 当前执行代理：Hermes。后续修改由 Hermes 直接实施，不要求 Codex 后台进程保持运行。
- 当前开发/发布版本：**2.8.150**。已修复旧美术素材类型 `asset-image` 导致所有生成接口误判素材格式/数量的根因并完成公开发布。安装包 **104,034,096 字节**，SHA256 `442442c963cceee0437c773e78fa8ec9289382192c82ee47503f067812d9db5e`，GitHub Release `441917816`。
- 当前源码工作区：`D:/AI/Qwen3-TTS/xingzhou-release`。
- 当前分支：`codex/character-voice-workflow`。
- 2.8.148 实现提交：`cc376a7`；发布文档提交：`eb4eb96`。
- 外层工作区 `C:/Users/11599/Documents/ChatGPT/行舟影视` 保存用户资料、外层约定及 `软件更新记忆.md`，其 `tencent/` 和根目录提交可能落后于独立发布工作区，不得误当成最新源码基线。

## 2.8.150：旧美术素材类型修复

- 用户问题：项目素材明明符合参数，LibTV 报“当前模式的参考素材数量不符合模型要求”，飞拓报“参考素材类型无效”，多个接口都无法生成。
- 证据：`D:/行舟影视/画布素材/generation-jobs.json` 最近 9 个失败任务中 7 个的 `references[].kind` 为旧存储类型 `asset-image`；真实任务有 3 张美术图 + 1 段音频，Seedance 2.5 明确允许 `mixed2video` 最多 50 项、图片 30 张。
- 根因：旧草稿/分镜把美术资产图以内部 `asset-image` 类型持久化，生成端只认 `image/audio/video`。LibTV 计数为 0 后报数量错误；飞拓在付费前校验报类型无效。不是素材参数、不是网络。
- 修复：新增统一 `normalizeGenerationReferences`，在草稿加载、LibTV 模式计算、统一生成队列提交前把 `asset-image` 恢复为 `image`；保留 assetId/imageId/顺序，修复分镜保存时的重复引用风险。
- 验证：真实失败任务数据重放得到 `mixed2video`、4 项参考、模型 Seedance 2.5；新增迁移、LibTV、Fnko 队列回归；全量 **3022/3022**。
- 事实边界：2.8.149 修的是 LibTV 四域名全量预检断连和大项目保存；本问题是它后面的另一层旧数据约定缺陷，不是同一根因。

## 2.8.149：大型项目协作保存修复

- 用户问题：项目协作里“神明”等大型项目持续提示“云端未确认本次保存”，其他读取正常；多次调整网关、物理分流、TUN 均无效。
- 根因：`cloud-backend/src/server.cjs` 把请求体上限写死为 16 MiB，超过后直接 destroy。真实“神明”项目单次导演同步约 **17.6 MB**，因此被断连；客户端把 502 HTML/断连统一显示成网络或未确认保存。
- 复现证据：无账号、无写入的 12 MB 请求返回正常 JSON 401；16/18 MB 返回 Nginx 502 HTML；18 MB 未压缩请求耗时约 54 秒。
- 修复：云端上限提升至 64 MiB；超过上限返回明确 JSON 413；超过 1 MiB 的客户端请求自动 gzip 压缩，服务端限制压缩前后 64 MiB 并解压。
- 真实验证：临时协作项目写入 300 万字符，保存 680 ms，回读长度一致，已删除；压缩 18 MB 请求公开网络 348 ms 返回 401。真实“神明”项目只读，未改写。
- 回归：`cloud-backend/test/server.test.cjs`、`server-large-payload.test.cjs`、`electron/cloud-timeout.test.cjs`、`electron/libtv-network.test.cjs`；全量 **3018/3018**。
- 云端部署：`server.cjs` 已备份并部署，备份 `/opt/xingzhou-backups/large-project-2.8.149-20261111T131532Z`，服务 active。
- LibTV：确认原实现要求四个官方域名全部预检成功，任一辅助域名（如 `bridge.liblib.art`）瞬时时超时便整体报“LibTV 网络连接失败”。现改为只剔除失败域名、保留可用线路，实际使用该域名时再按需探测。当前网络连续 5 次真实账号只读此前均成功；故障注入回归已覆盖单域名超时不再阻断账号连接。
- 发布核验：官网镜像、GitHub 资产、三份 `latest.json` 均已为 2.8.149；公开整包 SHA256 一致、Range 206 首 64 KiB 一致、三份 Ed25519 清单验签通过、2.8.148→2.8.149 软件内更新检测通过。验收 `docs/release-verification-2.8.149.md`。

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

- 2.8.149 已完成并发布；等待用户指定下一项功能或修复需求。
- Codex 接手时，从本文件和最新实际代码继续，不需要重复 2.8.149 已完成的保存/LibTV 修复。
- 并行静态审查另发现几项与本次“网络失败”无关的协作写入契约线索，尚未实施、尚未复现，不得直接当结论：成员删除/改角色可能按 `memberId` 与 `userId` 错位；`task-update` 可能被 `upsertTask()` 当成新增；美术协作者创建资产/替换清单可能被仓储层限制为所有者。若用户再报成员、任务或素材权限问题，先写失败测试复现再修。
