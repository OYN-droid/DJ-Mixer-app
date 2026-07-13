# Feature inventory

Statuses are based on code inspection. “Unable to Verify Without Manual Testing” means a complete code path exists but runtime audio behavior has not been tested.

| Feature | Status | Implementation | Observed behavior and gaps | Manual test and risk |
| --- | --- | --- | --- | --- |
| Deck A and B loading/playback | Unable to Verify Without Manual Testing | `#file-a`, `#file-b`, `.deck`; `loadFileToDeck`, `playDeck`, `pauseDeck`, `stopDeck` | Decodes local audio to buffers and schedules buffer sources | Test formats, replay, end handling. High |
| Manual cue, seek, nudge, loop, scratch | Unable to Verify Without Manual Testing | `[data-action]`, wave canvases, platters; `cueDeck`, `seekDeck`, `nudgeDeck`, scratch functions | Code changes offsets and sources. Cue means return to zero, not stored cue points | Test timing and stuck sources. High |
| Crossfader, trim, filter, channel level | Unable to Verify Without Manual Testing | `#crossfader`, `#mixerCrossfader`, gain/filter controls; `updateDeckGain`, `updateCrossfader` | Equal-power cross gains and mirrored controls are present | Verify audible routing. High |
| Mixer cue monitor | UI Only | `[data-action='cue-monitor']` | Toggles CSS and `aria-pressed`; no headphone bus or audio routing | Should be disabled or labelled preview until implemented. High |
| Smart Mix | Unable to Verify Without Manual Testing | Smart Mix selectors/buttons; `startSmartMix` through `stopAiMix` | Builds heuristic plans, loads alternating decks, schedules transitions and pitch return | Long-running timing and cleanup need tests. High |
| Pads and sampler | Unable to Verify Without Manual Testing | `#pads`, pad editor; `renderPads`, `triggerPad`, slicing functions | Sixteen memory-only buffers, trigger/gate/loop modes, quantize, trim and slicing | Test every mode and stop behavior. High |
| Drum Machine | Unable to Verify Without Manual Testing | `#sequencer`, presets; `startDrums`, `tickDrums`, `playDrumVoice` | Five synthesized rows, 16 steps, machines and presets | Timer drift and tempo changes need tests. Medium |
| Keys and bass | Unable to Verify Without Manual Testing | `#keyboard`, `#bassKeys`, chords; synthesis functions | Oscillator voices, presets, chords and A to K shortcuts | No keyup sustain model. Test stuck notes. Medium |
| Stem separation | Partially Working | `#stemFile`, `#stemDrop`, results; split functions and Python server | Uses Demucs when server is available. Browser fallback is filtered full mix, not true isolation | Test server, fallback, downloads and deletion. High |
| DITC music library | Partially Working | `#sourceDrop`, `#sourceList`, DITC search, collections and inspector; crate and DITC functions | Local files work in memory. Search, sorting, filters, favorites, tags, preview, inspector and destinations are implemented. URL metadata persists | Local audio vanishes on refresh. Provider links are references, not streams. High |
| Mixtape analysis | Partially Working | reference upload/drop and analysis controls; analysis functions | Local heuristic structure, artwork and metadata analysis. Optional endpoint fingerprint adapters | Results are inferred and require validation. Medium |
| AI prompt features | Partially Working | `#aiPrompt`, plan controls; `buildLocalAiPlan`, `applyAiPlan` | Rule-based local planning, not a hosted generative model. Can change presets, BPM and prepare assets | Preview and undo are absent. High |
| AI section search | Partially Working | `#aiSectionSearch`; search functions | Searches explicit time ranges and saved notes across available buffers | Semantic lyric/audio search is not implemented. Medium |
| Timeline and arrangement | Unable to Verify Without Manual Testing | editor controls and timeline; editor functions | Drag, move, trim, split, duplicate, loop, quantize, schedule and performance capture paths exist | No save/export, undo or robust transport clock. High |
| File drag and drop | Unable to Verify Without Manual Testing | decks, crate, stems, editor and mixtape drop areas | Filters supported extensions and decodes files | Browser-specific behavior. Medium |
| Folder drag and drop | Unable to Verify Without Manual Testing | crate/reference drop; WebKit entry traversal | Recursively collects entries in supporting browsers | Non-WebKit fallback and permissions need testing. Medium |
| Backend stem server | Partially Working | `stem_server.py`, `POST /api/stems` | Static server plus Demucs job execution | Missing limits, authentication and cleanup. High |
| Global audio transport | Unable to Verify Without Manual Testing | Persistent header controls; `AudioPlaybackRegistry`; `stopAllAudio` | Shows active ownership and coordinates play/resume, pause, restart, per-source stop and Stop All Audio. Escape is the emergency shortcut | Verify every source, overlap cleanup, recording and keyboard behavior. Critical |
| Mix recording | Unable to Verify Without Manual Testing | `#recordMix`, `#downloadMix`; `toggleMixRecording` | Records master MediaStream destination to WebM | Codec support and URL cleanup need tests. High |
| Connected music sources | Placeholder | URL crate and `detectPlatform` | Apple Music, Spotify, YouTube, SoundCloud and Bandcamp are labels only | Do not imply playback integration. Medium |
| Audio recognition providers | Placeholder | localStorage provider configs, endpoint adapters | ACRCloud, AudD, AcoustID and custom endpoints can be called if externally configured | No bundled service, secure secret proxy or verified schema. High |
| Recommendations and generation | Placeholder | assisted discovery links, AI plan, editor suggestions | Heuristic recommendations and web search links only | No external recommendation or generation model. Medium |

## First recovery target

Manually verify two-deck playback, stop, seek, gain, crossfader and the new global transport before expanding AI or production features.
