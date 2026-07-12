# Working DITC baseline

Baseline commit: `4352e00`. This map was completed before Phase 1B changes.

## Import path

- `setupDropZone` handles dragover, dragleave and drop events on `#sourceDrop`.
- `collectSupportedDropFiles` reads dropped `File` objects and WebKit file-system entries.
- `collectEntryFiles`, `readAllDirectoryEntries` and `entryToFile` recursively traverse folders where the browser supports `webkitGetAsEntry`.
- `isSupportedAudioFile` accepts `.mp3`, `.wav`, `.wave`, `.aif`, `.aiff`, `.flac`, `.m4a`, `.aac` and `.alac`, or a browser-reported `audio/*` MIME type.
- `addLocalSourceFile` creates an in-memory track with an ID, filename, folder path, `File`, optional decoded buffer, optional analysis and notes.
- Local files do not use object URLs. They are decoded on demand by `getSourceFileBuffer` and `loadAudioFile`.

## Rendering and actions

- `renderSources` renders local files from `sourceFiles` and URL references from `deckforge-sources`.
- `handleSourceFileAction` loads local buffers onto Deck A, Deck B, pads or Stem Lab, and deletes local entries.
- `handleSavedSourceAction` attempts CORS decoding for saved direct-audio URLs and supports the same destinations.
- `deleteLocalSourceFile` removes an in-memory entry. `deleteSavedSource` rewrites localStorage.
- `selectedCrateItems`, `crateSelection.local` and `crateSelection.saved` provide multi-selection to analysis and Smart Mix.

## Analysis and persistence

- `analyzeAudioBuffer` estimates duration, BPM, key, energy, genre, mood, vocal density, percussion intensity, intro and outro suitability.
- Local analysis and notes remain in memory.
- URL references, notes and analysis persist under `deckforge-sources`.
- Local audio cannot survive refresh because browser `File` objects are not persisted.

## Preview and cleanup

Crate content can be decoded and sent to the shared `playBufferPreview` path, which owns one preview source through `stemState.previewSource`. Starting another shared preview stops the previous source. `panicStopAllAudio` calls `stopStemPreview`, so Global Stop All Audio stops that preview.

## Known limitations

- Rows are large and action-heavy.
- There is no dedicated crate preview identity, explicit Stop Preview action, search, sorting, collections, favorites, tags or selected-track inspector.
- Duplicate files are accepted.
- Decode and folder-permission failures have limited user-facing detail.
- Local metadata is derived from filenames and audio analysis only. Embedded tags and artwork are not parsed.
- Folder traversal is browser-specific.
- Saved provider links are references and are usually not directly playable.
- No object URLs are created for local tracks, so the baseline object URL count is zero.

Run `docs/13-ditc-regression-checklist.md` after every DITC change.
