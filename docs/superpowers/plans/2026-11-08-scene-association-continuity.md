# Scene prompt association continuity implementation plan

Goal: Fix scroll extent, preserve scene voice identities down to individual prompts, and keep proven character identities consistent across clips in a scene.
Architecture: Keep scene roster authoritative. Preserve logical voice cards independently of adopted audio; references require real adopted audio. Give the association model a shared scene identity map and validate coverage of literal prompt identities, without copying all scene assets into every clip. Preserve manual locks and version separation.
Tech stack: React, pure JavaScript core, Electron local persistence.
Spec: User screenshots and request 2026-11-08; full request is the authority. Execute directly in existing release checkout, using tests before code. No user project writes or paid generation during verification.

- [x] Inspect nested production scroll owners and constrain the collaboration viewport; browser tests prove no extra outer scroll and footer ends at 18px. Original large gap was not reproduced in minimal data; document this limit.
- [x] Write failing core tests for pending voice identities, distinct clips/silent characters, eventual audio adoption, unique assistant identity and two-assistant ambiguity.
- [x] Implement voice identity continuity and source signatures; persist per-prompt decisions, render adopted/pending accurately, require adopted media for compilation.
- [x] Implement shared scene identity context, exact original-evidence coverage checks, no-reference negatives, and preservation of manual choices.
- [x] Add real React flow tests ending in exact storyboard references and no trailing scroll space; run focused + full tests and build.
- [x] Independently inspect changes and edge cases. Package and publish 2.8.131, verify public manifests/hash/download, update handoff and release memory.

Ruling: User has explicitly requested continued update and concrete corrections, so proceed without a new design approval conversation. Reuse current suitable checkout; no merge or data migration. Logical voice routing must not pretend an audio file exists. Ambiguous roles must remain reviewable.

Export scope refinement: existing export is complete. Preserve it, reserve all four button slots at open, reuse loaded local bindings, and redesign both native dialogs. Actual UI and IPC WAV/image exports verified; independent review found and prompted a fix for null-card manual skip locks.
