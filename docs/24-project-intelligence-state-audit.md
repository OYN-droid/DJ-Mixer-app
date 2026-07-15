# Project Intelligence State Audit

This audit describes the state sources in the current DeckForge implementation before Sprint 8.2 integration. It is based on `app.js`, `src/audio/playback-registry.js`, and `index.html`; it does not infer capabilities that are not represented in code.

## Runtime state sources

| Domain | Current source | Relevant fields | Mutation paths |
| --- | --- | --- | --- |
| Audio engine | `AudioEngine` | `context`, master nodes, recorder, recording chunks, mix URL | `AudioEngine.init`, master-volume input, `toggleMixRecording` |
| Decks | `deckState.a`, `deckState.b` from `createDeckState` | Track name, analysis, buffer, status, offset, playing, loop region, selection, Smart Mix ownership, manual override, gain/filter nodes | File/buffer load, play/pause/stop/clear, seek, loop and mixer controls, Smart Mix |
| DITC | `sourceFiles`, `ditcState`, `crateSelection`, saved references in storage | Local-track metadata/analysis/tags/favorite, search/filter/sort/selection, preview, Smart Mix selection | Import, analyze, tag, favorite, select, delete, preview and destination actions |
| Smart Mix | `autoMixState`, `smartPromptState`, `bpmRecoveryState`, `transitionController`, `tempoSafetyPreferences` | Candidate items, transition plan, active/incoming decks, prompt plan, controller state, tempo recovery and manual override | Smart Mix planning/scheduling, prompt planning, transition completion/cancellation, manual override |
| Pads | `sampler` | Active bank/scene, assignments, modes, regions, categories, active sources, held pads, scenes, prompt history | Pad file/DITC assignment, bank/scene switch, trigger/stop, AI Pad Plan, save/restore workspace |
| Beat Forge | `drums` | Pattern and lanes, kit/machine, groove, locks, section, bars, version, playback/recording, AI plan/history | Preset/kit load, sequencer edits, groove preview/apply/undo, prompt-plan apply, live recording |
| Harmony Lab | `instrument` | Instrument/machine, key/scale/chord mode, active pattern, notes, version, playback/recording, AI plan/history | Piano-roll/live edits, instrument/key controls, composer/bass plans, apply/undo, recording |
| Stem Lab | `stemState` | Source name/file/buffer, separated stems, current preview nodes | File/DITC/deck load, server separation, fallback separation, preview/stop |
| Arrangement | `editorState` | Lanes, clips, selected clip, snap/zoom, playhead, playback nodes, performance recording | Drag/drop, split/duplicate/delete/quantize/loop, clip inspector, recording, source send actions |
| Mixtape Analyzer | `mixtapeReferenceState`, `mixtapeInspirationState` | Reference files/tracks/artwork, decoded reference, analysis structure and blueprint | Reference upload/drop, analysis, apply blueprint as plan |
| Producer Studio | `producerStudioState`, previous `projectContext`, `aiPlanState` | Mode, prompt collections, dismissed/applied suggestions, timeline, generated plan | Studio prompt/suggestion/mission actions and local persistence |
| Playback | `AudioPlaybackRegistry`, `globalTransportState` | Registered descriptors, per-source state, active/primary source, last playback/stop/error | Registry registration and global/contextual transport commands |

Raw audio buffers and Web Audio nodes are intentionally held only in their owning runtime states. They must not enter Project Intelligence snapshots.

## Global variables and services

- `AudioEngine` owns the shared `AudioContext`, master routing, and recording output.
- `deckState`, `sampler`, `sourceFiles`, `ditcState`, `editorState`, `stemState`, `autoMixState`, `drums`, and `instrument` are module-level objects in `app.js`.
- `AudioPlaybackRegistry` is initialized by `src/audio/playback-registry.js` and exposes `snapshot()`, `active()`, `primary()`, and transport invocations.
- `AudioIdentificationService` owns optional recognition providers and returns concise provider/match results.
- `aiPlanState`, `aiSearchResultsState`, and `mixtapeInspirationState` are replaceable module-level plan/result values.
- Before Sprint 8.2, Producer Studio's `refreshProjectContext()` rebuilt a page-oriented object directly from several global objects and DOM values. It had no subscriptions, event contract, persistent revision, provenance, or stale-plan check.

## Local-storage keys

