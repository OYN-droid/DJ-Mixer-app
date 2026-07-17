# Producer Memory persistence audit

This audit is based on the storage calls and state models in `app.js`, `src/project-intelligence.js`, `src/recommendation-engine.js`, and `src/creative-missions.js` before Sprint 8.5.

| Existing storage | Stored fields | Scope in current code | Duplicate data and stale-data risk | Privacy and migration notes |
| --- | --- | --- | --- | --- |
| `deckforge-producer-studio` | Studio mode, project ID/name, identity fields, tags, creation date, prompt history, saved prompts | One persisted Studio record; it contains a project ID but its key is not project-scoped | Identity overlaps Project Intelligence. Changing project ID would overwrite/reuse the same record. Prompt history may outlive the intended project. | Text only; no schema version. Needs migration before true multi-project switching. |
| `deckforge-project-intelligence:{projectId}` | Schema v1, project metadata, decision log, creative preferences, progress, context version and timestamps | Project-scoped | Project identity overlaps Producer Studio. Adapter-derived domains are intentionally rebuilt, reducing stale runtime state. | Versioned and malformed-data tolerant. Decision `before`/`after` values must remain free of private file contents. |
| `deckforge-contextual-recommendations:{projectId}` | Recommendation status, rejection reason, saved flag, safe recommendation snapshot, undo token | Project-scoped | Recommendation decisions also appear in Project Intelligence. A fingerprint change creates a new record, so old rejections may not cover a semantically identical suggestion. | No explicit schema version. Stored recommendation snapshots contain labels/analysis, not audio. |
| `deckforge-creative-missions:{projectId}` | Active mission ID and up to 20 normalized missions, plans, results and undo tokens | Project-scoped | Lifecycle events also appear in the decision log. Runtime identifiers can become stale when referenced clips or patterns are removed. | No explicit schema version. Does not store audio, but plan parameters require validation after model changes. |
| Smart Mix `deckforge-smart-prompt-history` | Up to 12 prompts, favorite flag, dates | Global browser scope | Overlaps Producer Studio prompt history and can leak creative direction between projects. | No project ID or schema version. User-entered text only. |
| Smart Mix `deckforge-smart-prompt-recipes` | Up to 12 named prompt recipes | Global browser scope | Potential duplicate of favorite Prompt Studio prompts. Recipes remain after a project changes. | No project ID or schema version. |
| `deckforge-tempo-safety-preferences` | Preferred shift, warning/maximum thresholds, transition preference, BPM preservation | Global browser scope | Project Intelligence copies these values into project context, but the original remains global. A project-specific preference cannot be separated without Producer Memory. | Appropriate candidate for explicit User Defaults; must not be promoted automatically. |
| `deckforge-pad-workspace` | Active bank/scene/mode/quantize, serialized banks without buffers, relink flags, scenes, prompt history | Global browser scope | Pad configuration may be reused unintentionally across projects. Buffers correctly do not persist; names can become unresolved relink placeholders. | No schema version or project ID. No raw audio or object URLs are stored. |
| `deckforge-harmony-lab` | Preset, machine, mode, key/scale/chord mode, pattern/patterns, prompt history, favorites, arpeggiator | Global browser scope | Active pattern state and favorites mix session/project/default concerns. Project Intelligence derives current harmony again. Removed preset IDs can become stale. | No schema version or project ID. Pattern note data can grow but is bounded to 30 saved patterns. |
| `deckforge-beat-forge` | Active serialized pattern, 30 patterns, 30 prompts, workspace mode | Global browser scope | Active project material and user workflow defaults are combined. Removed kit/groove IDs can become stale. | No schema version or project ID. Pattern arrays are bounded; no sample audio is stored. |
| `deckforge-beat-kit-favorites` | Drum-machine IDs | Global browser scope | Explicit favorites are reasonable user defaults but are not project-specific. IDs can become unresolved after kit changes. | Small string array; no schema version. |
| `deckforge-sources` | Saved source/reference metadata, notes, analysis, tags, favorite and verification flags | Global browser scope | DITC favorites/tags can influence every project. Local decoded buffers are session-only; persisted references may be metadata-only. | Saved `file`/URL metadata may become stale. Producer Memory export must not copy absolute private paths. |
| `deckforge-ditc-metadata` | Per-track metadata and favorite state | Global browser scope | Can overlap `deckforge-sources` fields. Track IDs derived from a session import can fail to resolve later. | No schema version/project ID. Track text only; avoid exporting private folder paths. |
| `deckforge-id-{id}` | Audio identification result for a source ID | Source/global key | May outlive a deleted source and duplicate analysis stored elsewhere. | Provider results only; provider credentials are not stored here. |

## Session-only state

Deck selection, prompt drafts, preview sources, mission UI filters, recommendation filters, DITC search, transient audio buffers, playback nodes, object URLs, active recording state, and current mission execution remain runtime state. Some parent objects also have persisted portions, but these transient fields are deliberately rebuilt.

## Scope conclusions

- Existing Project Intelligence, recommendations, and Creative Missions already use project-scoped keys.
- Producer Studio identity, Beat Forge, Harmony Lab, Pads, Smart Mix history/defaults, DITC metadata, and saved sources use global keys even when their content may feel project-specific.
- Sprint 8.5 therefore adds a separate versioned `deckforge-producer-memory:v1:{projectId}` store rather than migrating or duplicating complete domain state.
- Explicit User Defaults use a separate `deckforge-producer-memory:user-defaults:v1` key and require a direct promotion action.

## Producer Memory migration and privacy requirements

- Validate schema version, project ID, status, category, key, bounded evidence, and safe serializable values during restore/import.
- Treat malformed or unsupported schemas as empty memory without failing Producer Studio.
- Never copy raw audio, buffers, waveforms, object URLs, tokens, credentials, source file contents, or absolute paths into memory.
- Store evidence summaries and related IDs rather than duplicating recommendation, mission, or decision objects.
- Mark memories unresolved when a referenced kit, instrument, pad bank, clip, or track no longer exists; do not fail the full project context.
