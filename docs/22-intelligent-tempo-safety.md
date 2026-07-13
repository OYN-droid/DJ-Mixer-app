# Intelligent tempo safety

## Thresholds

The recommended defaults are:

- Preferred temporary shift: 4%
- Warning threshold: 8%
- Absolute automatic beatmatch maximum: 12%
- Automatic safer-plan suggestions: on
- Automatic safer-plan execution: off
- Confirmation before replacement: on

Advanced users may change these values locally. Values above 20% show an explicit stretching warning. Safety evaluation uses the playback-rate change required on the incoming deck. The preview also reports the absolute BPM difference and the difference as a percentage of the outgoing BPM.

## Safer-plan generation

An unsafe beatmatched plan remains visible and retains its original timestamp, deck ownership, vocal-overlap preference, source choice and incoming destination. `generateSaferTransitionPlans` produces up to three ranked alternatives using only implemented transition behavior:

- Short filter fade
- Quick cut
- Drop mix
- Limited moderate tempo adjustment with recovery
- Two-stage tempo bridge when a qualified analyzed local DITC track exists

Natural-tempo plans set the incoming playback ratio to `1`, disable unnecessary BPM recovery and label Original BPM preserved. Applying an alternative passes it to `executeSmartMixPlan`, which uses the authoritative transition controller.

Effects that are not implemented, including echo freeze, vinyl brake, reverb tail, stop-time, acapella routing and loop-out automation, are not offered as executable alternatives.

## Halftime and double-time

Subdivision interpretation is limited to pairs where the lower tempo is 60–100 BPM, the higher tempo is 120–190 BPM, the doubled relationship is within 3.5%, and neither analysis reports low percussion intensity. This supports relationships such as 70/140 without treating arbitrary mathematical ratios as musically compatible.

Two-thirds and three-halves relationships are not applied because the current beat analysis does not validate those subdivisions reliably.

## Bridge tracks

Bridge suggestions search playable, analyzed local DITC tracks between the outgoing and final incoming BPM. Current deck tracks are excluded, and both bridge steps must improve on the original mismatch. Choosing a bridge confirms a two-stage plan: DeckForge transitions to the bridge, keeps the original destination buffer, reloads it onto the free deck and schedules a natural-tempo final handoff.

Recently played history is not yet persisted, so bridge ranking currently uses BPM proximity and the existing analysis metadata rather than a full play-history score.
