# Working Stem Lab baseline

Baseline branch: `feature/stem-lab-v2`. This audit was completed before Phase 4A behavior changes.

## Current user interface

The Stems navigation item opens a small Stem Lab page with an audio file picker, drop zone, Split Stems button, Stop Preview button, text status, and result cards. Each result card exposes Preview, Deck A, Deck B, Pad, WAV, and Delete. There is no mode or model selector, queue, local timeline, synchronized multi-stem transport, lane mixer, inspector, routing graph, mashup workflow, favorites, cancellation, retry, or diagnostics panel.

The page says the browser fallback creates stems. Those outputs are filtered copies of the full mix and are not isolated stems. The distinction is present in fine print and result quality labels, but an unavailable server silently triggers fallback rather than preserving a failed job for recovery.

## Server and processing flow

- `stem_server.py` serves the static application and accepts one route: synchronous `POST /api/stems`.
- The upload is parsed as multipart form data. The expected field is `audio`.
- The file picker accepts `audio/*`, but the server does not validate extension, MIME type, file size, or request size.
- The configured model defaults to `htdemucs_6s`, overridable with `DECKFORGE_STEM_MODEL`.
- Demucs is discovered in `.venv-stems`, `.venv`, or `PATH`.
- The request blocks until `subprocess.run` completes. There is no job record, queue, concurrency limit, status endpoint, stage reporting, progress percentage, cancellation, or retry.
- Input is written into a unique `TemporaryDirectory` below the repository and removed when the request ends.
- Outputs are copied to `generated_stems/<random-id>/` and are not automatically expired or deleted.
- Public responses expose generated URLs and filenames, not private absolute filesystem paths.
- Filename characters are restricted, although there is no explicit collision policy beyond the unique temporary directory and output ID.

## Stem capability

Demucs output files are discovered dynamically, so the actual stem set depends on the configured model. The default six-source model may produce vocals, drums, bass, guitar, piano, and other. The frontend remaps `other` to `guitarKeys`, creating ambiguous source metadata. There is no capability endpoint, and the UI cannot know which models or stem counts are actually available.

When server processing is unavailable, the browser renders six rough filtered buffers labelled Vocals, Drums, Bass, Guitar, Keys/Synth, and Air/FX. These are frequency-filtered previews, not source separation.

## Errors and lifecycle

- Missing Demucs returns HTTP 503. Missing uploads return 400. Demucs failure or missing output returns 500.
- The frontend catches every server error without displaying its cause and starts browser fallback.
- Decode and output-fetch failures are also reduced to the same fallback message.
- There is no unsupported-format message, missing-output recovery, backend health display, or retained failure state.
- Temporary inputs are cleaned by `TemporaryDirectory`; generated outputs have no cleanup policy.
- The development server has no authentication and binds all interfaces by default. Combined with no upload limit, this is unsafe to expose outside a trusted local machine.

## Playback and destinations

- One `AudioBufferSourceNode` and gain node are used for both DITC and stem preview ownership. Starting a preview stops the previous preview.
- Stem preview is registered as `stems-preview` in the shared Playback Registry and Global Stop reaches it.
- The registry reports only the source track name and does not identify the selected stem, muted/soloed stems, loop state, or playback time.
- Individual stems can load into Deck A or Deck B through the existing deck engine and can fill a pad through the existing pad engine.
- Stem buffers appear in the Arrangement source bin and can be dragged to the timeline, but there is no direct Send to Arrangement action.
- No direct Beat Forge or Harmony Lab routing exists.
- Loading a stem onto a playing deck pauses and replaces that deck without a confirmation prompt.
- `addBufferToPad` replaces Pad 1 if every pad is occupied, so the stem action can overwrite an assignment without confirmation.

## Existing intelligence

Project Intelligence reports separated source name, available stem names, selected-preview state, and basic mashup candidates. Contextual Recommendations can suggest previewing a prepared stem. Creative Missions can open Stem Lab and gate remix/mashup steps on stem count. There is no AI Stem Graph, graph prompt plan, stem-aware Producer Memory preference, direct mission service call, or undoable recommendation application.

## Known risks and placeholders

- Synchronous processing can tie up one request thread for a long operation.
- Unlimited concurrent requests can start unlimited Demucs processes.
- Request bodies are read fully into memory and have no size limit.
- Generated outputs accumulate indefinitely.
- There is no cancellation, retry, relink, persistence, or missing-file detection.
- Browser pseudo-stems can be mistaken for real isolation.
- Result card markup does not escape server-derived names.
- Multi-stem playback, waveforms, mix controls, exports for stem groups, live deck stem controls, Smart Mix stem execution, routing, and mashup controls are absent rather than functional.
- The documentation mentions source rights and lifecycle expectations, but the implementation does not enforce retention or authorization.

