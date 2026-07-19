# Local Music Library Linking regression checklist

## Automated browser contract

Open `tests/local-library-browser.html` from the DeckForge local server. A passing run reports `PASS` for explicit indexing, unsupported formats, project asset registration, duplicate prevention/grouping, exact and conflict matching, bulk review boundaries, disconnect/reauthorization, M3U import, sanitized export/import, project isolation, and diagnostics redaction.

## Manual regression matrix

Use a project containing at least one short, known-good WAV or MP3 and one metadata-only provider reference. Record the browser and sample files used; do not infer success from a status message.

| # | Check | Expected evidence | Status |
|---:|---|---|---|
| 1 | Startup project boundary | Project Library opens when no project route is active | Untested |
| 2 | Open an existing project | DITC state is restored only for that project | Untested |
| 3 | Select Audio Files | A library card and real DITC row appear | Untested |
| 4 | Select Music Folder | Only explicitly selected folder contents are considered | Untested |
| 5 | Drag files to DITC | Drop routes through the same index service | Untested |
| 6 | No unrestricted scan | No permission or files outside the selection are requested | Code verified |
| 7 | Playable count | Count equals supported, authorized runtime files | Untested |
| 8 | Unsupported file | File is indexed unavailable; no playable action is shown | Untested |
| 9 | First preview | Real decode succeeds and audible output plays | Untested |
| 10 | Decode failure | Row reports failure; no fake playback state | Untested |
| 11 | Deck A load | Indexed track loads and plays on Deck A | Untested |
| 12 | Deck B load | Indexed track loads and plays on Deck B | Untested |
| 13 | Global Stop | DITC preview and both decks stop | Untested |
| 14 | Arrangement handoff | Indexed local track can create a playable clip | Untested |
| 15 | Stem handoff | Authorized local track reaches real Stem Lab input | Untested |
| 16 | Duplicate selection | Reselecting the same file does not add a second index row | Untested |
| 17 | Duplicate copy | Similar copies are grouped, not deleted or silently merged | Untested |
| 18 | Manual Refresh | Refresh uses authorized runtime files or asks for permission | Untested |
| 19 | Browser restart | Metadata remains; audio becomes Permission Required | Untested |
| 20 | Reauthorize | Reselecting files restores DITC and asset runtime links | Untested |
| 21 | Disconnect | Metadata remains and playback actions disappear | Untested |
| 22 | Missing external drive | Library reads Disconnected/Missing without data loss | Untested |
| 23 | M3U import | Entries import as metadata and missing until reauthorized | Untested |
| 24 | Unsupported playlist | Import is rejected with an honest message | Untested |
| 25 | Apple Music explanation | UI states local unprotected files only | Code verified |
| 26 | DRM/cloud-only item | No bypass or fake playable state is offered | Code verified |
| 27 | Local search | Title, artist, album, filename, and path metadata are searchable | Untested |
| 28 | Playable filter | Only authorized supported tracks appear | Untested |
| 29 | Missing filter | Permission-required/missing tracks appear | Untested |
| 30 | Duplicate filter | Duplicate-group candidates appear | Untested |
| 31 | Existing assets library | Current project audio assets are indexed without copying audio | Untested |
| 32 | Provider reference match | Review dialog shows ranked evidence | Untested |
| 33 | Exact match | ISRC or aligned title/artist/duration is labeled Exact | Untested |
| 34 | Live conflict | Live versus studio remains Version Conflict | Untested |
| 35 | Remix conflict | Remix versus original remains Version Conflict | Untested |
| 36 | Clean/explicit conflict | Conflict requires explicit confirmation | Untested |
| 37 | Duration conflict | Material duration difference is not auto-selected | Untested |
| 38 | Reject candidate | Rejected candidate stays out of subsequent results | Untested |
| 39 | Confirm candidate | Provider asset links to the selected local asset | Untested |
| 40 | Unlink provider | Both records remain; playback returns to metadata/external state | Untested |
| 41 | Bulk matching | Only exact candidates enter confirm batch | Untested |
| 42 | Bulk cancellation/project switch | Late work cannot write to the new project | Untested |
| 43 | Asset Manager status | Linked provider metadata reads Local Audio Linked | Untested |
| 44 | Asset Manager review | Review Local Matches opens the same match flow | Untested |
| 45 | Asset relink fallback | Choose Different File uses existing Asset Manager relink | Untested |
| 46 | Export index | JSON has metadata but no binary, handle, object URL, or secret | Untested |
| 47 | Import index | Imported rows require explicit reauthorization | Untested |
| 48 | Project isolation | Project A confirmations do not appear in Project B | Untested |
| 49 | Diagnostics | Counts/errors are useful and contain no sensitive path/secret data | Untested |
| 50 | Existing provider/asset tests | Provider and Project Asset browser suites still pass | Untested |

## Capability truth

Complete in Phase 5B.2: explicit files/folder indexing, normalized metadata index, runtime-only file ownership, manual refresh/reauthorization, M3U/M3U8 metadata import, existing-project-asset index, deterministic version-aware review, project-scoped confirmations, sanitized index export/import, DITC and Asset Manager integration.

Partial: metadata comes from filename/folder inference or supplied export data; browser-reported codec support is verified by decode only on first actual use; duplicate copies use metadata evidence rather than content checksums.

Unavailable: unrestricted disk scanning, automatic directory watching, durable browser directory handles, embedded tag/artwork parsing, checksum workers, private Apple Music database access, cloud-only or DRM playback, PLS/XSPF/XML playlist parsing, and authenticated provider workflows.
