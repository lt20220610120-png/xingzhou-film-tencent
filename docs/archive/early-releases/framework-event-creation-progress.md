# Execution ledger — plan: docs/superpowers/plans/2026-10-07-framework-event-creation.md

- User approved the concrete second-version design and explicitly requested production application. Proceeding through implementation and AGENTS.md release without asking for the same authorization again.
- Isolated branch/worktree: codex/framework-event-creation. Original branch and source preserved during development.
- Baseline suite started, output in baseline-tests.log.
- Task ownership: workflow model, AI adapter and React workspace occupy disjoint new files. Root owns existing-file integration, verification and publishing.
- Ruling: retain optional middle-event groups; event numbering flattens small events per macro group. This follows the user's hierarchical diagram and A1/A2 convention.

- Production model, AI adapter and all ten React panes are implemented. Existing creator loading, task routing, fingerprints, candidate adoption, generic episode editing and library archival use the framework workflow.
- Root reviewed and fixed loose-inbox isolation, missing adjacent links, episode allocation validation, outline/body invalidation, full source-component insertion, character-led event entry and conversation scope/history.
- Full suite: 1711 passed before the final conversation regression; framework targeted suite: 52 passed. Final full release suite will include 1712 tests. Build passes.
- Browser writing workflow: 19 assertions passed, including batch sequential context, manual confirmation, Word export, library archival, independent episode plans, switching, deletion/restoration and locks. Further tooling, cancellation and viewport checks are in progress.

- Final full suite: 1712/1712 passed. Final build passes. Browser workflow 122/122 passed, with final additional source-selection, reload and scoped-conversation checks. Console has zero errors. Source is ready for packaging and public release.

- Independent final review found two P2 issues before publication: outline dialog copied stale body/history, and title-derived numbering conflicted with reordered plans. Both fixed; reviewer confirmed. Full suite now 1713/1713. Browser race regression 7/7 passed, including preserving freshly generated bodies/history and allowing stale outline repair. Single-episode generation also temporarily disables the body editor to prevent unsaved typing being displaced by its response.

- Released 2.8.0 from the original repository after fast-forward integration. Source pushed; installer runtime PASS. Public manifests in both update/source repositories match version, URL, 102694505-byte asset and SHA256 c485bcfaa5dd43ecfe525cc203e0142c14815922bc6be589b910183adc7a47e4. GitHub asset digest independently matches. Authorized implementation and release are complete.
