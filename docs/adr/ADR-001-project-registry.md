# ADR-001: Authoritative Project Registry

## Context

DeckForge previously derived project identity from Producer Studio storage and several hard-coded fallback IDs.

## Problem

Names, tabs, and subsystem defaults could disagree about which project owned mutable state. Renaming could not be separated cleanly from identity.

## Decision

`DeckForgeProjectRegistry` is the only authority for immutable `projectId`, project metadata, and the active session. A session carries `sessionId`, `projectId`, `contextVersion`, `creationTimestamp`, and switching state. Names remain mutable display metadata and never form references.

## Alternatives Considered

- Continue passing Producer Studio state between domains. Rejected because it duplicates identity.
- Use project names as storage keys. Rejected because rename would invalidate references.
- Put identity in URL parameters. Deferred because routing is not required for isolation.

## Consequences

Single-project users retain an automatically opened migrated project. Domains receive the registry ID at startup. Project creation and opening become explicit lifecycle operations.

## Future Work

Add import/export of registry metadata and an optional recent-project launch screen.
