# 2.8.85 发布验收

日期：2026-10-27。基线：2.8.84 / 0b8f893。来源：用户要求把提示词待处理缺项经模型一键补齐到场景、集清单，支持单项和勾选批量，描述可参考提示词。

## 实现与边界

- core/promptMissingSupplement.js 收集人工所选缺项，校验当前版本和所见签名，按场景与同类同文本去重；每次模型最多补 6 项，共享 requestArtModel 的 6 路队列。基础设定原文证据必须定位并覆盖所选缺项；模型可引用本集已有卡片或生成客观美术描述。
- 场景/分集通过原 artReview store 保存。新建使用 roster-upsert，显式清除曾移除身份的排除标记；已有同名卡片复用，已完成描述不覆盖；缺项不会用简单标点解析直接造卡。
- promptDistributionService.withSceneMaintenance 保持本场补充与分发互斥。写入前检查提示词版本、当前集正文、场景签名及复用卡片；保存后再次调用原模型分发服务分析本场全部提示词。失败项显示具体错误，已保存卡片不回滚或伪装发布。
- 不自动核实、上传发布或生图，沿用现有人审发布流程；发布后美术/资产出现新卡片并能定位到提示词。历史提示词版本不能反向改当前场景，需切回当前版本。
- UI 保留全剧折叠待处理面板、无需参考图和返回补充；增加每行“一键补充”、顶部“一键补充勾选项”、进度反馈。未选场景不补充，同场完整重新分发会让其他确实使用新卡的提示词一起关联。

## 验证

- 核心先写测试，观察接口缺失 RED 后实现；独立复核发现的排除标记恢复/旧项目编号问题及自查的零填充场号互斥问题分别 RED→GREEN。
- 新增 10 项回归：同场缺项去重、缺少模型/空/过期选择、非法证据/磁盘失败、提示词或场景人工变更、重入互斥、曾删除卡片恢复、旧项目推断集号、零填充场号、已有人工卡片复用、重新分发失败后重试。
- npm test：2467/2467 通过，0 失败/跳过；output/test-2885.log。
- scripts/verify-prompt-supplement-ui.cjs：1280/1700/2232 三宽通过。单项补充、勾选跨场/跨集、集清单去重、未选项保留、未自动发布、人审核实发布后美术卡片可见；output/playwright/prompt-supplement-2885.json 及截图。模型为模拟接口。
- 原 scripts/verify-prompt-missing-batch-ui.cjs、verify-model-pipeline-ui.cjs 三宽均通过，保留全剧缺项跳过、折叠/跳转、最大模型并发 6、上游停止下游继续、场/集/剧核实发布。
- npm run build 通过；node scripts/package-release.cjs NSIS/实际运行时 PASS：qa/packaged-smoke-2.8.85-1793101175658，output/package-2885.log。
- 安装包：103858278 字节；SHA256 2807d5abf27a52d05c1a19edb70f08ed90af90fecb1bf6e27e59325d262d46c7。

## 发布地址

- https://xingzhoufilm.cn/api/updates/Xingzhou-Film-Tencent-Setup-2.8.85.exe
- https://github.com/lt20220610120-png/xingzhou-film-updates/releases/download/v2.8.85/Xingzhou-Film-Tencent-Setup-2.8.85.exe

公开下载与签名清单验证在发布完成后补记。
