# Connected Provider Foundation audit

Date: 2026-07-18  
Branch: `feature/connected-provider-foundation`

## Scope and evidence

This audit records the provider behavior present before Phase 5B.1 implementation. Evidence came from `index.html`, `app.js`, `src/project-assets.js`, `src/project-registry.js`, `stem_server.py`, the root README, project/asset ADRs, and current DITC, Project Registry, Project Library, and Asset Manager regression records. No provider SDK packages, OAuth callback handlers, music-catalog backend routes, provider token exchange, account persistence, or provider-specific source modules were found.

The existing `AudioIdentificationService` is a separate optional fingerprint-recognition subsystem. It reads endpoint and optional API-key configuration from browser localStorage and can send audio segments to ACRCloud, AudD, AcoustID, or a custom endpoint. It is not a connected music-library provider architecture and is not reused as one.

## Existing surfaces

- DITC is the only music-source browser. It supports explicit local file/folder import and a collapsible “Add a project or provider reference” URL form.
- URL references persist in project-scoped DITC storage. `detectPlatform()` infers a display label from hostname for YouTube, SoundCloud, Bandcamp, Spotify, or Apple Music.
- Reference rows are labeled metadata references but expose “Try Deck A/B” controls. Those controls attempt a CORS fetch and audio decode for every URL, including streaming catalog pages. Failure is caught and explained, but the controls imply capability before it is known.
- There are no source-filter chips, provider cards, provider settings panels, normalized results, connection health, rate-limit state, grouped availability, search cancellation, or provider cache.
- Asset Manager indexes saved DITC URLs as `Provider Metadata Reference` rows and supplies the established manual local-audio linking workflow.
- Local files are real browser-selected `File`/`AudioBuffer` sources. There is no full-disk scan and no durable file handle.
- Mixtape discovery includes deterministic metadata/filename/artwork/notes helpers and optional fingerprint endpoints. It does not search Apple Music, Spotify, SoundCloud, or YouTube catalogs.

## Provider matrix

| Provider | Classification | Frontend | Backend | Authentication | Search/library/playlists | Preview | Native playback | Local link/import | Placeholder behavior and limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Local Files | Functional | DITC in `index.html` and `app.js` | None | Explicit browser file/folder permission | Searches imported in-memory project files through DITC filters; no OS library scan or playlists | Real decoded local preview | Yes, through existing Web Audio/decks | Real DITC import and Asset Manager registration/linking | Runtime file bytes disappear after reload; metadata restores as relink-required. |
| Local Music Libraries | Unavailable | No distinct surface | None | None | None | None | None | Local Files only | No Music.app/iTunes XML, filesystem library, or IndexedDB adapter exists. |
| Apple Music | Placeholder | Hostname label in DITC URL references | None | None; no MusicKit | None | None | No | Metadata URL can be saved and manually linked | No developer-token route, MusicKit authorization, catalog/library search, playlists, or SDK playback. A saved catalog URL must not imply downloadable audio. |
| Spotify | Placeholder | Hostname label in DITC URL references | None | None; no OAuth | None | None | No | Metadata URL can be saved and manually linked | No client configuration, token exchange, search, library, playlist, Web Playback SDK, or audio import. |
| SoundCloud | Placeholder | Hostname label in DITC URL references | None | None | None | None | No | Metadata URL can be saved and manually linked | No API adapter, likes/uploads/playlists, permitted stream resolution, or download verification. |
| YouTube | Placeholder | Hostname label in DITC URL references | None | None | None | None | No | Metadata URL can be saved and manually linked | No Data API adapter, playlists, embeds, native audio, downloading, or extraction. YouTube and YouTube Music are not distinguished. |
| YouTube Music | Unavailable | Falls through to the YouTube hostname label when applicable | None | None | None | None | No | Manual URL reference only | No separate result type, catalog adapter, or account support. |
| Bandcamp | Placeholder | Hostname label only | None | None | None | None | No | Manual URL reference and local link | Not requested as a first-class sprint adapter; no catalog or purchase/download integration. |
| Cloud Storage | Unavailable | None | None | None | None | None | No | None | No picker, file-handle, API, or synchronization implementation. |
| Record Pools | Unavailable | None | None | None | None | None | No | None | No provider adapters or credentials. |
| Private music libraries | Unavailable | None | None | None | None | None | No | None | No integration installed. |
| AI recommendations | Partial, separate domain | Mixtape and recommendation surfaces | Optional user-configured fingerprint endpoints only | Browser localStorage endpoint/API key for recognition | Deterministic project discovery, not provider catalog search | Local project audio only | Local audio only | Can reference DITC evidence | Web-search helper creates external searches; it does not return verified provider catalog results. |
| Verified mixtape tracks | Partial | Mixtape analysis output | Optional recognition endpoints | Same optional recognition configuration | Fingerprint matches only | No provider playback | No | Can become project evidence | Match confidence and provenance exist, but no connected-provider availability or import adapter exists. |

