# 2.8.135 发布验收（2026-11-09）

正式源码D:/AI/Qwen3-TTS/xingzhou-release，codex/character-voice-workflow。保持用户已有软件和项目；本版纯客户端，无云端文件/schema/账号配置部署。

## 根因与行为

- 提示词卡同时render VoiceBindingSummary与BindingAuditList，造成重复音色；仅保留后者并在同卡内播放真实已采用音频。场景音色small flex-basis100%在nowrap容器挤掉姓名，改独立非收缩状态、姓名占剩余空间，未采用仍具名。
- 批核实旧门槛要求每条decision.needs覆盖本场全部card，即使automatic关联已confirmed，仍被“模型分发尚未完成”挡住；改为验证本条真实需求。全剧发布按已核实完整场景而非全剧所有可核实条目计数启用。场景原子、CAS/源版检查、4集并发和成功检查点保持。
- 用户只读原记录253条中1-3-1真实把“旧防盗门、门框、走廊墙面”当scene缺项。属性段不新建场景，明确第二场景仍保留。修复带所有者、逗号的括号截断道具，适配数量并列/唯一明确所有者。同名多造型、真实缺卡仍进待处理，不以成功掩盖歧义。
- 分镜preview保留就绪媒体，pending音色不再清空已就绪图；采用后刷新补入。保存未手改preview保留bindingSourcePrompt；严格实际生成仍核对原文签名/必要素材。无本场导演词和手工分镜用本场就绪素材；pending占位不作为真实音频引用。
- LibTV原prepare每次project create。新ensureProject按软件账号/LibTV用户团队identity持久化当前画布并串行一次初始化，图片/视频与各入口共用。支持显式新建命名、官方链接/ID连接与可用性检查、切回、打开。旧任务始终用原画布查询；切项目全过程禁止登录/断开/空间切换/资料迁移，控件随identity和全局事件刷新。

## 验证

- npm run dist：2830/2830，13 suites，0失败/取消/跳过；构建成功，既有大chunk提示无新打包错误。output/135-dist.log。
- 新核心5项+LibTV6项，覆盖自动子集核实/发布、属性与第二场景、preview→保存→重载→采用、所有者道具和手工场景回退；12并发图视频仅一画布/重启复用/用户空间隔离/切回旧画布/未授权连接不改选项/损坏文件不重建/切项目禁登录。严格生成仍拒绝缺媒体。
- 独立只读复核43项相邻测试通过；发现的preview保存改源词、LibTV身份竞态、控件跨身份陈旧与第二场景漏读均修复复验，无遗留P1/P2。
- qa/review135-ui.cjs：1280/1700/2232真实ArtReviewSection/StoryboardWorkbench/GenerationComposer，音色姓名可见且单组、切换靠右、0模型自动核实/部分场景发布→处理缺项→全发布、分镜3图后采用到3图2音频、保存不损词、LibTV图片视频共项目/新建/切回/连接已有项目，无页面错误/横向溢出。output/review-135/review-ui.json及截图。
- 原association134命名版本/补漏0调用/模型校准与原supplement完整信息→补漏→图片→分镜→全剧切版三宽通过，output/135-editions-ui.log、135-supplement-ui.log。旧supplement脚本两次goto load超时定位到外部Google字体CSS未完成，改以DOMContentLoaded+既有可见操作定位等待；所有业务断言保留，重跑通过。
- 真实数据仅只读内存回放，不写回：1-3-1缺项清空并confirmed；整体依旧有真实缺卡/描述歧义，未声称全剧100%自动准确。所有模型、生成与LibTV写操作均模拟，未花真实积分、未改旧LibTV画布或用户工程。
- 官方1.1.3现有校验二进制本机project --help/project list --help核对，未更新CLI依赖。安装包实际运行qa/packaged-smoke-2.8.135-1794215540720：PASS（音视频播放/IPC/登录锁/数据读写/LibTV模块等），未安装覆盖用户客户端。

## 发布

安装包104029791字节，SHA256 9c36c9106f2727f0e35558b6b8760e79e51c8406a3353700aca304fb05c5ed3e。
本机：D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.135/Xingzhou-Film-Tencent-Setup-2.8.135.exe。
公开发布后补录清单与完整哈希验收。
