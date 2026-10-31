# SDD ledger — plan: docs/superpowers/plans/2026-10-31-character-voice.md
Base: 1ec8d64; existing isolated D:/AI/Qwen3-TTS/xingzhou-release reused, branch codex/character-voice-workflow.
Baseline npm test: 2582/2582.
Pre-flight: Task 1 voiceAnalysis + voiceProfiles consumed by Task 2 cards and Task 3 snapshot.voiceCards; Task 3 full compiled references consumed by Task 4 outbound clipping; no conflicting names.
Task 1: complete (3f7d20f; characterVoices + artReview 30/30; missing exports and missing saved voiceAnalysis RED -> GREEN).
Task 2: implemented; UI verification pending. Local import reuses mediaImportFiles, no new IPC needed.
Task 3: implemented; voiceBinding/imported/scene/prompt 35/35; mixed-folder missing voiceCards RED -> GREEN; promptAssetUsage/version/repair 10/10.
Task 4: implemented; audio selection + production selection + real file hash 9/9; initial missing exports and audio hash refusal RED -> GREEN. Automation sends original complete binding to trusted main process, which verifies then clips.
Full suite first run 2592/2594: two old role-matrix expectations updated to include new voice section. Focused permissions/automation 42/42.
Task 5: complete; audio-results local index/store, per-result save/delete/export/playback, clear-all cleanup including orphan legacy audio, ProjectVoices confirmation linkage, fixture/UI verification. Full suite 2596/2596; build and 1280/1700/2232 UI verification pass. Release packaging pending.

2026-11-01 completion: 2.8.100 fixes independent review findings; 2602/2602 tests, build, 3-width audio UI, real React episode/scene optional-audio export UI, prompt audio export tests, NSIS runtime PASS. Published official mirror and both GitHub signed manifests verified. Installed D:/行舟影视客户端/Xingzhou Film Tencent Edition 2.8.100.0.

2026-11-01 follow-up:清单核实双页签/单列音色审核、年龄阶段、身份依据传入、音色描述选填、人工卡和批量任务完成；自动化新增 voices stage 与三项模型配置，第一条成功样音自动采用。2609/2609、构建和三宽UI通过，待发布2.8.101。

2.8.101发布完成：安装包103934851字节，SHA256 1e92d6a855656f54827d4a16887f960b7f8aaaa4d54196c69b05a557062971c8；本机2.8.101.0；官网和双GitHub清单核对通过。

2026-11-01 UI follow-up:分段控件改为音色/核实分发，音色前置；场景清单、本集清单、提示词分发显示音色类别；2609/2609和构建通过，待发布2.8.102。

2.8.102发布完成：整场分发读取sceneSource并返回/校验speakers；2610/2610；包103935296字节，SHA256 20257bbd475661e0ca4817782a26b349b79247e372a292a37e83a0e3ee153141；官网及双GitHub清单签名通过。
