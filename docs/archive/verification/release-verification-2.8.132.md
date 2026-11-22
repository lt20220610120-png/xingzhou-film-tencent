# 2.8.132 验收（2026-11-09）

基线 2.8.131 / e337671。正式源码 D:/AI/Qwen3-TTS/xingzhou-release；上级工作区 tencent 副本停留 2.8.98，不以该副本构建。

## 修改与边界

- 工具栏限定分集与模型最大宽度并居中，已关联 x/y 条移至同排。窄屏自动换行；保留表单标签和可访问名称。移除导演设定重复说明，项目风格/画幅的设置与生成逻辑不变。精简清单的名称/状态重复表头与自动关联说明，保留音色待采用/已采用状态。
- 模式切换入口放到逐场核实标题行，带 aria-pressed 及选中样式。进入新场景仍优先提示词，点击当前场景编号返回场景；没有提示词仅显示场景。两个模式可随时往返。
- 原 131 已为 voiceAnalysis 的讲话人物保留 pendingAudio，但旧清单缺 voiceAnalysis 或模型漏讲话仍无位置。新增仅据原文明确对白、唯一人物身份的补充识别；不从入镜、提及和整场名单推断每条讲话。支持 Dxx 及对白段落的普通“人物（语气）：对白”，排除心声、OS/VO、旁白及电话画外音，多角色简称/年龄有歧义不自动选。
- 逻辑分发指纹改用音色稳定身份，媒体签名仍包含实际音频。采用/替换录音后重建最新媒体签名，保留已确认的逻辑关系并直接取最新录音，无额外模型请求。分发中媒体变化不再误报人工选择变化；真实人工修改、正文或人物身份变化仍拦截旧结果。
- 长期前端文案准则写入正式与工作区 tencent/AGENTS.md，并在工作区根指引引用。纯客户端，无云数据库、账号、卡密变更；隔离模拟接口，无用户项目改写或真实付费模型生成。

## 验证

- 6 项新增 voiceSlots 回归：无 voiceAnalysis/profiles/样音的集→场景→提示词身份，已有分析漏项补回，过期正文隔离，采用/替换立即编译新录音，单独分发及零追加模型调用，非对白/沉默/年龄和角色歧义，分发期间采用。先复现并发采用误报再修复；现有人工修改保护回归通过。
- 首次全量 2792/2793；唯一失败是旧用例仍要求采用音色后新模型调用。按用户新要求更新为直接复用，相关 11 项通过，与新增回归合计 17/17。
- qa/review-slots-ui.cjs 实际 React + 生产完整 CSS，1280/1700/2560 三宽无横向溢出；宽屏选择器限宽并与计数中心同高。实际点击当前场景返回、双向切换；无提示词只显示场景且保留两位音色身份；未做语音读取的旧项目每条讲话人数2/1。采用后未追加调用（仍2次）立即编译2/1段音频。导演风格及画幅按钮仍可修改。errors=[]。证据 output/review-132/ui-verification.json 及截图。
- 原 qa/scene-continuity-ui.cjs 通过：真实浏览器 WAV 播放、图片/音频导出、分条讲话范围、三宽滚动、窄弹窗检查。证据 output/132-continuity-final.log。
- Jev 独立复核工具请求返回 HTTP402，不可用，未将其记为通过。已人工逐项复核源码差异与验证证据，包括媒体采用与人工选择指纹的区别。最终全量、原补漏链路与安装包/公开清单结果发布后追加。

- 最后人工复核收窄电话标签过滤：现场打电话仍可关联，电话画外音继续排除；新增断言覆盖。已在签名更新清单发布前暂停首次上传，修正后重新打包，最终资产以本节后续记录为准。

## 初次发布状态（官网同步前）

