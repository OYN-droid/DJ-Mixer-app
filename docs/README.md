# DeckForge documentation

This directory is the DeckForge v2 recovery and design baseline. It records observed code behavior. Browser audio behavior remains subject to manual testing.

## Documents

1. [Current state audit](00-current-state-audit.md)
2. [Feature inventory](01-feature-inventory.md)
3. [Control audit](02-control-audit.md)
4. [Audio engine map](03-audio-engine-map.md)
5. [State map](04-state-map.md)
6. [Product vision](05-product-vision.md)
7. [Design principles](06-design-principles.md)
8. [Roadmap](07-roadmap.md)
9. [Manual QA checklist](08-manual-qa-checklist.md)
10. [Modularization plan](09-modularization-plan.md)

## Recovery snapshot

The pre-v2 application is preserved by Git commit `05a99fd` on `main` and `recovery/deckforge-v2`. No duplicate source backup was created. This avoids stale runtime-adjacent copies. Recover with `git show 05a99fd:<path>` or create a new branch from that commit. Never add `.env`, credentials, tokens, private keys, virtual environments, or generated stems to a recovery snapshot.
