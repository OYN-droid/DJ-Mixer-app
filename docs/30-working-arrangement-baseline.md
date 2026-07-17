# Working Arrangement baseline

Baseline branch: `feature/arrangement-studio`. This audit was completed before Phase 4B behavior changes.

## Current interface and state

The navigation item labelled Editor opens a page titled Mixtape Editor. It has Play, Pause, Stop, Restart, performance Record/Overdub, Add Track, Snap, Zoom, playhead, event quantize, Split, Duplicate, Loop, Quantize, Delete, a flat source bin, four fixed timeline rows, and a clip inspector.

`editorState` is an in-memory legacy model with `tracks`, `clips`, one selected clip ID, snap, zoom, playhead, playback flags, scheduled nodes, pointer-drag state, and one active performance recording. It has no arrangement ID, project ID, normalized lanes, markers, transitions, automation, versions, export state, persistence status, or command history.

The fixed rows are Songs/Main Decks, Vocals/Acapellas, Pads/Drops/Scratches, and Drums/Keys/FX. Rows have labels only; lane mute, solo, arm, volume, pan, lock, output routing, and collapse state do not exist.

## Clip model and editing

Legacy clips use `id`, `source`, `sourceKind`, `sourceId`, `type`, `name`, numeric `trackIndex`, `start`, `duration`, `sourceStart`, `volume`, fades, stretch, loop, filter, EQ tilt, effect, color, and optional performance events. Some paths create clips directly and omit fields used by other paths. Some source objects retain raw `AudioBuffer` references.

Source-bin clips are draggable and local files can be dropped directly. Existing clips can be dragged horizontally and between rows. Inspector controls edit start, duration, volume, fades, stretch, filter, EQ, mute, solo, and effect. Split always cuts a clip in half rather than at the authoritative playhead. There are no trim handles, multi-selection, copy/paste, grouping, locking, keyboard editing, undo, or redo.

The displayed clip rectangles contain names and time labels. They do not render waveforms, so there is no fake waveform data. The ruler displays bar numbers from the fixed project BPM.

## Playback

`playEditorArrangement` uses the shared `AudioEngine` context and schedules buffer clips, rendered Beat Forge events, Harmony events, pad events, and recorded performance events against one `startAt` time. Buffer clips use Web Audio sources, low-pass filters, gains, fades, playback rate, and optional looping. Global Stop reaches `stopEditorArrangement` through the shared Playback Registry.

The scheduler is the only arrangement scheduler, but the authoritative playhead does not advance during playback. Pause therefore preserves the old UI playhead rather than elapsed playback time. There is no timeline loop region, automatic end state, metronome, active-clip reporting, seek-while-playing restart, lane mute/solo, or scheduler error state. Performance event voices are scheduled by the domain renderers and are not all represented in `editorState.scheduled`, which weakens cancellation guarantees for future long voices.

## Source integrations

- Playable DITC tracks, Deck A/B buffers, Pads, Stem Lab stems, current Beat Forge state, current Harmony state, local files, and marker-like transition/drop entries appear in one source bin.
- DITC source duration falls back to 180 seconds when neither a buffer nor analysis duration exists. This can create a playable-looking clip from metadata that is not linked to audio.
- Deck sources reference the current deck buffer; replacing the deck can make an arrangement clip resolve to different audio.
- Pad references use the current pad index and can become stale when the bank changes.
- Beat Forge clips adapt the canonical pattern to real scheduled drum events.
- Harmony clips adapt the current state to real synth events. One Harmony send path constructs its clip independently from the common clip creator.
- Stem clips reference current in-memory stem buffers. Synchronized group metadata can be carried on the source, but group movement is not implemented.
- Transition markers are generic non-audio marker sources. There is no normalized transition model or transition editor, and they do not invoke the shared transition controller.

## Recording and export

Performance recording captures real drum, key, and pad events with timestamps, velocity, duration, and domain metadata, then creates an editable event clip. It does not create master audio, take management, punch recording, or deck-specific recordings. The global mix recorder can produce a real MediaRecorder blob, but it is not managed as an Arrangement take.

Arrangement has no project-file export, cue sheet, tracklist, offline audio render, export readiness validation, or arrangement-specific recording download. The top-level mix recording download is separate.

## Persistence, history, and intelligence

Arrangement state is memory-only and is lost on reload. There is no autosave, missing-source restoration, relink workflow, save status, versions, or undo/redo. Project Intelligence derives clip count, length, gaps, intro/outro heuristics, transition-like regions, selected clip, and recording state from live legacy state. Recommendations and Creative Missions can open Arrangement or add Beat Forge/Harmony clips through existing functions, and those specific recommendation/mission actions keep custom undo tokens. There is no shared Arrangement command history.

## Known risks

- The page can display a 180-second metadata-only DITC clip as if it were playable.
- Deck, Pad, Stem, and local-file references are volatile and have no relink state after reload.
- Playhead display and registry elapsed time become stale during playback.
- Seeking while playing does not restart scheduled sources from the new position.
- Clip drag mutates on every pointer event and has no single committed command boundary.
- Direct integration paths create inconsistent clip shapes.
- Filters and effects are not uniformly applied to performance-event clips.
- There is no clipping/readiness check or supported Arrangement export.
- No fake clips are pre-populated, but marker source entries can be mistaken for playable transition audio.

