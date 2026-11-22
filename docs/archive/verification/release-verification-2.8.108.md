# 行舟影视 2.8.108 验收（2026-11-01）

## 范围与实现

基于已发布2.8.107源码186415f继续实现用户六张截图要求。实际源码目录D:/AI/Qwen3-TTS/xingzhou-release；保留原资料和已生成成果，不运行收费生成。

- audio-generate之前调用audio-service-ready，每次检查，不依赖页面/Agent先启动服务；本机Qwen固定识别已部署目录，PowerShell隐藏启动，启动过程合并。云接口可显式配置同源健康/POST启动地址；未配启动地址的云实例无法凭语音地址推断云控制面，只报告无法连接而不假报启动。
- 兼容只有speech、不提供models目录的远端接口；显式健康地址必须返回ready:true，loading不被当就绪。账号取消只取消自身等待，不中断其他人物共用启动；语音POST不盲目重投。
- 完成音色卡短句续写，保留原句开头，sampleExpansion记录原句与估计时长，preparationEvidence保留逐字依据。人工编辑CAS保护，长句与已采用卡不反复扩写，音色描述仍选填。
- 提示词接力策略持久化已尝试次数，只补缺场；生图多模型独立尝试、并发、画幅，排队获取槽位后再记提交状态。原未知任务不重新POST。
- 信息读取实际检查清单及场景关联，不将store.load创建的空场景当完成；自动顺序prompts→information→voices→art→images。关闭音色仍读取剧本信息。
- 七步设置；视频主备使用所选具体型号能力，页面内滚动选择。未知能力提供480p/720p/1080p/2K/4K，不虚增已声明型号能力。

## 验证

- 基线npm test：2630/2630通过。
- 新增回归均观察过修改前失败：本地冷启动/共享启动、云端就绪、短句扩写/CAS、提示词有序持久化接力、三生图模型独立次数/画幅、信息读取顺序、新项目空场景不能跳清单、排队暂停/额度熔断及提交前取消。
- scripts/verify-workflow-28108-ui.cjs：1280/1700/2232三宽七步、3备用提示词/2备用生图、各项参数、排序、开工、保存、暂停修改及页面内滚动选择通过；额外验证未声明模型的五种分辨率。
- 原scripts/verify-production-ui.cjs、verify-fallback-video-ui.cjs：三宽均通过；verify-voice-review-ui.cjs：1280/1700/2232/2560四宽通过，含短句补全、生成/采用/删除、停止、并发和人工新增缺项错误。
- 本机实际服务关闭后自动冷启动：24456毫秒就绪，真实WAV生成成功。随后测试续写句“别在这儿趴窝呀，我怎么这么倒霉，今天还怎么回家呢？”返回4.00秒/192044字节WAV。记录output/local-voice-cold-2.8.108.json和output/local-voice-target-2.8.108.json。不同语速的真实样音可能略超目标，不用补静音伪造时长。
- 独立只读代码复核发现的排队暂停、额度熔断、新项目空清单和云健康兼容问题，均已新增失败回归后修复。额外覆盖持久化检查点期间暂停，未实际提交项回滚次数。

最终发布检查npm test：2646/2646通过，0失败；生产构建通过。包含实际生图主并发1/备用3的请求峰值验证。

首次发布检查中原有update-resume本机HTTP测试及Windows浏览器窗口测试出现间歇失败；分别复跑6/6通过，再次全量2646/2646通过。未通过时未上传安装包。Electron自动解压重命名及NSIS临时输出曾遇Windows文件占用，沿用已验证的electron-runtime-43.2.0并清理本次未完成安装包后重打包成功，未改业务代码绕过验收。

## 安装包

- 实现提交：693fb13。
- 文件：release/2.8.108/Xingzhou-Film-Tencent-Setup-2.8.108.exe。
- 大小：103964233字节；SHA256 a74b2074c1b4918176a0e8ceb7a0ed7951785c0cc1c9076f864cee31044ac8c4。
- 安装包运行验收：qa/packaged-smoke-2.8.108-1793537064386/report.json，success:true，errors:[]，版本2.8.108；账号许可门禁、媒体播放/导出、IPC与各模块通过。
- GitHub Release v2.8.108及官网镜像已发布；官网安装包Range返回206，总长度103964233，GitHub资产digest与本地SHA256一致。
- 官网公开latest.json和两个GitHub仓库main分支latest.json（通过公开Contents API读取）完全一致，三份Ed25519签名验证通过。发布后GitHub raw CDN曾仍缓存2.8.107，未把缓存值当作已核对新版；仓库main原文件及软件实际优先更新源已分别核验。
- 使用客户端实际createUpdateFetch/fetchUpdateManifest核验，优先https://106.55.41.128/api/updates/latest.json返回2.8.108并通过签名校验；软件内可发现更新。证据output/release-2.8.108-public.json及output/inapp-update-2.8.108.json。
- 官网下载：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.108.exe
- GitHub下载：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.108/Xingzhou-Film-Tencent-Setup-2.8.108.exe
- 用户正在运行的D盘2.8.107客户端未被本轮强制关闭或替换。安装2.8.108后重启软件生效。
