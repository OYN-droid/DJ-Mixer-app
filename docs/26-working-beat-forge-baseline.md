# Working Beat Forge Baseline

> Phase 2C requested `docs/18-working-beat-forge-baseline.md`. Documents 18 and 19 already preserve the prompt-directed Smart Mix phase, so this baseline uses the next available number without overwriting project history.

## Existing Drum Machine

- The page is named Drum Machine and contains a machine selector, producer-era preset selector, Load Preset, Start/Stop, Pause, Restart, Clear, and a five-lane 16-step grid.
- Canonical runtime state is the single `drums` object in `app.js`. It stores playing, paused, current step, one timer, lane names, selected preset/machine, a synthesized kit, and a five-by-sixteen binary pattern.
- Lanes are Kick, Snare, Hat, Clap, and Sub. Each step is either on or off; there are no per-step velocity, probability, or timing arrays.

## Kits, presets, and groove

- Drum machines provide synthesized tone/noise parameters and may provide a pattern. Presets provide BPM, notes, swing, kit parameters, and a pattern.
- Loading a preset combines its kit with the selected machine, replaces the pattern, changes global BPM, resets step position, and restarts playback when already playing.
- Swing is a numeric kit property. There is no independently named Groove model, browser categories, preview transport, favorites, or pattern library.

## Scheduling and audio

- `startDrums` guards against both an active playing flag and an existing timer, preventing a second timer from a repeated Play command.
- `tickDrums` advances one sixteenth note using a chained `setTimeout`; alternating interval offsets apply swing. It reads the current pattern on every tick.
- Active steps call `playDrum`, which records an Arrangement performance event and delegates to `playDrumVoice`.
- Kick and Sub use short oscillator pitch envelopes. Snare, Hat, and Clap use generated noise through a filter. Voices connect to the shared master analyser and AudioContext.
- Pause cancels the timer but retains step position. Stop cancels the timer and clears playback highlights. Restart stops, resets to step zero, and starts once.

## Transport, recording, and integration

- Local controls provide Play/Stop, Pause, Restart, and Clear. There is no dedicated Stop button, sticky transport, bar/beat display, metronome, or Beat Forge record toolbar.
- Drum triggers are captured by the shared Arrangement performance recorder when it is active.
- Arrangement sources can render the current drum pattern as repeated performance events.
- The shared playback registry registers `drums` with stop, pause, resume, restart, playing, paused, looping, and preset-name metadata. Global Stop therefore stops the timer.
- No direct Send to Pads or dedicated Send to Arrangement action exists on the Drum Machine page.

## Missing editors and placeholders

- No Piano Roll, Velocity view, probability editor, timing-offset editor, automation view, lane inspector, layering, pattern chaining, or multi-bar state.
- No kit browser, kit preview, separate groove engine, performance pad grid, MIDI input, or local live-record take workflow.
- No AI Beat Generator or AI Drum Prompt Studio is present on this page. The broader project planner can select a drum preset and machine, but it does not preview and apply a canonical Beat Forge pattern plan.
- Pattern, kit, groove, prompt, and lane metadata are not persisted.
- Existing controls are functional, but the compact implementation does not expose advanced Phase 2C concepts.

