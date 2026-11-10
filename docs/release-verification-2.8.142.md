# 2.8.142 验收记录

2026-11-10；基线7e42116 / 2.8.141；D:/AI/Qwen3-TTS/xingzhou-release。原未跟踪electron-runtime-43.2.0及output保留。

## 音色、冲突及界面

- compileVoiceBinding与手工场景绑定不再追加【人物正常对白音色参考】/【场景人物音色参考】。inlineVoiceAliases解析基础设定/基础信息中原音色行，按分号分条，按已确认场景身份及年龄唯一匹配，在原描述末尾添加参考audio。仅有OS复用同一身份，不因分号数量建立重复人物或新音色；无明确身份不猜，旧非标准格式只在原显式对白说话人处加引用，不编造新段落。
- 自动基础字段匹配也复用同一插入方法，修复原字段姓名处与描述末尾重复audio标记；保留旧签名下人工删标签及排除项，旧basic-v1/v2有空引用时修复，不无故复活手工删除。
- 分镜保存以服务器实际回执更新base，JSON字段顺序不再误报；保存中继续输入也更新自身回执base但保留新草稿。409只刷新核对，不自动覆盖或重投。只有现有bindingSourcePrompt/bindingCompiledPrompt元数据逐字证明确为自动编译正文时可识别旧投影，不猜测清洗人工正文。
- 模型容量提醒为12px/约26px高琥珀标签，键盘聚焦/悬停可看详情；真实冲突为红色一行、明确的采用/保留按钮，默认折叠，展开正文最高220px内部滚动。
- 三宽1280/1700/2232验证提醒尺寸、Tooltip/Escape、冲突折叠及按钮、网络开关与检查，零横向溢出。连续四次保存、云端回执额外归一化字段、保存中继续键入均通过，无假冲突与草稿丢失。证据output/142-ui.json、scripts/verify-storyboard-save142-ui.cjs及output/playwright/storyboard-2.8.142/report.json。

## 网络分流与Muse

- 设置新增国内云端直连（兼容TUN）、自动/手选物理网络和检查连接。用户本机已开启WLAN，持久化在原userData/network-routing.json，其他安装默认关闭。主进程whenReady设定真实userData后重新配置，避免设置写入错误旧目录。
- 只路由官方云端/官方IP和腾讯云COS HTTPS；绑定真实物理IPv4源地址、国内DNS Resolver绑定同源；官方IP保留固定CA与指纹，COS保留标准证书/主机名校验。不开全局代理、不关闭TLS、不修改Clash/TUN或系统路由；模型API与127.0.0.1 Muse走原网络。
- 官方gateway/许可、更新清单与安装包、协作上传/媒体上传/下载、COS媒体读取、9Y/AutoDL临时参考大文件流式PUT均接入分流；上传原始流一次发送，不为网络错误重投付费生成。身体是stream时不复制全视频进内存。
- 当前实际TUN环境默认官方IP健康检查ECONNRESET，绑定WLAN立即200。新模块3次healthz均200，146/185/219ms；output/142-network-live.json。原Muse任务的2条COS签名链接直连已获得HTTP403，明确AccessDenied/Request has expired（output/142-real-cos-read.json、142-real-cos-reason.json），只能证明网络/TLS/DNS已通，不能冒充过期素材读取成功。
- 独立诊断进程无法解开已安装客户端保存的登录会话，未做真实账号读写或真实COS上传；没有改写/注销用户会话。其失败证据output/142-real-network-process.json。不宣称全链路登录/上传永久可用。
- Muse视频参考图片（含远端签名链接）在行舟先读取为真实图片字节，再发data URL；不再让号池经TUN假IP重新抓远图，不扩大Muse私网抓取权限。HTTP400/401/403/404/405/413/415/422明确拒绝标为beforeSubmission，新任务失败不误记已接受待核对；不会重发旧不明任务。
- 新增物理路由选择/禁用、模型与本机Muse不改道、证书保留、原始流PUT、Muse内容传递/单POST与明确400失败测试；模拟不消耗额度。未真实生成新图片/视频。

最终测试、打包、发布及本机安装情况执行后补记。


## 最终检查

最终2883/2883通过（并发2，output/142-tests-verified.log）；前一轮并发4时原Windows后台浏览器CDP测试1项连接失败，独立4/4复测与最终全套通过，未修改其断言或生产浏览器功能。最终构建通过；NSIS及打包运行时通过，qa/packaged-smoke-2.8.142-1794289267350。流式上传专项8/8，真实四次连续保存及保存中键入回归通过。独立复核补齐了真实userData切换后的配置初始化、COS流式body、保存途中键入基线、普通自动音色重复引用四项遗漏。

公开发布与本机安装另行补记。


## 公开发布及本机状态

源码f48bc2a已推送；Release439990178，官网及GitHub2.8.142已发布。包104044719字节，SHA256 deab4aa7b96f29a1a336df783f8df2759a439e8087cf602992529d648a9f1349。三份公开latest.json相同且Ed25519签名验证通过，官网Range206与本地字节一致，固定SSH主机信任重算服务器整包SHA256一致，GitHub资产size/digest/state一致；客户端生产更新检测命中官方IP2.8.142。证据output/review-142/public-verification.json及in-app-update-official.json。

本机安装尚未完成：安装程序已启动，但Windows consent/UAC安全桌面需要用户确认，工具无法抓取该安全桌面；已通过异步输入提示用户在2.8.142权限确认窗口点击“是”。最后检查已安装exe仍为2.8.141.0，不能报告已安装142。已有桌面快捷方式和原资料保留。用户回复确认后复核ProductVersion、网络设置与启动情况。观察到早先2.8.141遗留安装进程，未强杀安装器或绕过权限确认。

国内网络偏好已保存至实际userData/network-routing.json（enabled:true,interfaceName:WLAN）。未改Clash全局设置；仅为发布使用的临时17997DIRECT实例任务结束关闭。未修改真实项目/分镜/音色或重发旧任务，真实付费生成与真实COS上传未测试。

官方安装包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.142.exe
GitHub安装包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.142/Xingzhou-Film-Tencent-Setup-2.8.142.exe
本机安装包：D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.142/Xingzhou-Film-Tencent-Setup-2.8.142.exe
