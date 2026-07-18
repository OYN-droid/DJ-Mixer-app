# DeckForge documentation

This directory contains the DeckForge Design Bible, engineering governance, architecture records, audits, baselines, and regression evidence. Design documents describe intended behavior; dated audits and baselines describe observed behavior at the time written and are not promises that every designed capability is currently available.

## Governance

- [09 Engineering Playbook.md](<09 Engineering Playbook.md>) — Practical engineering rules for ownership, persistence, audio, interaction, testing, and ADRs.
- [10 AI Constitution.md](<10 AI Constitution.md>) — Binding behavior rules for all deterministic and model-assisted intelligence.
- [21 Coding Standards.md](<21 Coding Standards.md>) — Code structure, lifecycle, accessibility, and verification standards.
- [22 Git Workflow.md](<22 Git Workflow.md>) — Branch, commit, integration, and recovery conventions.

## Product and Vision

- [00 Vision.md](<00 Vision.md>) — Mission, cultural foundation, and connected-workstation promise.
- [01 Product Philosophy.md](<01 Product Philosophy.md>) — Product values for play, growth, creative control, craft, and reliability.
- [02 Core Principles.md](<02 Core Principles.md>) — Durable product rules including manual authority, honest controls, and one source of truth.
- [05-product-vision.md](05-product-vision.md) — Recovery-era product direction and target outcomes.
- [09 AI Philosophy.md](<09 AI Philosophy.md>) — Product-level contract for optional, explainable AI assistance.
- [10 Project Intelligence.md](<10 Project Intelligence.md>) — Intended shared-context model, provenance, and recommendation lifecycle.
- [23 Roadmap.md](<23 Roadmap.md>) — Outcome-oriented long-term product milestones.

## Experience and Design

- [03 User Experience.md](<03 User Experience.md>) — Expectations for beginner DJs, working DJs, and producers.
- [04 Information Architecture.md](<04 Information Architecture.md>) — Intended workspace organization and navigation hierarchy.
- [05 Design System.md](<05 Design System.md>) — Visual, component, motion, accessibility, and interaction language.
- [06 Navigation.md](<06 Navigation.md>) — Navigation behavior and workspace continuity.
- [06-design-principles.md](06-design-principles.md) — Recovery design principles used to assess the current interface.

## Workflows

- [07 DJ Workflow.md](<07 DJ Workflow.md>) — End-to-end DJ preparation, performance, and finishing intent.
- [08 Producer Workflow.md](<08 Producer Workflow.md>) — End-to-end production workflow across instruments, stems, and arrangement.
- [11 Smart Mix.md](<11 Smart Mix.md>) — Smart Mix product behavior and manual-control boundaries.
- [12 DITC.md](<12 DITC.md>) — Digging, source, crate, and track-preparation workflow.
- [13 Beat Forge.md](<13 Beat Forge.md>) — Beat creation and performance intent.
- [14 Harmony Lab.md](<14 Harmony Lab.md>) — Harmony composition and performance intent.
- [15 Pads.md](<15 Pads.md>) — Sampling and pad-performance intent.
- [16 Stem Lab.md](<16 Stem Lab.md>) — Stem separation, routing, and remix intent.
- [17 Producer Studio.md](<17 Producer Studio.md>) — Producer Studio coordination intent.
- [18 Mixtape Intelligence.md](<18 Mixtape Intelligence.md>) — Mixtape analysis and authorship intent.
- [19 Connected Sources.md](<19 Connected Sources.md>) — Capability-based source integration; named provider integrations remain future work.

## Engineering and Architecture

