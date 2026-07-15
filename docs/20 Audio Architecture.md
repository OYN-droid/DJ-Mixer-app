# Audio Architecture

DeckForge's audio architecture must make every sound source responsive, synchronized, recordable, and stoppable. The design favors one shared system with explicit ownership over isolated feature engines that happen to reach the speakers.

## Shared foundation

The application uses one primary audio context and one shared master output graph per running workspace. Master gain, metering, safety limiting, recording taps, device routing, and Global Stop belong to that foundation. Features connect through defined buses rather than creating independent master paths.

A shared musical clock provides time, tempo, meter, beat position, and quantization boundaries. Beat Forge, Pads, Harmony Lab, deck transitions, and arrangement playback may schedule differently, but they derive timing from the same clock when synchronized operation is requested.

## Playback ownership

Every audible source registers with a playback control plane and has one clear owner. The owner controls loading, play, pause, seek, stop, cleanup, and error state. Global transport coordinates owners through that interface instead of manipulating internal nodes or media elements directly.

The decks own deck playback. Smart Mix coordinates those decks through approved controls and does not create duplicate deck sources. Beat Forge owns its pattern scheduler, Pads owns active pad voices, Harmony Lab owns its note voices, and Stem Lab owns its preview and stem-set voices. Producer Studio coordinates arrangement regions without erasing source ownership.

Global Stop must silence and reset all registered playback predictably. A subsequent local Play starts through the same ownership path as a normal start. Navigation and editor teardown must release listeners, scheduled events, object URLs, nodes, and temporary media resources.

## State and failure behavior

Transport state is explicit, observable, and not inferred only from button labels. Loading, ready, playing, paused, stopped, ended, and failed states have defined transitions. Browser autoplay restrictions, missing devices, decoding errors, unavailable sources, and suspended audio contexts produce visible recovery actions.

Only one scheduler or event listener should own a given musical action. Recording observes the final routed signal or structured event stream through documented taps, so captured output matches the performance without double triggering.

The architectural test is practical: an artist should always know what is playing, which control owns it, how it is synchronized, and how to stop it.
