# Gradual modularization plan

Keep behavior stable and move one tested domain at a time. Introduce ES modules only after a static-server compatibility check.

| Proposed module | Exact current functions and responsibilities to move |
| --- | --- |
| `src/core` | `clamp`, `formatTime`, `createId`, app version, development logging, startup, shared error reporting |
| `src/audio` | `AudioEngine`, playback registry, `clipAudioBuffer`, preview ownership, WAV conversion, global stop and master routing |
| `src/decks` | `createDeckState`, `connectDeck`, `makeSource`, load/play/pause/stop/cue/seek/nudge/clear, gain, crossfader, waveform, selection and scratch functions |
| `src/ditc` | Crate selection, local/saved analysis, mixtape discovery, fingerprint aggregation, section search and assisted discovery |
| `src/drums` | `drums`, machine/preset catalogs, sequencer rendering, preset application, scheduler and drum voice synthesis |
| `src/keys` | `instrument`, synth catalogs, keyboard rendering, bass mode, note/chord playback and voice cleanup |
| `src/pads` | `sampler`, pad rendering, triggering, quantization, region editor, slicing, crate export and media sampling |
| `src/stems` | `stemState`, file loading, server split, browser fallback, result rendering, preview and stem actions |
| `src/producer` | `editorState`, editor source bin, timeline rendering, clip editing, scheduling, performance capture and AI suggestions |
| `src/providers` | `AudioIdentificationService`, provider configuration, endpoint requests, result normalization and platform detection |
| `src/ui` | `switchView`, `setupEvents`, drop-zone adapters, status helpers, DOM guards and accessible control state |

## Safe extraction order

1. Extract pure utilities and add unit tests.
2. Add a central playback registry without changing graphs.
3. Extract crate provider adapters, which have narrow boundaries.
4. Extract drums and keys after audio smoke tests.
5. Extract pads and stems.
6. Extract decks only after manual transport and crossfader tests are repeatable.
7. Extract editor and Smart Mix last because they depend on nearly every domain.

Each extraction should be one focused commit, preserve global compatibility temporarily, and include a rollback note. Avoid simultaneous markup, styling and audio changes.
