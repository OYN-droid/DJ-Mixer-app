# Decks regression checklist

Browser: __________  Date: __________  Commit: __________

Run this checklist after every Decks or Smart Mix change.

| Test | Pass | Fail | Notes |
| --- | :---: | :---: | --- |
| Drag two playable local tracks into the crate | [ ] | [ ] | |
| Load Track 1 into Deck A | [ ] | [ ] | |
| Load Track 2 into Deck B | [ ] | [ ] | |
| Play and pause Deck A manually | [ ] | [ ] | |
| Play and pause Deck B manually | [ ] | [ ] | |
| Seek, cue, restart and stop each deck | [ ] | [ ] | |
| Move both crossfader controls and hear the expected deck balance | [ ] | [ ] | |
| Start Smart Mix from stopped decks | [ ] | [ ] | |
| Confirm an estimated transition occurs without dead air | [ ] | [ ] | |
| Stop Smart Mix and confirm currently playing deck audio continues | [ ] | [ ] | |
| Start Deck A manually, then start Smart Mix | [ ] | [ ] | |
| Confirm Deck A does not restart, pause, seek backward or reload | [ ] | [ ] | |
| Confirm loaded Deck B remains the incoming track | [ ] | [ ] | |
| Move the crossfader and confirm Manual Override cancels automation only | [ ] | [ ] | |
| Confirm manual controls work after override | [ ] | [ ] | |
| Press Space and confirm all audio stops | [ ] | [ ] | |
| Reload the page | [ ] | [ ] | |
| Repeat crate import, deck loading and Smart Mix | [ ] | [ ] | |

Do not mark audio tests passed from code inspection alone.
