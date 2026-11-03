# 2.8.121 验收（2026-11-03）

基线 `bf81fe9`。本版修复制作工作流 Agent 的模型发现，目标是让行舟影视读取 Hermes Desktop 当前资料档和本机最新 Codex 的完整模型目录。

## 根因与修正

- Hermes ACP 启动时没有显式指定 Desktop 当前资料档，父进程已有的 `HERMES_HOME` 还会把连接带到 `default`，因此只出现 `OpenAI API · gpt-5.6-sol`。现在连接优先级为显式 `HERMES_PROFILE`、Hermes Desktop LevelDB 当前资料档、近期 `active-profile.json`、最新配置缓存证据；实测解析为 `w`。
- Codex App Server 的 `model/list` 支持分页、隐藏项和游标。旧实现只读取默认页且排除隐藏项。现在使用 `limit: 100`、`includeHidden: true`，遍历全部页面并去重，带游标循环保护。
- 项目里保存的 Codex 路径如果来自行舟托管的旧版本目录，连接时自动解析为本机最新 `codex.exe`；用户在外部明确选择的自定义 Codex 可执行文件不被替换。
- 重新连接后只有原模型已不存在时才自动改选，原模型仍可用时保留用户选择。

## 真实连接结果

- Hermes：资料档 `w`，当前模型 `custom:workbuddy:cn:deepseek-v4.1-flash`，共 61 个模型。WorkBuddy 列表包含 `auto`、`hy4-preview`、`glm-5.3`、`glm-5.3-flash`、`kimi-k3-1`、`deepseek-v4-pro` 等。
- Codex：执行文件为本机最新 `C:\Users\11599\AppData\Local\OpenAI\Codex\bin\22cfb1d302613eae\codex.exe`，当前默认模型 `gpt-6.1-sol`，共 10 个模型：`gpt-6.1-sol`、`gpt-6-astra`、`gpt-6.1-terra`、`gpt-6-sol`、`gpt-reserve`、`gpt-6-luna`、`gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`、`codex-auto-review`。

## 自动化验证

- Agent 定向测试：12/12 通过。
- 全量测试：2724/2724 通过。
- 生产构建：通过。
- 模型目录与生产界面验证：1280、1700、2232 三个宽度均通过。
- 验证覆盖 Hermes 资料档选择、继承环境纠正、Codex 分页/隐藏模型/游标循环、托管旧路径升级、自定义路径保留，以及重连时保留有效模型选择。
- Agent 模型目录 UI 与生产工作流 UI 在 1280、1700、2232 三宽全部通过，模型选择、聊天模型/强度切换、Hermes、附件和真实调度状态均可见。
- 安装包：`release/2.8.121/Xingzhou-Film-Tencent-Setup-2.8.121.exe`，103986300 字节，SHA256 `048069516A32E6258FF4F7FDEBEFF9DC71EE1E054FC9402ACEC1C5A90F7AC157`，产品/文件版本均为 2.8.121。打包运行烟测 `success=true`、`errors=[]`，报告目录 `qa/packaged-smoke-2.8.121-1793678741023`。

## 边界

- 未执行真实付费视频生成，未改动用户制作项目、生产队列或媒体文件。
- Hermes 的模型目录来自本机 `hermes-acp.exe` 的真实 ACP 会话；Codex 的模型目录来自本机最新 App Server 的真实 `model/list` 响应。
