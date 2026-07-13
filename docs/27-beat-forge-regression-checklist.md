# Beat Forge Regression Checklist

> Phase 2C requested `docs/19-beat-forge-regression-checklist.md`, but that path already belongs to the preserved Smart Mix regression phase. This checklist uses the next available number.

Run these tests in an audio-enabled browser. Do not mark audible behavior passed based only on code inspection.

## Core transport and sequencing

- [ ] Load a preset and confirm pattern, kit, groove, BPM, and summary update.
- [ ] Load a kit and confirm steps remain unchanged.
- [ ] Start Beat Forge, pause, resume, stop, and restart from step one.
- [ ] Press Play repeatedly and confirm only one scheduler advances.
- [ ] Navigate away during playback and confirm registry status remains accurate without a hidden second scheduler.
- [ ] Toggle sequencer steps while playing and hear the latest pattern version.
- [ ] Change bars and navigate bars without corrupting other bars.
- [ ] Change velocity and hear gain change.
- [ ] Set probability below 100 percent and confirm intermittent triggering.
- [ ] Change timing offset and hear the event move within safe bounds.
- [ ] Change groove/intensity and hear timing and velocity feel change.
- [ ] Preview Straight and Boom Bap at Medium; confirm the same core pattern has a clearly different pocket.
- [ ] Compare Boom Bap and Dilla-Inspired; confirm timing and velocity contours differ, not only loudness.
- [ ] Preview House Swing, Jersey Bounce, UK Garage, and Cinematic Trap; confirm recognizable structural differences.
- [ ] Compare Subtle, Medium, and Strong groove intensity.
- [ ] Lock Kick, apply a groove, and confirm kick steps, velocity, and timing remain unchanged.
- [ ] Preview Original, Preview Groove, and Alternate A/B; cancel and confirm Pattern A remains intact.
- [ ] Apply a groove, stop/restart, and confirm the scheduler reports and plays the latest pattern version.
- [ ] Undo Groove, Reapply, and Reset Straight.
- [ ] Use local Stop and confirm decks and pads continue.
- [ ] Use Global Stop All Audio and confirm Beat Forge and every other source stop.

## Views and editing

- [ ] Open Step, Piano Roll, Velocity, and Automation views.
- [ ] Edit a Piano Roll note and confirm the Step grid updates the same pattern.
- [ ] Edit and drag velocity bars; test accent, humanize, randomize, and reset.
- [ ] Draw lane-volume automation and confirm it affects audible gain.
- [ ] Select a lane and change volume, pan, probability, timing, filter, choke, mute, and solo.
- [ ] Confirm unavailable sample layering or MIDI features are visibly disabled with an explanation.

## Kits, generation, and prompts

- [ ] Select a kit category, filter kits, preview, stop preview, load, favorite, and move previous/next.
- [ ] Confirm Load Kit preserves the current step pattern.
- [ ] Use Load Kit + Recommended Pattern and confirm both change only after the explicit combined action.
- [ ] Generate five new beats and confirm their canonical step data differs.
- [ ] Generate a variation, simplify, make busier, add a fill, humanize, add swing, and straighten.
- [ ] Convert a pattern among Intro, Verse, Hook, Breakdown, Transition, and Outro.
- [ ] Enter a prompt, preview its plan, generate another, apply, undo, save, refine, and clear.
- [ ] Test keep-kick, keep-snare, hats-only, preserve-bars, keep-kit, and keep-groove intent.
- [ ] Confirm applying a prompt plan requires preview and confirmation when replacing a pattern.
- [ ] Preview, apply, explain, reject, and undo an AI Beat Match suggestion.

## Performance and project integration

- [ ] Finger-drum the 4x4 pads with pointer and keyboard input.
- [ ] Record and overdub a live take into the pattern, then undo it.
- [ ] Send the current pattern to Arrangement and confirm timing, velocity, groove, length, and kit metadata.
- [ ] Send a rendered pattern or individual lane to an empty Pads slot without replacing occupied assignments silently.
- [ ] Save, rename, duplicate, favorite, export, import, and delete a pattern.
- [ ] Refresh and confirm patterns, kit, groove, velocities, probability, timing, automation, and prompt history restore.

## Regression

- [ ] Complete `docs/11-decks-regression-checklist.md`.
- [ ] Complete `docs/25-pads-regression-checklist.md`.
- [ ] Confirm DITC import/search and prompt-directed Smart Mix remain functional.
- [ ] Confirm no visible Beat Forge control silently does nothing.
