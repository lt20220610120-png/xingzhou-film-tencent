# 2.8.98 本地语音接入验收

日期：2026-10-31（Asia/Shanghai）。源码基于2.8.97的1182f3b与语音实现a5863a7；在D:/AI/Qwen3-TTS/xingzhou-release独立工作区打包，避免并行任务的版本和构建输出冲突。

## 实际模型

- 官方QwenLM/Qwen3-TTS源码022e286；VoiceDesign权重从ModelScope官方推荐源下载，约4.52GB，各文件大小和SHA256均通过，清单在D:/AI/Qwen3-TTS/model-download-manifest.json。
- Python3.12.14，torch2.10.0+cu128，torchaudio2.10.0+cu128。官方PyTorch wheel SHA256 fbde8f6a9ec8c76979a0d14df21c10b9e5cab6f0d106a73ca73e2179bc597cae 已核验；uv pip check全部兼容。
- RTX5060 Laptop8GB，CUDA识别与真实tensor运算通过；官方模型BF16/SDPA成功加载，GPU总显存占用约5841MiB。
- 本地127.0.0.1:7891，health ready与v1/models音频模型列表通过；通过行舟electron/audio-provider.cjs实际调用生成。
- 中文女声：7.12秒WAV，341804字节，实际耗时14.012秒；英文男声：3.84秒WAV，184364字节，实际耗时7.067秒。原始输出保存到D:/行舟影视/画布素材/语音生成，便于原应用直接读取；样音在模型部署目录。
- 参数、路径、耗时记录D:/AI/Qwen3-TTS/live-verification.json；模型服务不返回模拟音频或调用公网语音接口。

## 客户端

- 专项17项通过；Python参数2项通过；此前工作区完整2582项通过，独立工作区发布测试另补。
- 1280/1700/2232真实React界面：预设/无Key持久化、完整输入/音色/语言、导出、服务错误、切页后晚回包隔离均通过。UI使用模拟API，实际推理证据如上。
- 独立只读复核发现三项并已复验关闭：长文本不覆盖官方生成上限、WAV采样格式验证、失败写入删除部分文件（保留EEXIST文件）。
- 本地启动停止快捷方式已创建；停止已实测回收Windows venv子进程，GPU占用从模型加载态降回约1598MiB，随后重新启动health ready；启动脚本加互斥与PID复用以免重复加载。

## 安装包与本机

- 独立工作区 npm run dist：2582/2582、Vite构建、NSIS及实际打包运行时全部通过。初次独立环境15项缺pg/sharp失败，补齐既有cloud-backend/node_modules链接后完整重跑通过，未修改产品代码。
- 打包报告 qa/packaged-smoke-2.8.98-1793423152425：audioGenerate桥接、真实WAV解码/播放（duration2s/readyState4/currentTime递增）、导出字节一致通过，原账号/许可门禁、沙箱/CSP等均通过。
- 包103929750字节，SHA256 1d1d4e0848e5fd01602e5313e3d3c59e8310412eb91c49000930655479d68d51。
- 实际安装于D:/行舟影视客户端/Xingzhou Film Tencent Edition，版本2.8.98.0，沿用原登录与D:/行舟影视资料目录。静默安装选中了所有用户模式并等待系统许可，已结束该次安装，改用安装向导的「仅为我安装」成功完成，不需要更改系统权限。
- 关闭旧应用后备份完整原资料到D:/行舟影视/repair-backups/local-qwen-tts-20261031T130647，再添加本地audio配置并设为默认，原29个媒体接口及其他数据保留。新应用实际显示文本20/图片15/视频14/语音1。
- 本机正常应用「API接口→语音模型配置」实际生成成功：4.4秒、211244字节WAV（speech-1793423468288-307f41ae-1759-4007-a231-6cb93acd5a44.wav）；点击播放后显示暂停控件与0:00/0:04，真实文件位于原资料目录。安装版app.asar与验收版SHA256一致（99a56fab22a41c7922ada3472da8fad7e1237562f159e4c60d39c94e65d65bc6）。
- 发布成功：GitHub Release429737171及官方镜像均为同一103929750字节包；GitHub资产digest与本地SHA256一致。
- 官网与两个GitHub仓库三份latest.json均2.8.98且签名、URL、大小、hash完全一致；官网Range206/0-63/103929750与MZ头通过。脚本上传后最后一份清单PUT遇SSL连接中断，使用原已签名清单只补齐该写入，未重传或替换已验收安装包。证据output/release-2.8.98-public.json。
- 对照完整备份复核：原29个媒体接口逐条内容相同，各项目/画布数量保留，新增语音1条并默认选中。桌面「行舟影视」旧快捷方式已备份并指向D盘2.8.98。
- 公开安装包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.98.exe
- GitHub安装包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.98/Xingzhou-Film-Tencent-Setup-2.8.98.exe
