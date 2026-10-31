# 人物语音流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** 人物固定音色从分集读取贯通项目协作、独立素材、自动化与视频提交。
**Architecture:** 清单保存逐场对白证据，项目语音状态保存样音选择。关联编译输出完整音频，在最终请求按能力裁剪。
**Tech Stack:** React / Electron / Node tests.
**Spec:** docs/superpowers/specs/2026-10-31-character-voice-design.md

## Global Constraints
- 出场不同集数 >=3；仅普通对白；截图2为项目语音入口。
- 支持生成及上传本地语音并确认固定样音。
- 保留既有数据/权限/发布规则，不运行收费视频生成。

## Review Focus
- 同人物多妆造、重复集、未读集及正文变化不得虚增/复用错误证据。
- 音色确认后新候选及晚到回包不能替换确认样音。
- 可见但不说话、仅提及、画外音与心声不能带入普通对白音频。
- 已确认关联完整验证后才能按模型裁剪；切换模型不得丢失原关联。
- 旧项目、无提示词场景、导入混合音频以及自动化都走同一规则。

### Task 1: 语音清单领域与读取
Files: core/characterVoices.js, core/characterVoices.test.js, core/artReview.js, core/artReviewRunner.js, core/collabArtSkill.js.
Interfaces: validateEpisodeVoices(episode,scenes,data), projectVoiceRoster(project,ledger), voiceAnalysisMessages(episode,scenes).
- [ ] 添加并运行失败测试：3集去重、普通对白证据、串场拒绝、正文失效。
- [ ] 实现提取契约、逐场数据保存及旧项目补读。
- [ ] 相关测试通过并提交。

### Task 2: 项目语音卡片
Files: core/artReviewPersistence.js, src/v06/ProjectVoices.jsx, core/collabStore.js, src/v06/CollabWorkspace.jsx, electron/main.cjs, electron/preload.cjs.
Interfaces: store.setVoiceProfile(characterKey,reduce), confirmedVoiceReferences(ledger,sceneId).
- [ ] 测试确认与候选隔离、账号项目隔离。
- [ ] 生成/上传/试听/确认、模型选择、场景关联预览与补读。
- [ ] 相关测试通过并提交。

### Task 3: 统一提示词与文件夹关联
Files: core/promptArtBinding.js, core/scenePromptDistribution.js, core/importedArtBinding.js, corresponding tests, src/v06/ImportedArtBindingPanel.jsx, src/v06/StoryboardWorkbench.jsx.
Interfaces: decision.speakers with original quote evidence; snapshot.voiceCards; compiled references include selected audio only.
- [ ] 测试可见静默不关联、普通对白关联、混合文件夹屏蔽无关音频、无提示词场景。
- [ ] 将人物语音映射接入统一模型分发/编译与页面展示，自动化复用。
- [ ] 相关测试通过并提交。

### Task 4: 视频模型容量适配
Files: core/audioReferenceSelection.js, tests, src/v06/GenerationComposer.jsx, core/productionReferenceSelection.js, electron/main.cjs.
Interfaces: selectAudioReferences(input,caps) returns immutable outbound prompt/references; original request remains available for binding validation.
- [ ] 测试0/3/5容量、总量、编号、换模型恢复、原始关联防篡改。
- [ ] 提交前统一筛选，前端和自动化共用，保留图片规则。
- [ ] 相关测试通过并提交。

### Task 5: 验证发布
- [ ] 完整 npm test / npm run build、实际 React 多宽交互、模拟视频出站检查。
- [ ] 独立复核并修复重要问题。
- [ ] 版本、发布说明、安装包、运行时验证、公开签名清单/大小/hash核验。
- [ ] 更新交接与软件更新记忆，交付公开及本机安装包链接。
