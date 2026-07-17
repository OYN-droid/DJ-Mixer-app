# Recording and export baseline

Baseline branch: `feature/recording-mixdown-export`. This audit reflects the code before Phase 4C changes.

## Audio graph and master recording

`AudioEngine.init` creates one `MediaStreamAudioDestinationNode`. The existing audible graph is `domain source → AudioEngine.masterAnalyser → AudioEngine.masterGain → AudioContext.destination`, with the same `masterGain` also connected once to the recording destination. Decks, Pads, Beat Forge, Harmony Lab, Stem Lab, Arrangement Studio, and the metronome all route into `masterAnalyser`. This is the correct post-master capture point and there is no second master bus.

`toggleMixRecording` creates a browser `MediaRecorder` from that destination stream, collects chunks, creates one Blob when stopped, revokes the previous URL, and exposes the newest URL through `AudioEngine.mixUrl`. It does not detect MIME support, validate size/duration, name or retain takes, expose pause/cancel, persist metadata, or distinguish a failed/empty recording. The download button always uses `deckforge-mix.webm`, even if the browser selected another MIME type.

Global Stop reaches the `mix-recording` Playback Registry adapter and calls `MediaRecorder.stop`, so an active take is finalized rather than deliberately discarded. The UI does not explain this behavior and the recorder is not normalized into project history.

## Domain recording

- Pads and Arrangement Studio share structured performance-event capture. These are real editable events, not audio recordings.
- Harmony Lab records real note events into its pattern.
- Beat Forge reports a recording state for its pattern workflow, but has no audio-file recording export.
- Deck A/B have no isolated MediaRecorder destination.
- Smart Mix and Arrangement can be captured only as part of the real master output.
- Microphone and tab capture use separate temporary MediaRecorders that decode their result directly into Pads. They do not retain a recording-library item.

## Existing exports

- Stem Lab acapella/instrumental export offline-mixes real aligned `AudioBuffer` stems and writes a real 16-bit PCM WAV.
- Individual Stem Lab download writes a real 16-bit PCM WAV.
- Beat Forge export writes pattern JSON only; it is not audio.
- Arrangement Studio exports a real project JSON and text cue sheet. Audio rendering is explicitly unavailable.
- DITC exports a JSON metadata track list.
- Producer Memory exports JSON.
- Mixtape analysis packages selected reference clips as actual WAV data inside a structured project package.
- The master recording download is a real browser-native Blob, but its extension is hard-coded.

There is no backend mix renderer or audio encoder route. `stem_server.py` only provides the static application and Demucs stem jobs. Browser-native MediaRecorder plus existing OfflineAudioContext stem mixing are the only dependable audio finishing capabilities.

## Risks and missing behavior

- Recording state is split between `AudioEngine`, Arrangement event capture, Pads, Beat Forge, and Harmony Lab.
- Only the latest master Blob URL survives in memory; refresh loses it and no relink record remains.
- Completed Blob data is not validated and an empty take can be presented as downloadable.
- The real MediaRecorder codec is not surfaced and can disagree with the `.webm` filename.
- There is no project-scoped recording or export history, retry/cancel model, metadata editor, tracklist/cue-sheet service, project delivery package, peak analysis, or object-URL diagnostics.
- Download helpers correctly revoke short-lived metadata/WAV URLs, but `AudioEngine.mixUrl` lives until replaced and is not revoked on deletion or unload.
- Stem export history stores metadata but not a reopenable output reference.
- Arrangement export fires two browser downloads with no normalized job or recoverable failure state.
- Offline Arrangement audio rendering would omit symbolic performance material and is therefore correctly disabled.
- No code provides MP3, FLAC, M4A, loudness normalization, LUFS, true peak, dither, or metadata embedding.

