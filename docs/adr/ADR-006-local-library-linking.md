# ADR-006: Local Music Library Linking

## Context

DITC can already ingest user-selected browser files, Project Asset Manager owns project audio references, and the Connected Provider Foundation can retain metadata-only provider results. DeckForge needs a reusable local-library index and a safe way to match provider metadata to playable local assets without scanning a user's computer or inventing provider playback rights.

## Decision

`DeckForgeLocalLibraries` is the normalized authority for explicitly selected library roots, permission summaries, lightweight track metadata, indexing jobs, deterministic match evidence, and project-scoped link decisions. It never scans outside a browser selection. Browser `File` objects remain runtime-only; persisted records contain sanitized metadata and non-durable reference descriptions.

The service registers playable indexed tracks through DITC and Project Asset Manager rather than creating another asset system. Provider linking is deterministic and version-aware. Exact matches require an ISRC or aligned title, artist, and known duration. Live, remix, remaster, edit, instrumental, clean/explicit, and duration conflicts require review and are never silently selected. Confirmation and unlinking cross a single bridge into Project Asset Manager. Playback continues to use the existing Playback Registry.

M3U and M3U8 are the only implemented playlist imports. Entries remain metadata-only until the user explicitly reselects accessible audio. Apple Music local files are supported only as ordinary, unprotected files the browser can access through explicit selection; cloud-only items, DRM-protected media, and private Music application databases are unavailable.

## Consequences

Metadata survives a browser restart, but browser file permission does not. Libraries therefore expose `Permission Required`, `Missing`, and `Disconnected` states and preserve their index while asking the user to reauthorize. Refresh is manual because no durable directory watcher is implemented. Exports remove runtime handles and force imported tracks back to permission-required state.

Checksums and embedded tag parsing are not implemented in this phase. Format capability is based on the browser's media declaration and remains subject to real Web Audio decode verification on first use. Duplicate-copy grouping is metadata evidence, not automatic deletion.

## Alternatives Considered

- Scan common music folders automatically. Rejected because browser access and product governance require explicit user selection.
- Store `FileSystemHandle`, object URLs, or audio bytes in localStorage. Rejected because these are runtime capabilities or binary data, not safe portable project metadata.
- Auto-link the highest fuzzy score. Rejected because recording versions and clean/explicit variants can be materially different assets.
- Parse Apple Music's private database or bypass DRM. Rejected as unsupported, unsafe, and outside DeckForge's permissions.

## Future Work

Embedded tag and artwork extraction, durable File System Access handles, directory watching, checksum workers, additional playlist formats, desktop-native library connectors, and authenticated provider workflows require separate capability, privacy, migration, and regression decisions.
