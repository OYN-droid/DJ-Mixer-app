# Working audio playback baseline

Baseline commit: `c1f65b1`. This map was completed before Phase 1C playback changes.

## Shared audio graph

`AudioEngine.init` lazily creates one `AudioContext`, `MediaStreamDestination`, master analyser and master gain after user interaction. Feature nodes connect to the analyser. The master gain connects to speakers and mix recording. No HTML audio elements are used.

## Playback owners

| Source | Start and pause | Stop and cleanup | State and overlap | Navigation and Global Stop |
| --- | --- | --- | --- | --- |
| Deck A and B | `playDeck`; `pauseDeck` stores offset | `stopDeck`, `stopDeckSource` | `deckState`; both decks intentionally overlap; buffer sources are recreated | Continues across pages; `panicStopAllAudio` reaches both |
| DITC preview | `handleSourceFileAction("preview")`, `playBufferPreview` | `stopDitcPreview`, shared `stopStemPreview`; one preview at a time | `ditcState.previewTrackId`, `stemState.previewSource` | Stops when leaving DITC and on Global Stop |
| Pads | `triggerPad` creates buffer sources; trigger, gate and loop modes | `stopPad`, `stopAllPads` | `sampler.active`; one-shots and loops may overlap | Continues across pages; Global Stop reaches all pads |
| Drums | `startDrums`, recursive `tickDrums` timeout | `stopDrums` clears the current timeout | `drums.playing`, `drums.timer`; may overlap decks | Continues across pages; Global Stop reaches drums |
| Keys | `playInstrumentNote`, `playInstrumentChord`, oscillator voices | Envelope stops and `stopAllInstrumentVoices` | `instrument.activeVoices`; notes may overlap | Continues across pages until envelopes end; Global Stop releases tracked voices |
| Stem preview | `handleStemAction`, `playBufferPreview` | `stopStemPreview` | `stemState.previewSource`; shares preview owner with DITC | Continues across pages unless DITC owns it; Global Stop reaches it |
| Arrangement | `playEditorArrangement`, performance scheduling | `stopEditorArrangement` stops scheduled nodes | `editorState.playing`, `scheduled`; one arrangement scheduler intended | Continues across pages; Global Stop reaches it |
| Smart Mix and Auto Mix | `startSmartMix`, deck playback and transition scheduler | `stopAiMix` cancels timeouts and animation frames but preserves deck audio | `autoMixState`; controls both decks | Continues across pages; Global Stop stops automation, then decks |
| Mix recording | `toggleMixRecording` starts `MediaRecorder` | Second toggle stops recording | `AudioEngine.recorder`, chunks, object URL | Global Stop does not currently stop recording |
| AI and transition previews | Reuse shared buffer preview or Smart Mix deck paths | Shared preview or automation stop functions | No separate audio owner | Reached indirectly when using shared paths |

## Timers, loops and URLs

- Smart Mix stores timeout and animation-frame IDs in `autoMixState.timers`.
- Drums use one recursive timeout in `drums.timer`.
- Pads use looping `AudioBufferSourceNode` instances.
- Arrangement stores scheduled nodes in `editorState.scheduled`.
- Instrument envelopes schedule oscillator stops.
- Recording and WAV export use object URLs. Recording replaces and revokes its previous URL. Export URLs are revoked after a delay.

## Baseline risks

- There is no shared playback registry or persistent current-source display.
- Space invokes Global Stop, while Escape has no global behavior.
- Drum start does not guard directly against duplicate calls, although its button toggles state.
- Preview ownership is shared between DITC and stems.
- Mix recording is not covered by the current global stop.
- Global Stop calls several feature stop functions directly, so future sources can be missed.
- Navigation generally allows intentional continued playback, but the active source is not visible outside its page.
