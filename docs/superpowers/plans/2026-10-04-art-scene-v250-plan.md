# 2.5.0 逐场资产与素材 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自动分配本集名单、补缺保留旧稿，并将逐场图片贯通导出、导入和分镜。

**Architecture:** 在 review schema 1 上追加 roster 与备选描述，保留现有逐场发布接口；runner 自动补齐缺失对应。素材账本追加 sceneMedia，旧 episodeMedia 仍兼容。

**Tech Stack:** React / Electron / Node / PostgreSQL。

**Spec:** docs/superpowers/specs/2026-10-04-art-scene-v250-design.md

## Global Constraints

- 版本 2.5.0；保留用户已有图片与人工编辑；付费生成测试使用模拟接口。
- 白底、黑体、淡紫按钮；详细描述后台保留。
- 数据单向；不自动建立未核实资产卡片。

## Review Focus

- 旧版记录缺 roster 时迁移，场景中同一人物不同衣服保持独立。
- 模型返回期间用户删除或核实，返回结果不能覆盖操作。
- 改名后旧条目不能被补缺回包恢复；模型失败仍保存人工名头。
- 跨场复用同字节图片，不因内容去重失去另一场关联。
- 场景目录与集号冲突、符号链接和未关联图片不得错误挂载。

### Task 1: 名单、补缺与自动对应

**Files:** core/artReview.js, core/artReviewRunner.js, core/artReviewPersistence.js, core/artReview.test.js, cloud-backend/src/art-review-repository.cjs

**Interfaces:** reviewRoster(record) 返回去重名单；editArtReview 支持 roster-upsert / assign / roster-remove / roster-undo；runner 支持自动缺失对应补齐和 focusItem。

- [ ] 写并运行失败回归：多场复用、只补缺、自动缺对应、单条补齐、无下游回流。
- [ ] 实现名单迁移与增量合并、自动对应请求和单条信息补齐；云端验证名单。
- [ ] Run: node --test core/artReview.test.js cloud-backend/test/art-review.test.cjs electron/art-review-checkpoints.test.cjs。Expected: 全通过。
- [ ] 提交本任务。

### Task 2: 核实页面

**Files:** src/v06/ArtReviewSection.jsx, src/art-review.css, src/v06/CollabWorkspace.jsx

**Interfaces:** 使用 Task 1 的名单、分配与 focusItem；自动补齐只尝试一次，可手动重试。

- [ ] 页面回归先复现“安排后名单消失”与“手动新增要重跑整集”。
- [ ] 实现持续名单、多选场号、名单添加保存并补齐、只补缺重读、自动启动对应。
- [ ] Run: npm run build + 真实浏览器模拟接口验收。Expected: 操作成功，无溢出，不付费。
- [ ] 提交本任务。

### Task 3: 场景导出与媒体匹配

**Files:** electron/image-export.cjs, electron/episode-media-import.cjs, core/promptBook.js, core/automaticReferences.js, src/v06/PromptBookWorkspace.jsx, src/v06/StoryboardWorkbench.jsx, src/v06/CollabWorkspace.jsx

**Interfaces:** 导出 layout=scene；导入返回 scenes:{'N-M':refs}；mergeEpisodeMedia(book,incoming,scenes)；bookSharedReferences(book,entry)；项目参考按场景过滤。

- [ ] 写并运行失败测试：导出→导入→当前场附加、跨场共享、手工移除、旧目录兼容、媒体按场过滤。
- [ ] 实现场景目录往返与各 UI 入口，保留既有条目编辑和手工参考。
- [ ] Run: node --test electron/image-export.test.cjs electron/episode-media-import.test.cjs core/promptBook.test.js core/automaticReferences.test.js。Expected: 全通过。
- [ ] 提交本任务。

### Task 4: 发布

**Files:** package.json, package-lock.json, release-notes/2.5.0.md, docs/superpowers/validation/2026-10-04-v250.md

- [ ] 完成规格逐项核对、全量测试与页面操作验证，记录证据。
- [ ] 云端部署名单验证，制作安装包并运行实际桌面验收。
- [ ] Run: npm run release；python qa/director-reliability/verify-public-release.py。Expected: 发布成功，公开大小/hash一致。
- [ ] 提交并推送源码和验证文档。
