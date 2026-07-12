# Current state audit

Audit basis: repository contents at `05a99fd`, reviewed on 2026-07-12. No browser audio claims are made.

## Repository inventory

| File | Purpose and responsibility | Major contents | Dependencies |
| --- | --- | --- | --- |
| `index.html` | Static application shell and all eight views | Decks, mixer, sampler, drums, keys, stems, editor, AI, crate controls | `styles.css`, `app.js`, browser DOM |
| `styles.css` | Entire visual system and responsive layout | Tokens, navigation, decks, mixer, pads, sequencer, keyboard, stem cards, editor, AI and crate rules | CSS features only |
| `app.js` | Application state, rendering, event wiring, audio engine and local analysis | About 200 functions, objects described below | Web Audio, MediaRecorder, media capture, Canvas, drag and drop, File, Blob, Fetch, localStorage |
| `stem_server.py` | Static server and optional Demucs separation API | `DeckForgeHandler`, `safe_name`, `demucs_command`, `stem_name` | Python standard library, external `demucs` executable |
| `.gitignore` | Excludes generated and machine-local files | Virtual environments, caches, generated stems, `.DS_Store` | Git |
| `.DS_Store` | Untracked operating-system metadata | No application responsibility | None |

## Frontend responsibilities

`app.js` is a single global script. Its main groups are:

- Audio and decks: `AudioEngine`, `createDeckState`, `connectDeck`, `makeSource`, load, play, pause, cue, seek, loop, scratch, waveform and selection functions.
- Sampler: `sampler`, pad rendering, triggering, region editing, slicing and crate export.
- Arrangement: `editorState`, source bin, clip editing, scheduling and performance recording.
- AI and analysis: local prompt planning, mixtape analysis, heuristic BPM, key and genre inference, fingerprint provider adapters and Smart Mix planning.
- Instruments: drum presets and synthesis, keyboard and bass synthesis.
- Stems: server request, browser filtering fallback, previews and WAV export.
- Crate: local in-memory files, URL entries in localStorage, analysis, notes and load actions.
- Wiring: `setupEvents`, drop-zone helpers and immediate startup rendering.

## Globals and browser APIs

Top-level mutable sources include `AudioEngine`, `deckState`, `sampler`, `sourceFiles`, `editorState`, `crateSelection`, `stemState`, `aiPlanState`, `aiSearchResultsState`, `mixtapeInspirationState`, `mixtapeReferenceState`, `AudioIdentificationService`, `autoMixState`, `drums` and `instrument`. Preset catalogs are also global.

Browser APIs include `AudioContext`, `OfflineAudioContext`, Canvas 2D, `requestAnimationFrame`, timers, `MediaRecorder`, `navigator.mediaDevices.getUserMedia`, `getDisplayMedia`, `File`, `FileReader`, `Blob`, object URLs, Fetch, drag and drop including WebKit directory entries, `crypto.randomUUID`, DOM events and localStorage.

## Storage and integrations

- `deckforge-sources` stores URL crate entries, names, notes and analysis. Local `File` objects and decoded buffers are memory-only.
- `deckforge-ditc-metadata` stores local-track favorites, tags, notes, edited text metadata and analysis, keyed by file identity. Audio files remain memory-only.
- `deckforge-id-acrcloud`, `deckforge-id-audd`, `deckforge-id-acoustid` and `deckforge-id-custom-fingerprint` may hold provider endpoint configuration. The code can read `apiKey` and send it as a bearer token. This is insecure for shared browser profiles and should be replaced by server-side secret handling.
- `/api/stems` accepts multipart field `audio`. Success returns `{ stems: [{ id, name, fileName, url }] }`.
- `/generated_stems/<job>/<file>` is served statically by the Python server.
- Direct audio URLs use CORS fetch. Spotify, Apple Music, YouTube, SoundCloud and Bandcamp are detected only for labels. No provider SDK playback exists.

## Backend details

`DeckForgeHandler.do_POST` exposes only `POST /api/stems`; other POST paths return 404. The server writes the upload to a temporary directory, invokes Demucs with `DECKFORGE_STEM_MODEL` or `htdemucs_6s`, copies WAV results into `generated_stems`, and returns public paths. `PORT` defaults to 8000. Upload size is trusted from `Content-Length`; there is no authentication, rate limit, file-size limit, timeout, job cleanup policy or explicit CORS policy.

## Known coupling

- Audio state and UI values are coupled through direct selectors. Gain is the product of deck trim and channel fader. Two crossfaders mirror each other.
- Global BPM drives drums, pad quantization, arrangement snapping and AI planning.
- Crate, decks, stems, pads, drums and keys all feed editor and AI context.
- Smart Mix mutates deck buffers, pitch, filters, faders and crossfader, and it owns timers shared in `autoMixState`.
- Many render functions replace DOM content, while state is stored separately. Some UI text is also read back as data, such as deck titles.
- Startup calls all setup and rendering functions immediately. One missing expected element can prevent later initialization.

## Recovery conclusion

Git commit `05a99fd` is the safe pre-change snapshot. The recovery branch points to it. Backup source copies are unnecessary and are not loaded by the application.
