# Stem Lab regression checklist

Record browser, operating system, server/model, source format, and result for each run. Use local audio that the tester is authorized to process.

## Sources and processing

- [ ] Load a supported local track and confirm its name and duration.
- [ ] Send a decoded local track from DITC.
- [ ] Send the current Deck A track without interrupting playback.
- [ ] Send the current Deck B track without interrupting playback.
- [ ] Begin two-stem separation and observe Uploading, Preparing, Separating, Encoding, and Finalizing where available.
- [ ] Confirm stage-based progress is labelled estimated when exact model progress is unavailable.
- [ ] Cancel a queued job.
- [ ] Cancel an active job and confirm its process and temporary input are cleaned.
- [ ] Retry a cancelled or failed job.
- [ ] Queue multiple jobs and confirm the concurrency limit is enforced.
- [ ] Remove a completed job without deleting an asset currently used by a deck, pad, or arrangement.
- [ ] Reload and confirm completed references restore or clearly require relinking.

## Playback and mixing

- [ ] Preview every produced stem.
- [ ] Stop an individual preview locally.
- [ ] Play all available stems on one aligned timeline.
- [ ] Pause, resume, restart, seek, and loop all stems together without audible drift.
- [ ] Confirm a missing or undecodable stem prevents misleading synchronized playback.
- [ ] Mute and unmute each stem with a visible text state.
- [ ] Solo one stem, then clear Solo.
- [ ] Adjust per-stem volume and confirm only that stem changes.
- [ ] Adjust pan and available advanced controls with labelled values.
- [ ] Press local Stop and confirm deck playback continues.
- [ ] Navigate away during preview and confirm the Global Transport still identifies Stem Lab.
- [ ] Press Global Stop All Audio and confirm all stem voices and every other registered source stop.

## Routing and export

- [ ] Load an individual stem onto Deck A.
- [ ] Load an individual stem onto Deck B.
- [ ] Confirm before replacing audio on a playing deck.
- [ ] Send a stem to an empty Pad.
- [ ] Fill the current pad bank and confirm Stem Lab does not overwrite an assignment silently.
- [ ] Send a stem to Arrangement and confirm source/alignment metadata.
- [ ] Send a drum stem to Beat Forge and preview before replacing a kit or lane.
- [ ] Send a melodic stem to Harmony Lab and label analysis as estimated.
- [ ] Export an individual stem.
- [ ] Preview and export an acapella.
- [ ] Preview and export an instrumental.
- [ ] Route acapella and instrumental groups to decks, Pads, and Arrangement.

## Graph, intelligence, and recovery

- [ ] Create source, stem, mixer, and Arrangement graph nodes.
- [ ] Create and remove a valid route.
- [ ] Reject an invalid route with a visible explanation.
- [ ] Reject a feedback loop.
- [ ] Build a graph proposal from a prompt and review nodes, routes, warnings, missing sources, and confidence before Apply.
- [ ] Preview, Apply, edit, regenerate, cancel, and undo a recommendation.
- [ ] Start a guided mashup and validate BPM, key, duration, alignment, and local availability.
- [ ] Confirm Project Intelligence updates for start, complete, failure, routing, graph save, and mashup creation.
- [ ] Confirm Producer Memory stores preferences only, never audio data.
- [ ] Confirm Creative Missions opens and uses real Stem Lab state.
- [ ] Stop the stem server and confirm a useful Backend unavailable recovery message.
- [ ] Submit an unsupported format and confirm it is rejected before processing.
- [ ] Submit an oversized file and confirm the size limit is explained.
- [ ] Simulate an output missing from disk and confirm a relink or retry state.
- [ ] Simulate an output decode failure and confirm other outputs are not presented as synchronized.
- [ ] Confirm temporary inputs are removed after success, failure, and cancellation.

## Protected regressions

- [ ] Manual Deck A and Deck B playback, pause, restart, loop, and crossfader still work.
- [ ] Auto Mix and Smart Mix still use the current decks and shared transition controller.
- [ ] Prompt-directed and tempo-safe transitions still work.
- [ ] DITC import and preview still work.
- [ ] Pads trigger, gate, loop, choke, and Global Stop behavior still work.
- [ ] Beat Forge playback, preview, recording, and routing still work.
- [ ] Harmony Lab playback, preview, MIDI, and routing still work.
- [ ] Producer Studio, recommendations, missions, and Producer Memory still initialize.
- [ ] Arrangement playback remains registered and stoppable.
- [ ] No visible Stem Lab control silently does nothing.

