# 2.8.122 验收（2026-11-03）

基线 `2f04bdf`。本版把制作自动化统一收回行舟影视主流程，修复停止后协作智能体继续运行、ACP 运行中不能追加指令，以及 Topaz/OpenFilm 的本机连接与失败诊断。

## 主从与停止

- 制作 Agent 身份改为“行舟影视制作协作”，行舟影视是唯一控制端。制作与剪辑使用开工时同一组 `agentPath/agentProtocol/agentModel`，剪辑页不再出现第二套 Agent 连接。
- Hermes/ACP 活动回合期间的新指令进入同一 `pendingChats` 队列，当前回合结束后自动接续。`pause/pauseAll` 清空队列、取消当前回合并关闭该任务的会话。
- 行舟拥有的 Agent、剪辑和渲染命令在 Windows 使用 `taskkill /t /f` 终止整个进程树。真实父子进程探针结果 `parentAlive=false`、`childAlive=false`。
- Agent 契约禁止自行另跑 FFmpeg、Topaz、OpenFilm 或复制后期执行器；行舟负责外部软件调用、OpenFilm 渲染和验收。

## 本机软件实测

- 自动发现：`D:\Topaz Video\Topaz Video.exe`、`D:\Openfilm\OpenFilm.exe`。
- Topaz：`ffmpeg.exe`、`ffprobe.exe` 与 `tvai_up AVOptions` 均存在；本机输出编码器选择 `h264_nvenc`。
- OpenFilm：实际找到 `resources/app.asar.unpacked/node_modules/openfilm/MANUAL.md` 与 `bin/openfilm.mjs`。
- 一秒 256×256 测试片调用真实 Proteus `tvai_up` 复现 `parseAuth` 和无帧崩溃，没有产出可验收 AI 超分片。新版将授权/模型问题明确反馈并清理未完成文件，不调用普通放大替代。

## 自动化与界面

- 全量测试：2733/2733 通过，0 失败；发布流程再次全量测试通过。
- 生产构建：通过。
- 生产界面：1280、1700、2232 三宽全部通过，无页面异常和横向溢出。剪辑页验证同一 Codex/Hermes、友好模型名及无第二套剪辑模型控件。
- 定向覆盖：ACP 排队与停止、活动聊天停止、Windows 进程树、软件发现、Topaz stdout/stderr 授权诊断、无帧崩溃和编码器选择。
- 安装包：`release/2.8.122/Xingzhou-Film-Tencent-Setup-2.8.122.exe`，104003383 字节，SHA256 `32D9A0B66971311998DC00A0B1D267A27C5F896D803CAD1734DE317BC70B5D70`。
- 安装包运行烟测 `success=true`、`errors=[]`，报告目录 `qa/packaged-smoke-2.8.122-1793683843422`，页面显示当前版本 2.8.122。

## 边界

- 未执行真实付费生成，未修改用户制作项目或成片。
- 当前本机 Topaz 授权/模型仍未通过真实 AI 超分，因此本版不宣称已成功产出 AI 超分视频；已验证真实错误被识别并阻止伪替代。

## 公开发布

- 源码提交：`184a518`（`release v2.8.122`）。GitHub Release ID `432313259`。
- 官网、updates 仓库和源码仓库三份 `latest.json` 均为 2.8.122，Ed25519 签名、下载地址、大小与 SHA256 全部一致。
- GitHub 完整下载 104003383 字节，SHA256 与本地安装包一致；Release 资产 digest 相同。
- 官网安装包 Range 请求返回 206，开头 65536 字节与本机安装包逐字节一致。
- 官方安装包：`https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.122.exe`。
