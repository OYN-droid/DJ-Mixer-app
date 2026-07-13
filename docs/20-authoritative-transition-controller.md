# Authoritative transition controller

## Ownership

`transitionController` owns the one pending transition deadline. Manual Smart Mix, prompt plans and deck quick actions all prepare transitions through the existing Smart Mix engine, then call `scheduleTransition` through `scheduleNextAutoMix`.

The controller exposes these lifecycle functions:

- `scheduleTransition`
- `replaceScheduledTransition`
- `cancelScheduledTransition`
- `executeTransition`
- `completeTransition`

Only the pending trigger is centralized. Incoming-deck preparation, playback, crossfader automation, filter and channel blending, transition completion and BPM recovery continue to use the existing Smart Mix functions.

## Playback-position scheduler

The controller stores a concrete outgoing-deck playback timestamp and polls `currentDeckTime` at a short interval. Pausing the outgoing deck freezes its countdown. Resuming continues toward the same playback timestamp. Normal seeks recalculate the remaining time. A seek that jumps past the target pauses scheduling and asks for Execute Now, Next Phrase, Delay From Now or Cancel.

Each scheduled plan records its ID, source, priority, outgoing and incoming decks, trigger type, target playback time, transition object, controller version and status. A version token prevents a cancelled scheduler from executing later.

## Priority and replacement

Pending instructions use this priority order:

1. Manual user control
2. Deck Quick Action
3. Prompt
4. Smart Mix
5. Default automatic planning

Applying a prompt or deck quick instruction safely cancels pending Smart Mix scheduling while preserving deck buffers and currently playing audio. A crossfade already in progress remains locked until it completes or the user takes manual control.

## Timestamp interpretation

Prompt timing supports `M:SS`, `MM:SS`, `H:MM:SS`, natural-language minutes and seconds, relative seconds, seconds before track end, time before another timestamp and completion-by timestamps. Unless stated otherwise, an exact timestamp means begin the transition when the outgoing deck reaches that playback position.

Incoming-deck cue timestamps are stored separately from the outgoing trigger. Phrase requests remain labelled beat-grid estimates because reliable phrase recognition is unavailable.

## Deck quick actions

Each deck can schedule Now, 15 sec, 10 sec, 5 sec, Next Phrase, At Timestamp or Custom. Five-second actions select a short supported style and disable unsafe beatmatching when the BPM difference is large. An empty incoming deck requires additional preparation time for short deadlines.
