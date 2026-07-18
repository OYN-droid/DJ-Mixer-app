# Project Registry and Isolation regression checklist

Browser: Google Chrome  OS: macOS  Commit: uncommitted Phase 5A.1 audit  Date: 2026-07-17

## Automated evidence

- [x] Fresh-origin bootstrap migrated two seeded legacy domains, preserved a backup, and opened immutable `legacy-project`.
- [x] Two projects retained distinct values for the same domain key; rename preserved the second project's ID.
- [x] A generated asset contained all required ownership fields and defaulted to `shared: false`.
- [x] App integration switched A → B → A with zero active playback after the boundary.
- [x] Project B retained one DITC reference while Project A retained zero.
- [x] Project A restored its former Deck reference as `Relink Required`, never as playable audio.
- [x] Project Intelligence rebuilt with Project A's immutable ID after returning.
- [x] A post-switch master recording produced 18,531 bytes and its owned export produced the same 18,531 bytes.
- [x] Recording and export jobs carried the active session `contextVersion`; Recording and Export asset entries were attached to Project A.

These checks used a temporary browser profile and isolated localhost origin. Human audible checks and long-running Demucs switching remain manual.

## Registry and lifecycle

- [x] First launch creates one migrated project with an immutable `projectId`.
- [ ] Create Project opens a clean project after the safe switch boundary.
- [x] Rename changes display metadata without changing `projectId` or storage keys.
- [ ] Close stops playback, saves state, suspends audio, and disables creative controls.
- [x] Open restores a closed project and reloads its isolated state.
- [x] Creating multiple projects never duplicates an ID.

## Isolation

- [ ] Give Projects A and B distinct DITC references, Pads, Beat Forge patterns, Harmony patterns, Smart Mix history, Stem jobs, Arrangement clips, Producer Studio metadata, recordings, exports, recommendations, missions, memory, and decision logs.
- [x] Switch A → B → A and verify tested domains restore only their owner.
- [x] Verify Deck audio never survives a switch and restored Deck references say Relink Required.
- [x] Verify Global Stop reports zero active providers before the target project opens.
- [x] Verify Producer Studio and Project Intelligence report the target immutable ID.
- [ ] Verify global tempo-safety preferences and provider configuration remain global.

## Background ownership

- [ ] Start a Stem job in A, switch to B, and confirm late polling cannot update B.
- [ ] Return to A and confirm the Stem job remains owned by A.
- [ ] Finalize a recording during switch and confirm it remains in its originating project.
- [ ] Start an export, recommendation refresh, mission plan, waveform analysis, and track analysis; verify stale completions are discarded after switching.
- [ ] Confirm every job exposes `projectId`, `jobId`, `contextVersion`, and `creationTimestamp`.

## Migration and recovery

- [ ] Seed each legacy creative key, reload, and verify copy-and-validate migration.
- [ ] Verify destination values declare `projectId` ownership.
- [x] Verify legacy keys remain untouched.
- [x] Verify a timestamped migration backup exists and the UI reports migration status.
- [ ] Corrupt one legacy key and confirm migration reports the error without deleting other data.

## Assets and cleanup

- [ ] Inspect DITC, Deck, Arrangement, Stem, Recording, and Export asset entries for the required ownership fields.
- [ ] Verify runtime-only recordings and exports restore as Missing/Relink Required.
- [ ] Delete or close a project and confirm no other project's asset records change.
- [ ] Verify object URLs are revoked on switch and close.

## Existing features

- [ ] Decks load/play/restart and Global Stop pass.
- [ ] Smart Mix, DITC, Pads, Beat Forge, Harmony Lab, Stem Lab, Arrangement, recording, and export pass their focused checklists.
- [ ] Undo/redo remains project-local.
- [ ] Complete a human audible pass before marking project switching production-ready.
