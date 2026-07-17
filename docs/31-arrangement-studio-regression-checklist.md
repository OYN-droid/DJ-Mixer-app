# Arrangement Studio regression checklist

Record browser, operating system, project version, source availability, and result for each run.

## Empty state and real sources

- [ ] Open an empty arrangement and confirm no fake clips, waveforms, or durations appear.
- [ ] Add a playable DITC track and verify its source ID, metadata, duration, and audio.
- [ ] Add Deck A and Deck B without changing current deck playback.
- [ ] Add a Stem Lab stem and a synchronized stem group.
- [ ] Add the canonical Beat Forge pattern and confirm real scheduled events.
- [ ] Add Harmony Lab material and confirm real rendered events or an honest symbolic state.
- [ ] Add a Pad recording and verify bank, scene, pad, timing, duration, and playback mode metadata.
- [ ] Drop a supported local file.
- [ ] Confirm metadata-only references are labelled Audio Not Linked and cannot play.

## Editing and history

- [ ] Move a clip horizontally and between compatible lanes.
- [ ] Trim the clip start and confirm source offset changes non-destructively.
- [ ] Trim the clip end.
- [ ] Split at the playhead.
- [ ] Duplicate and delete a clip with confirmation.
- [ ] Undo and redo add, move, trim, split, duplicate, delete, and lane changes.
- [ ] Verify playhead changes do not enter Undo history.
- [ ] Copy and paste a clip.
- [ ] Lock a clip and verify move/edit/delete are blocked.
- [ ] Group synchronized stems, move the group, then ungroup it.
- [ ] Exercise keyboard alternatives for add, split, duplicate, delete, save, loop, undo, and redo.

## Timeline and transport

- [ ] Play from zero and confirm layered audio shares one timeline clock.
- [ ] Pause and confirm the displayed playhead is preserved accurately.
- [ ] Resume from the paused position without duplicate sources.
- [ ] Stop locally and confirm unrelated deck or pad audio continues.
- [ ] Restart from zero or the enabled loop start.
- [ ] Seek while playing and confirm the scheduler restarts once at the new playhead.
- [ ] Create, move, resize, enable, disable, and clear a loop region.
- [ ] Confirm loop playback remains synchronized.
- [ ] Enable the metronome and confirm it uses project BPM and the shared audio graph.
- [ ] Confirm current time, bars/beats, and duration update.
- [ ] Mute one lane and solo another using text-labelled controls.
- [ ] Press Global Stop All Audio, then restart Arrangement locally.
- [ ] Navigate away during playback and verify Global Transport still identifies Arrangement Studio.

## Recording, transitions, versions, and export

- [ ] Record pad, Beat Forge, and Harmony performance events.
- [ ] Stop an empty recording and confirm no false take is created.
- [ ] Rename, keep, compare, promote, and delete takes where supported.
- [ ] Confirm unsupported master-audio and punch modes are disabled with explanations.
- [ ] Create a transition between two real playable clips.
- [ ] Preview it through the existing transition controller.
- [ ] Change duration/style and inspect BPM, key, vocal, stem, phrase, and stale-context warnings.
- [ ] Remove the transition and Undo/Redo it.
- [ ] Duplicate the arrangement as an alternate version and confirm clip isolation.
- [ ] Rename, switch, compare, delete, and set a version as Main.
- [ ] Run export readiness with missing sources, an empty arrangement, and a ready arrangement.
- [ ] Export and re-import the Arrangement project JSON.
- [ ] Export a cue sheet and tracklist from real timeline metadata.
- [ ] Export supported WAV audio and verify duration and playable content.

## Persistence and recovery

- [ ] Save explicitly and confirm Saved status.
- [ ] Make a meaningful edit and confirm debounced autosave without playhead-tick writes.
- [ ] Reload and verify lanes, clips, markers, transitions, loop, zoom, versions, and references restore.
- [ ] Confirm raw AudioBuffers, AudioNodes, object URLs, tokens, and private paths are absent from saved JSON.
- [ ] Remove a source and confirm the clip remains marked Missing Source.
- [ ] Relink a matching source and preserve timing.
- [ ] Relink a significantly different duration and confirm a warning.
- [ ] Replace or remove a missing source.
- [ ] Simulate storage failure and confirm Save Failed without destroying the last valid save.

## Integrations and regressions

- [ ] Confirm Project Intelligence updates for clip, transition, marker, recording, version, gap, and export events.
- [ ] Confirm project progress is based on actual content, not page visits.
- [ ] Confirm Producer Memory supplies only confirmed defaults and current commands override them.
- [ ] Preview and apply an Arrangement recommendation, then Undo it.
- [ ] Preview a Creative Mission arrangement plan before applying real steps.
- [ ] Preview a Prompt Studio multi-step arrangement plan before applying it.
- [ ] Verify Decks, Auto Mix, Smart Mix, transitions, DITC, Pads, Beat Forge, Harmony Lab, Stem Lab, Producer Studio, Global Transport, Playback Registry, and Producer Memory regressions.
- [ ] Confirm no visible Arrangement Studio control silently does nothing.

