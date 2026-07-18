# DeckForge Engineering Playbook

## Purpose

This playbook governs future DeckForge implementation by human developers and coding agents. It turns the product's established principles into a compact engineering contract. Detailed product intent, architecture, audits, and test evidence remain in their existing documents; this file points to those sources and defines the rules that should survive individual sprints.

DeckForge is a creative instrument. Reliability, manual authority, honest behavior, and recoverability are product requirements, not cleanup work. New capability must integrate with existing owners instead of creating parallel state, transport, or persistence paths. A sprint may intentionally deliver a partial foundation, but the interface and completion report must make that boundary explicit.

## Required Reading

Before implementation, read the documents relevant to the change rather than relying on a prompt alone:

- Vision and product direction: [Vision](<00 Vision.md>), [Product Philosophy](<01 Product Philosophy.md>), [Core Principles](<02 Core Principles.md>), and [Roadmap](<23 Roadmap.md>).
- User experience and design: [User Experience](<03 User Experience.md>), [Information Architecture](<04 Information Architecture.md>), [Design System](<05 Design System.md>), and [Navigation](<06 Navigation.md>).
- Workflows: [DJ Workflow](<07 DJ Workflow.md>) and [Producer Workflow](<08 Producer Workflow.md>), plus the feature document for the domain being changed.
- AI behavior: [AI Constitution](<10 AI Constitution.md>), [AI Philosophy](<09 AI Philosophy.md>), and [Project Intelligence](<10 Project Intelligence.md>).
- Audio architecture: [Audio Architecture](<20 Audio Architecture.md>), [Audio engine map](03-audio-engine-map.md), [Global audio transport architecture](16-global-audio-transport.md), and [Authoritative transition controller](20-authoritative-transition-controller.md).
- State architecture: [State map](04-state-map.md), the relevant state audit, and the project registry ADRs in [docs/adr](adr/).
- Engineering workflow: [Coding Standards](<21 Coding Standards.md>) and [Git Workflow](<22 Git Workflow.md>).
- Verification: the latest baseline and regression checklist for every affected domain. Historical audits describe the state when written and must not be mistaken for current capability.

The [documentation index](README.md) identifies the available detailed sources and known documentation drift.

## Product and Engineering Principles

Stability comes before feature count. Preserve working playback, stopping, editing, persistence, recording, and export while expanding the workstation. A compelling new surface is not an acceptable trade for a regression in an established workflow.

Manual workflows come before AI automation. AI assists rather than replaces the user. DeckForge must remain useful when remote AI is unavailable or unwanted, and a manual instruction always outranks an automated suggestion. Recommendations should expose their evidence and remain optional.

Use progressive disclosure. Simple Mode offers a short, complete, approachable path; Advanced Mode exposes deeper evidence, routing, parameters, and control without changing the underlying project or meaning of actions. Complexity may be hidden until useful, but capability boundaries may not be hidden.

Each domain has one authoritative source of truth. Views, summaries, previews, persistence, and AI context may derive from that owner but must not become competing models. Use defined services and events to coordinate domains.

Preview multi-step, destructive, or materially creative changes before application when practical. Preserve undo when technically practical and only present it when a real recovery path exists. If a change cannot be previewed or reversed, say so before it runs and require an appropriate confirmation.

Unsupported states must be honest. Never ship enabled controls, progress, output cards, analysis, files, or success messages that simulate behavior. Disable unavailable actions and explain what dependency or implementation is missing. Partial success is reported as partial success.

## Architecture Rules

DeckForge has one Playback Registry for audible ownership and Global Stop. It has one authoritative audio transport structure and one transition controller. Feature code registers with these systems; it does not create a second global transport, hidden playback path, or unrelated scheduler.

The Project Registry is the sole authority for immutable project IDs, active project metadata, and project sessions. Names are mutable labels, never identity. Project-specific persistence uses project-scoped keys or a documented adapter. A domain must not silently fall back to ambiguous global creative storage.

Background work carries project ownership. Jobs and async requests include at least the relevant `projectId`, job identity, context version, and creation timestamp. Completion handlers revalidate ownership before mutating active state. A late result from an old context is discarded, retained for its owning project when supported, or presented for deliberate recovery; it never leaks into the current project.

DeckForge has one recording pipeline and one export pipeline. Domain adapters may contribute sources or formats, but they must not invent separate success semantics. Recording completes only after a real nonzero playable output exists. Export completes only after a real usable file exists and its extension matches the actual codec.

Use shared domain services instead of direct mutation of unrelated DOM or state. Legacy systems integrate through adapters that read the established owner and translate its contract. Do not duplicate state merely to make a new feature easier to render.

