# DeckForge documentation

This directory contains the DeckForge Design Bible and the recovery and implementation records for DeckForge v2. The Design Bible defines intended product behavior. Recovery records document observed implementation and manual verification, so they should not be read as promises that every designed capability is already available.

## DeckForge Design Bible

1. [Vision](<00 Vision.md>)
2. [Product Philosophy](<01 Product Philosophy.md>)
3. [Core Principles](<02 Core Principles.md>)
4. [User Experience](<03 User Experience.md>)
5. [Information Architecture](<04 Information Architecture.md>)
6. [Design System](<05 Design System.md>)
7. [Navigation](<06 Navigation.md>)
8. [DJ Workflow](<07 DJ Workflow.md>)
9. [Producer Workflow](<08 Producer Workflow.md>)
10. [AI Philosophy](<09 AI Philosophy.md>)
11. [Project Intelligence](<10 Project Intelligence.md>)
12. [Smart Mix](<11 Smart Mix.md>)
13. [DITC](<12 DITC.md>)
14. [Beat Forge](<13 Beat Forge.md>)
15. [Harmony Lab](<14 Harmony Lab.md>)
16. [Pads](<15 Pads.md>)
17. [Stem Lab](<16 Stem Lab.md>)
18. [Producer Studio](<17 Producer Studio.md>)
19. [Mixtape Intelligence](<18 Mixtape Intelligence.md>)
20. [Connected Sources](<19 Connected Sources.md>)
21. [Audio Architecture](<20 Audio Architecture.md>)
22. [Coding Standards](<21 Coding Standards.md>)
23. [Git Workflow](<22 Git Workflow.md>)
24. [Roadmap](<23 Roadmap.md>)

## Recovery and implementation records

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
11. [Working Auto Mix baseline](10-working-auto-mix-baseline.md)
12. [Decks regression checklist](11-decks-regression-checklist.md)
13. [Working DITC baseline](12-working-ditc-baseline.md)
14. [DITC regression checklist](13-ditc-regression-checklist.md)
15. [Working audio playback baseline](14-working-audio-playback-baseline.md)
16. [Global audio regression checklist](15-global-audio-regression-checklist.md)
17. [Global audio transport architecture](16-global-audio-transport.md)
18. [Performance deck regression checklist](17-performance-deck-regression-checklist.md)
19. [Prompt-directed Smart Mix architecture](18-prompt-smart-mix.md)
20. [Prompt-directed Smart Mix regression checklist](19-prompt-smart-mix-regression-checklist.md)
21. [Authoritative transition controller](20-authoritative-transition-controller.md)
22. [Authoritative transition regression checklist](21-authoritative-transition-regression-checklist.md)
23. [Intelligent tempo safety](22-intelligent-tempo-safety.md)
24. [Tempo safety regression checklist](23-tempo-safety-regression-checklist.md)
25. [Working Pads baseline](24-working-pads-baseline.md)
26. [Pads regression checklist](25-pads-regression-checklist.md)
27. [Working Beat Forge baseline](26-working-beat-forge-baseline.md)
28. [Beat Forge regression checklist](27-beat-forge-regression-checklist.md)
29. [Producer Studio regression checklist](28-producer-studio-regression-checklist.md)
30. [Project asset audit](35-project-asset-audit.md)
31. [Project Asset Manager regression checklist](36-project-asset-manager-regression-checklist.md)

## Recovery snapshot

The pre-v2 application is preserved by Git commit `05a99fd` on `main` and `recovery/deckforge-v2`. No duplicate source backup was created. This avoids stale runtime-adjacent copies. Recover with `git show 05a99fd:<path>` or create a new branch from that commit. Never add `.env`, credentials, tokens, private keys, virtual environments, or generated stems to a recovery snapshot.
