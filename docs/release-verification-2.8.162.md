# 2.8.162 验收

日期为 2026-11-14。基于 2.8.161（2ca4b45），实现 aafbe3d、69b88b2。本机 Codex 图片渠道通过 ChatGPT 登录和 App Server 临时线程调用 image_gen.imagegen，按正式图片完成事件回收 GPT Image 2 图片。LibTV 分镜提供自动生成与上传至画布手动生成；两种方式均查询原节点收回结果，默认自动。

- 本机 Codex 0.167.0-alpha.4.1 的只读模型目录和生图开关检查通过。官方实现标明 GPT Image 2。本机调用的图片事件、参考图传递、图片字节核验用隔离接口验证。
- LibTV 手动模式回归覆盖只创建节点、重启后继续查询、手动启动后下载原节点结果及零次自动启动。Electron 隔离界面验证了全场景、本集、全剧三处应用按钮携带设置以及导入 Codex 图片渠道。真实付费生图和 LibTV 视频生成未执行。
- 全量 3091/3091，记录见 output/162-tests.log。构建、正式打包运行通过。
- 云端只更新 storyboard-settings.cjs。基线校验、原文件备份、进程健康检查及隔离数据读写模式验证通过。
- Release 444564924，Actions 43479690786。安装包 104120648 字节，SHA256 3986bb75a2da4bf918e3b260db9f5dd399a388b7ff61766d2ec608b4dcb38f45。三份更新清单验签、GitHub 资产、官网 Range 和 HTTPS 整包校验、Electron 续传及安装回调通过。
- 官网 https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.162.exe
- GitHub https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.162/Xingzhou-Film-Tencent-Setup-2.8.162.exe
- 本机 D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.162/Xingzhou-Film-Tencent-Setup-2.8.162.exe
