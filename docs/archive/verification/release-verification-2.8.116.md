# 2.8.116 验收（2026-11-02）

基线 facfe9e，复用 D:/AI/Qwen3-TTS/xingzhou-release。
本机 OpenFilm app.asar 只读检查显示其使用 ACP 增量消息与 steering 扩展。行舟沿用已有 Codex App Server，复用 ephemeral 会话，不写入用户 Codex 聊天列表。
真实本机 gpt-6.1-sol：一次只读回复分4个增量；另一次只读fixture工具调用中发送 turn/steer，16个增量，最终返回“追加指令验证成功”。0视频付费提交。
独立复核修复初始化竞争、turn id、异常deadline、缓存指纹、并发busy；Hermes保留ACP原路径并支持文字增量，不宣称支持steering。
三宽1280/1700/2232工作流界面验收通过。最终测试/构建/安装包与公开清单结果发布后追加。
限制：不宣称完全复刻Codex桌面所有功能；未执行真实整集付费生成或剪辑。

最终 npm test：2684/2684；生产构建及三宽UI通过。源码6d12887已推送main。
安装包实际运行 qa/packaged-smoke-2.8.116-1793632978699：success=true，errors=[]。默认Electron解压遇Windows重命名拒绝，复用本机同版本43.2.0解压运行目录打包。
公开发布完成：官网镜像及两个GitHub main签名清单均为2.8.116，installerUrl/size/sha256一致。官网发布脚本已复核安装包大小和哈希。
包103980839字节，SHA256 144b2335dfb80112a233285f328639b4a162eb70ea480a86e09d76054661c2a1。
官方安装包 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.116.exe 。本机 release/2.8.116/Xingzhou-Film-Tencent-Setup-2.8.116.exe 。未安装替换用户正在使用的客户端。
