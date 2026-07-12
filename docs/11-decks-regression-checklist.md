# Decks regression checklist

Browser: Google Chrome  Date: 2026-07-12  Commit: d880499

Run this checklist after every Decks or Smart Mix change.

| Test | Pass | Fail | Notes |
| --- | :---: | :---: | --- |
| Drag two playable local tracks into the crate | [x] | [ ] | |
| Load Track 1 into Deck A | [x] | [ ] | |
| Load Track 2 into Deck B | [x] | [ ] | |
| Play and pause Deck A manually | [x] | [ ] | |
| Play and pause Deck B manually | [x] | [ ] | |
| Seek, cue, restart and stop each deck | [x] | [ ] | |
| Move both crossfader controls and hear the expected deck balance | [x] | [ ] | |
| Start Smart Mix from stopped decks | [x] | [ ] | |
| Confirm an estimated transition occurs without dead air | [x] | [ ] | |
| Stop Smart Mix and confirm currently playing deck audio continues | [x] | [ ] | |
| Start Deck A manually, then start Smart Mix | [x] | [ ] | |
| Confirm Deck A does not restart, pause, seek backward or reload | [x] | [ ] | |
| Confirm loaded Deck B remains the incoming track | [x] | [ ] | |
| Move the crossfader and confirm Manual Override cancels automation only | [x] | [ ] | |
| Confirm manual controls work after override | [x] | [ ] | |
| Press Space and confirm all audio stops | [x] | [ ] | |
| Reload the page | [x] | [ ] | |
| Repeat crate import, deck loading and Smart Mix | [x] | [ ] | |

Do not mark audio tests passed from code inspection alone.
