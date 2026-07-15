# Pads

Pads is DeckForge's tactile sampling and live performance surface. It connects one-shot triggering, sample chopping, scene launching, finger drumming, and performance recording through a consistent bank and pad model.

## Pad behavior

Every pad has a visible assignment, playback mode, color, source, and state. Supported modes may include one-shot, gate, toggle, choke group, loop, and scene trigger. Press, hold, release, retrigger, and stop behavior must match the selected mode across pointer, touch, computer keyboard, and MIDI input.

Banks expand the available performance surface without changing the identity of existing pads. Switching banks should never leave hidden loops playing without an accessible stop control. Choke groups and global pad stop provide clear ownership for overlapping samples.

## Sampling and chopping

Artists can assign local samples, recordings, generated audio, approved source material, or project exports. A chop workflow creates editable slices with start, end, gain, fade, pitch, and optional tempo information. Automatic slicing offers candidates based on transients or musical regions, but the original source remains unchanged.

Source provenance and usage constraints travel with each assignment. Missing files or unavailable connected sources should produce a relink or replacement path, not a silent pad.

## Performance workflow

Scenes capture coordinated pad states for transitions, drops, and live arrangement. Performance recording preserves hits, releases, velocity, timing, bank changes, and scene actions as editable events. Quantization can be applied during or after recording and should remain reversible.

AI-assisted bank building can propose a balanced palette, map slices, or create variations from project context. The artist previews the bank and can apply individual assignments. Generated suggestions never replace an occupied pad without confirmation.

Pads shares the master audio path, transport, and recording system with the rest of DeckForge. It should feel immediate enough for performance and structured enough that an inspired take can become part of a project.
