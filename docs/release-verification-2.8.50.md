# 2.8.50 发布验收

日期：2026-10-19。基线 d576214 / 2.8.49；分支 codex/clean-client-protected-skills-2.8.50。

## 实现与数据边界

- 新存储识别为clean-v1：三个导演Skill仅名称/说明/标识，UI与store禁止查看/编辑/删除；新安装不带开发者项目、接口或自定义Skill。已有Skill不转换。
- 用户明确同意服务端执行，临时转发剧本文本/导演构想/所选API Key，不落盘Key。官方OpenAI、DeepSeek、Anthropic与行舟Win AI精确HTTPS线路白名单；未审核自建接口及本机/网页登录模型拒绝执行受保护Skill。
- 原始三套Skill与全部附件部署在/opt/xingzhou-private-skills，目录700、文件600；安装包外。网关沿用身份/角色验证、每用户任务隔离、幂等/取消/失败脱敏、DNS检查/HTTPS固定目标、不跟重定向。模型仍需接收执行规则，不宣称抵御所有提示注入抽取。
- 三套正文包外部署已完成。回滚目录/opt/xingzhou-backups/protected-skills-2.8.50-20261018T161202Z。服务active、healthz通过、未登录401、Win AI TLS固定目标/Nginx鉴权401通过；生成使用模拟上游，真实付费请求0。
- 地区/时代/文字语言/明确例外从全剧背景进入清单、补漏及最终单张/批量生图前提；中文叙述不决定画面文字，海外不一律英语，纽约试卷/工牌等使用英语，明确中文家书等例外保留。
- 按用户追加要求，拥有者及另外两位老用户升级均添加FT五类连接，保留原有项目/Skill/其他接口。只为老资料自动加5条空Key配置，新用户仍0条。旧站Key不向新站复制、旧站仅用于原任务查询，含旧图片接口继承共享Key恢复。
- 五类端点：/v1视频、/api/open/v1视频、/api/feituo/v1官方视频、/v1图片、/api/open/v1图片。素材按顺序上传与引用，目录版本/报价版本、图片imageSize、模型上下限、幂等ID与原任务查询下载均有模拟验证。用户尚未配置新Key，未进行账号实时目录/额度/真实生图视频验证；文档快照不冒充实时可用目录。填新Key后刷新替换旧目录，下架项不保留在型号选项。
- 本机独立迁移计划位于Roaming资料目录，启动前备份配置再应用；未直接重写正在运行的旧窗口资料。现有项目/图片/提示词保持。旧API保留以恢复旧任务，新站5接口同账号可共享新Key，不覆盖不同账号既有Key。

## 验证证据

- 全量npm test：2240通过，0失败。output/tests-2850-final.log。其后窄改动（过期签名URL重查、迁移资料隐藏旧快捷）另经专项回归与UI/打包验证。
- 核心回归：core/ftUpgrade.test.js，assetImageRecovery、fnko-client、fnko-direct；模拟已确认失败可重试、未确认任务不重发、URL-only结果下载重试、有jobId则重查新签名地址、重启继续原任务、Key不进入job文件。
- 真实React/Edge界面：output/ui2850-verification.json及clean2850-skills.png。新资料3张仅元数据卡片无工具；旧自定义Skill工具保留；新视频协议无上游快捷和品牌标签；图片/视频目录刷新及空目录移除型号通过，最终美术提示词含当地语言约束。
- 独立复核两轮：受保护Skill7项专项及8种非法端点阻断；FT原问题均修复并回归。无真实付费请求。
- npm run build通过；NSIS制作、ASAR扫描无私有Skill正文/开发者数据、实际安装运行时通过。qa/packaged-smoke-2.8.50-1792341107851/report.json；新增cleanClient全部true，原视频Range206/播放拖动/同字节下载、Win AI、权限及画布隔离均通过。
- 安装包：103744389字节，SHA256 a420e6f8ab9385aa1f01ba0a93018039e7942cda79d4ec290db37493b1d3de65。

公开更新与下载安装校验将在发布后补记。
