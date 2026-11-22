# 模型驱动并发清单链路 Implementation Plan

> 按项目协作约定在当前会话直接实施，使用 executing-plans；不另开工作区、不覆盖已有无关改动。

**Goal:** 用户点击分析后，集清单→场景→提示词分发由模型分级并发推进；支持提示词整场/整集/整剧核实发布，构图控件并入生图工具栏。
**Architecture:** 沿用现有核实账本、promptArt 版本和发布 API。新增独立于页面生命周期的模型分发服务，按条目防重，短时串行保存并按目标决策检测冲突；不同条目回包合并。分析流水线保持集清单身份连续性，上游每完成一层即派发下游有界并发任务。页面挂载不发模型请求、不展示规则预判缺项。
**Tech Stack:** React/Electron、现有 aiChat、Node tests、Playwright 模拟接口。
**Spec:** 本轮八张截图及用户文字；集、场景、提示词层级并发；仅模型返回结果决定自动关联；不自动发布、保留人工锁定和缺项三次上限。

## Review Focus

- 空账本/仅打开界面无任何模型调用和虚假缺项；只有明确分析或手动重分发发起请求。
- 先完成场景的提示词可在下一集和同集其他场景分析期间并发执行；同条不重复，不相关手工任务可并行。
- 两个模型回包不丢关联；人工修改同一条、正文更新、跨账号项目、失败/停止/重开不复活旧任务。
- 分发未完成、空结果、缺项和过期不能批量核实发布；已完成的模型关联与人审记录在版本内保存。
- 原整场发布、已有图片/人工草稿和权限继续保留；美术展示场景及提示词去向。

## Tasks

- [x] core/promptDistributionService.js 与测试：有界并发、条目级锁、保存合并、失败三次、显式触发、目标冲突与事件订阅。
- [x] core/artAnalysisPipeline.js 与测试，core/artReviewRunner.js 复用 inventoryOnly：集清单推进与场景/提示词下游重叠，局部任务独立、停止/复用/待补回填。
- [x] core/promptReviewBatch.js 与测试：各范围完整性门禁、人审标记、整场核实发布及批量发布反馈。
- [x] 替换 useScenePromptDistribution 页面自动触发；ArtReviewSection/PromptArtBindingPanel 接入独立服务及提示词范围按钮；空清单等待状态，手动重分发仅本条忙时禁用。
- [x] CollabWorkspace 任务注册按集防重并发、信息读取显式启动流水线；ProjectCompositionControl 内联到批量模型前方。
- [x] 真实 React/生产 CSS 模拟并发与整场/集/剧发布检查；全量测试、构建、独立复核、2.8.80 打包/发布、公开签名/下载核验与记忆更新。
