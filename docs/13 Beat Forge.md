# Beat Forge

Beat Forge is DeckForge's rhythm creation and performance environment. It supports rapid beat making, detailed pattern editing, groove exploration, and live recording while keeping the musical state understandable.

## Pattern model

The canonical pattern contains tempo, meter, length, tracks, steps, velocities, timing offsets, probability, and sound assignments. The sequencer, prompt tools, presets, performance controls, and arranger all operate on this model. There should be no separate hidden pattern used only for playback.

Patterns can be duplicated, varied, chained, saved, and recorded into an arrangement. Editing during playback should be safe and musically synchronized. Changes that cannot be applied cleanly mid-cycle should enter at a visible quantization boundary.

## Kits, grooves, and presets

These concepts have distinct responsibilities:

- A kit changes the sound palette while preserving the rhythm.
- A groove changes timing, dynamics, probability, or articulation while preserving the essential pattern.
- A preset may intentionally define both sounds and rhythm as a complete starting point.

Groove choices must produce audible, musically coherent differences. Swing, pocket, push, drag, accent shape, and velocity behavior should be represented explicitly rather than hidden behind labels.

## Assisted creation

Prompt-directed generation creates pattern candidates within the current tempo, kit, and project intent. The artist can audition a candidate, compare it with the current beat, apply selected parts, or discard it. Matching tools may use a deck track, sample, or project reference, but should disclose uncertain tempo or structural analysis.

## Performance and recording

Beat Forge transport follows the shared audio clock while retaining local pattern controls. Pads and step input should feel immediate, and scheduled events should remain stable under interface load. Recording captures the musical performance, including intended timing and automation, without duplicating notes caused by multiple listeners or schedulers.

Beat Forge is successful when a rough rhythm can become a distinctive, editable performance without changing tools or surrendering control.
