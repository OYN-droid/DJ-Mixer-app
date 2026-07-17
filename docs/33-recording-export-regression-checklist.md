# Recording, mixdown, and export regression checklist

Browser: Google Chrome  OS: macOS  Commit: uncommitted Phase 4C audit  Date: 2026-07-17

## Automated audit evidence

- [x] A headed-browser `MediaRecorder` run produced a 14,761-byte `audio/webm;codecs=opus` Blob.
- [x] `decodeAudioData` opened that Blob as 0.900 seconds of playable audio.
- [x] Recording export produced a 14,761-byte `Codec Verification.webm`; the extension matched the MIME type.
- [x] The real download control wrote `DeckForge Verified Output.webm` to disk at 11,831 bytes; the browser decoded it as 0.720 seconds and the system `file` utility identified it as WebM.
- [x] Deck A loaded and played a generated WAV, advancing to 0.255 seconds.
- [x] Local Deck A restart returned playback to 0.006 seconds and continued playing.
- [x] Arrangement playback scheduled real active clips.
- [x] Global Stop left zero active Playback Registry sources after final deck reconciliation.

The synthetic browser checks above validate the real code paths and file data, not UI toasts. Human audible QA, timing judgment, and download-folder inspection remain required where noted below.

## Recording

- [x] Record a real browser audio stream through the shared recording path and confirm a real nonzero Blob.
- [ ] Record Deck B through the master output and confirm the intended audible signal.
- [ ] Record master output with Decks and Pads active.
- [ ] Record Smart Mix and confirm its transitions are captured.
- [ ] Record Arrangement Studio and verify timing against the arrangement duration.
- [ ] Record a Pad, Beat Forge, and Harmony Lab performance as real editable events.
- [ ] Pause, resume, stop, and cancel a master recording.
- [ ] Press Global Stop while recording and confirm the take finalizes rather than disappearing.
- [x] Restart local playback and verify that playback returns to the beginning.
- [ ] Rename, preview, add to Arrangement, export, and delete a completed recording.
- [x] Confirm zero-byte failures are not presented as successful takes. (Audible-silence classification remains unavailable.)

## Export

- [x] Export a completed recording using its actual browser codec and extension.
- [ ] Validate and export full Arrangement metadata.
- [ ] Validate the current loop as a selected region.
- [ ] Export an alternate Arrangement version without switching the source accidentally.
- [ ] Export individual Stem Lab stems, acapella, and instrumental WAV files.
- [ ] Export an aligned stem group and verify common duration/start.
- [x] Confirm unsupported lane/offline Arrangement audio exports are not offered and are labeled unavailable.
- [ ] Cancel an export job, retry it, and preserve its settings.
- [x] Block recording export when its runtime Blob is missing; offline Arrangement audio is not offered.
- [ ] Generate a tracklist from actual Arrangement clips only.
- [ ] Generate a cue sheet from actual Arrangement timing.
- [ ] Export metadata and artwork as honest sidecars when embedding is unavailable.
- [ ] Create a project package without audio and inspect it for secrets, object URLs, and private paths.

## History, persistence, and cleanup

- [ ] Reload and confirm Recording and Export histories restore as Missing when Blob data is unavailable.
- [ ] Confirm missing recordings cannot preview or download.
- [ ] Delete a recording and verify its object URL is revoked.
- [ ] Replace a recording URL and verify the old URL is revoked.
- [ ] Delete/cancel export jobs and confirm temporary object URLs are cleaned up.
- [ ] Confirm diagnostics report active IDs, MIME type, bytes, duration, validation, errors, and URL count.
- [ ] Confirm Project Intelligence and Producer Studio show latest real recording/export state.

## Regressions

- [ ] Decks, Smart Mix, transitions, DITC, Pads, Beat Forge, Harmony Lab, Stem Lab, Arrangement Studio, Producer Studio, Playback Registry, and Global Transport still pass their existing checklists.
- [ ] No recording or export control silently does nothing.
- [ ] Complete a full audible browser QA pass before marking audio behavior passed.
