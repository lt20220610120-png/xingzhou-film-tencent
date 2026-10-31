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
