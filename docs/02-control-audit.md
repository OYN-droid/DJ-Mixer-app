# Interactive control audit

The application uses JavaScript listeners rather than inline handlers. Dynamic controls use delegated listeners or listeners attached during rendering.

## Control matrix

| Section and controls | Selectors | Handler and state | Result | Finding |
| --- | --- | --- | --- | --- |
| Navigation tabs | `.tab-button[data-target]` | `switchView` changes classes | Shows one view | Implemented, verify focus behavior |
| Start Audio | `#audioEnable` | `AudioEngine.init` | Creates or resumes audio graph | Implemented, no visible failure state |
| Record and download | `#recordMix`, `#downloadMix` | `toggleMixRecording`, anchor click | Records master to WebM | Implemented path, no permission or codec error UI |
| Global BPM | `#globalBpm` | Read directly by drums, pads, editor and AI | Shared timing value | No input handler or validation feedback |
| Master volume | `#masterVolume` | Updates `AudioEngine.masterGain` | Controls speaker and recording output level | Implemented path, verify clipping and recording level |
| Smart Mix | `#smartMixMode`, `#smartMixSource`, toggle/stop | Smart Mix functions and `autoMixState` | Plans and schedules deck transitions | Implemented path, needs loading/error states |
| Deck load and drop | `#file-a`, `#file-b`, `.deck` | load and drop handlers | Decode and load buffers | Implemented path, errors are not surfaced locally |
| Deck transport | `[data-action]` | delegated action switch | Play/pause, stop, cue, nudge, loop, edit actions | Implemented paths, button availability does not reflect empty decks |
| Waveforms and seek | `.waveform`, `[data-seek-deck]` | pointer and input handlers | Seek and selection | Implemented path, canvas lacks keyboard equivalent |
| Pitch, filter, gain, levels | deck and mixer range inputs | input listeners mutate nodes/UI | Audio parameters | Implemented paths, numeric values are not exposed |
| Crossfaders | both crossfader IDs | `setCrossfaderValue` | Mirrors controls and gains | Duplicate purposeful controls, verify equality |
| Cue monitor | cue buttons | toggles class and ARIA only | No audio change | Silent audio placeholder, should be disabled or clearly labelled |
| Sampler file and pads | `#sampleFile`, dynamic `.pad-button` | load, select, trigger and stop functions | Buffer playback | Implemented path, dynamic accessibility requires testing |
| Pad editor | trim, mode, quantize, preview, slice, save | pad editor functions | Mutates pad regions and crate | Implemented, controls remain active with empty pad and silently return |
| Mic and tab sample | `#micSample`, `#tabSample` | media capture functions | Five-second MediaRecorder sample | Missing try/catch user error state and loading state |
| Drum controls | play, clear, selects, preset, dynamic steps | drum functions | Mutates pattern and synthesized playback | Implemented path, clear has no undo |
| Keys | generated keys, chord buttons, bass mode, A to K | instrument functions | Synth voices | Implemented path, computer shortcut help is incomplete for global Space |
| Stem controls | file/drop, split, stop, dynamic cards | stem functions | Server/fallback separation and preview | Implemented path, fallback quality warning exists |
| Editor transport and tools | all `#editor*` controls | editor functions | Arrangement edits and scheduling | Implemented paths, many actions silently return without selection |
| AI plan | prompt and plan buttons | plan functions | Builds and applies local heuristic plan | “AI” label can imply external model. No undo after apply |
| Mixtape analysis | file/drop, notes and analysis buttons | analysis functions | Heuristic analysis and provider calls | Implemented path, long work has limited loading state |
| Section search | textarea, find, clear, result actions | search functions | Matches times/notes and loads results | Implemented, not semantic recognition |
| Crate URL form | `#sourceForm` inputs/button | `addSource` | Stores URL metadata | Implemented, URLs may not be playable |
| Crate drop and cards | `#sourceDrop`, dynamic source actions, checkboxes and notes | crate functions | Load, select, analyze, notes, delete | Partially implemented, local files are not persistent |

## Flagged controls

- Cue monitor buttons visibly activate but never alter audio routing.
- `#globalBpm` changes timing only when consumers next read it. There is no centralized state update.
- Pad editor actions and editor clip tools can silently do nothing when prerequisites are missing.
- Deck actions appear enabled on empty decks. Most functions return silently.
- Smart Mix and media capture lack consistent loading, cancellation and error UI.
- Space stops all audio, but this critical behavior has no visible control or adjacent instruction.
- Canvas waveforms, drag targets, sequencer steps and generated keys need keyboard and screen-reader review.
- Select options and labels can update state or explanatory text without proving an audible change.
- There are no inline event handlers.

## Recommended disposition

Keep functional controls visible. Disable controls until their prerequisites exist, add clear errors and loading states, and either implement cue monitoring or label it unavailable. Do not hide critical transport behavior.
