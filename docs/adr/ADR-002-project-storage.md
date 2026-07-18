# ADR-002: Project-Scoped Storage and Migration

## Context

Several established domains persisted to global localStorage keys while newer engines used their own project suffixes.

## Problem

Global creative keys leaked state between projects. Destructive key moves risked losing existing work.

## Decision

Legacy creative domains use `deckforge-project:v1:{projectId}:{domain}` through the Project Registry. Existing independently project-scoped engines remain behind documented adapters. Migration follows copy → JSON validation → scoped read, retains the legacy key, and stores a timestamped recoverable backup plus a visible migration report.

Global configuration such as identification endpoints, audio-device behavior, tempo-safety preferences, and kit favorites remains global.

## Alternatives Considered

- Intercept all localStorage calls. Rejected because hidden rewriting obscures ownership.
- Delete legacy keys after copying. Rejected because recovery would be harder.
- Rewrite every established engine in one pass. Rejected because it would endanger playback and export stability.

## Consequences

Pads, DITC, Smart Mix history/recipes, Beat Forge, Harmony Lab, Stem Lab, Producer Studio, Deck references, and existing project-scoped engines restore independently. Backup storage is intentionally retained.

## Future Work

Move large metadata and durable audio assets to IndexedDB while retaining the same registry adapter contract.