- [03-audio-engine-map.md](03-audio-engine-map.md) — Recovery snapshot of audio graph, source ownership, cleanup, and risks.
- [04-state-map.md](04-state-map.md) — Recovery snapshot of domain state and persistence hazards.
- [09-modularization-plan.md](09-modularization-plan.md) — Incremental plan for reducing global coupling.
- [16-global-audio-transport.md](16-global-audio-transport.md) — Playback Registry and authoritative Global Stop contract.
- [18-prompt-smart-mix.md](18-prompt-smart-mix.md) — Prompt-directed Smart Mix architecture.
- [20 Audio Architecture.md](<20 Audio Architecture.md>) — Intended shared audio context, buses, clock, recording, and lifecycle.
- [20-authoritative-transition-controller.md](20-authoritative-transition-controller.md) — Transition scheduling ownership and priority model.
- [22-intelligent-tempo-safety.md](22-intelligent-tempo-safety.md) — Tempo-safety evaluation and transition recovery model.
- [30-working-arrangement-baseline.md](30-working-arrangement-baseline.md) — Verified Arrangement Studio implementation baseline.
- [32-recording-export-baseline.md](32-recording-export-baseline.md) — Recording and export pipeline audit and capability boundary.

## Audits and Baselines

- [00-current-state-audit.md](00-current-state-audit.md) — Initial recovery snapshot of application structure, dependencies, and known gaps.
- [01-feature-inventory.md](01-feature-inventory.md) — Recovery inventory of feature status.
- [02-control-audit.md](02-control-audit.md) — Recovery audit of visible controls and behavior.
- [08-manual-qa-checklist.md](08-manual-qa-checklist.md) — Original broad manual QA checklist.
- [10-working-auto-mix-baseline.md](10-working-auto-mix-baseline.md) — Preserved working Auto Mix behavior.
- [12-working-ditc-baseline.md](12-working-ditc-baseline.md) — Preserved working DITC behavior.
- [14-working-audio-playback-baseline.md](14-working-audio-playback-baseline.md) — Preserved working playback behavior.
- [24-project-intelligence-state-audit.md](24-project-intelligence-state-audit.md) — Pre-integration Project Intelligence state audit.
- [24-working-pads-baseline.md](24-working-pads-baseline.md) — Preserved working Pads behavior.
- [25-recommendation-system-audit.md](25-recommendation-system-audit.md) — Recommendation paths, duplication, and service gaps.
- [26-creative-missions-audit.md](26-creative-missions-audit.md) — Creative Missions integration and known service gaps.
- [26-working-beat-forge-baseline.md](26-working-beat-forge-baseline.md) — Preserved working Beat Forge behavior.
- [27-producer-memory-audit.md](27-producer-memory-audit.md) — Producer Memory storage, scope, privacy, and migration audit.
- [28-working-stem-lab-baseline.md](28-working-stem-lab-baseline.md) — Preserved working Stem Lab behavior.
- [28-working-stem-lab-baseline 2.md](<28-working-stem-lab-baseline 2.md>) — Byte-for-byte duplicate of the Stem Lab baseline, retained for preservation.
- [32-recording-export-baseline.md](32-recording-export-baseline.md) — Pre-foundation recording and export evidence and limitations.

## Roadmap

- [07-roadmap.md](07-roadmap.md) — Historical recovery roadmap with audit-time status values.
- [23 Roadmap.md](<23 Roadmap.md>) — Current product roadmap organized around complete creative outcomes.

## ADRs

- [ADR-001-project-registry.md](adr/ADR-001-project-registry.md) — Selects the Project Registry as immutable identity and session authority.
- [ADR-002-project-storage.md](adr/ADR-002-project-storage.md) — Defines project-scoped persistence and copy-validate migration.
- [ADR-003-project-switching.md](adr/ADR-003-project-switching.md) — Defines the safe reload-backed project-switch boundary.
- [ADR-004-asset-ownership.md](adr/ADR-004-asset-ownership.md) — Defines explicit project ownership for generated and referenced assets.

## Regression Checklists

