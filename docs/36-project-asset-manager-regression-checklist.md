# Project Asset Manager regression checklist

Date: 2026-07-18  
Branch: `feature/project-asset-manager`

## Outcome

Phase 5A.3 now extends the existing `DeckForgeProjectAssets` authority with a project-scoped Asset Manager, typed usage references, missing/relink state, duplicate evidence, safe removal and Project Trash, explicit sharing, storage summaries, temporary cleanup, validation, diagnostics, and sanitized manifest export. No second asset registry was introduced.

This record separates automated browser results from manual application QA. The focused service suite passed. A complete real-audio acceptance pass in the full application remains required; it is not represented as complete based on table rendering or notifications.

## Automated browser test

Run from the repository root while the local static server is available:

```sh
open http://127.0.0.1:8000/tests/project-assets-browser.html
```

Headless Chrome result on 2026-07-18: `PASS`, 17 checks, project manifest 7,449 bytes. The test snapshots and restores its origin storage so it does not retain test projects or erase existing project data.

Passed coverage:

- registration, immutable project ownership, and typed usage;
- missing state, successful relink state, and duration/size mismatch warnings;
- exact-checksum duplicate classification, resolution to Trash, and restore;
- safe-removal blocking and active Stem job cleanup protection;
- metadata-only reference linking to local audio;
- persisted object URL rejection;
- shared ownership, deletion protection, project isolation, and storage counted once;
- sanitized manifest export and diagnostics.

## Status report

- Existing asset registry reuse: Passed
- Asset Manager UI: Needs Review
- Project ownership: Passed
- Asset usage graph: Passed
- Missing-asset detection: Passed
- Relink workflow: Needs Review
- Local audio linking foundation: Passed
- Duplicate detection: Passed
- Duplicate resolution: Needs Review
- Unused-asset detection: Passed
- Safe removal: Passed
- Project Trash: Passed
- Shared assets: Passed
- Project consolidation: Unavailable
- Temporary cleanup: Passed
- Object URL lifecycle: Passed
- Project isolation: Passed
- Project Library integration: Needs Review
- Producer Studio integration: Needs Review
- Existing regressions: Needs Review
- Manual QA: Required

`Needs Review` means the code path exists and its underlying service behavior passed, but the complete interactive path has not yet been manually verified with real project media. Consolidation is intentionally unavailable because the current browser storage model cannot persistently copy every referenced source into a controlled project package. Reveal is also disabled because durable browser file handles are not available.

## Manual acceptance matrix

Status key: **Automated** was covered by the focused browser suite; **Required** needs a real full-application session; **Unavailable** is intentionally disabled and labeled.

1. Open a project with tracks, stems, recordings, and exports — Required
2. Confirm all appear once — Required
3. Confirm shared storage is not double-counted — Automated
4. Inspect an asset's usage — Required
5. Remove a local source file — Required
6. Confirm the asset becomes Missing — Required
7. Confirm referencing Arrangement clips remain visible — Required
8. Relink the source — Required
9. Confirm playback works again — Required
10. Relink with a clearly mismatched file — Required
11. Confirm a warning appears — Automated; UI confirmation Required
12. Create two exact duplicate assets — Automated
13. Confirm Exact Duplicate is detected — Automated
14. Resolve the duplicate — Automated; UI confirmation Required
15. Confirm references point to the retained asset — Required across Pads and Arrangement
16. Find unused generated assets — Automated classification; UI confirmation Required
17. Confirm active Arrangement and Pad assets are not unused — Required
18. Move a safe unused asset to Trash — Automated
19. Restore it — Automated
20. Permanently delete it — Required
21. Confirm cleanup updates storage totals — Required
22. Mark an asset shared — Automated
23. Reference it from another project — Automated
24. Confirm deletion protection — Automated
25. Open a metadata-only track — Required
26. Link a local audio file — Automated service; UI Required
27. Confirm the track becomes playable — Required
28. Confirm provider metadata remains attached — Automated
29. Preview a recording — Required
30. Confirm preview registers with Playback Registry — Required
31. Press Global Stop — Required
32. Confirm preview stops — Required
33. Restart preview locally — Required
34. Confirm restart works — Required
35. Start a Stem job — Required
36. Attempt to remove its source — Required
37. Confirm the action is blocked or deferred — Automated active-job guard; real job Required
38. Export an asset manifest — Automated
39. Confirm no secrets or private paths appear — Automated
40. Switch projects — Required
41. Confirm private assets plus explicit shared assets only — Automated service; UI Required
42. Reload — Required
43. Confirm asset state persists — Required
44. Confirm DITC still works — Required
45. Confirm Decks still work — Required
46. Confirm Stem Lab still works — Required
47. Confirm Arrangement Studio still works — Required
48. Confirm Recording and Export still work — Required
49. Confirm Project Library still works — Required
50. Confirm no visible Asset Manager control silently does nothing — Required

## Known limitations and intentional unavailability

- Project consolidation and Reveal are disabled and labeled; the app does not pretend to copy or reveal files.
- Shared assets are registry references. Another project cannot preview owner-project runtime audio unless that audio is durably available in the current browser session; imported shared references are read-only.
- Local browser files, runtime `AudioBuffer` values, and Blob-backed recordings/exports still require relink after reload unless their owning service has a durable backend reference.
- Exact duplicates require a trustworthy checksum or identical durable reference. Filename/size and metadata matches remain probable/possible evidence, not proof.
- Permanent deletion removes the registry record only. It never claims to delete an external local file or backend output.
- Provider authentication, cloud asset storage, and automatic provider-to-local matching remain out of scope.

## Files and integrations

- `src/project-assets.js`: existing registry extension and asset lifecycle services.
- `app.js`: domain indexing, preview registration, relink propagation, duplicate repointing, UI actions, Project Library and Producer Studio integration.
- `index.html`, `styles.css`: Asset Manager interface and unavailable-state labeling.
- `src/project-library.js`: project asset summaries without opening inactive projects.
- `src/recommendation-engine.js`: real missing/duplicate asset recommendations.
- `tests/project-assets-browser.html`: focused browser regression suite.
- `docs/35-project-asset-audit.md`: pre-implementation asset ownership audit.
