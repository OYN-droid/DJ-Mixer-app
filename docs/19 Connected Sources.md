# Connected Sources

Connected Sources lets DeckForge work with music and assets across local storage, cloud libraries, and authorized services while respecting each source's technical and legal boundaries.

## Capability, not assumption

A connected item is described by explicit capabilities. Depending on the source and account, DeckForge may be able to search metadata, display artwork, audition, stream, load to a deck, analyze locally, download, edit, separate stems, record, or export. These abilities are not interchangeable.

The interface should offer only actions that the current item and authorization support. If a capability changes because an account expires, a file moves, the network is unavailable, or a provider changes policy, DeckForge should preserve the project reference and provide a clear recovery path.

## Source identity and provenance

Every asset keeps a stable internal identity plus source-specific identifiers, provenance, availability, and rights-relevant notes. Local copies and provider records may be linked without being treated as identical until the artist or reliable matching confirms the relationship.

Relinking should preserve cues, tags, notes, project references, and analysis when the musical identity remains the same. Duplicate resolution must be reviewable and reversible.

## Authentication and privacy

Connections use provider-supported authorization and request the narrowest practical permissions. Account state, synchronization status, and offline availability should be visible. Tokens and credentials belong in secure platform storage, never project files, logs, or source control.

DeckForge should avoid unnecessary background synchronization and give the artist control over disconnecting an account and removing cached information. Provider data must be used according to the provider's terms and the artist's choices.

Local files remain a first-class source. Apple Music, Spotify, YouTube, SoundCloud, cloud drives, and future integrations should enter through a common capability model rather than custom assumptions scattered throughout the interface.

Connected Sources succeeds when the artist can find and reference music broadly while always understanding what DeckForge can actually do with it.
