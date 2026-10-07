# Framework Event Creation Implementation Plan

> **For agentic workers:** Use the approved design and test-driven development. Three disjoint file domains may proceed in parallel under superpowers:dispatching-parallel-agents; root owns integration, review and release.

**Goal:** Apply the approved event-based framework workspace to real projects and real configured Agent interfaces, preserving old work and shipping an updater-visible release.
**Architecture:** A pure immutable workflow model owns framework data and version-bound episodes. A separate AI adapter owns structured task context, validation and adoption. React panels consume those APIs inside the existing CreatorWorkspace and persistence pipeline.
**Tech Stack:** Existing React, JavaScript ESM, lucide-react, Electron, node:test, Vite, Playwright. No new dependencies.
**Spec:** `docs/superpowers/specs/2026-10-07-framework-event-creation.md`.

## Global Constraints

- No demonstration story or canned generation in production; use existing configured AI interfaces.
- Never lose legacy source, stage output, episodes, versions or manual edits.
- Stable IDs drive associations; display numbering may change.
- Conflicts require human choice. Locks and changed-input checks are enforceable in core functions.
- Version bodies are isolated. Agent failure/cancellation cannot silently adopt partial output.
- All writes participate in existing project persistence; no parallel localStorage document store.

## Review Focus

- Legacy projects with only free text or existing episodes: preserve and make readable.
- Stale model replies after manual edits/settings/version changes: preserve candidate, block adoption.
- Locked macro/micro events across editing/moving/simulation: content and relative ordering survive.
- Referenced event deletion or reordering: flag stale allocations, preserve archived bodies and source identity.
- Mid-batch cancellation/version changes: retain completed text and never write results to another version.

## Task 1: Workflow Model

**Files:** create `core/frameworkWorkflow.js`, `core/frameworkWorkflow.test.js`.
**Interfaces:** `normalizeFrameworkProject(project) -> project`, `frameworkState(project) -> framework`, `frameworkEvents(project) -> [{group,middle,event,code,groupCode}]`, `frameworkEventCode(project,id)`, `frameworkLinks(project)`, `applyFrameworkCommand(project,command) -> project`.
The model lives at `project.creator.framework` with version 2. Sections: `ideas`, `ideaSummary`, `settings:{items,pending,confirmed,revision,history}`, `groups:[{id,title,goal,time,confirmed,locked,middles:[{id,title,events:[{id,title,summary,before,after,motive,foreshadow,actualTime,characterIds,story,confirmed,locked,source}]}]}]`, `looseEvents`, `mainline:{links,confirmed}`, `characters`, `sources`, `components`, `simulations`, `plans`, `activePlanId`, `archives`, `legacy`. Preserve unknown fields. Plans have `id,name,episodes,eventSnapshot,settingsRevision,stale`; actual episode objects follow existing `content/result/finalConfirmed` shape.
Commands: model agent publishes the authoritative command list and payloads before UI writes handlers. Root owns normalizer integration to avoid circular imports.

- [ ] Write failing preservation, settings-choice, locks, stable-ID, version-isolation, deleted-plan recovery tests; run targeted node:test and observe failures.
- [ ] Implement immutable model with strict invariants; publish command interface to UI/AI workers.
- [ ] Run targeted suite, inspect output. No shared creator files changed by this task.

## Task 2: AI Adapter

**Files:** create `core/frameworkAi.js`, `core/frameworkAi.test.js`; root integrates existing `core/creatorAi.js`, `core/creatorWorkspace.js` and hook if needed.
**Interfaces:** `isFrameworkTask(target)`, `prepareFrameworkTask(project,target)`, `frameworkTaskContext(project,target)`, `frameworkTaskRule(task)`, `frameworkInputFingerprint(project,target)`, `applyFrameworkRecord(state,projectId,recordId,options) -> state` (or project-level helper communicated to root). No import of creatorWorkspace/projectStore from adapter to avoid cycles.
Targets use task names `frameworkIdeas`, `frameworkSettingsCheck`, `frameworkExtract`, `frameworkSimulate`, `frameworkPlan`, `frameworkExpand`, `frameworkEpisode`, `frameworkCheck`, `frameworkChat`, with precise sourceId/eventId/planId/episodeId/mode and selected component IDs. Schema-checked JSON for structure tasks, full script for episode, prose for communication/checks.

- [ ] Write tests for exact context, no unadopted facts, source identity, conflict gate, lock validation, stale fingerprints and late/cancelled results.
- [ ] Implement prompt schemas and record processing against command contract; extraction keeps original raw text; no hardcoded story generation.
- [ ] Run targeted tests and send integration notes.

## Task 3: Approved UI

**Files:** create `src/creator/FrameworkCreationWorkspace.jsx`, focused `src/creator/framework/*.jsx`, `src/creator/framework/framework.css`; root adds routing/imports.
**Interface:** React props `{project,state,setState,getState,api,agent,onBack,onSave,saveStatus}`. All mutation via applyFrameworkCommand on current project in setState updater. Agent.run with exact targets; pending records processed through adapter and user choice.

- [ ] Build all approved panes from preview layout, using live project data and meaningful empty states.
- [ ] Connect actual import API, models, raw sources, editing, conflict dialogs, candidate review, event structure, causal links, simulation modes, independent allocations and version bodies.
- [ ] Connect batch generation/cancellation/context freshness, version restore, export/library via existing components where compatible.
- [ ] Verify component static/build checks; root drives real-browser smoke tests with simulated responses.

## Task 4: Integration and Release

**Files:** modify `core/creatorWorkspace.js`, `core/creatorAi.js`, `src/creator/CreatorWorkspace.jsx`; add integration tests, review/QA artifacts, package version and release notes.

- [ ] Verify baseline tests and preserve pre-existing working tree.
- [ ] Wire framework normalizer, custom targets/fingerprints/adoption, workspace route; keep free/rewrite/IP branches intact.
- [ ] Run entire suite and build; validate actual UI with isolated seeded projects and mock APIs, including old-project recovery.
- [ ] Request independent review, resolve supported findings and rerun affected tests.
- [ ] Commit changes, integrate into original checkout, bump version with notes, `npm run release`, verify manifests/version/size/SHA256. Existing user authorization includes publishing under AGENTS.md.