- [11-decks-regression-checklist.md](11-decks-regression-checklist.md) — Deck transport and mixing regression checks.
- [13-ditc-regression-checklist.md](13-ditc-regression-checklist.md) — DITC regression checks.
- [15-global-audio-regression-checklist.md](15-global-audio-regression-checklist.md) — Global audio and restart regression checks.
- [17-performance-deck-regression-checklist.md](17-performance-deck-regression-checklist.md) — Performance Deck regression checks.
- [19-prompt-smart-mix-regression-checklist.md](19-prompt-smart-mix-regression-checklist.md) — Prompt-directed Smart Mix regression checks.
- [21-authoritative-transition-regression-checklist.md](21-authoritative-transition-regression-checklist.md) — Transition-controller regression checks.
- [23-tempo-safety-regression-checklist.md](23-tempo-safety-regression-checklist.md) — Tempo-safety regression checks.
- [25-pads-regression-checklist.md](25-pads-regression-checklist.md) — Pads regression checks.
- [27-beat-forge-regression-checklist.md](27-beat-forge-regression-checklist.md) — Beat Forge regression checks.
- [28-producer-studio-regression-checklist.md](28-producer-studio-regression-checklist.md) — Producer Studio, recommendations, missions, and memory regression checks.
- [29-stem-lab-regression-checklist.md](29-stem-lab-regression-checklist.md) — Stem Lab regression checks.
- [29-stem-lab-regression-checklist 2.md](<29-stem-lab-regression-checklist 2.md>) — Byte-for-byte duplicate of the Stem Lab checklist, retained for preservation.
- [31-arrangement-studio-regression-checklist.md](31-arrangement-studio-regression-checklist.md) — Arrangement Studio regression checks.
- [33-recording-export-regression-checklist.md](33-recording-export-regression-checklist.md) — Recording and export regression checks with real-output requirements.
- [34-project-registry-regression-checklist.md](34-project-registry-regression-checklist.md) — Project lifecycle, isolation, migration, ownership, and regression evidence.

## Required Reading for Coding Agents

1. [09 Engineering Playbook.md](<09 Engineering Playbook.md>)
2. [10 AI Constitution.md](<10 AI Constitution.md>)
3. Relevant product and design documents
4. Relevant architecture documents
5. Relevant ADRs
6. Relevant regression checklist

Reusable prompt preamble:

> Before implementing this sprint, read and follow the DeckForge Engineering Playbook, AI Constitution, relevant product and design documents, relevant architecture documentation, ADRs, and regression checklists. Existing working behavior is the baseline.

## Known Documentation Conflicts

- [00-current-state-audit.md](00-current-state-audit.md), [03-audio-engine-map.md](03-audio-engine-map.md), and [04-state-map.md](04-state-map.md) are recovery-era snapshots. Their descriptions of global creative storage, missing project selection, and some audio cleanup predate the Project Registry, project-scoped storage, recording/export services, and ADRs. A future targeted audit should supersede their current-state claims without deleting the historical evidence.
- [07-roadmap.md](07-roadmap.md) contains audit-time completion statuses that no longer align with later baselines and regression records; [23 Roadmap.md](<23 Roadmap.md>) is outcome-oriented and does not provide replacement implementation statuses. A future roadmap-status review should reconcile these files.
- [28-working-stem-lab-baseline 2.md](<28-working-stem-lab-baseline 2.md>) and [29-stem-lab-regression-checklist 2.md](<29-stem-lab-regression-checklist 2.md>) duplicate their unsuffixed counterparts exactly. They are preserved here as required; a future targeted cleanup can decide which copies are canonical.

Apple Music and Spotify are examples in the future Connected Sources capability model. No documentation here claims their provider integrations are implemented.

## Recovery snapshot

The pre-v2 application is preserved by Git commit `05a99fd` on `main` and `recovery/deckforge-v2`. Recover with `git show 05a99fd:<path>` or create a branch from that commit. Never add credentials, tokens, private keys, virtual environments, generated stems, or machine-specific secrets to a recovery snapshot.
