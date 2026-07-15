# Recommendation System Audit

This audit records the recommendation and suggestion paths present before Sprint 8.3. Findings are based on `app.js` and `index.html`; no unavailable capabilities are inferred.

## Existing systems

| Surface | Source and functions | Trigger and context | Supported actions | Assessment before Sprint 8.3 |
| --- | --- | --- | --- | --- |
| Producer Studio cards | `buildProducerSuggestions`, `renderProducerSuggestions`, `applyProducerSuggestion` | Studio render; reads shared Project Intelligence plus some direct `sourceFiles` state | Preview generated a Prompt Studio plan, Apply copied the suggestion prompt into a working plan, Explain toggled generic copy, Dismiss, runtime-only Undo | Partial. Conditions used real context, but the objects were not normalized, confidence was a percentage of non-empty fields, explanations were generic, and Preview/Apply did not execute the named domain action. |
| Producer missions | `PRODUCER_MISSIONS`, `renderProducerMissions` | Static list rendered in Advanced Mode | Opens a hard-coded prompt as a plan | Hard-coded creative starting points, not contextual recommendations. Kept as missions rather than recommendation evidence. |
| Smart Mix prompt safety | `parseSmartMixPrompt`, `evaluateTempoSafety`, `generateSaferTransitionPlans`, `selectSaferTransitionPlan`, `applySmartPromptPlan` | User plans a prompt-directed transition; reads deck BPM, tempo preferences, deck readiness, phrase timing, stems and candidate tracks | Preview plan text, explain, choose safer alternative, execute through existing Smart Mix transition controller, cancel/manual override | Real and executable. Separate from Producer Studio and used percentage confidence specific to its own plan scorer. Sprint 8.3 must delegate to it rather than duplicate mixing. |
| Smart Mix plan builder | `buildSmartMixPlan`, `startSmartMix`, transition scoring helpers | User starts Smart Mix; reads selected DITC/deck items and analyses | Starts/schedules the existing transition plan | Real domain behavior, but not registered as a shared recommendation source. |
| DITC transition scoring | `scoreTransition`, crate rendering and DITC inspector helpers | DITC list/selection render; track analysis and current deck context | Preview/load deck/add to Smart Mix/arrangement through DITC actions | Real per-track scoring and actions, but no normalized recommendation lifecycle, explanation contract, rejection memory, or shared ranking. |
| Mixtape discovery | reference identification, structure analysis, blueprint construction and `renderMixtapeInspiration` | Explicit reference analysis; filename metadata, optional recognition results, local analysis, notes and artwork | Review analysis, apply blueprint as Prompt Studio plan | Partial. Evidence and uncertainty are shown, but blueprint chapters were not shared recommendation objects and had no common status/undo model. |
| Beat Forge Match | `renderBeatMatch`, `previewBeatMatch`, `applyBeatMatch`, `undoBeatEdit` | Beat Forge render with a loaded deck; deck BPM plus canonical Beat Forge state | Real audio preview through Beat Forge, apply canonical pattern edit, existing undo stack, reject/explain controls | Real domain action with partial recommendation semantics. Logic and lifecycle were isolated inside Beat Forge. |
| Beat Forge prompt/groove | prompt plan builders, groove candidate measurement, `previewGrooveModel`, `applyGrooveCandidate`, `undoLastGroove` | Explicit Beat Forge prompt or groove selection; canonical pattern, locks, timing and kit | A/B or candidate preview, apply, cancel and undo | Real and reversible, but user initiated rather than surfaced by a shared project rule engine. |
| Harmony Match | `renderHarmonyMatch`, `previewHarmonyPattern`, `applyHarmonyPlan`, `undoHarmony` | Harmony Lab render; loaded deck BPM/key when available, otherwise Beat Forge groove and selected scale | Real synthesis preview, apply canonical Harmony pattern, reject/explain and undo | Partial. Real actions exist, but the fallback could describe a suggestion without verified project key and had no shared confidence or rejection persistence. |
| Pad AI plan | `previewAiPadPlan`, `applyAiPadPlan` | Explicit Pad prompt; decoded local DITC sources and current occupied pads | Structured non-audio plan, apply after overwrite confirmation | Real local-source plan with warnings. It is not a contextual recommendation and does not preview the resulting audio bank as a whole. |
| Pad macros | `previewPadMacro`, `runPadMacro`, `cancelPadMacro` | Explicit macro selection; selected pad and active loops | Text preview, real trigger/loop stop, cancel | Real action path, but not project-ranked and not evidence-driven beyond current pad state. |
| Stem opportunities | Prompt Studio `planStemUsage`; Stem Lab result cards and `handleStemAction` | Prompt generation or separated stem results | Preview through registered stem preview, route to decks/pads, download, delete | Functional stem actions exist. Before Sprint 8.3, Producer Studio showed a generic “Stem Opportunity” when no stems existed, even though no functional stem action was then available. |
| Arrangement warnings | `arrangementIntelligence`, `buildProjectIntelligenceSnapshot`, `generateEditorAiSuggestions` | Project-context refresh or explicit editor suggestion button; clip timing/types and selected clip | Editor guidance and normal manual editor actions | Real gap/intro/outro facts exist. Editor suggestions were static guidance templates and were not tied to common apply, stale, or undo handling. |
| Project Intelligence risks | `buildProjectIntelligenceSnapshot` | Every meaningful context sync | Display only in Advanced Project Intelligence | Real supported risks (missing outro, gaps, specific pad/vocal condition), but not actionable recommendation objects. |

