# Pads Regression Checklist

> Phase 2B requested `docs/17-pads-regression-checklist.md`, but that number is already used by the preserved performance-deck checklist. This checklist uses the next available number.

Run in an audio-enabled browser. Mark a test passed only after hearing and observing the stated result.

## Loading and assignment

- [ ] Drag a local sample onto an empty pad and confirm the hover target and assignment.
- [ ] Reassign an occupied pad only after the replace confirmation.
- [ ] Drag a decoded DITC source to a pad.
- [ ] Send a Deck A region and a Deck B region to pads.
- [ ] Send a Stem Lab result to a pad.
- [ ] Send an Arrangement source to a pad where supported; confirm unsupported sources explain the limitation.
- [ ] Clear a pad and confirm its audio, metadata, and active state are removed.

## Playback and stops

- [ ] Trigger a one-shot and hear one complete trimmed-region playback.
- [ ] Hold a Hold pad, release it, and confirm release stops it.
- [ ] Repeat the press/release test in Gate mode.
- [ ] Toggle a pad on and off.
- [ ] Start a Loop pad and stop it with Stop Loops.
- [ ] Trigger multiple pads and confirm allowed overlap.
- [ ] Assign two pads to one choke group and confirm the second stops the first.
- [ ] Use Stop Pads and confirm deck playback is unaffected.
- [ ] Use Release Held Pads and confirm one-shots and loops are unaffected.
- [ ] Use Panic and confirm no pad remains active or held.
- [ ] Use Global Stop All Audio and confirm pads and every other registered source stop.
- [ ] Navigate away with a loop active and confirm registry status remains visible while playback continues.
- [ ] Repeatedly retrigger and stop pads; confirm no duplicate audio or stuck loops.

## Long samples and editing

- [ ] Load a long sample and confirm progress and remaining time update.
- [ ] Trim start/end, preview, retrigger, and loop the selected region.
- [ ] Auto-slice to 4, 8, and 16 pads and confirm occupied-slot warnings appear before replacement.
- [ ] Trigger every mapped slice and confirm boundaries are sensible.
- [ ] Confirm unavailable analysis/slice modes are disabled and labelled Coming Soon.

## Banks, scenes, recording, and builder

- [ ] Switch among Banks A-D; confirm switching stops current pad audio without affecting decks.
- [ ] Save, reload, rename, duplicate, and clear a bank.
- [ ] Refresh and confirm metadata returns; local audio that cannot persist shows Relink Required.
- [ ] Switch scenes and confirm bank, quantize, and scene metadata recall without stuck audio.
- [ ] Record a pad performance with free and quantized timing.
- [ ] Overdub, undo the last take, save it, and send it to Arrangement.
- [ ] Build an AI pad plan, inspect warnings, cancel, regenerate, and apply without silently overwriting a populated bank.
- [ ] Preview and run a supported performance macro, cancel it, and confirm manual stops override it.

## Regression

- [ ] Complete `docs/11-decks-regression-checklist.md`.
- [ ] Complete `docs/13-ditc-regression-checklist.md`.
- [ ] Verify Auto Mix, prompt-directed Smart Mix, and tempo-safe transitions.
- [ ] Confirm every visible pad control either works or is explicitly disabled with an explanation.

