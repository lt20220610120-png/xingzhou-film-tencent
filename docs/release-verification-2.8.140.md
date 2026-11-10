# 2.8.140 验收记录

2026-11-10，基线 e200be0 / 2.8.139，工作区 D:/AI/Qwen3-TTS/xingzhou-release。保留既有 electron-runtime-43.2.0 与 output。

- GenerationComposer 左侧原高度观察器移除；两列 stretch，编辑器外层原生 resize，提示词和素材区共同分配剩余高度；素材卡在正常文档流内。三宽1280/1700/2232、750px拉长、长短参数切换和底部差<3px通过，截图及矩形数据 output/140-ui*。
- LibTV 4个项目按钮紧凑同行；批量栏CSS grid自动整齐换行，复用单卡LibTV schema参数。storyboardDefaults白名单包含libtvMode/libtvParams，旧数据缺省仍auto，不覆盖正文/引用。模拟批量模式和声音设置通过。
- 云端安全只读请求的IP备用入口遇网络错误可用原固定证书native HTTPS；首个只读端点12秒失联切换，其余30秒，显式测试超时优先；写请求重复规则未放宽。未部署云端/schema，不能保证上游永不失联。
- 本机Muse连接IPC保留online门禁，仅读取D:/MuseCanvasData/install.json，鉴权拉取/v1/models；不扫描其它账号资料、不输出秘密、不随包附带配置。主界面添加两个可选择profile，不更改已有默认。generic视频任务支持Muse duration/size/images、轮询与鉴权content下载；图片比例转换，引用继续走images/edits。
- 独立画布通过xzapp config.js动态注入已配置Muse渠道，保留其它渠道/原模型选择；图片和视频使用模型自定义脚本，仅对本机已配置用户生效。video单次POST、后续只轮询/内容下载。上游画布插件API依据本地v0.19源码核验。
- 全量首轮2871/2871通过，最终含独立画布新增测试另记；构建通过，既有bundle体积提示；NSIS与packaged runtime通过，报告qa/packaged-smoke-2.8.140-1794285002272。
- 真实只读Muse鉴权、两模型、既有图片读取成功（output/140-muse-existing-image.json）；本机现有3条均为图片任务，无现成视频。视频提交/查询/字段映射使用模拟接口；未提交真实图片/视频，未消耗额度，不宣称真实视频生成已验收。

发布、公开清单及本机安装情况在执行后补记。

## 最终发布与本机安装

最终2872/2872通过；三宽UI及独立画布真实页面渠道显示通过（output/140-independent-canvas.json）。源码c45b154已推送。

- 官方与GitHub安装包公开；三份latest.json逐项一致且Ed25519签名通过，官网Range206与本地前65536字节一致；固定SSH主机信任重算官网整包hash一致，GitHub资产digest/size一致。软件生产更新检测命中官网IP2.8.140。见output/review-140/public-verification.json与in-app-update-official.json。
- 安装包104055229字节，SHA256 b1f4ef3280c141b150fcb8c9869401e07a3d3d0fd377256ffbad993c60cbd047，Release439948026。
- 官网首次SSH被全局路由中断，复用临时DIRECT绑定WLAN的独立17997通道补传，未修改全局代理。完成后停止本轮临时进程。
- 本机NSIS静默安装至D:/行舟影视客户端/Xingzhou Film Tencent Edition，exe ProductVersion=2.8.140.0。配置前通过CloseMainWindow正常退出客户端，未强杀。
- 本机D:/行舟影视/xingzhou-data.json先备份到repair-backups/muse-2.8.140-1794285132365，再增加Muse图片/视频profile，原28项变30项、原默认不变。未修改项目或原凭据。启动MuseCanvas后在所需生成区选择Muse；独立画布重开读取渠道。软件不自动启动MuseCanvas。
- 自动重新打开客户端的命令被工具自动审批拦截，未提供具体原因；需用户双击已有桌面快捷方式。安装已完成。

官方包：https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.140.exe
GitHub包：https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.140/Xingzhou-Film-Tencent-Setup-2.8.140.exe
本机包：D:/AI/Qwen3-TTS/xingzhou-release/release/2.8.140/Xingzhou-Film-Tencent-Setup-2.8.140.exe