### Search, library, playlist, and import detail

| Provider | Search | User library | Playlists | Import |
| --- | --- | --- | --- | --- |
| Local Files | Imported session files only | Active-project DITC files | None | Real playable DITC import |
| Apple Music | None | None | None | Public metadata URL only |
| Spotify | None | None | None | Public metadata URL only |
| SoundCloud | None | None | None | Public metadata URL only |
| YouTube / YouTube Music | None | None | None | Public metadata URL only |
| Bandcamp | None | None | None | Public metadata URL only |
| Cloud Storage / Record Pools / Private Libraries | None | None | None | None |
| AI recommendations | Deterministic project discovery only | Existing project evidence | None | Existing DITC evidence only |
| Verified mixtape tracks | Optional fingerprint recognition only | None | None | Metadata evidence only |

## Persistence, configuration, and security

- DITC references are project-scoped through `deckforge-project:v1:{projectId}:ditc-sources` and contain URL/name plus user metadata. They contain no provider tokens.
- Provider connections do not exist. There is no global account store or backend token store.
- The fingerprint subsystem reads `deckforge-id-*` objects from browser localStorage and accepts `apiKey`; it builds an Authorization header in frontend code. The root README already identifies this as unsuitable for production secrets. Phase 5B.1 must not migrate those credentials into project state or present them as music-provider connections.
- `stem_server.py` has Stem Lab routes only. No Apple developer-token, OAuth redirect/callback, refresh-token, catalog proxy, rate-limit, or provider-health route exists.
- No `.env` file is committed. No provider private key, client secret, access token, or refresh token was found in tracked application files.
- Project asset manifests sanitize source location and do not export provider credentials. Provider metadata references retain public provider identifiers/URLs only.

## Duplicate and local-link behavior

- Saved URL references are independent DITC rows and are capped to the latest 20 entries. There is no duplicate check before adding the same URL.
- Asset Manager can classify exact durable references and metadata similarities, but DITC provider references do not yet use normalized provider/result IDs, ISRC, version, explicit state, or grouped availability.
- Asset Manager owns the working metadata-to-local-audio link operation. Provider work should call that workflow rather than add adapter-specific relinking.

## Error, availability, and offline behavior

- Saved reference actions attempt `fetch(url, { mode: "cors" })` and decode only audio/octet-stream responses. Errors collapse to a streaming-platform explanation.
- There is no provider-specific configuration, authentication, permission, region, policy, rate-limit, or retry classification.
- Offline local files that remain in the current browser session continue to work. Saved metadata persists. Connected search has no implementation.
- Capability badges do not exist. “Metadata reference” is the only meaningful current availability label.

## Required Phase 5B.1 boundary

Phase 5B.1 should introduce a global, sanitized Provider Registry and connection foundation; normalized capabilities/results/errors; a real Local Files adapter; honest non-connected foundations for Apple Music, Spotify, SoundCloud, YouTube, YouTube Music, cloud storage, and record pools; a cancellable partial-failure search coordinator; and project-scoped DITC import records that reuse Asset Manager linking. It must remove inferred native-playback actions from metadata-only references and must not add provider SDK playback, OAuth secrets, DRM workarounds, downloads, or a second audio path.
