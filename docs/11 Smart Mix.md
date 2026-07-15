# Smart Mix

Smart Mix helps DJs plan and execute transitions while preserving the feel of hands-on mixing. It is a deck-aware assistant, not an autonomous replacement for track selection or performance judgment.

## Core experience

The artist chooses the source and destination tracks, or asks DeckForge to recommend candidates from available music. Smart Mix evaluates usable metadata and analysis such as BPM, key, phrase structure, energy, cue positions, and track availability. It then proposes a transition plan in musical language.

A plan should communicate:

- Which deck leads and which deck enters
- The proposed entry and exit regions
- Phrase length and transition duration
- Tempo strategy and any safety adjustment
- Crossfader, level, EQ, filter, or stem movement
- Risks caused by uncertain analysis or limited source capabilities

The artist can edit the plan, audition it, execute it, or ignore it. Deck controls remain live throughout the process.

## Prompt-directed mixing

Prompts such as "make this transition faster," "keep the vocals clean," or "move into something darker" should modify a concrete plan, not merely produce descriptive text. DeckForge should show how the prompt changed timing, track choice, energy, or processing before committing the change.

Quick transitions offer dependable musical shortcuts for common performance needs. They use the same transition model as prompt-directed plans so that manual, preset, and AI-assisted workflows do not diverge.

## Tempo and playback safety

Tempo changes must respect configurable limits and account for half-time or double-time relationships. When the requested blend would create an excessive pitch or tempo shift, Smart Mix should choose a safer technique, shorten the blend, suggest another cue, or clearly warn the artist.

BPM recovery may compare embedded metadata, local analysis, tap input, and user correction. The corrected value becomes authoritative for the project unless the artist asks to analyze again.

Smart Mix coordinates the decks through the shared playback system. It must not create a second transport or hidden audio path. Global Stop, deck Stop, manual fader movement, and direct deck loading always have predictable ownership and override behavior.
