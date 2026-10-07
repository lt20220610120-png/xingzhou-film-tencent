# 人物关系锚定与批量确认 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布 2.8.7，原创可批量确认，洗稿以统一的新作人物关系转换多来源事件。

**Architecture:** 人物身份、来源对应与事件转换使用项目本地结构数据；AI 输出先作为候选，经结构/指纹/锁定校验后采用。人物界面位于大纲和主线之间。输入、采用、主线及版本快照贯穿同一组稳定 ID。

**Tech Stack:** React、JavaScript、Electron、Node 内置测试、现有本地项目与任务执行器。

**Spec:** [已批准设计](../specs/2026-10-08-rewrite-character-anchors-design.md)。用户已要求默认直接实现并发布，无需再确认计划。

## Global Constraints

- 版本 2.8.7；保留本地编辑、旧文、来源出处、ID、顺序、锁定和历史；不采用全文替名。
- 任务只使用人工确认的新作人物与对应；未采用候选不是故事事实；不猜测歧义关系。
- 付费调用用模拟接口验证；完整测试、界面、打包和公开签名清单验证后发布。
- 不使用 frontend-design；默认当前会话直接执行，结束前一次独立复核。

## Review Focus

1. 两本书同名或一本书同名两人：来源角色必须按来源与独立角色 ID 区分，不因名字合并。
2. 没有来源的原创事件、旧文字项目：本地查看/编辑/导出不阻断，引用转换需要明确的人物依据。
3. 单组/单事件转换：不能改非目标事件、归属、出处、锁定文字或顺序。
4. 编辑人物或移除来源时正在生成：候选必须失效，原稿和历史仍能恢复。
5. 切换版本与多轮要求：人物依据不能来自另一个版本，既往指令和未采用结果不能被当成事实。

### Task 1: 原创原子确认

**Files:** `core/frameworkWorkflow.js`、`core/frameworkComponents.test.js`、`src/creator/framework/ComponentPanes.jsx`、`AGENTS.md`。
**Interfaces:** 新命令 `mainline.confirmGroups`，输出已确认的大事件及 `orderConfirmed`，不改小事件和全剧确认。

- [ ] 增加测试：13 个完整组全确认；一个空组全回滚；锁定已确认不变、锁定未确认拒绝。
- [ ] `node --test core/frameworkComponents.test.js`：新用例先失败。
- [ ] 实现原子命令与“一键确认全部”，不导航、不调 AI。
- [ ] 同一测试命令全部通过后提交。

### Task 2: 新作身份和来源绑定

**Files:** 新建 `core/rewriteIdentity.js`、`core/rewriteIdentity.test.js`。
**Interfaces:** `rewriteIdentity(project)`、`validateIdentityCandidate(project,raw)`、`changeRewriteIdentity(project,command)`、`identityTaskInput(project,target)`、`prepareRewriteIdentityProject(project,target)`。

- [ ] 先写失败测试：多来源/同名身份、关系引用、歧义绑定、确认/修改/恢复、移除来源保留人物、失败不变输入。
- [ ] `node --test core/rewriteIdentity.test.js`：看到失败后实现上述纯函数；候选采用与人工确认独立，局部编辑保存本地。
- [ ] 同一测试命令通过后提交。

### Task 3: 事件转换与生成约束

**Files:** 新建 `core/rewriteConversion.js`、`core/rewriteConversion.test.js`；修改 `rewriteOutline.js`、`rewriteMainline.js`、`rewriteStory.js`、`rewriteWorld.js`、`rewriteWorkflow.js`、`creatorWorkspace.js`、`creatorAi.js`。
**Interfaces:** `conversionTaskInput(project,target)`、`prepareRewriteConversionProject(project,target)`、`validateIdentityConversion(project,target,raw)`、`applyIdentityConversion(project,target,raw)`、`assertRewriteIdentityReady(project,eventIds)`、`rewriteIdentityTaskInput(project,target)`，身份/转换任务路由 `rewriteIdentity` / `rewriteConvert`。

- [ ] 先写失败测试：目标范围、重复/遗漏、人物外键、来源名残留、原文出处保留、指纹失效、锁定及元数据贯通、版本恢复。
- [ ] 验证失败后实现转换，原子采用、上下文和指纹路由；新引用卡片为待转换草稿，正式展开检查身份。
- [ ] 为旧项目保留查看/编辑/导出；新增调用执行新门槛。来源拆解仍独立，人物确认不被大纲确认循环置为过期。
- [ ] `node --test core/rewriteIdentity.test.js core/rewriteConversion.test.js core/rewriteStory.test.js core/rewriteWorkflow.test.js` 全通过后提交。

### Task 4: 人物工作区及故事区接入

**Files:** 新建 `src/creator/RewriteIdentityPane.jsx`、`src/creator/rewrite-identity.css`，修改 `RewriteWorkspace.jsx`、`RewriteOutlineCards.jsx`、`RewriteStoryBoard.jsx`。
**Interfaces:** 人物区调用 Task 2 的编辑/确认与 Task 3 的候选路由/转换；复用 CreatorDialog、模型选择、useCreatorAgent；不新增复杂表单。

- [ ] 浏览器先记录旧页面缺少新入口/批量确认的失败；用示例项目，不改用户数据。
- [ ] 人物卡＋自然语言输入左右布局，来源映射折叠，歧义下拉修正，批量确认和转换；候选先预览且允许 Agent 继续修改。
- [ ] 导航“大纲 → 人物与关系 → 主线”，新引用提示待统一人物，原有资料折叠保留。
- [ ] 验证两个来源进入同一人物库、固定底栏、拖动、三种窗口宽度、本地草稿和候选采用前后；模拟外部接口。
- [ ] `npm test`、`npm run build` 通过后提交。

### Task 5: 独立复核和发布

**Files:** 版本文件、`release-notes/2.8.7.md`、验收文档、`latest.json`。

- [ ] 独立复核整次改动，对重要问题补失败测试、修复并重跑对应检查。
- [ ] 最终完整测试、构建、Windows 打包运行验证。
- [ ] 发布安装器，核对两个公开清单、固定公钥签名、大小、SHA256、公开下载和客户端验证入口；提交推送发布记录。

## 执行记录

工作日志保存在忽略的 `output/playwright/rewrite-287-progress.md`；按任务记载完成证据和必要的裁决。保存既有未跟踪的安全评级文档，不纳入本次功能提交。
