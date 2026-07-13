# Performance deck regression checklist

Browser: __________  Date: __________  Commit: __________

| Test | Pass | Fail | Notes |
| --- | :---: | :---: | --- |
| Deck A load, play, pause, stop and restart remain responsive | [ ] | [ ] | |
| Deck B load, play, pause, stop and restart remain responsive | [ ] | [ ] | |
| Local Play and Restart recover after Global Stop | [ ] | [ ] | |
| Cached waveforms display energy, progress and playhead | [ ] | [ ] | |
| Heuristic beat grid aligns acceptably with analyzed BPM | [ ] | [ ] | |
| Selection, loop and Smart Mix transition markers are distinct | [ ] | [ ] | |
| Loop sizes update the audible region and countdown | [ ] | [ ] | |
| Platters rotate smoothly at the selected playback rate | [ ] | [ ] | |
| Platters hold position when paused and reset when stopped | [ ] | [ ] | |
| Deck A and Deck B meters respond to their own audio | [ ] | [ ] | |
| Peak hold and clip indicators update without distracting motion | [ ] | [ ] | |
| Both crossfaders remain synchronized | [ ] | [ ] | |
| Manual crossfader movement overrides Smart Mix | [ ] | [ ] | |
| Compact title, artist, BPM, key, genre and duration remain readable | [ ] | [ ] | |
| Smart Mix dashboard shows current, incoming, confidence and countdown | [ ] | [ ] | |
| Transition visualization follows outgoing and incoming deck state | [ ] | [ ] | |
| Simple Controls remain approachable | [ ] | [ ] | |
| Advanced Controls remain keyboard accessible | [ ] | [ ] | |
| Auto Mix completes a transition without duplicate playback | [ ] | [ ] | |
| Smart Mix stop remains non-destructive to playing decks | [ ] | [ ] | |
| Global Audio Transport remains accurate | [ ] | [ ] | |

Phrase markers are not shown because the current analyzer does not produce phrase data. Hot-cue banks are not shown because the current deck engine exposes only the existing cue-to-start behavior.

Do not mark audible or timing tests passed from code inspection alone.