| Key | Stored data | Risk/notes |
| --- | --- | --- |
| `deckforge-pad-workspace` | Pad bank metadata, scenes, mode, quantize and prompt history | Audio buffers are deliberately omitted; restored assignments may require relinking. |
| `deckforge-smart-prompt-history` | Recent Smart Mix prompts | Separate from Producer Studio prompt history. |
| `deckforge-smart-prompt-recipes` | Saved Smart Mix recipes | Contains plan preferences, not live transition state. |
| `deckforge-tempo-safety-preferences` | Tempo thresholds and transition preferences | User preferences, safe to summarize. |
| `deckforge-harmony-lab` | Instrument settings, pattern, saved patterns, prompt history, favorites and arpeggiator | Playback nodes/timers are reset during restore. |
| `deckforge-beat-forge` | Serialized active pattern, saved patterns, prompt history and workspace mode | Playback nodes/timers are reset during restore. |
| `deckforge-beat-kit-favorites` | Favorite kit IDs | Preference only. |
| `deckforge-sources` | Saved URL references and their metadata/analysis/notes | Local `File` objects are not persisted here. |
| `deckforge-ditc-metadata` | Local-track metadata keyed by file identity | Can restore metadata when the same local file is imported again; cannot restore the file itself. |
| `deckforge-id-*` | Per-track identification cache | Contains recognition metadata, not credentials. |
| `deckforge-producer-studio` | Studio mode, project labels, prompt collections, timeline and dismissed suggestions | Sprint 8.1 mixed project metadata with page UI state. |

## DOM-derived state

The following values are not consistently represented by a dedicated plain state field:

- Global BPM from `#globalBpm`.
- Master volume from `#masterVolume`.
- Deck tempo ratio from `#pitch-a` and `#pitch-b`.
- Deck channel volume from `#channel-a` and `#channel-b`.
- Crossfader position used to resolve the active deck when both decks play.
- Several active mode/filter values are copied between DOM controls and state (`smartMixMode`, pad controls, DITC controls).
- Deck title is mirrored into `#title-a`/`#title-b`, although `deckState.trackName` is the authoritative runtime value after load.

Project Intelligence adapters should read state fields first and use these controls only where the control is the existing source of truth.

## Duplicate state and stale-state risks

- Deck names/status exist in `deckState` and rendered DOM labels. Reading labels can lag a mutation if rendering fails.
- BPM is a DOM value used by Decks, Beat Forge, Harmony Lab, Arrangement, and Producer Studio without a dedicated project metadata owner.
- DITC is split across in-memory local files, persisted URL references, persisted local metadata, selection sets, and UI filter state.
- Prompt history exists separately for Smart Mix, Pads, Beat Forge, Harmony Lab, and Producer Studio.
- Producer Studio's Sprint 8.1 `projectContext` duplicated summaries from the domain objects and refreshed mainly when Studio rendered; changes could remain stale while another page was active.
- Playback state is present in domain objects and the registry's derived snapshot. The registry is the best cross-domain playback summary, while each domain remains authoritative for its own controls.
- Pad workspace persistence restores assignment metadata without raw audio. A relink-required assignment must not be reported as playable.
- Deck buffers, local `File` objects, Web Audio nodes, timers, object URLs, waveform peaks and complete sequencer matrices would make a shared snapshot unsafe or oversized.
- Arrangement clips may contain source buffers or full performance events. Shared context must use clip summaries.
- Mixtape reference state may contain files, decoded buffers and artwork objects. Shared context must use analysis/identity summaries only.

## Existing event systems

- UI behavior is primarily direct DOM event listeners installed by `setupEvents()` and feature-specific render functions.
- `AudioPlaybackRegistry` provides command/state aggregation but does not emit subscription events.
- Web Audio `onended`, `MediaRecorder` callbacks, timers, drag/drop handlers and async analysis/separation callbacks mutate their owning state directly.
- Before Sprint 8.2 there was no shared project-context event bus or context subscriber API.
- High-frequency animation and playhead functions run continuously and are unsuitable as context-update events.

Meaningful Project Intelligence notifications should therefore be emitted from existing mutation functions rather than inferred by polling render output.

## Existing project metadata

- Default project name: `DeckForge Session` in Producer Studio state and DITC copy.
- Global BPM: current `#globalBpm` value.
- Key/genre/mood/energy: per-track analysis when available; Harmony Lab has an explicit musical key/scale for its own material.
- Reference identity: `mixtapeReferenceState` and `mixtapeInspirationState` after a reference is loaded/analyzed.
- Tags: DITC track tags plus the Sprint 8.1 Producer Studio tag list.
- No multiple-project picker currently exists. A stable project ID was not present before Sprint 8.2.
- Era, region, description, user-confirmed identity/provenance, project phase and created timestamp had no authoritative model.

## Missing context before Sprint 8.2

- Stable project ID and project-scoped intelligence persistence.
- Context revision counter and subscriber API.
- Context provenance, confidence, conflicts and user-confirmation flags.
- Transparent progress factors.
- Compact prompt-context inclusion/exclusion controls.
- Creative decision log shared across domains.
- Stale recommendation protection.
- Recent-session summary derived from real events.
- Supported risk/missing-context calculation.
- Developer diagnostics for adapter coverage, subscribers, persistence and snapshot size.

## Adapter boundary

Sprint 8.2 uses the existing domain objects as authorities and adds a concise adapter layer. The shared model stores IDs, labels, numeric values, statuses and bounded summaries only. It does not move or duplicate audio ownership, scheduling, playback commands or editing behavior.
