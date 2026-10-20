# 2.8.56 Like 浏览器连接验收

日期：2026-10-21；基线为已发布2.8.55，用户确认 Like 无官方画布API，采用浏览器扩展方案。

## 实现

- 新建本机127.0.0.1:18764连接服务，与旧实验18763独立。绑定按行舟账号保存至userData/like-connector，浏览器设备凭据用系统safeStorage加密；配对码8位/10分钟/失败限速。扩展本地存储限制到可信扩展环境，无Cookie、history、webRequest或nativeMessaging权限。
- MV3组件包内附带，可由软件导出到userData/like-browser-extension/1.0.0。首次需用户在Edge/Chrome加载解压缩扩展并输入本机配对码；安装后刷新原网页一次。配置入口在API接口与图视生成接口设置，支持粘贴项目网址、打开项目、观察当前画布、绑定及切换已保存画布。
- provider=likeai，绑定id与账号归属贯穿保存、模型选择与视频任务。两处生成共用GenerationComposer/jobs；默认480p，16:9/9:16，4–30秒，30图片/10音频/10视频。只传当前任务选中素材，分块本机读取，编号与mentionDocument写入画布。
- 任务先持久化身份再交付命令。失联、网页刷新或服务/浏览器重启仅恢复查询，绝不重投原生成。最终付费动作前复核本机账号、命令、未取消信号、有效期及网页项目/画布/权限；准备最多10分钟，过期拒绝继续。原网站已接受的任务不承诺撤销。
- 未确认任务可查询原节点、打开原画布；成功任务下载按既有媒体链路执行。失去最终回执时保留待核对状态，不以URL或已建节点假定付费生成成功。
- 单素材尾块发送后释放Buffer，避免全部素材累积。网站未就绪/结构变化原因上报；端口启动失败解除占用后可重试。SPA从首页进入项目也支持注入。

## 验证

- npm test：2303/2303，通过。新增核心/服务初轮10项聚焦10/10；补充音频/视频MIME识别后最终11/11；包括账号/来源/素材路径、错画布/只读/不支持模型、配对、持久化、防重、授权取消/超时、恢复下载。
- npm run build：通过。
- 实际Chromium加载MV3，在模拟Like工作台验证扩展弹窗配对→选中素材字节→网站上传/编号→9:16/30秒/480p→一条原任务回执。网页刷新、本机服务重启、浏览器进程重启保留绑定，生成总调用始终1；最终调用前取消后也没有新增调用。证据output/like2856-extension-verification.json。
- 真实React/Edge模拟API，1280/1700/2048三宽：配对码、扩展文件夹、绑定启用、默认480p、4–30秒选项与生成载荷完整，无溢出/页面错误。证据output/like2856-ui-verification.json，截图output/playwright/like2856-*.png。
- 独立只读复核通过；额外动态验证端口占用解除后同一服务可启动。复核修复最终授权、SPA注入、退出取消、错误展示、缓存和异步测试时序。
- NSIS/ASAR/实际打包运行时通过：Like preload桥存在、MV3与6个扩展文件齐全，纯净新用户/受保护Skill正文扫描、fuses与视频播放/Range/下载旧链路继续通过。首次验证脚本因Windows ASAR路径分隔符报错，改用path.join后复验通过，包内容本来齐全。证据output/like2856-runtime.log。
- 本机只读确认local-trial-features.json功能仍true，普通包默认false。未改写真实项目、接口、Skill或旧任务，没有向真实Like发起付费任务，也未强制关闭正在使用的软件。

## 使用边界与交付

实际Like适配沿用本机已验证的Vue工作台入口；本次完整生成和重启验收使用模拟网页，没有消耗网站积分。网站内部结构或模型权限变化可能需要更新适配，不保证浏览器/网页关闭时可提交。首次加载扩展和配对是用户需完成的一次性步骤，不能把安装包发布等同于当前运行实例已完成新连接。

指南：docs/Like浏览器画布连接指南.md。安装包公开地址发布后核对；既有临时连接保留，不自动把旧未确认任务转成新任务。

安装包：103797991字节；SHA256 `367b3761a5ede2fdff74d8656ee40e5e74dd4b9f23479cb096b8b527ff2fa03d`。

最终打包补充：AAC/OGG/FLAC/音频MP4/视频WebM按素材类型传输，避免本机已导入文件被网站归为错误节点。新增模拟读取断言通过，MV3完整流程复跑通过；最终NSIS与运行时复验通过。

## 最终公开发布核验

- 源码fe00304、音频类型补充e274b17，已推送main；官方Release非草稿，GitHub资产digest/HEAD200及双main签名清单一致。
- 正式更新传输器验证Ed25519签名，2.8.55与2.8.54-private.1可发现2.8.56；官方IP源Range206、65536字节及总长度与最终包一致。证据output/release-2856-public.json、output/like2856-inapp-update-verification.json。
- 首轮候选包上传后补充格式识别，镜像同号不同哈希保护正常拒绝覆盖；对先前候选包与清单完整备份，再原子替换为最终包并同步双GitHub清单，重新核验三源一致。备份：/opt/xingzhou-backups/update2856-candidate-20261020T183915Z.
- 公开安装包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.56/Xingzhou-Film-Tencent-Setup-2.8.56.exe
- 本机安装包：release/2.8.56/Xingzhou-Film-Tencent-Setup-2.8.56.exe。最终103797991字节，SHA256 367b3761a5ede2fdff74d8656ee40e5e74dd4b9f23479cb096b8b527ff2fa03d。
