# Authoritative transition regression checklist

Browser: __________  Date: __________  Commit: __________

| Test | Pass | Fail | Notes |
| --- | :---: | :---: | --- |
| A prompt starts Smart Mix services when automation is off | [ ] | [ ] | |
| A prompt replaces a pending manual Smart Mix plan | [ ] | [ ] | |
| A second prompt replaces the first pending prompt timer | [ ] | [ ] | |
| Exact `1:00` scheduling follows Deck A playback time | [ ] | [ ] | |
| `2:15`, `02:15` and `1:02:15` normalize correctly | [ ] | [ ] | |
| Natural-language minutes and seconds normalize correctly | [ ] | [ ] | |
| Seconds-before-end scheduling validates track duration | [ ] | [ ] | |
| Complete-by timing subtracts the planned blend duration | [ ] | [ ] | |
| A timestamp beyond duration shows a visible error | [ ] | [ ] | |
| A passed timestamp offers Execute Now, Next Phrase and Delay From Now | [ ] | [ ] | |
| Pausing the outgoing deck freezes the countdown | [ ] | [ ] | |
| Resuming continues toward the same playback timestamp | [ ] | [ ] | |
| Seeking before the target recalculates time remaining | [ ] | [ ] | |
| Seeking past the target pauses for a user decision | [ ] | [ ] | |
| Deck A Now, 15 sec, 10 sec and 5 sec actions execute | [ ] | [ ] | |
| Deck B Now, 15 sec, 10 sec and 5 sec actions execute | [ ] | [ ] | |
| Custom seconds, bars, timestamp and before-end modes execute | [ ] | [ ] | |
| Next Phrase is labelled as an estimated 16-bar boundary | [ ] | [ ] | |
| Empty incoming deck short deadlines request more preparation time | [ ] | [ ] | |
| Five-second large-BPM action uses a natural-tempo quick transition | [ ] | [ ] | |
| Cancel Transition stops scheduling but keeps deck audio | [ ] | [ ] | |
| Manual crossfader movement cancels automation | [ ] | [ ] | |
| Only one pending controller plan and poll loop exist | [ ] | [ ] | |
| Prompt and quick transitions complete as one-shot instructions | [ ] | [ ] | |
| BPM recovery continues after the prompt transition completes | [ ] | [ ] | |
| Manual Smart Mix continues scheduling subsequent transitions | [ ] | [ ] | |
| Global Stop, local Play and local Restart still work | [ ] | [ ] | |

Do not mark audible transition, timing or BPM recovery behavior passed without audio-enabled browser testing.
