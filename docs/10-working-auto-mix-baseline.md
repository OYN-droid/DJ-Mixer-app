# Working Auto Mix baseline

Baseline commit: `72eacd0`. This map was completed before Phase 1A application changes.

## Successful workflow

1. `setupDropZone` and `collectSupportedDropFiles` accept local files and folders on `#sourceDrop`.
2. `addLocalSourceFile` adds playable files to the in-memory `sourceFiles` crate.
3. `renderSources` creates Deck A and Deck B actions for each local file.
4. `handleSourceFileAction` decodes with `getSourceFileBuffer`, then calls `loadBufferToDeck` for the chosen deck.
5. `startSmartMix` gathers playable buffers with `collectAutoMixItems`, analyzes them, builds a plan and starts the scheduler.
6. `scheduleNextAutoMix` and `monitorSmartMixHandoff` wait for an estimated mix-out point.
7. `transitionToNextAutoMixItem`, `performSmartTransition` and `fadeCrossfaderTo` bring in the opposite deck.
8. `stopAiMix` cancels timers and animation frames. At the baseline, it also stops both decks unless called with `{ keepDecks: true }`.

## Protected code paths

| Responsibility | Functions and state |
| --- | --- |
| Crate import | `setupDropZone`, `collectSupportedDropFiles`, `collectEntryFiles`, `addLocalSourceFile`, `sourceFiles` |
| Deck A and B loading | `loadFileToDeck`, `loadBufferToDeck`, `handleSourceFileAction` |
| Start | `startAiMix`, `startSmartMix` |
| Stop | `stopAiMix` |
| Item selection | `selectedCrateItems`, `collectAutoMixItems`, `orderSmartMixItems`, `prepareSmartMixItem` |
| Plan | `buildSmartMixPlan`, `planSmartTransition`, `getSmartMixProfile` |
| Scheduler | `scheduleNextAutoMix`, `monitorSmartMixHandoff`, `prepareNextSmartMixDeck`, `transitionToNextAutoMixItem` |
| Crossfader automation | `performSmartTransition`, `applySmartTransitionFrame`, `fadeCrossfaderTo`, `setCrossfaderValue` |
| Cancellation | `autoMixState.timers`, `clearTimeout`, `cancelAnimationFrame`, `handoffArmed`, `transition` |

## Auto Mix state

`autoMixState` owns `running`, `mode`, `sourceMode`, analyzed `items`, transition `plan`, current `index`, `activeDeck`, prepared deck and item indexes, timer and animation-frame IDs, the current transition and the handoff flag.

## Baseline limitations

- Starting Smart Mix reloads the first planned item into Deck A, seeks it and starts it. It does not join playback already in progress.
- Plan ordering can reorder manually loaded decks when crate sources are included.
- Preparing the incoming deck always reloads its buffer, even if that same track is already loaded.
- The Stop Smart Mix button calls `stopAiMix()` without `keepDecks`, so it stops deck audio.
- Status is one text sentence. It does not expose active deck, incoming deck, countdown or override state.
- Transition timing uses heuristic BPM and energy analysis. It is not verified phrase analysis.

These paths should be changed incrementally and checked with `docs/11-decks-regression-checklist.md`.
