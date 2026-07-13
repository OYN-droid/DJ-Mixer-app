# Global audio transport architecture

## Registry module

`src/audio/playback-registry.js` loads before `app.js` and exposes one `window.AudioPlaybackRegistry` instance. It has no application-domain imports. Sources register an ID, type, display name, stop callback, optional pause, resume and restart callbacks, and a `getState` callback.

The registry reads live feature state instead of duplicating buffers, nodes or schedulers. Callback failures are isolated so Global Stop continues attempting every registered source.

## Registered sources

- `deck-a` and `deck-b`
- `ditc-preview`
- `pads`
- `drums`
- `keys`
- `stems-preview`
- `arrangement`
- `smart-mix`
- `mix-recording`

AI and transition previews currently reuse the shared preview or Smart Mix owners. They do not create separate audio nodes outside those paths.

## Transport behavior

- Play or Resume resumes the shared AudioContext and the primary resumable source.
- Pause suspends the shared AudioContext, preserving intentional overlap and scheduler position.
- Restart invokes the primary source’s real restart callback when available. Deck-local and global restart both use `restartDeck`, which resumes the shared AudioContext before creating one fresh deck source.
- Stop All Audio calls the registry’s stop callback for every source, releases performance recording, clears preview identity and refreshes playback UI.
- Stop Smart Mix remains local to automation and preserves deck audio.

Navigation does not close the AudioContext. Active audio is shown in the persistent header and as a subtle navigation indicator.
