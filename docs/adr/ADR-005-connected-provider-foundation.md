# ADR-005: Connected Provider Foundation

## Context

DITC already accepts local files and public music-service URLs, while Project Asset Manager owns metadata-to-local-audio relinking. Future provider integrations need one capability model without implying that a catalog result is playable, downloadable, editable, or authorized.

## Problem

Provider names inferred from URLs are not provider integrations. Scattered provider-specific checks would duplicate connection state, search coordination, error handling, project ownership, and playback assumptions. Persisting account credentials or authorization URLs in project state would also violate the Connected Sources privacy boundary.

## Decision

`DeckForgeProviders` is the global authority for provider registration, sanitized connection summaries, normalized capabilities, search results, errors, grouped availability, cancellation, cache state, and diagnostics.

Each adapter declares an explicit provider definition and capability matrix. An action is available only when the adapter implements the method and the capability is supported. Local Files is the only functional provider in this phase. Apple Music, Spotify, SoundCloud, YouTube, YouTube Music, cloud storage, and record pools are registered as honest unavailable foundations; they do not simulate connections or results.

Searches carry the active project identity and reject late results after project ownership changes. Import crosses a single runtime bridge into project-scoped DITC state. Provider metadata references reuse Project Asset Manager for local-audio linking. The existing Playback Registry remains the only playback authority.

Only sanitized connection summaries and public provider identifiers may persist. Tokens, secrets, passwords, authorization headers, signed URL parameters, credential-bearing URL components, binary audio, and object URLs are excluded. Search cache is global metadata cache; imported references remain project-scoped.

## Alternatives Considered

- Add bespoke Apple, Spotify, SoundCloud, and YouTube code directly to DITC. Rejected because capability and account behavior would diverge.
- Treat every provider URL as fetchable audio. Rejected because catalog pages are usually not audio resources and this falsely advertises native playback.
- Store provider credentials in project localStorage. Rejected because project export, switching, and diagnostics must never carry account secrets.
- Build a second relinking or playback system for providers. Rejected because Asset Manager and Playback Registry already own those responsibilities.

## Consequences

The application can display one consistent provider browser, partial failures, capability labels, grouped availability, and project-safe metadata imports. Local files remain real and playable. Network provider foundations remain visibly unavailable until supported SDK, backend, authorization, policy, and test work exists.

Global browser localStorage is not secure credential storage. A future authenticated adapter must keep confidential credentials in secure backend or platform storage and persist only a redacted account summary in this service.

## Future Work

Implement providers individually only after their authorization, backend proxy, policy, rate-limit, regional availability, playback, and regression requirements are documented. Add durable cache migration and secure backend session handling before enabling any real account connection.
