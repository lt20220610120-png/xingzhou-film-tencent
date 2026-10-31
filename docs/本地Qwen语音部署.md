# 本地 Qwen3-TTS Voice Design

## 实现

本地部署使用 Qwen 官方 GitHub 仓库 https://github.com/QwenLM/Qwen3-TTS ，本机检出 022e286。模型为 Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign；从官方文档推荐的 ModelScope 下载，清单、文件大小与 SHA256 均保存在部署目录。

本机目录 D:/AI/Qwen3-TTS，环境 .venv（Python3.12），源码 repo，权重 models，下载和运行缓存 cache，日志 logs。FastAPI 适配服务只绑定 127.0.0.1:7891；本地调用不需要 API Key；不启用公网监听或公网生成回退。CUDA PyTorch 支持 RTX5060，推理 BF16，使用 PyTorch SDPA。

行舟客户端语音页使用 OpenAI Speech 兼容 POST /v1/audio/speech，传入 model/input/voice/instructions/language/response_format=wav/speed=1。生成请求只提交一次；出错不自动重发。主进程按既有账号与许可门禁执行，账号切换中止请求，音频经过 WAV 内容验证后保存到当前资料目录的「画布素材/语音生成」，支持 xzmedia 试听及导出。模型配置允许勾选本地服务无需密钥。

## 操作

桌面快捷方式「启动本地 Qwen 语音」「停止本地 Qwen 语音」分别运行 D 盘 Start-Qwen3TTS.ps1、Stop-Qwen3TTS.ps1；启动服务隐藏窗口。暂不增加开机自启。

语音页保存以下配置后即可输入文本和音色说明：

- 接口：http://127.0.0.1:7891/v1
- 模型：Qwen3-TTS-12Hz-1.7B-VoiceDesign
- 无需密钥：是
- 默认语言：中文

VoiceDesign 根据描述生成音色，重复描述不保证跨句声纹完全一致。需要固定角色声纹时，官方方案是先用 VoiceDesign 生成参考样音，再使用单独 Base 模型克隆；当前任务仅部署用户指定的 VoiceDesign。

## 可复现来源与验证

tools/local-qwen-tts/ 保存适配器、启动停止脚本、下载校验脚本和说明；不打入客户端运行包，也不包含任何权重、用户凭据或私有资料。D 盘部署文件为实际运行副本。环境完整版本快照在部署目录 requirements-lock.txt。

专项测试：node --test electron/audio-provider.test.cjs electron/ipc-security.test.cjs electron/software-license-client.test.cjs。

Python 参数校验：在部署目录用 .venv/Scripts/python.exe test_server.py。

UI：启动 Vite 5841 后运行 node scripts/verify-audio-ui.cjs；覆盖 1280/1700/2232、无 Key 配置持久化、完整音色/语言请求、导出、服务错误及切换页后旧回包隔离。该脚本使用模拟 API；模型实际推理与安装版联调证据另记发布验收。
