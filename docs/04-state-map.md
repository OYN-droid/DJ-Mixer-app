# State map

## Current sources of truth

| Domain | Primary state | Secondary or DOM state | Persistence |
| --- | --- | --- | --- |
| Audio engine | `AudioEngine` | Start Audio label, record buttons | None |
| Decks | `deckState.a`, `deckState.b` | Titles, pitch/filter/gain, channel faders, play labels, selections | None |
| Sampler | `sampler` arrays | Pad classes and editor inputs | None |
| Drums | `drums` | Sequencer button classes, BPM input, preset selects | None |
| Keys | `instrument` | Selects, bass button and generated key classes | None |
| Crate | `sourceFiles`, `crateSelection` | Dynamic cards, checkboxes and notes | URL entries under `deckforge-sources`; local files memory-only |
| Stems | `stemState` | Status and result cards | Generated WAV files on server only |
| Editor | `editorState` | Timeline and inspector | None |
| Smart Mix | `autoMixState` | deck nodes, faders, filters, status and buttons | None |
| AI plan/search | `aiPlanState`, `aiSearchResultsState` | Prompt and output markup | None |
| Mixtape reference | `mixtapeReferenceState`, `mixtapeInspirationState` | Notes and analysis output | None |
| Identification | `AudioIdentificationService` | Analysis output | Provider configs in `deckforge-id-*` keys |
| Current page | CSS `.is-active` | Active tab and view | None |

## State hazards

- Deck title is read back from DOM by AI and editor context, creating duplicate state.
- BPM lives in an input and is repeatedly read rather than held in one application object.
- Gain, filter, pitch and crossfader values exist in both DOM controls and AudioNodes.
- Crate URL arrays are parsed and rewritten in many functions. Concurrent or malformed updates can lose state or throw.
- Local file entries and selections use IDs in memory, while saved URLs use array indexes. Deletion can make index identity stale.
- Render functions rebuild dynamic DOM. Closures and selected IDs must remain consistent after each rebuild.
- Editor objects are mutated in place and manually re-rendered. Exceptions can leave visuals stale.
- Smart Mix state overlaps deck state and DOM state. User transport actions attempt to stop automation, but not every control follows that policy.
- Provider credentials in localStorage are readable by any script on the origin.

## Gradual direction

Create small domain modules with explicit state APIs and events. Start with a shared transport and playback registry, then deck state. Do not add a large state-management framework.
