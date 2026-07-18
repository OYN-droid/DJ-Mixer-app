# ADR-003: Safe Project Switching Boundary

## Context

DeckForge owns live Web Audio nodes, timers, object URLs, MediaRecorders, timeline playback, and asynchronous server jobs.

## Problem

Mutating all in-memory singleton state during a hot switch would be error-prone and could let playback or late callbacks cross projects.

## Decision

Switching uses a strict boundary: recording safety check → Global Stop → persist active domains → mark switching → clean runtime recording/export URLs → open the target registry session → reset project runtime models → rebind project-scoped services. The application document does not reload. Closing follows the same stop, persist, cleanup, and suspend boundary and leaves the Project Library available while creative controls remain disabled.

The runtime reset contract clears decoded local files, audio buffers, nodes, timers, selections, previews, undo stacks, and other session-only objects before restoring the target project. Project-scoped storage keys and Project Intelligence, Producer Memory, recommendations, missions, Stem Lab, Arrangement, Recording, and Export services are reconfigured against the new immutable ID. Restored references without durable browser data are marked relink-required.

Async tasks carry project ownership. Completion handlers verify active `projectId` and session `contextVersion`; `owns` returns false after switching begins.

## Alternatives Considered

- Reload after every project switch. Replaced in Phase 5A.2 after explicit reset contracts were added; reload remains a recovery fallback, not the normal interaction.
- Change the active ID without resetting domain state. Rejected because audio, selections, and stale in-memory creative state would leak.
- Allow playback to continue across projects. Rejected as a direct isolation violation.
- Cancel every server job. Rejected because jobs should remain attached to their originating project and can be restored there.

## Consequences

Switching remains deterministic without interrupting the application shell. Runtime-only audio becomes relink-required rather than leaking. Producer Studio and Project Intelligence rebuild against the target ID, and the session context version advances. New project-owned runtime domains must join the reset/rebind contract before they can participate in switching.

## Future Work

Introduce abort controllers per domain for cancellable network work, add durable IndexedDB media ownership, and expand automated switching coverage as new domains are introduced.
