# DeckForge

DeckForge is a recovery-stage browser DJ mixer and music-making workstation. The project is being stabilized before new product work. Manual DJing is the first-class workflow. The goal is to help a beginner load two tracks and mix quickly, while leaving room for advanced performance and production tools.

DeckForge is fun first and powerful over time. AI features are optional assistants. Human creativity and manual control have the final say.

## Current status

The repository contains substantial prototype implementations for two decks, mixer controls, pads, drums, keys, stems, the DITC local music library, Smart Mix, local prompt planning, mixtape analysis and arrangement. Browser audio behavior still requires manual QA. Connected provider names and several recognition integrations are placeholders or external configuration points, not bundled streaming or AI services.

## Architecture

- `index.html` contains the static application shell.
- `styles.css` contains the complete visual layer.
- `app.js` is a single browser script containing state, Web Audio graphs, rendering, analysis and event handling.
- `src/audio/playback-registry.js` coordinates playback ownership and Global Stop while leaving feature audio engines intact.
- `stem_server.py` serves the frontend and provides bounded asynchronous `POST /api/stem-jobs` separation through Demucs, plus capability, status, and cancellation endpoints.

No build step is required.

## Run the frontend

For UI inspection without server stems:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. Directly opening `index.html` may limit Fetch and media behavior.

## Run the stem server

Python 3 is required. Demucs is optional but required for true model-based stem separation. A Python 3.11 or 3.12 environment is recommended for Demucs compatibility.

```sh
python3 -m venv .venv-stems
source .venv-stems/bin/activate
python3 -m pip install "demucs==4.0.1" "numpy<2"
python3 stem_server.py
```

Set `PORT` to change the default port of 8000. Set `DECKFORGE_STEM_MODEL` to change the six-stem model, `DECKFORGE_STEM_CONCURRENCY` to change the default two-job processing limit, and `DECKFORGE_STEM_MAX_BYTES` to change the 500 MB upload limit. If Demucs is unavailable, Stem Lab records the failure and offers an explicit rough browser-preview action. Those previews are not true isolated stems.

## Security

Never commit `.env` files, API keys, tokens, credentials or private keys. Current optional fingerprint-provider configuration is read from localStorage and is not suitable for production secrets. A future server proxy should own credentials. The development stem server validates file type and size, removes temporary inputs, bounds Demucs concurrency, and binds to localhost, but it still has no authentication or automatic expiry for completed outputs. Use it only on a trusted local machine and remove unneeded generated outputs.

## Current limitations

- The application has not yet passed a full audio-enabled browser QA cycle.
- Local files, decoded audio, pads, decks and arrangements are memory-only.
- URL audio loading depends on remote CORS permission.
- Apple Music, Spotify and other platform detection does not provide SDK playback.
- AI planning is local heuristic logic. It is not a hosted generation model.
- Cue monitor buttons do not route headphone audio.
- There is no undo system or saved arrangement format.

## Documentation

Start with the [documentation index](docs/README.md), [feature inventory](docs/01-feature-inventory.md), [audio map](docs/03-audio-engine-map.md), [roadmap](docs/07-roadmap.md) and [manual QA checklist](docs/08-manual-qa-checklist.md).

## Recovery workflow

The original baseline is commit `05a99fd`. Recovery work belongs on `recovery/deckforge-v2`. Before each focused change, confirm `git status`, review the diff, and create a small commit. Recover any baseline file with `git show 05a99fd:<path>` without overwriting current work.

## Development notes

Preserve working audio behavior. Avoid large framework migrations and broad `app.js` rewrites. Add tests before moving audio code. Keep documentation and user-facing prose clear, use commas or separate sentences instead of dash interruptions, and do not present placeholder controls as functional.
