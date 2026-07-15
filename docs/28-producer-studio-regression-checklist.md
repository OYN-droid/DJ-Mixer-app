# Producer Studio Regression Checklist

Run these tests in an audio-enabled browser. Producer Studio may plan from local project data, but audible playback regressions must be verified by listening.

## Project overview and shared context

- [ ] Open Studio and confirm Project Overview shows project name, BPM, key, genre, subgenre, progress, reference mixtape, deck state, mix length, recording state, and AI state.
- [ ] Change global BPM and confirm the overview updates while Studio is open.
- [ ] Load Deck A or Deck B, return to Studio, and confirm deck status, duration, key, genre, and progress reflect the loaded project.
- [ ] Import DITC tracks, create a Beat Forge pattern, add Harmony Lab notes, load pads, generate stems, and add arrangement clips; confirm each system appears in `window.DeckForgeProjectContext`.
- [ ] Confirm the shared context object updates in place and exposes DITC, Decks, Smart Mix, Beat Forge, Harmony Lab, Pads, Stem Lab, Arrangement, Mixtape Analyzer, BPM, key, genre, progress, reference, and tags.

## Prompt Studio

- [ ] Enter a free-form prompt and generate a plan.
- [ ] Confirm the generated plan is visible in both Simple and Advanced modes.
- [ ] Confirm the plan automatically reflects current BPM, decks, crate, pads, stems, drums, and harmony context without repeating those details in the prompt.
- [ ] Apply a plan and confirm existing local plan behavior still works.
- [ ] Save a prompt, reuse it from Saved, and refresh to confirm persistence.
- [ ] Generate multiple prompts and confirm History updates newest-first.
- [ ] Favorite and unfavorite a history item and confirm the Favorites group updates.
- [ ] Reuse a suggested prompt and each prompt template.
- [ ] Clear the prompt and confirm the working plan resets without altering project audio.

## Suggestions and missions

- [ ] Confirm Today’s Suggestions renders contextual cards for arrangement, transitions, pads, Beat Forge, Harmony Lab, stems, and DITC.
- [ ] Preview a suggestion and confirm it creates a reviewable plan without changing playback.
- [ ] Apply a suggestion to the working plan, then Undo it.
- [ ] Open and close Explain content.
- [ ] Dismiss a card, refresh the page, and confirm the dismissal persists.
- [ ] Use Refresh to restore dismissed cards.
- [ ] Start each Creative Mission and confirm it creates the matching editable prompt plan.

## Timeline and modes

- [ ] Generate, save, preview, apply, dismiss, and undo Studio actions; confirm Project Timeline records timestamps and action labels.
- [ ] Use a timeline Undo action and confirm the associated working-plan change is reversed.
- [ ] Refresh and confirm journal entries persist.
- [ ] Clear the journal and confirm it remains empty after refresh.
- [ ] In Simple Mode, confirm only Project Overview, Prompt Studio, Today’s Suggestions, and Creative Missions are shown.
- [ ] In Advanced Mode, confirm Project Timeline and Project Intelligence appear.
- [ ] Confirm Advanced Mode shows detailed context, AI reasoning, confidence, project graph, and future integrations.
- [ ] Refresh in either mode and confirm the selected mode persists.

## Playback and feature regression

- [ ] Complete `docs/11-decks-regression-checklist.md`.
- [ ] Complete `docs/19-prompt-smart-mix-regression-checklist.md`.
- [ ] Complete `docs/23-tempo-safety-regression-checklist.md`.
- [ ] Complete `docs/25-pads-regression-checklist.md`.
- [ ] Complete `docs/27-beat-forge-regression-checklist.md`.
- [ ] Start, pause, resume, restart, and stop Harmony Lab playback.
- [ ] Start Smart Mix, navigate through Studio, and confirm the active transition is not duplicated, stopped, or rescheduled.
- [ ] Play Decks, Pads, Beat Forge, Harmony Lab, and Arrangement sources, then confirm Global Stop All Audio still stops every registered source.
- [ ] Confirm Studio previews do not start audio and Studio Apply never silently replaces manual project work.
