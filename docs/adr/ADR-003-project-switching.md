# ADR-003: Safe Project Switching Boundary

## Context

DeckForge owns live Web Audio nodes, timers, object URLs, MediaRecorders, timeline playback, and asynchronous server jobs.

## Problem

Mutating all in-memory singleton state during a hot switch would be error-prone and could let playback or late callbacks cross projects.

## Decision

Switching uses a strict boundary: Global Stop → persist active domains → mark switching → clean runtime recording/export URLs → open the target registry session → reload. Closing follows Global Stop → persist → cleanup → suspend audio and disables creative controls until another project opens.

Async tasks carry project ownership. Completion handlers verify active `projectId` and session `contextVersion`; `owns` returns false after switching begins.

## Alternatives Considered

- Hot-swap every singleton in place. Rejected for this sprint because it risks audio leakage.
- Allow playback to continue across projects. Rejected as a direct isolation violation.
- Cancel every server job. Rejected because jobs should remain attached to their originating project and can be restored there.

## Consequences

Switching is intentionally reload-backed but deterministic. Runtime-only audio becomes relink-required rather than leaking. Producer Studio and Project Intelligence rebuild against the target ID.

## Future Work

Introduce abort controllers per domain and enable a reload-free switch only after all singletons implement reset contracts.
