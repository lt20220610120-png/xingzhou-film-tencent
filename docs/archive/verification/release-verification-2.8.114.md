# 2.8.114 发布核验

日期：2026-11-02。实现提交：0c40099。

## 本机发现与真实验收

用户Hermes快捷方式指向C:/Users/11599/AppData/Local/hermes/hermes-agent/apps/desktop/release/win-unpacked/Hermes.exe。只读确认同安装目录venv/Scripts/hermes-acp.exe，--check返回Hermes ACP check OK。
真实ACP连接返回33模型及当前模型；不复制或输出密钥。真实Hermes按原配置调用临时会话MCP的xingzhou_task.inspect一次，回执fixture=true后回复OK。该验收仅使用只读夹具，没有付费视频动作，不等于整集生产或Hermes完整剪辑验收。

本机Codex与Hermes连接组件找到；Cursor仅桌面应用，未发现CLI；Claude Code未发现ACP组件。后两者未宣称实际连接通过。

## 接入与生命周期

Codex继续App Server；Hermes/Cursor/Claude适配器走ACP stdio，通过session/new接收本机会话MCP。MCP仅127.0.0.1随机端口，随机Bearer，暴露同一套当前任务后端工具，结束关闭；不改用户Hermes/Cursor/Claude全局配置。每次连接从智能体返回模型，优先原当前模型。

Claude JS组件使用真实node.exe，不使用行舟Electron当Node，保持RunAsNode fuse关闭。未找到Node时给明确缺运行环境信息。仅发现桌面程序不等同可连接。
ACP剪辑许可仅当前cwd以内显式edit locations可allow_once，范围外/执行命令请求不自动放行；未宣称已验证各智能体完整剪辑能力。

## 验证

npm test：2679/2679；生产构建通过。1280/1700/2232三宽原工作流UI、接入列表、发现状态、Hermes模型默认选择与运行页模型可见、安装说明入口通过。
独立复核发现并修复：MCP请求断流崩溃（加断流存活回归）；Claude打包后Node运行环境；ACP无Codex额度信息时运行模型消失；编辑权限范围明确限定并加当前目录/外部目录/terminal拒绝回归。

安装包运行烟测qa/packaged-smoke-2.8.114-1793624802855返回success=true、errors=[]。
安装包103977356字节，SHA256 b1959ebe870279f625155f215113ae0c2218de5a032f375fbba701a0bdbf7848。

- [官方安装包](https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.114.exe)
- [本机安装包](D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.114/Xingzhou-Film-Tencent-Setup-2.8.114.exe)

协议依据：[Hermes ACP](https://hermes-agent.nousresearch.com/docs/user-guide/features/acp/)、[Cursor ACP](https://prod.cursor.com/docs/cli/acp)。
本轮未安装替换当前行舟客户端；未在本机安装缺失的Cursor CLI或Claude适配器，界面提供安装说明与浏览组件。

官方镜像及两GitHub仓库main清单版本、大小、SHA256和Ed25519签名核验全部通过。
