# 提示词分发与版本联动 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this session, with an independent final review.

**Goal:** 整场清单不随提示词拆分变化；核实、图片导出和图视生成使用同一版本的逐条分发。

**Architecture:** 清单与美术卡片继续由现有 ledger 管理。提示词集合用内容指纹版本化，历史版本保留原文与分发，使用当前卡片和图片；来源变化只使相关分发待审。项目协作负责剧本依据核查，图视生成只从已有图片池分发。

**Tech Stack:** React / Electron / Node test runner。

**Spec:** 本对话 2026-10-26 用户两张截图及详细需求。

## Global Constraints
- 保留整场核实、手工导入与管理员试用权限。
- 不缩小字体；不删除现有图片、清单或历史提示词。
- 不调用付费生成服务做测试。
- 按工作区约定直接实施、验证、发布，无需另行确认设计。

## Review Focus
- 5 条变 3 条：旧版可选，场景卡片身份不变。
- 后生成图片不丢失已确认的用途；人工选择失效时不猜图。
- 相同图片分发到两条提示词：往返导出导入均保留两个成员关系。
- 新提示词需要场景清单没有的对象：只在协作中核查剧本证据。
- 账号切换、并发保存与旧版本提交仍执行原有权限和新鲜度检查。

### Task 1: 版本与分发数据
Files: core/promptArtBinding.js, core/promptBindingVersions.js, electron/prompt-art-store.cjs and tests.
Interfaces: bindingVersionOptions(snapshot,saved), selectBindingVersion(snapshot,saved,id), saveBindingVersion(saved,snapshot,decisions).
- [ ] 写并运行版本隔离、出图后恢复分发、旧版保存测试，确认失败。
- [ ] 实现内容指纹版本和持久化，回归原有严格提交验证。
- [ ] 运行对应 Node 测试并记录结果。

### Task 2: 核实界面与缺项核查
Files: src/v06/ArtReviewSection.jsx, PromptArtBindingPanel.jsx, core/promptSceneReconcile.js and tests.
- [ ] 测试剧本证据缺失不得新增、已有卡片不得覆盖、跨场依据可核查。
- [ ] 将分析方式移入标题，将提示词核实作为场景核实的第二模式；保留版本选择和逐条确认。
- [ ] 加入只影响对应场景的新缺项提案与审核应用，不改写原有资产。

### Task 3: 导出导入与生成联动
Files: electron/image-export.cjs, episode-media-import.cjs, core/promptBook.js, src/v06/CollabWorkspace.jsx, PromptBookWorkspace.jsx and tests.
- [ ] 写逐条目录往返、跨提示词共享图片、旧目录兼容测试并确认失败。
- [ ] 增加 prompt 布局和 promptMedia，按版本载入项目；未分发的项目载入场景图片池以供分发。
- [ ] 图视生成缺图保持待处理，不调用剧本核查。
- [ ] 运行上述测试、npm test、npm run build、模拟界面验证。

### Task 4: 复核与发布
- [ ] 独立复核改动及上述五项失败模式，修复重要问题。
- [ ] 更新版本、release notes、交接手册，提交本任务源码。
- [ ] 打包发布，核验公开清单版本、下载大小及 SHA256，更新软件更新记忆。

## Progress
2026-10-26: 已核验 2.8.71 基线；早期版本按 generationRunId 全剧分组不可用，改为提示词集合指纹，场景内批次独立选择最新完整批次。
