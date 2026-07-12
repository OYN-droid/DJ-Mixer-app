# Recovery roadmap

Status values reflect the current audit. Order is the recommended implementation sequence within each phase.

| Phase and item | Status | Priority | Dependencies | Risk | Order |
| --- | --- | --- | --- | --- | --- |
| 0. Preserve backup and Git workflow | Complete | P0 | Git | Low | 1 |
| 0. Document current behavior and controls | Complete | P0 | Code audit | Low | 2 |
| 0. Add smoke tests and prevent file loss | Missing | P0 | Test runtime, fixtures | Medium | 3 |
| 0. Resolve startup errors and placeholder control policy | Partial | P0 | Smoke tests | Medium | 4 |
| 1. Reliable Deck A and B load/play/pause/stop | Unverified | P0 | Audio smoke harness | High | 1 |
| 1. Cue, seek and explicit stop semantics | Partial | P0 | Deck transport | High | 2 |
| 1. Gain, channel level, filter and crossfader | Unverified | P0 | Stable deck graph | High | 3 |
| 1. Crate-to-deck loading | Partial | P0 | Crate identity model | High | 4 |
| 1. Visible Global Stop All Audio and playback states | Partial | P0 | Playback registry | Critical | 5 |
| 1. Basic manual transition workflow | Partial | P1 | All above | High | 6 |
| 2. Simple mode and helpful empty states | Missing | P1 | Stable manual workflow | Medium | 1 |
| 2. Guided first mix and tooltips | Missing | P1 | Simple mode | Low | 2 |
| 2. BPM sync assistance and suggested transition points | Partial | P1 | Reliable analysis | High | 3 |
| 2. Optional AI only | Partial | P1 | Clear automation boundaries | Medium | 4 |
| 3. Cue points and loops | Partial | P1 | Deck transport model | High | 1 |
| 3. Effects and stems | Partial | P1 | Audio routing, server safety | High | 2 |
| 3. Performance pads and recording | Partial | P1 | Playback ownership | High | 3 |
| 3. Phrase-aware mixing and Smart Mix | Partial | P2 | Analysis and scheduler tests | High | 4 |
| 4. Drum Machine and Keys | Partial | P2 | Shared clock and master bus | Medium | 1 |
| 4. Stem Lab | Partial | P2 | Secure job server | High | 2 |
| 4. Arrangement | Partial | P2 | Save model and scheduler | High | 3 |
| 4. Prompt-based creation | Partial | P2 | Preview and undo | High | 4 |
| 5. DITC and Mixtape Analyzer | Partial | P2 | Crate persistence and verified analysis | Medium | 1 |
| 5. Recommendations and connected providers | Placeholder | P2 | Provider policy and server proxy | High | 2 |
| 5. Producer Studio | Missing | P3 | Production foundation | High | 3 |
| 6. Modular architecture and automated tests | Missing | P1 | Stable behavior contract | Medium | 1 |
| 6. Accessibility and performance | Partial | P1 | Test coverage | Medium | 2 |
| 6. Documentation and architecture diagrams | Partial | P2 | Modules stabilized | Low | 3 |
| 6. Screenshots, demo video and portfolio polish | Missing | P3 | Product QA | Low | 4 |

## Immediate sequence

Add a repeatable browser smoke test, introduce a playback registry and visible panic stop, verify two-deck transport with small licensed fixtures, then lock down crossfader behavior. Only after that should Smart Mix or AI application behavior expand.
