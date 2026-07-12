# Manual QA checklist

Browser: __________  Date: __________  Commit: __________

For every test, check one result and add notes.

| Test | Pass | Fail | Not Implemented | Notes |
| --- | :---: | :---: | :---: | --- |
| Application opens without an uncaught console error | [ ] | [ ] | [ ] | |
| All eight navigation tabs open the correct view | [ ] | [ ] | [ ] | |
| Start Audio changes to Audio On and context runs | [ ] | [ ] | [ ] | |
| Load a supported local track | [ ] | [ ] | [ ] | |
| Load Deck A by picker and drop | [ ] | [ ] | [ ] | |
| Load Deck B by picker and drop | [ ] | [ ] | [ ] | |
| Play and pause Deck A | [ ] | [ ] | [ ] | |
| Play and pause Deck B | [ ] | [ ] | [ ] | |
| Play both decks together | [ ] | [ ] | [ ] | |
| Seek, cue, nudge, loop and stop each deck | [ ] | [ ] | [ ] | |
| Crossfader fully cuts A at B end and B at A end | [ ] | [ ] | [ ] | |
| Both crossfader controls stay synchronized | [ ] | [ ] | [ ] | |
| Trim, filter and channel fader audibly affect the expected deck | [ ] | [ ] | [ ] | |
| Space stops all active audio systems | [ ] | [ ] | [ ] | |
| Crate local preview/load actions work | [ ] | [ ] | [ ] | |
| Direct audio URL succeeds or shows a useful CORS error | [ ] | [ ] | [ ] | |
| Pad load, trigger, gate, loop, trim, slice and Stop Pads work | [ ] | [ ] | [ ] | |
| Mic Sample handles allow and deny permission | [ ] | [ ] | [ ] | |
| Tab Audio handles allow, cancel and unsupported browser | [ ] | [ ] | [ ] | |
| Drum steps, presets, tempo, start, stop and clear work | [ ] | [ ] | [ ] | |
| Keys, bass, chords and A to K shortcuts work without stuck notes | [ ] | [ ] | [ ] | |
| Stem upload and browser fallback complete | [ ] | [ ] | [ ] | |
| Demucs server separation, preview and download work | [ ] | [ ] | [ ] | |
| File drag and drop works in every advertised target | [ ] | [ ] | [ ] | |
| Folder drag and drop imports nested supported audio | [ ] | [ ] | [ ] | |
| Smart Mix starts, transitions, stops and restores controls | [ ] | [ ] | [ ] | |
| Editor drag, trim, split, duplicate, loop, quantize, play and stop work | [ ] | [ ] | [ ] | |
| Mix recording starts, stops and downloads a playable WebM | [ ] | [ ] | [ ] | |
| Invalid files, failed decode, denied media and failed fetch show errors | [ ] | [ ] | [ ] | |
| Leaving each view while audio plays has clear expected behavior | [ ] | [ ] | [ ] | |
| Space stop does not fire while typing in an input or textarea | [ ] | [ ] | [ ] | |
| Refresh preserves URL crate entries and notes | [ ] | [ ] | [ ] | |
| Refresh clearly loses memory-only local files, decks, pads and arrangement | [ ] | [ ] | [ ] | |
| Keyboard-only navigation reaches and operates all controls | [ ] | [ ] | [ ] | |
| Screen reader announces buttons, ranges, status and dynamic results | [ ] | [ ] | [ ] | |

## Audio overlap stress test

Start both decks, a looping pad, drums, a held key, stem preview and editor playback. Press Space once. Confirm silence, stopped UI states and no later scheduled sound. Repeat during a Smart Mix transition and during recording.
