# 创作空间 2.6.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Independent document/export and creator-domain work may use superpowers:dispatching-parallel-agents with exclusive file ownership.

**Goal:** 落实已讨论的创作空间，完成果子双栏、洗稿、自由原创、框架原创、固定版本剧本库和 TXT/DOCX 导出，并发布软件内更新。

**Architecture:** 保留现有 React/Electron 和 state 持久化。创作领域纯函数放 core/creatorWorkspace.js；UI 在 src/creator 内按职责拆分，App 仅替换三个入口。复用现有 API 配置、完整 Skill 执行和导演项目卡片。总稿从同一组节点生成，库作品以快照版本保存。

**Tech Stack:** React、Vite、Electron、Node.js node:test、mammoth；现有依赖，不接入 MiroFish 外部服务。

**Spec:** ../specs/2026-10-04-creator-space-discussion.md。用户 2026-10-04 已明确要求按照讨论落实并更新；无需再次等待设计或执行方式批准。

## Global Constraints

- 保留旧项目、原稿、转换稿和旧总稿冲突版本；迁移可重复执行。
- 总稿和分集编辑同一份内容；剧本库保存收录时的完成版本。
- 框架式成果编辑为主，右侧聊天。
- 洗稿右侧、自由左右、框架终稿分别按设计范围导出，不做空白回退。
- AI 先产候选，显式采用；记录目标 ID 与输入版本，回包不覆盖新稿或写错项目。
- 全部结果进入项目资料，弃案不得当成已采用事实。完整 Skill 不截断；长文分批阅读可见。
- 第一版真实提供经验提炼和约束推演，外部引擎后续适配。
- 沿用导演现有视觉，不使用 frontend-design；模拟 API 验证付费功能。
- 版本 2.6.0，完整测试、构建、界面验证、安装包验证后发布并核对公开更新清单。

## Review Focus

- 旧总稿与逐集冲突：两份均保留，迁移不丢内容。
- AI 在用户改稿、切页、取消时回包：保留候选且不覆盖。
- 对标集与新集数不等：关联稳定、原文不混入新作导出。
- 上游修改后：人工终稿保留并标记复核；弃案不污染上下文。
- 中文 Word 导入导出与重新加载：正文、结构和库版本实际可读。

## Task 1: 创作领域与迁移

Files: core/creatorWorkspace.js、core/creatorWorkspace.test.js；root 集成 core/projectStore.js。

Interfaces: normalizeCreatorProject(project,kind); createCreatorProject(state,{name,mode,groupId}); updateCreatorSection(state,kind,id,key,patch); updateCreatorEpisode(state,kind,id,episodeId,patch); addCreatorEpisode(state,kind,id,{title,type}); removeCreatorNode(state,kind,id,nodeId); importCreatorSource(state,id,document); addCreatorReference(state,id,document); appendCreatorRecord(state,kind,id,record); adoptCreatorRecord(state,kind,id,recordId,{mode,side}); buildCreatorText(project,kind,side,{includeSections}); editCreatorMaster(state,kind,id,side,text); archiveCreatorProject(state,id,{side,includeSections}); creatorInputFingerprint(project,target).

- [x] Write/run failing behavior tests for migration, same-node master edits, no side fallback, immutable library versions, source/new episode separation, stale results, candidate isolation.
- [x] Implement pure immutable functions with normalized project.creator sections/source/references/records/chat and existing episodes retained.
- [x] Run node --test core/creatorWorkspace.test.js; integrate normalizeState without changing director behavior.

## Task 2: 真实文档导出与素材导入

Files: electron/creator-documents.cjs、electron/creator-documents.test.cjs、electron/main.cjs、electron/preload.cjs。

Interfaces: api.saveCreatorDocument({name,content,format:'txt'|'docx'}), api.importCreatorVideo() -> {fileName,filePath}|null. Existing api.importFullScript for TXT/DOCX.

- [x] Write/run failing DOCX ZIP/XML, Unicode, paragraph and invalid-input tests.
- [x] Produce genuine DOCX without new heavyweight dependency; safe file names; save cancellation returns null; video import selects and returns source without false transcription.
- [x] Run focused node tests and verify imported DOCX through mammoth.

## Task 3: AI 项目执行与上下文

Files: core/creatorAi.js、core/creatorAi.test.js、src/creator/useCreatorAgent.js、src/creator/AgentPanel.jsx。

Interfaces: buildCreatorContext(project,{kind,target,scope}), runCreatorTask({api,state,project,kind,target,profile,skillId,instruction,taskId,onProgress}) -> {output,meta}; hook saves runs/candidates via functional setState.

- [x] Failing tests: approved versus rejected context, full Skill, overlong source coverage, cancellation and empty/error response.
- [x] Implement stage prompts, source reading batches, project-scoped history, candidates and adoption; configured model names selectable per task.
- [x] Verify mocked API and cancellation; no paid calls.

## Task 4: 果子、洗稿、自由原创与框架界面

Files: src/creator/CreatorWorkspace.jsx、CreatorEditor.jsx、FrameworkWorkspace.jsx、CreatorLibrary.jsx、creator.css；src/App.jsx.

- [x] Wire all three navigation entries to persistent creator shell; projects, groups, mode filters and create dialogs.
- [x] Fruit compact title/upload bar and always-visible paired editors. Source/document preview and episode mappings for rewrite. Free custom nodes and independently exportable sides.
- [x] Framework stage directory, central editable成果, right chat, 1—3 references/experience, lockable skeleton, constrained simulation candidates, episode/detail/scene workflow.
- [x] Export/archive previews with explicit ranges; full library reader and version choice; final source warning/legacy recovery/history.
- [x] Interface verification through mock desktop APIs; create/edit/switch/reload/export/adopt; capture screens at normal and narrow desktop sizes.

## Task 5: Review、发布

Files: package.json、package-lock.json、release-notes/2.6.0.md、qa records、latest.json.

- [x] Fresh independent branch review; fix material findings with regression tests.
- [x] npm test and npm run build; UI mock flows, director regression, UTF-8/DOCX output.
- [ ] Commit verified code, npm run release, packaged-runtime verification and public manifest version/URL/size/SHA256 checks.
- [ ] Report released version and user update entry, material limitations only.

## Execution ledger

Baseline commit 9392121; feature branch codex/creator-space-v260. Product implementation and publish explicitly authorized. Main controller owns UI/integration and release; independent workers own the domain file pair and the Electron document files; no overlapping edits or worker releases.

2026-10-04 集成完成：人物事件稳定条目、引用验证、因果无环、拆分合并、完整聊天和模型范围、长输入读取、候选分支选择、总稿同源、旧稿恢复及固定收录版本均落实。独立审查指出的运行与资料问题已修并补回归。1312项测试及构建通过，四组页面模拟流程与导演导入通过，未调用付费生成。详见 docs/qa/creator-space-v260.md。下一步提交与打包发布2.6.0。
