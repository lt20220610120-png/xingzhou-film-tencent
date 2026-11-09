# 2.8.134 发布验收（2026-11-09）

正式源码：D:/AI/Qwen3-TTS/xingzhou-release，分支codex/character-voice-workflow。用户连续反馈中截图的原始崩溃与工具栏修复已由2.8.132/133交付；134继续修复多版本素材关联并新增显式命名版本。

## 复现与修复

- 只读用户prompt-art-bindings历史发现大量“AI音色不属于本场或重复”、音色依据和原文片段错误；同人物多个Dxx回包及无效UID使整条画面结果被拒绝。改为独立子项核验/去重并用精确正常对白恢复身份；本条VO/心声/场外音不混入正常对白。
- 用户1-1-1最小例确认2人物日常服、1走廊场景、0道具、2待样音身份；程序在基础设定内定位原文、名称去装饰符匹配同场唯一卡，无模型0token。纯补充场景文字不另造缺项，明确仅提及/不出镜排除，多造型歧义不猜。
- 新建版本填写名称，可重命名；快速/创造/历史共用选择。归档并恢复原付费提示词、计划/草稿/构想及风格画幅。协作同步同名；同版补漏/模型补词/刷新不新增版本，旧原始版与local/cloud ID兼容。
- Yjs按版隔离work，首次建版并发旧回包回原始版；创造迟到回包归档、快/手动提交拒绝跨版并保留检查点；分镜切版保留人工编辑，旧版写入409。已有图片补充后保留关联的原始校验基准。
- 单条失败保留正确结果，后续集场继续；取消/存储失败/真实缺卡仍如实反馈，不无限付费重试，不用错误匹配凑成功。

## 验证

- npm test：2819/2819，13 suites，0失败/取消/跳过；npm run build通过。output/134-tests-final.log、134-build.log。
- 针对回归16项、独立复核相邻36项及独立模拟，已报P1/P2全部关闭；productionAdapters30项包含图片后补、单条先出视频及继续处理。
- qa/association134-ui.cjs：1280/1700/2232，真实DirectorWorkspace/ArtReviewSection，新建空版、命名/重命名、切回原词、补漏不增版、精确自动关联0模型、显式模型校准1模拟调用、无横向溢出/页面异常。output/review-134/association-ui.json。
- scripts/verify-supplement-workflow-ui.cjs：三宽原补漏→云刷新→关联→图片→分镜→全剧版本切换通过。初次显式校准3模拟请求，补漏与新显式版程序关联不增加请求；每条分镜3张精确素材。output/134-supplement-ui.log。
- 付费接口全部模拟；未写入用户真实项目、删除旧词或关闭用户软件。

## 云端

- 106.55.41.128：只部署src/storyboard-merge.cjs、shared/directorSharedDocument.mjs；阶段测试3/3后备份并重启服务，healthz及systemd active通过，无数据库schema变更。
- 备份：/opt/xingzhou-backups/prompt-editions-2.8.134-20261109T074833Z。
- 目标SHA256：storyboard-merge.cjs 3d471350a92315d0a33df576d517a8b93aa824c87aec35b00cddd4f47b2d20c1；shared c3f5496f357138480b0bc05eebbbc47d12d6a8f982d768bb448ce0a231c71d1d。
- 首次阶段测试缺少director-source依赖，失败发生在部署前；补齐阶段依赖后全部通过。部署脚本带原文件hash断言、备份、失败回滚及健康检查。证据output/review-134/backend-deploy.log。

## 发布

npm run dist再次2819全量通过，Electron43.2.0、NSIS、安装包实际运行smoke通过（qa/packaged-smoke-2.8.134-1794210530563）。未安装替换用户运行中的客户端。

安装包104038586字节，SHA256 e692997e56cf2588db5e08bb225d4d4c67e268f3b14dd4fa7fe1b3e97d028a9e；实现982d521已推送。官网及GitHub公开发布完成，Release438856948。官网完整文件SHA256、公开Range206首65536字节、三份公开清单签名及GitHub资产digest/大小全部一致；生产更新逻辑保留CA/固定证书指纹/签名验证，实际命中官网IP源并返回2.8.134，较2.8.133为新版本。证据output/review-134/public-verification.json、in-app-update-official.json。

官方下载：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.134.exe

本机安装包：D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.134/Xingzhou-Film-Tencent-Setup-2.8.134.exe

发布临时DIRECT实例绑定WLAN，仅用于本次网络传输，用毕关闭；原全局代理/TUN配置及凭据验证不变。
