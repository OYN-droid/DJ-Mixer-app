# Connected Provider Foundation regression checklist

Date: 2026-07-18  
Branch: `feature/connected-provider-foundation`

## Outcome

Phase 5B.1 adds one normalized provider foundation and Connected Music Browser to DITC. Local Files is functional against files explicitly imported into the active browser session. The remaining provider cards are capability-aware, honestly unavailable foundations: no account connection, remote catalog search, preview, download, or native playback is claimed.

The focused browser suite verifies the service contract and project boundary. Full-application testing with real media remains required. Rendered provider cards, badges, and notices are not treated as evidence of provider access or playable audio.

## Automated browser test

Run from the repository root while the local static server is available:

```sh
open http://127.0.0.1:8000/tests/provider-foundation-browser.html
```

Automated coverage:

- built-in registration and explicit capability matrices;
- honest unavailable provider status and unsupported-method errors;
- real Local Files search normalization;
- concurrent search with partial rate-limit failure;
- ISRC/metadata grouping, native-source priority, and version-safe deduplication;
- cancellation and rejection of late results after project ownership changes;
- project-scoped import and cross-project import rejection;
- recursive secret removal and credential/signed-URL sanitization;
- offline Local Files behavior and connected-provider network errors;
- connection transitions for a test adapter and sanitized diagnostics.

Headless Chrome result on 2026-07-18: `PASS`, 18 checks. The existing Project Asset Manager browser suite also remained `PASS` with 17 checks. A complete-app headless startup smoke loaded all provider and application scripts, rendered the project-first library state, and reported no JavaScript exception in the browser log.

## Status report

- Provider model and registry: Passed
- Capability model: Passed
- Adapter contract: Passed
- Connection-state service: Passed with test adapter; real accounts Unavailable
- Search coordinator: Passed
- Cancellation and stale-result protection: Passed
- Normalized results and errors: Passed
- Grouped availability and version-safe deduplication: Passed
- Project isolation: Passed at service boundary
- Secret and public-URL sanitization: Passed
- Local Files adapter: Passed at service boundary; UI Needs Review
- Connected Music Browser UI: Needs Review
- DITC metadata import: Needs Review
- Asset Manager local-audio linking reuse: Needs Review
- Apple Music: Foundation only; account/search/playback Unavailable
- Spotify: Foundation only; account/search/playback Unavailable
- SoundCloud: Foundation only; account/search/playback Unavailable
- YouTube and YouTube Music: Foundation only; account/search/playback Unavailable
- Cloud storage and record pools: Foundation only; Unavailable
- Existing Decks, Global Stop, Arrangement, Stem, recording, and export regressions: Needs Review
- Manual QA: Required

`Needs Review` means the integration code exists but has not completed a real-media, full-application manual pass. `Unavailable` means no adapter method is exposed and the UI labels the limitation; it does not return fake data or success.

## Manual acceptance matrix

Status key: **Automated** is covered by the focused suite; **Required** needs the full application and appropriate real media/account conditions; **Unavailable** is intentionally disabled.

1. Open a project and import a real local audio file — Required
2. Search for that file in Connected Music Browser — Automated service; UI Required
3. Confirm one normalized Local Files result — Automated service; UI Required
4. Preview it and confirm audible output — Required
5. Load it to Deck A and Deck B through existing DITC controls — Required
6. Press Global Stop and confirm provider/local preview stops — Required
7. Restart locally and confirm playback resumes — Required
8. Confirm provider search never auto-loads a deck — Required
9. Add a public Spotify or Apple Music reference — Required
10. Confirm it is labeled external/metadata and not native playable — Required
11. Confirm no Try Deck action appears before local linking — Required
12. Open the public reference externally — Required
13. Link the metadata reference to a real local audio file in Asset Manager — Required
14. Confirm provider metadata remains attached — Automated service; UI Required
15. Confirm the linked local audio becomes playable — Required
16. Add the same provider URL again — Required
17. Confirm duplicate persistence is prevented — Required
18. Search two providers where one fails — Automated
19. Confirm successful results remain and failure is named — Automated service; UI Required
20. Cancel an in-flight search — Automated service; UI Required
21. Confirm cancelled or late results never enter the active project — Automated
22. Switch projects during a search — Required
23. Confirm no search results or imports leak into the new project — Automated service; UI Required
24. Return to the original project and confirm its imported references persist — Required
25. Disconnect a configured test provider and confirm account summary changes — Automated
26. Confirm Apple/Spotify/SoundCloud/YouTube Connect controls are absent — Required
27. Confirm their cards state Coming Later or configuration unavailable — Required
28. Confirm unsupported search does not return sample results — Automated
29. Go offline with a local file still in memory — Required
30. Confirm Local Files search and playback still work — Automated search; playback Required
31. Confirm network providers report offline/unavailable — Automated service; UI Required
32. Reload the page — Required
33. Confirm public metadata references restore — Required
34. Confirm runtime-only local audio requests relink rather than faking playback — Required
35. Inspect provider localStorage and project manifest — Required
36. Confirm no access token, refresh token, password, client secret, signed parameter, or Authorization value persists — Automated sanitizer; storage inspection Required
37. Open Provider Settings — Required
38. Confirm capability explanations and limitations are visible — Required
39. Clear provider cache and confirm project references remain — Required
40. Confirm Decks still play real local audio — Required
41. Confirm Arrangement playback still works — Required
42. Confirm Stem Lab still works for supported local audio — Required
43. Confirm recording/export paths still produce real files — Required
44. Confirm no visible provider control silently succeeds or performs a placeholder action — Required

## Known limitations and intentional unavailability

- No remote music account is connected in Phase 5B.1. Provider SDKs, OAuth callbacks, secure token storage, catalog proxies, account libraries, and playlist sync are not implemented.
- Local Files searches only files the artist explicitly imported into the current browser session. DeckForge does not scan the filesystem or Music.app library.
- Provider metadata does not confer audio rights or availability. Native playback, download, analysis, stems, arrangement use, and export require a real supported audio source.
- Search cache contains sanitized metadata only. It is global and disposable; project references are stored separately under the active project namespace.
- The pre-existing optional fingerprint configuration still accepts a browser-stored API key and remains unsuitable for production secrets. It is separate from provider connections and was not expanded by this phase.

## Files and integrations

- `src/provider-foundation.js`: registry, adapters, capabilities, connection state, search, normalization, cache, errors, and diagnostics.
- `app.js`: DITC integration, project ownership bridge, metadata import, external actions, and Asset Manager linking.
- `index.html`, `styles.css`: Connected Music Browser and Provider Settings UI.
- `tests/provider-foundation-browser.html`: focused service regression suite.
- `docs/36-connected-provider-audit.md`: pre-implementation audit.
- `docs/adr/ADR-005-connected-provider-foundation.md`: architecture decision.
