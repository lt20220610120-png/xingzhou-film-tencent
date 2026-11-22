# 2.8.141 Muse 时长修复验收

2026-11-10；基线0628f5c / 2.8.140，D:/AI/Qwen3-TTS/xingzhou-release；原未跟踪electron-runtime-43.2.0及output保留。

原因：2.8.140 core/museLocal.js错误固定durations=[5,6,8,10]，同时保存至capabilities和modelCatalog。UI严格遵循此能力，故只显示最多10秒。截图MuseCanvas允许30秒；本机MuseCanvas 0.21.3前端QO/EV原生秒数夹取范围为4至30，配套上游v0.19源码media-size.ts VIDEO_SECONDS_MIN=4,MAX=30。配置输入限制不等于已验证上游实际产片30秒。

修复：共享MUSE_VIDEO_DURATIONS为4..30整数；saveMuseProfiles使用此范围，upgradeMuseProfiles在App加载持久化状态时只更新museLocal/video/muse-video的旧能力及目录条目，不改变接口ID、Key、默认接口、项目、草稿或已选时长。修复幂等，无Muse时不产生数据改写。号池请求保留duration，并同步发出原生seconds别名；30秒模拟单次提交通过，31秒超能力拒绝。独立画布插件同样测试30秒透传，截图上游的4–30范围原本已具备。

验证：output/141-targeted.log和141-ui.json；三宽1280/1700/2232从旧接口配置加载、27个时长选项、选30→应用全部→单卡30→模拟提交30通过，无实际生成POST。旧媒体和API配置保持，不修改用户工程内容。

首轮全量2873通过/1失败：旧endpoint-fallback测试只mock global.fetch，2.8.140新增原生IP备用传输实际访问生产并返回401，导致测试假token被清；已补mock https.request模拟完整网络中断，不改生产鉴权或连接策略。专项5/5通过，最终全套另记。

构建通过，既有chunk大小提示保留。真实Muse新生成及30秒成片未测试，不消耗额度。最终打包/发布/本机安装执行后补记。


## 最终验收与发布

- 最终2874/2874全量测试通过；三宽旧接口→批量30→单卡30→模拟提交30通过；NSIS及packaged runtime通过，报告qa/packaged-smoke-2.8.141-1794285908817。
- 源码09fe4e6已推送。官网与GitHub已发布，Release 439956056；包104055455字节，SHA256 b862653ef1e8b62be8e742054843f087354dabb062d4b15af3d40d3338f0c8b4。
- 三份公开latest.json一致且签名通过；官网公开Range206、固定主机SSH重算服务器整包hash、GitHub资产size/digest一致；客户端生产更新检测命中官网IP2.8.141。证据output/review-141/public-verification.json和in-app-update-official.json。
- 本机正常关闭窗口后静默安装到原D盘目录，exe版本2.8.141.0。关闭客户端状态下，先备份原资料到D:/行舟影视/repair-backups/muse-duration-2.8.141-1794286004959，再同函数定向修复旧Muse接口；capabilities与modelCatalog最大30、最小4、共27项，非mediaProfiles数据逐项比对一致。没有改写项目、草稿或默认接口；用户下次打开即可使用，无需重新接入。
- 官网发布复用本机临时DIRECT通道，未改全局代理，任务结束停止临时进程。纯客户端，无云代码或schema更新。真实30秒产片仍未实测，不宣称上游一定按请求长度输出。

官方安装包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.141.exe
本机安装包：D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.141/Xingzhou-Film-Tencent-Setup-2.8.141.exe
