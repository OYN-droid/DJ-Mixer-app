# ADR-004: Project Asset Ownership

## Context

DITC references, Arrangement clips, stems, recordings, exports, and restored deck references need explicit ownership independent of UI state.

## Problem

Without an ownership index, generated or missing assets can be confused across projects and deletion cannot be reasoned about safely.

## Decision

`DeckForgeProjectAssets` stores a registry per project. Every indexed asset declares `assetId`, `projectId`, `owningDomain`, `createdBy`, `assetType`, `shared`, `references`, `checksum`, `missing`, and `relinkRequired`. Generated assets default to private. Registration rejects inactive-project ownership.

## Alternatives Considered

- Infer ownership from the current tab or array location. Rejected because those are mutable UI details.
- Store assets in one global array. Rejected because deletion and filtering become leak-prone.
- Persist audio Blobs in localStorage. Rejected because localStorage is unsuitable for large binary data.

## Consequences

Runtime-only recordings/exports restore as missing assets; DITC files and Deck references explicitly require relink after reload. Shared assets require an explicit future workflow.

## Future Work

Add content hashing, reference counting, shared-asset promotion, and IndexedDB-backed durable binary ownership.
