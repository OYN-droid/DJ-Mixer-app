# Tempo safety regression checklist

Browser: __________  Date: __________  Commit: __________

| Test | Pass | Fail | Notes |
| --- | :---: | :---: | --- |
| Unsafe smooth blend shows outgoing and incoming BPM | [ ] | [ ] | |
| Absolute BPM difference and outgoing-relative percentage are correct | [ ] | [ ] | |
| Required incoming playback-rate shift is correct | [ ] | [ ] | |
| Configured preferred, warning and absolute limits are displayed | [ ] | [ ] | |
| Unsafe plan automatically generates ranked executable alternatives | [ ] | [ ] | |
| Use Safer Plan never leaves the workflow in a dead state | [ ] | [ ] | |
| Recommended safer plan preserves the original timestamp | [ ] | [ ] | |
| Recommended safer plan preserves deck and vocal-overlap intent | [ ] | [ ] | |
| Natural-tempo safer plan sets incoming playback ratio to 1 | [ ] | [ ] | |
| Natural-tempo safer plan performs no unnecessary BPM recovery | [ ] | [ ] | |
| Moderate limited adjustment remains inside the preferred range | [ ] | [ ] | |
| Filter fade alternative executes through the real controller | [ ] | [ ] | |
| Quick cut alternative executes through the real controller | [ ] | [ ] | |
| Drop mix alternative executes through the real controller | [ ] | [ ] | |
| 15-second quick action automatically chooses a safe strategy | [ ] | [ ] | |
| 10-second quick action automatically chooses a safe strategy | [ ] | [ ] | |
| 5-second quick action is never blocked by beatmatch safety | [ ] | [ ] | |
| 70/140 relationship is offered as halftime when analysis qualifies | [ ] | [ ] | |
| Unrelated tempos are not labelled halftime or double-time | [ ] | [ ] | |
| Bridge suggestion uses a playable analyzed local track | [ ] | [ ] | |
| Bridge use keeps the original incoming track as final destination | [ ] | [ ] | |
| Cancel Transition preserves outgoing playback | [ ] | [ ] | |
| Manual crossfader movement cancels automation | [ ] | [ ] | |
| Manual Smart Mix, Auto Mix and Global Stop still work | [ ] | [ ] | |

Do not mark audible safer transitions, BPM matching, subdivision compatibility or bridge execution passed without audio-enabled browser testing.
