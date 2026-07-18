# Project Library regression checklist

Browser: isolated Google Chrome  OS: macOS  Branch: `feature/project-library-ui`  Date: 2026-07-18

## Automated browser evidence

- [x] Project Library module, browser grid, create dialog, and all eight project types loaded without a page initialization error.
- [x] Created and opened a real Mixtape project with immutable registry identity.
- [x] A sentinel stored only in runtime survived A → B → A, proving project switching did not reload the application document.
- [x] Generated a real `AudioBuffer`, loaded and played Deck A, invoked Global Stop, and restarted Deck A locally.
- [x] Switching projects stopped all Playback Registry sources; active source count was zero in the target project.
- [x] Projects A and B retained different DITC source records, and A restored its Deck reference as `Relink Required` rather than playable audio.
- [x] Rename preserved the immutable project ID; favorite state persisted.
- [x] Duplicate copied project-scoped DITC data and did not copy a runtime audio output.
- [x] Archive and Restore changed the real registry status.
- [x] Project validation passed for the tested project.
- [x] Name search, Favorites filtering, and Alphabetical sorting returned matching registry projects.
- [x] Project overview reported one real track reference and the stored Mixtape type.
- [x] Delete purged the test duplicate's project-owned browser storage and removed it from the library.
- [x] A full browser reload restored the active project name, active ID, Project Library, and honest Deck relink state.

The browser run used an isolated Chrome profile and localhost storage. It did not alter the user's regular browser profile.

## Default startup and project entry follow-up

The Phase 5A.2 follow-up was exercised in a second fresh isolated Chrome profile. The harness used real application APIs and browser storage; it did not treat notifications or rendered cards as proof of state.

1. [x] Launched DeckForge at the normal root URL.
2. [x] Project Library was the first active view.
3. [x] Decks was not active and creative navigation was unavailable without a project.
4. [x] Opened the existing test project through the registry lifecycle without reloading.
5. [x] Producer Studio became the active view; Project Intelligence, Producer Memory, and recommendations were rebound to the opened project.
6. [x] Navigated to Decks and verified the hash route changed to that project and page.
7. [x] Returned to Project Library through the workspace exit action.
8. [x] Verified the Producer Studio sentinel was persisted, playback registry count was zero, and the project remained registered and active for Continue.
9. [x] Created a second project through Project Registry with only name and type.
10. [x] Producer Studio opened with the new project active and empty project-scoped DITC state.
11. [x] Reloaded the browser while on the first project's Decks route.
12. [x] Restored the matching active project, Decks page, DITC state, and honest `Relink Required` Deck reference.
13. [x] Injected invalid JSON into project-owned storage for a registered project.
14. [x] Reload safely fell back to Project Library with no active project.
15. [x] Navigated to a valid project route after normal startup had cleared the active session.
16. [x] Redirected to Project Library with `Open or create a project to continue.`; a missing project route produced the same protection.
17. [x] Project Library create, open/continue, search, sort, filter, rename, favorite, duplicate, archive/restore, validate, details, and delete actions remain covered by the Phase 5A.2 browser run above.
18. [x] Project A data remained absent from Project B and restored correctly after returning to A.
19. [x] A real generated `AudioBuffer` played on Deck A and Global Stop reduced active playback to zero.
20. [x] Deck A restarted locally after Global Stop.

Result: automated entry-flow regression `PASS`. Human visual, audible, assistive-technology, live-recording-finalization, and long-running Demucs checks remain required below.

## Project browser and cards

- [ ] Visually review artwork placeholders, compact card layout, responsive layout, focus visibility, and status contrast.
- [x] Cards derive name, type, timestamps, progress, duration, track count, arrangement state, recording count, latest export, missing assets, favorite, and status from stored data.
- [x] Unknown progress, absent artwork, absent duration, absent exports, and unavailable folders use honest empty or unavailable labels.
- [ ] Test card keyboard navigation and screen-reader announcements with assistive technology.

## Project actions

- [x] Create Project and project type defaults.
- [x] Open and reload-free switch.
- [x] Rename without changing identity.
- [x] Duplicate project-scoped data.
- [x] Favorite and Unfavorite.
- [x] Archive and Restore.
- [x] Validate Project.
- [x] Repair is shown only for a repairable validation issue and preserves a backup before mutation.
- [x] Delete requires confirmation and purges owned browser storage.
- [x] Reveal Details displays real fields and explains why Open Folder is unavailable.
- [ ] Manually corrupt repairable metadata and confirm Repair restores ownership from its backup.

## Search, sort, filter, and empty state

- [x] Search matches name, tags, genre, and type in the query model.
- [x] Sort supports recently opened, recently created, alphabetical, progress, and project type.
- [x] Filters support all, favorites, archived, project types, missing assets, and needs repair.
- [ ] In a fresh empty registry, visually confirm the four requested empty-state actions and copy.

## Switching safety and existing behavior

- [x] Unsaved Arrangement state requests save confirmation before switching.
- [x] Active recording requests explicit finalization before switching or closing.
- [x] Project switch follows stop → persist → ownership transition → runtime reset → service rebind.
- [x] Playback Registry reports no active sources after switching.
- [x] Local Deck playback restarts after Global Stop.
- [ ] Complete a human audible Deck, Pads, Beat Forge, Harmony Lab, Stem preview, Arrangement, recording, and export pass.
- [ ] Start a long Demucs job in A, switch to B, return to A, and verify server-job ownership and resumption.
