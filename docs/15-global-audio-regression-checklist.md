# Global audio regression checklist

Browser: __________  Date: __________  Commit: __________

| Test | Pass | Fail | Notes |
| --- | :---: | :---: | --- |
| Deck A play, pause and stop | [ ] | [ ] | |
| Deck B play, pause and stop | [ ] | [ ] | |
| Both decks overlap intentionally | [ ] | [ ] | |
| DITC preview starts and stops | [ ] | [ ] | |
| Starting a second DITC preview stops the first | [ ] | [ ] | |
| Pad one-shot playback ends cleanly | [ ] | [ ] | |
| Pad loop starts and Stop Pads ends it | [ ] | [ ] | |
| Drum play, pause, stop and restart use one scheduler | [ ] | [ ] | |
| Keys note-on, note release and Release Notes work | [ ] | [ ] | |
| Stem preview starts and stops | [ ] | [ ] | |
| Arrangement play, pause, stop and restart use one scheduler | [ ] | [ ] | |
| Auto Mix starts and stops safely | [ ] | [ ] | |
| Stop Smart Mix cancels automation but preserves deck audio | [ ] | [ ] | |
| Multiple intentional sources play together | [ ] | [ ] | |
| Global Stop All Audio stops every active source | [ ] | [ ] | |
| Deck A local Play works immediately after Global Stop | [ ] | [ ] | |
| Deck A local Restart works immediately after Global Stop | [ ] | [ ] | |
| Deck B local Play works immediately after Global Stop | [ ] | [ ] | |
| Deck B local Restart works immediately after Global Stop | [ ] | [ ] | |
| Local and Global Restart use the shared deck restart command | [ ] | [ ] | |
| Navigation keeps intentional audio visible in Global Transport | [ ] | [ ] | |
| Browser refresh stops browser audio and restores a clean UI | [ ] | [ ] | |
| AudioContext resumes after suspension | [ ] | [ ] | |
| No stuck notes or pad loops remain after Global Stop | [ ] | [ ] | |
| No duplicate drum, arrangement or Smart Mix scheduling occurs | [ ] | [ ] | |
| Space performs context-aware play or pause outside text entry | [ ] | [ ] | |
| Escape performs Global Stop outside text entry | [ ] | [ ] | |
| Shift plus Space restarts the primary active source | [ ] | [ ] | |
| Decks and DITC regression checklists still pass | [ ] | [ ] | |

Do not mark audio tests passed from code inspection alone.
