# Project Intelligence

Project Intelligence is the shared context layer that helps DeckForge understand what the artist is making. It connects decisions across DJ performance, beat production, harmony, sampling, stems, arrangement, and discovery without collapsing those workflows into one opaque model.

## Project context

The context model may include:

- Project identity, creative intent, genre references, and notes
- Tracks, crates, playlists, tags, and verified metadata
- Deck assignments, cues, loops, tempo decisions, and transition history
- Beat Forge patterns, kits, grooves, and recorded performances
- Harmony Lab chords, bass lines, melodies, key choices, and voicings
- Pad banks, samples, slices, scenes, and performance recordings
- Stem sources, separation status, routing, and remix relationships
- Arrangement regions, versions, exports, and recommendation history

Each domain owns its canonical state. Project Intelligence reads that state through defined interfaces and records relationships between artifacts. It must not maintain competing copies of transport, playback, or editor state.

## Facts, analysis, and inference

Context needs provenance. User-entered values and verified source metadata are facts. Locally measured BPM, key, energy, or structure are analyses with a method and confidence. AI interpretations, such as mood or narrative role, are inferences. The interface should make these categories understandable and allow correction.

Freshness matters as much as confidence. Recommendations built from an older arrangement, replaced track, or changed tempo should be marked stale and recalculated before application.

## Recommendation lifecycle

A recommendation should identify its goal, inputs, expected effect, and affected project objects. The artist can preview it, apply it, revise it, dismiss it, or return to an earlier state. DeckForge should remember useful decisions without repeatedly resurfacing rejected advice.

Project Intelligence supports continuity across sessions, but it is not a surveillance layer. Only relevant project information should enter the context, connected account data should respect provider permissions, and private creative material should remain under the artist's control.

The outcome is a workstation that understands the work in progress while keeping every creative domain legible and independently controllable.