## Duplicated logic

- Tempo mismatch and transition safety are described in Producer Studio, Smart Mix prompt safety, Smart Mix scoring and DITC transition scoring. Smart Mix owns execution and must remain the sole transition engine.
- Beat/deck compatibility exists in both Beat Forge Match and the old Producer Studio “Develop the Active Groove” prompt card.
- Harmony opportunity logic exists in Harmony Match and the old Producer Studio “Harmony Space Available” prompt card.
- Missing intro/outro facts exist in Arrangement Intelligence, Project Intelligence risks, Editor suggestions and Producer Studio cards.
- Stem opportunities appear in Prompt Studio plan generation and the old Producer Studio card even when prepared stems are absent.
- Confidence is represented as several unrelated percentages or labels; their inputs and meanings differ by feature.

## Explanation, preview and undo gaps

- Producer Studio’s card explanation was the same generic sentence for every recommendation and did not enumerate evidence.
- Its Preview created a prompt plan rather than previewing the affected domain.
- Its Apply changed Prompt Studio state rather than the domain named on the card.
- Its Undo restored the prior prompt only and was lost on reload.
- Dismissal was persisted as a simple ID set, but rejection reasons and evidence fingerprints were not tracked.
- Smart Mix, Beat Forge and Harmony Lab have real preview/apply flows, but their results were not reflected in a shared recommendation status/history model.
- Arrangement guidance has no safe synthesized audio preview. Opening the relevant editor is the honest action until an actual clip candidate exists.
- Recording and export actions existed outside recommendations and had no shared validation pipeline.

## Stale-state risks

- Sprint 8.2 added a context-version check for Producer Studio cards, but cards were rebuilt through page functions rather than a shared recommendation registry.
- Rejection IDs such as `intro` or `transition` were broader than the evidence that created them, so genuinely new evidence could remain hidden.
- Domain-local Match suggestions could outlive the deck, pattern, key or groove that generated them.
- Runtime-only undo functions were not available after a recommendation refresh.
- Several render-time suggestion builders mixed shared context with direct globals, increasing the chance that display and action validation used different snapshots.

## Sprint 8.3 boundary

The shared recommendation engine normalizes evidence, ranking, confidence labels, status, rejection fingerprint, context version and capabilities. Domain execution remains in existing DeckForge functions. No recommendation object owns audio buffers, Web Audio nodes, complete patterns, files, transition controllers or arrangement clip payloads.