- 实现3b177b8、最终电话边界修正bfec484已推送。最终 npm run dist：2794/2794测试、构建、NSIS安装包实际运行验证通过，success=true、errors=[]；报告output/132-dist-final.log、qa/packaged-smoke-2.8.132-1794165183375/report.json。
- 首次打包下载Electron时win-unpacked.tmp重命名EPERM，使用本机现有同版本43.2.0运行库成功，无降级或替换用户运行客户端。最终包由完整dist流程重建。
- 原补漏→刷新→自动分发→分镜引用、同模型补漏沿版/换模型新版本/全剧切版三宽回归通过：output/132-chain-ui.log。新交互三宽和原图片/音频导出播放回归见前文。
- GitHub Release438458237，正式安装包104029095字节，SHA256 2d497f15ca3e0c6ff573b39229aacc66668f7c62e4c9a4db392c00da2dd0144f。GitHub资产uploaded、大小和digest均与本机一致；公开下载Range206首65536字节及总长度一致。两仓库main/latest.json与本机签名清单完全一致，签名由客户端验证。证据output/review-132/fallback-publication.json、github-release.json、github-download.json、current-sources.json。
- 实际客户端fetchUpdateManifest经生产createUpdateFetch和固定公钥验签，从https://raw.githubusercontent.com/lt20220610120-png/xingzhou-film-tencent/main/latest.json成功读到2.8.132并判定高于2.8.131，安装包大小/sha256一致。证据output/review-132/in-app-update.json。
- **官网镜像尚未同步，不能将官网完整哈希或三份清单一致性记为通过。** 发布脚本上传GitHub后，106.55.41.128:22在SSH握手前关闭连接；Windows原生/Git附带SSH、官方域名及现有HTTP代理均复现。官网HTTPS也在TLS握手关闭，客户端因此成功使用既有GitHub备用源。没有关闭主机密钥验证或更改服务器/系统网络。当时已向用户询问登录入口；用户随后明确未改动，实际恢复结果见下文。
- 后续网络恢复后执行原scripts/publish-update-mirror.py，输入release/2.8.132中的最终exe和latest.json；再做官网全SHA256、Range及三清单一致性检查。无需重新上传GitHub资产或重签清单。若改入口，先严格核对同一固定主机密钥。
- 下载：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.132/Xingzhou-Film-Tencent-Setup-2.8.132.exe
- 本机安装包：D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.132/Xingzhou-Film-Tencent-Setup-2.8.132.exe。旧项目可点一次补齐素材关联修复漏项；采用音频自动接入已有身份，实际带音频生成/导出仍需真实已采用样音。未强制替换或关闭用户运行中的客户端，未写用户项目或付费生成。

## 官网同步完成（2026-11-09）

- 用户确认没有改动服务器端口、防火墙或入口。只读检查确认本机 Clash 当前为global模式且TUN启用；原进程内部DIRECT健康测试可访问官网。普通SSH及HTTPS受本机全局路由影响，先前“服务器连接故障”描述仅为当时观察，不能据此判断服务端异常。
- 使用已安装的同一mihomo程序建立仅本机127.0.0.1:17997的临时DIRECT实例，关闭该实例TUN，明确绑定WLAN物理网卡。未修改原代理配置、模式、TUN、系统路由或服务器防火墙。原SSH私钥及StrictHostKeyChecking/固定known_hosts保留，认证成功。
- 经临时ProxyCommand执行原scripts/publish-update-mirror.py及原install-update-mirror.sh；使用既有最终安装包和既有签名latest.json，无重新打包/签名/GitHub上传，无服务端业务代码或云数据库变更。官网镜像更新成功，日志output/review-132/mirror-recovery.log。
- 完整公开核验通过：三份清单逐字相同且Ed25519签名均有效；官网正式文件完整SHA256为2d497f15ca3e0c6ff573b39229aacc66668f7c62e4c9a4db392c00da2dd0144f；公开Range206首65536字节与本机一致，总长度104029095。GitHub资产digest/大小一致。证据output/review-132/public-verification.json。
- 实际生产fetchUpdateManifest/createUpdateFetch经临时网络通道成功读取官网优先IP源2.8.132，保留原CA、证书指纹、签名和版本比较校验。证据output/review-132/in-app-update-official.json。此前GitHub备用源成功的证据继续保留。
- 官网下载：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.132.exe
- GitHub备用：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.132/Xingzhou-Film-Tencent-Setup-2.8.132.exe
- 本机安装包：D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.132/Xingzhou-Film-Tencent-Setup-2.8.132.exe。
- 临时直连实例仅用于本次发布和验证，完成后关闭。后续若再遇“SSH认证前断开、官网TLS EOF、GitHub正常”，先检查本机代理路由；不要据此改服务器端口、关闭主机密钥/TLS验证或盲目重建安装包。默认发布脚本仍按原流程。
