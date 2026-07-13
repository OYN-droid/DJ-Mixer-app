# Working Pads Baseline

> Phase 2B requested this record as `docs/16-working-pads-baseline.md`. Numbers 16 through 23 already belong to completed transport, deck, Smart Mix, and tempo-safety phases, so this non-destructive record uses the next available number.

## Existing grid and state

- The Pads page renders one responsive 4 by 4 grid from a single `sampler` object in `app.js`.
- State uses parallel 16-item arrays for decoded `AudioBuffer` objects, names, active sources, trim starts, trim ends, and `trigger` or `loop` modes. Selection and a page-wide quantize value are also stored.
- Empty slots retain starter labels but contain no audio. Loaded buffers live in memory only.

## Loading and integration

- The Add Sample file input decodes a local file into the next open pad.
- Microphone and tab-capture actions record a fixed-duration stream and assign its decoded result to a pad.
- DITC can send decoded local sources to the sampler through the existing drop-action integration.
- Deck cue/loop regions can be clipped and sent to the next open pad. Stem and arrangement performance playback can reference pad buffers, but there is no complete drag-target contract for every source named in the Phase 2B brief.
- Slicing clips the selected trim region into 2 to 16 equal `AudioBuffer` objects and maps them across the current 16 slots.
- A selected pad region can be saved back to the crate.

## Playback and audio graph

- Each trigger creates one `AudioBufferSourceNode` and one `GainNode`, connected to the shared `AudioEngine.masterAnalyser`; no new `AudioContext` is created.
- `trigger` starts the trimmed region once. `loop` sets `loopStart` and `loopEnd` and continues until stopped.
- Retriggering a slot stops that slot's previous source. Different slots may overlap.
- Quantize schedules at the next beat or bar using global BPM. Off starts immediately.
- Pad triggers are captured by the existing Arrangement Editor performance recorder with pad index, region, duration, loop state, and velocity.

## Editing and waveform

- The selected-pad editor includes a canvas waveform, start/end trim sliders, trigger/loop mode, page quantize, equal-slice count, preview, slice-to-pads, and save-to-crate.
- The waveform is derived honestly from channel 0 of the decoded buffer. It shows the trim region but has no playback head, zoom, slice handles, fades, or transient analysis.

## Stops and playback registry

- Stop Pads stops every active pad while leaving decks and other registered sources alone.
- Stop Loops stops only active slots whose mode is `loop`.
- Global Stop reaches pads through the shared playback registry registration named `pads`.
- Registry state reports whether any pad is playing, whether a loop is active, and an active-pad count. It does not distinguish held pads, choke groups, or recording state.

## Drag and drop

- The Pads section is a DITC drop-action target and receives page-level local-file drops through the existing source ingestion flow.
- Individual pads are not drop targets. There is no hover assignment preview and deck, stem, arrangement, and sample-browser drag contracts are incomplete.

## Known gaps and placeholders

- No hold, gate, toggle, repeat, roll, choke-group, bank, scene, keyboard, MIDI, or per-pad effects behavior.
- No persistent bank metadata or relink state for local files.
- No pad-focused recording toolbar, take undo, AI bank preview, macros, search browser, or diagnostics.
- Long audio plays, trims, loops, and stops, but the grid has no progress or remaining-time display.
- The current slice action overwrites occupied destination slots without a preview.
- Playback is not paused on page navigation; registry status remains global while audio continues.

