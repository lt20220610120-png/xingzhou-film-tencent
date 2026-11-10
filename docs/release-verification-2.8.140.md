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
