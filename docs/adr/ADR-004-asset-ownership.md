# ADR-004: Project Asset Ownership

## Context

DITC references, Arrangement clips, stems, recordings, exports, and restored deck references need explicit ownership independent of UI state.

## Problem

Without an ownership index, generated or missing assets can be confused across projects and deletion cannot be reasoned about safely.

## Decision

`DeckForgeProjectAssets` stores a registry per project. Every indexed asset declares `assetId`, `projectId`, `owningDomain`, `createdBy`, `assetType`, `shared`, typed `references`, checksum evidence, missing/relink state, lifecycle state, and JSON-safe source metadata. Generated assets default to private. Registration rejects inactive-project ownership. Explicit shared references retain their owner project and are read-only when viewed from another project.

The registry is an index and ownership authority, not a binary store. Local `File` values, `AudioBuffer` values, Blob data, object URLs, credentials, and private paths are not persisted in it. Safe removal evaluates active and historical references, processing jobs, recovery requirements, favorites, and cross-project shared references before allowing a record to enter Project Trash.

## Alternatives Considered

- Infer ownership from the current tab or array location. Rejected because those are mutable UI details.
- Store assets in one global array. Rejected because deletion and filtering become leak-prone.
- Persist audio Blobs in localStorage. Rejected because localStorage is unsuitable for large binary data.

## Consequences

Runtime-only recordings/exports restore as missing assets; DITC files and Deck references explicitly require relink after reload. Explicit sharing is supported at the ownership-index level, but does not make runtime-only audio durable or transferable. Project consolidation remains unavailable until DeckForge has a browser-capable durable copy mechanism.

## Future Work

Add production content hashing at import/output boundaries and IndexedDB- or backend-backed durable binary ownership. Revisit consolidation only after every supported asset type has a real copy and recovery path.