Project Intelligence consumes concise real context with provenance and freshness. It does not own audio, transport, or editor state. Producer Memory remains transparent, editable, forgettable, and project-scoped; confirmed preferences outrank inferred ones.

## State Classification

Every new field belongs to an explicit class:

- **Session state** exists for the current open interaction, such as selection, prompt drafts, filters, and transient UI position.
- **Project state** is creative work owned by one immutable project ID, such as patterns, arrangement clips, track references, decisions, and project metadata.
- **Global settings** configure the installation or device across projects, such as provider endpoints or audio-device behavior.
- **User defaults** are explicitly promoted reusable preferences; they do not silently absorb one project's creative choices.
- **Temporary runtime state** includes live `AudioNode` objects, decoded buffers, timers, active recorders, subscriptions, and temporary object URLs.
- **Generated assets** are outputs such as stems, recordings, and exports with explicit project and job ownership.
- **Shared assets** are deliberately promoted references with explicit sharing metadata. Generated assets default to private.

Classification controls storage, cleanup, ownership, migration, and restore behavior. Project-specific data must never silently fall back to a global key because identity is missing. Runtime-only material restored from metadata must be labeled missing or relink-required, not playable.

## Persistence and Migration

Persistent models have a schema version and validate at their boundaries. Migrations follow copy, validate, switch, then clean up. Keep recoverable backups while migration confidence is being established, and surface migration errors without destroying valid unrelated data.

Never persist raw `AudioBuffer` objects, temporary `AudioNode` objects, active timers, recorders, or object URLs. Object URLs are process-local and invalid after reload; persisted references must instead describe a durable source or honestly require relinking. Never place credentials, provider tokens, private keys, or unnecessary absolute paths in project data.

Autosave only meaningful changes, not high-frequency playback or rendering ticks. Pair every listener, timer, source, object URL, and subscription with cleanup. Async writes and completions must verify active project ownership and context version immediately before commit.

## Audio Rules

Avoid duplicate `AudioContext` instances, master paths, and schedulers. Connect audible and preview sources through the established graph and register them with the Playback Registry using a stable owner and a real stop callback.

Local Stop affects only its domain. Global Stop invokes every registered stop path and leaves no registered source audible. It must not unload reusable content, erase a pattern, clear a deck buffer, or delete an asset. After Global Stop, local playback must restart through the normal source-creation path. Synchronized sources share one authoritative clock and expose any timing estimate honestly.

Navigation does not implicitly determine audio ownership. Preview audio is real audio and follows the same registration and cleanup rules as main playback. Recording and export cannot be verified by a toast, card, or filename alone: inspect the produced bytes, ensure output is nonzero, and confirm it is playable or parseable in the claimed format.

## UI and Interaction Rules

Follow the existing [Design System](<05 Design System.md>) and interaction meanings. Keep beginner workflows approachable and use progressive disclosure to expose advanced evidence or parameters. An enabled visible action performs real behavior; an unavailable action is disabled and explains why.

Destructive actions require confirmation proportionate to risk. Status is never communicated by color alone. Labels, text, icons, semantics, focus, and announcements reinforce important state. Keyboard and screen-reader access must be considered alongside pointer interaction. Errors explain what failed, what was preserved, and what recovery action is available.

## Testing and Completion Standard

A feature is complete only when every relevant condition has evidence:

- The real behavior works, not just its UI representation.
- Meaningful state persists and reload restores it safely.
- Project switching remains isolated and stale async work cannot cross projects.
- Global Stop works and local playback restarts afterward.
- Relevant existing regression checklists pass.
- No visible action silently does nothing.
- Errors preserve work and offer a recovery path.
- Unsupported behavior is disabled or clearly labeled.
- Architecture documentation is updated when ownership or contracts change.

Testing should be proportional to risk. Pure transformations may be automated directly. Audio, browser-file, accessibility, and interaction paths usually need focused browser and manual checks in addition to syntax or unit tests. Record what was actually tested, including browser, fixture, output size or format where relevant, and any untested conditions. Do not convert an unperformed manual check into a checked box.

## ADR Policy

Create an Architecture Decision Record when a change introduces a new authoritative service, persistence strategy, major ownership boundary, audio scheduling model, cross-domain architecture, migration strategy, or replacement of an existing core system. An ADR records context, problem, decision, alternatives, consequences, and future work. Link it from the documentation index and relevant implementation records.

Routine component work, copy changes, narrowly scoped bug fixes, and implementation details within an established contract do not need an ADR. The purpose is durable decision memory, not paperwork volume.
