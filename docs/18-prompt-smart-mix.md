# Prompt-directed Smart Mix architecture

## Structured planning

`parseSmartMixPrompt` converts text into a normalized plan before any playback command runs. The plan records deck ownership, source preference, trigger estimate, bar timing, transition style, vocal-overlap preference, temporary BPM, recovery timing and curve, confidence, warnings, unsupported instructions and safety state.

The parser is deterministic and local. It does not call a hosted language model. Section language such as chorus, verse, hook, breakdown or instrumental is mapped to an explicitly labelled beat-grid estimate because the current analyzer does not provide reliable phrase recognition.

## Execution adapter

`applySmartPromptPlan` passes an approved plan into the existing `startSmartMix` path. The existing active-deck detection, incoming-deck preparation, transition scheduler, crossfader automation and manual override behavior remain authoritative.

The opposite loaded deck is preserved unless the prompt explicitly requests DITC selection. When selection is requested, local DITC candidates are filtered by supported name, genre, mood and energy terms. If no candidate qualifies, the active deck continues and the plan reports the failure.

## Tempo safety and recovery

Temporary matching changes only the incoming deck. The user-configured maximum shift is checked again after the actual incoming track is selected. A plan outside that limit is not started. The safer-plan action removes beatmatching and uses a short transition at natural tempo.

`bpmRecoveryState` owns recovery independently from the transition scheduler. It supports linear, ease-in, ease-out, smooth S-curve and phrase-stepped interpolation. Recovery may start immediately or after a bar delay. Manual tempo movement cancels the recovery frame, preserves the selected pitch ratio and exposes resume, recalculate and cancel actions.

## Honest limitations

- Phrase and section recognition are unavailable. Beat and time estimates are labelled as estimates.
- Web Audio playback-rate changes also affect pitch. Key lock is unavailable.
- True echo processing is unavailable. Echo prompts fall back to a filter-assisted quick blend with a warning.
- Smart Mix cannot independently route stems, acapellas or automated stem swaps.
- Automated loop transitions are unavailable.
- Vocal clash avoidance uses metadata and density estimates unless prepared stems exist, and prepared stems are not yet routed through Smart Mix.
- Prompt parsing is rule-based and supports the documented musical vocabulary rather than unrestricted language understanding.

Prompt history and transition recipes are stored locally without audio data, file contents or private paths.
