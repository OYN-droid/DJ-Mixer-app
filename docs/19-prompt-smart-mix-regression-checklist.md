# Prompt-directed Smart Mix regression checklist

Browser: __________  Date: __________  Commit: __________

| Test | Pass | Fail | Notes |
| --- | :---: | :---: | --- |
| A prompt creates a visible plan without changing audio | [ ] | [ ] | |
| Phrase language displays an honest beat-grid fallback warning | [ ] | [ ] | |
| Conflicting section and bar instructions request clarification | [ ] | [ ] | |
| Applying a plan preserves the active deck without restart | [ ] | [ ] | |
| Apply advances through Validating, Preparing and Waiting for Trigger | [ ] | [ ] | |
| Repeated Apply clicks create only one transition scheduler | [ ] | [ ] | |
| Validation failures show retry, edit, load, source and cancel actions | [ ] | [ ] | |
| An already loaded opposite deck is not replaced | [ ] | [ ] | |
| Explicit DITC selection keeps the active deck playing | [ ] | [ ] | |
| No qualifying DITC track reports why and produces no dead air | [ ] | [ ] | |
| Incoming tempo is matched within the configured safety limit | [ ] | [ ] | |
| A shift above the safety limit blocks execution | [ ] | [ ] | |
| Use Safer Plan removes automatic beatmatching | [ ] | [ ] | |
| Recovery begins at the planned time | [ ] | [ ] | |
| Recovery reaches the original incoming tempo smoothly | [ ] | [ ] | |
| Recovery visualization reports BPM, bars, curve and progress | [ ] | [ ] | |
| Manual incoming tempo movement immediately stops recovery | [ ] | [ ] | |
| Resume BPM Recovery continues from the manual tempo | [ ] | [ ] | |
| Recalculate uses the current tempo and selected controls | [ ] | [ ] | |
| Cancel Recovery preserves the current user-selected tempo | [ ] | [ ] | |
| Stop Smart Mix cancels automation without stopping deck audio | [ ] | [ ] | |
| Manual crossfader override remains authoritative | [ ] | [ ] | |
| Prompt history supports reuse, favorite and delete | [ ] | [ ] | |
| Recipes support save, reuse, edit through the prompt and delete | [ ] | [ ] | |
| Auto Mix still completes a normal transition | [ ] | [ ] | |
| Global Stop still stops every registered source | [ ] | [ ] | |
| Local Play and Restart still recover after Global Stop | [ ] | [ ] | |
| Deck waveforms, platters, meters, loops and metadata remain responsive | [ ] | [ ] | |

Do not mark phrase detection, timing, tempo matching or audible recovery passed without audio-enabled browser testing.
