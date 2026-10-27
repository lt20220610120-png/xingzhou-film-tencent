# 提示词缺项一键补充 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans 当前会话执行，结束时独立复核。

**Goal:** 人工选中提示词缺项后，调用所选模型补齐对应场景及分集清单，并重新用模型分发受影响提示词。

**Architecture:** 新增 promptMissingSupplement 服务，使用现有 artReview store 和 promptDistributionService；按场分组、同类同名缺项合并，小批量模型返回已有卡片引用或带基础设定证据的新卡片，复用 applySceneReconciliation 更新场/集。保存后调用原模型分发服务重读整场提示词；美术/资产仍经用户核实发布，绝不自动发布或生图。

**Tech Stack:** React、现有 CSS、Node test、共享 6 路模型队列、CAS 保存。

**Spec / Design:** 用户 2026-10-27 截图与要求：每行“一键补充”，顶部“一键补充勾选项”，根据提示词描述生成详细卡片。沿用当前 checkout。tencent/AGENTS.md 已授权直接实施验证发布，无需架构确认。备选为复用整集重分析（会扩大费用与改动范围）或规则创建卡片（不满足模型补齐）；采用定向模型补充。

## Global Constraints

- 只有人工点击触发；没有模型配置、过期来源或运行中目标不能发请求。
- 同场重复对象合并请求，跨场同集同名复用已有卡片，保留人工描述/图片。
- 模型只处理所选项，基础设定原文证据必须可定位；不能把属性片段造成人物。
- 不自动核实、发布或生成参考图；失败保存可恢复的成功部分，提示具体失败。
- 沿用总并发 6，不发真实付费测试请求。

## Review Focus

- 模型等待期间提示词、场景或人工选择变化，迟到回包拒绝。
- 同场两条提示词缺同一道具，只增加一个场/集卡片。
- 仅选择部分项目时不能连带生成未选缺项。
- 已有卡片只建立关联，不覆盖旧描述、造型、人工锁定与图片。
- 模型失败/格式无效/本地保存失败不产生伪成功；补充成功但重新分发失败可明确重试。

## Tasks

- [x] 核心 TDD：新增 core/promptMissingSupplement.test.js；先运行观察缺少接口的 RED。实现 core/promptMissingSupplement.js，校验来源/证据、按场去重、模型补齐、守卫写入、重分发与部分失败。增加 promptDistributionService 场景维护互斥，防止同时分发。
- [x] UI：PromptMissingBatchPanel 增加逐项与勾选补充；useScenePromptLinks 提供补充操作、进度；ArtReviewSection 传所选模型和目标签名。扩充模拟 fixture 与三宽浏览器验证，检查场/集卡片和发布后的美术资产。
- [ ] 完整测试、构建、独立复核修正、2.8.85 NSIS/运行时、公开发布与校验；更新交接、记忆及验收记录。

独立复核的两项问题（曾删除身份排除标记、旧项目分集号归一化）和自查零填充场号互斥均 RED→GREEN。全量2467/2467、三组三宽UI、构建/NSIS/运行时通过。

Ruling: 沿用当前命名分支与现有安装包发布脚本，不新开 checkout；项目AGENTS已授权直接发布，无需架构、集成菜单或重复发布确认。新增卡片按原流程先保存清单，再由用户核实发布，不自动越过人审。
