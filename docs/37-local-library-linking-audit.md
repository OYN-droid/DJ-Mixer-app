# Local Music Library Linking audit

Date: 2026-07-18  
Branch: `feature/local-music-library-linking`

## Current implementation

DeckForge currently has one project-scoped, session-only local music path in DITC. The user can select audio files with `#ditcFileInput`, select a folder with the non-standard `webkitdirectory` input `#ditcFolderInput`, or drag files/folders onto `#sourceDrop`. `collectSupportedDropFiles()`, `collectEntryFiles()`, and `readAllDirectoryEntries()` recursively enumerate explicitly dropped entries. No unrestricted filesystem scan occurs.

`addLocalSourceFile()` creates the in-memory DITC track, restores user metadata by a file/folder-derived storage key, and registers an `Audio Track` with `DeckForgeProjectAssets`. `getSourceFileBuffer()` lazily calls `loadAudioFile()` on first playback or analysis. That method reads the complete file and asks the existing Web Audio context to decode it. Initial DITC import does not decode every file, but an extension or `audio/*` MIME match is currently sufficient to show the row as playable before decode is verified.

Local preview, Deck loading, Smart Mix, Pads, Stem Lab, and Arrangement reuse the in-memory DITC source. DITC preview is registered with `AudioPlaybackRegistry`, so Global Stop owns it and local restart creates a new source. Asset Manager is the authoritative project asset, duplicate, missing, safe-removal, sharing, and relinking service.

## Files and functions

- `index.html`: DITC file/folder inputs and drop surface; no local-library settings or match-review interface.
- `app.js`: `isSupportedAudioFile`, `collectSupportedDropFiles`, `addLocalSourceFile`, `getSourceFileBuffer`, `inferDitcMetadata`, `persistDitcTrack`, `handleSourceFileAction`, `handleAssetRelinkFile`, and provider-reference rendering/actions.
- `src/project-assets.js`: project asset authority, duplicate evidence, missing state, metadata links, sharing, Trash, validation, and sanitized manifest export.
- `src/provider-foundation.js`: global provider registry and Local Files adapter; it searches only DITC files already imported into the active browser session.
- `src/audio/playback-registry.js`: audible source ownership and Global Stop.
- `src/project-registry.js`: immutable project ownership and project-scoped storage keys.

## Supported file types and capability detection

The DITC allow-list is MP3, WAV/WAVE, AIFF/AIF, FLAC, M4A, AAC, and ALAC. Drag/drop also filters through this list. Ogg, Opus, and WebM audio are accepted by the Stem backend but not DITC. Browser decode capability is not checked during import. MIME values may be empty and are supplied by the browser/OS rather than an embedded metadata parser. A decode failure is reported only when playback or analysis is attempted.

## Folder access and permission behavior

- Folder input uses `webkitdirectory`; dropped folders use `webkitGetAsEntry()` where available.
- Access is explicitly initiated by the user and lasts only while the selected `File` objects remain in memory.
- No `showDirectoryPicker`, `showOpenFilePicker`, `FileSystemFileHandle`, or `FileSystemDirectoryHandle` usage exists.
- There is no normalized permission state, reauthorization workflow, external-drive root state, directory watcher, or incremental refresh.
- A reload cannot restore file bytes or permission. DITC metadata remains, but local files must be selected again.

## Persistence and object URLs

DITC user metadata is stored per project in localStorage. Project Asset records persist JSON-safe browser-file metadata, not file handles or audio. Local `File`, `AudioBuffer`, nodes, and previews are runtime-only. Local playback does not require an object URL. Recording/export services own their temporary object URLs and revoke replacements; download helpers revoke temporary URLs. No local audio blob or object URL is persisted by DITC or Asset Manager.

There is no IndexedDB database, Origin Private File System storage, backend local-library database, desktop-wrapper bridge, or serializable file-handle store.

## Metadata parsing and analysis

`inferDitcMetadata()` supports only the cautious filename form `Artist - Title.ext`; otherwise the filename becomes the title and artist/album remain unknown. Folder structure is stored for search/display but is not parsed into artist/album. No ID3, Vorbis, MP4, RIFF, AIFF, artwork, composer, ISRC, track/disc number, or embedded BPM/key parser is installed. User edits stored by `persistDitcTrack()` outrank later filename inference for the same storage key. BPM/key/genre/energy analysis is a separate explicit full-decode action and is not run during import.

## Playlist and Music application support

No M3U, M3U8, PLS, XML, JSON-library, CSV, iTunes, or Music.app library parser exists. No private Music application container is accessed. Users can select genuinely accessible audio files from a Music Media folder through normal browser file/folder permission, but DeckForge cannot distinguish local, cloud-only, subscription-protected, or DRM-protected Music library entries from an exported library database.

## Matching and provider links

Provider URLs persist as project-scoped `Provider Metadata Reference` assets. Asset Manager supports manual metadata-to-local-audio linking and preserves provider attribution. There is no automatic candidate search, deterministic score, match evidence, version conflict detection, bulk matching, rejection record, or match-review UI. The provider foundation groups search results conservatively by ISRC/title/artist/duration and version class, but that grouping is not a local-library linking engine.

## Duplicate and missing handling

- DITC prevents the same runtime import when name, size, modification time, and folder path produce the same storage ID.
- Asset Manager can classify exact checksum/durable-reference duplicates and weaker size/duration/metadata evidence. DITC does not compute checksums during import.
- Runtime files disappear on reload. Asset metadata and references persist, and Asset Manager can mark/relink them, but there is no library-root-level offline state or root reauthorization.
- Arrangement and provider references are preserved during Asset Manager relinking; uncertain replacement selection is manual.

## Known broken, placeholder, and unavailable behavior

- “Import Folder” is functional only for the current browser session; it is not a durable indexed library.
- File rows can appear playable before the browser has successfully decoded them.
- Reveal is disabled because no durable browser handle exists.
- Provider cards other than Local Files are honest unavailable foundations; no remote provider audio is imported.
- Apple Music, Spotify, SoundCloud, and YouTube metadata can be linked manually, but no automatic version-aware suggestions exist.
- Full-disk scanning, private Music.app access, DRM audio extraction, provider authentication, directory watching, XML/PLS/CSV import, and desktop filesystem paths are unavailable.

## Security and privacy risks

- Browser-supplied relative folder paths are stored in DITC metadata and can expose user-created folder names inside that project. Asset manifests sanitize private absolute paths.
- File objects grant runtime access to explicitly selected content; they must not be copied into localStorage, logs, diagnostics, provider payloads, or project exports.
- The optional fingerprint-recognition configuration remains a separate pre-existing browser-local API-key risk and must not be reused for local matching.
- Any new library index must exclude raw audio, temporary object URLs, credentials, unsupported serialized handles, and unnecessary absolute paths.

## Required Phase 5B.2 boundary

Phase 5B.2 should add one global/user-scoped local-library index and permission model that bridges into existing project assets and DITC, a lightweight explicit-selection indexer, safe index import/export, real M3U/M3U8 support if implemented, deterministic version-aware provider matching, project-scoped confirmation/rejection records, and a review UI that reuses Asset Manager and Playback Registry. Unsupported persistent handles, Music XML, private application access, watching, and DRM workflows must remain visibly unavailable.
