(function initializeContextualRecommendations(global) {
  "use strict";

  const STORAGE_PREFIX = "deckforge-contextual-recommendations";
  const STATUSES = new Set(["New", "Viewed", "Previewed", "Accepted", "Applied", "Rejected", "Dismissed", "Stale", "Failed", "Undone", "Saved"]);
  const PRIORITY_WEIGHT = { "Needs Attention": 400, "Recommended Next": 300, "Creative Opportunity": 200, "Optional Experiment": 100 };
  const DOMAIN_ICONS = { DITC: "⌕", Decks: "◉", "Smart Mix": "↝", Pads: "▦", "Beat Forge": "◫", "Harmony Lab": "♬", "Stem Lab": "≋", Arrangement: "▤", "Mixtape Intelligence": "◇", "Project Planning": "✦", Recording: "●", "Export Readiness": "⇧" };
  const subscribers = new Set();
  let projectId = "deckforge-session";
  let getContext = () => null;
  let executeAction = async () => ({ success: false, message: "No recommendation action adapter is registered." });
  let current = [];
  let history = {};
  let refreshTimer = null;
  let lastError = "None";
  let lastRefreshReason = "Not initialized";
  let lastApplyResult = "None";
  let lastUndoResult = "None";
  let staleCount = 0;
  let generatedCount = 0;
  let validatedCount = 0;
  let rejectedByValidation = 0;
  let triggeredRuleIds = [];
  let rankingScores = {};

  function safeClone(value, fallback = null) {
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { lastError = error.message || "Serialization failed"; return fallback; }
  }

  function compact(value) {
    return String(value ?? "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 80) || "context";
  }

  function storageKey() { return `${STORAGE_PREFIX}:${projectId}`; }

  function loadHistory() {
    try { history = JSON.parse(localStorage.getItem(storageKey()) || "{}"); }
    catch (error) { history = {}; lastError = error.message || "Recommendation history restore failed"; }
  }

  function persistHistory() {
    try { localStorage.setItem(storageKey(), JSON.stringify(history)); }
    catch (error) { lastError = error.message || "Recommendation history save failed"; }
  }

  function confidenceLabel(score) {
    if (score >= 0.78) return "High Confidence";
    if (score >= 0.52) return "Medium Confidence";
    return "Experimental";
  }

  function normalizeRecommendation(rule, context) {
    const evidence = (rule.evidence || []).filter((item) => item && item.value !== undefined && item.value !== null);
    const confidence = Math.max(0, Math.min(1, Number(rule.confidence ?? (evidence.length ? 0.5 : 0))));
    const fingerprint = rule.fingerprint || evidence.map((item) => `${item.label}:${item.value}`).join("|") || String(context.contextVersion);
    const recommendationId = `${rule.ruleId}:${compact(fingerprint)}`;
    const prior = history[recommendationId] || {};
    return {
      recommendationId,
      ruleId: rule.ruleId,
      projectId: context.project?.projectId || projectId,
      type: rule.type || "Guidance",
      domain: rule.domain,
      domainIcon: DOMAIN_ICONS[rule.domain] || "✦",
      title: rule.title,
      summary: rule.summary,
      explanation: rule.explanation,
      evidence,
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      confidenceBasis: rule.confidenceBasis || `${evidence.length} supporting signal${evidence.length === 1 ? "" : "s"}`,
      expectedImpact: rule.expectedImpact || "Clarify the next creative decision",
      difficulty: rule.difficulty || "Easy",
      beginnerFriendly: rule.beginnerFriendly !== false,
      learningNote: rule.learningNote || null,
      advancedDetails: rule.advancedDetails || {},
      suggestedAction: rule.suggestedAction || null,
      alternativeActions: rule.alternativeActions || [],
      previewCapability: rule.previewCapability || { available: false, reason: "No temporary preview is available for this guidance." },
      applyCapability: rule.applyCapability || { available: false, reason: "This recommendation is guidance only." },
      undoCapability: rule.undoCapability || { available: false, reason: "No project state is changed." },
      contextVersion: context.contextVersion,
      createdAt: new Date().toISOString(),
      expiresAt: rule.expiresAt || null,
      status: STATUSES.has(prior.status) ? prior.status : "New",
      priority: rule.priority || "Creative Opportunity",
      source: rule.source || "Deterministic DeckForge rule",
      relatedTrackIds: rule.relatedTrackIds || [],
      relatedDeckIds: rule.relatedDeckIds || [],
      relatedPatternIds: rule.relatedPatternIds || [],
      relatedPadIds: rule.relatedPadIds || [],
      relatedClipIds: rule.relatedClipIds || [],
      warnings: rule.warnings || [],
      dependencies: rule.dependencies || [],
      fingerprint,
      rejectionReason: prior.rejectionReason || null,
      savedForLater: Boolean(prior.savedForLater),
      undoToken: prior.undoToken || null,
      rankingScore: 0
    };
  }

  function deckRules(context) {
    const decks = (context.decks || []).filter((deck) => deck.loadedTrack);
    const rules = [];
    if (decks.length === 1 && context.ditc?.playableTracks > 0) rules.push({
      ruleId: "decks-prepare-incoming", domain: "Decks", type: "Playback Readiness",
      title: "Prepare the incoming deck", summary: `Deck ${decks[0].id.toUpperCase()} has ${decks[0].loadedTrack.name}; the other deck is empty while DITC has playable tracks.`,
      explanation: "Loading and cueing an incoming track before the current record approaches its transition point prevents a rushed handoff.",
      evidence: [{ label: "Loaded deck", value: `Deck ${decks[0].id.toUpperCase()}` }, { label: "Loaded track", value: decks[0].loadedTrack.name }, { label: "Playable DITC tracks", value: context.ditc.playableTracks }, { label: "Other deck", value: "Empty" }],
      confidence: 0.9, expectedImpact: "Keep the next transition ready without starting playback", difficulty: "Easy", beginnerFriendly: true,
      learningNote: "Preparing the next deck early gives you time to check tempo, key, cue point, and transition style.",
      suggestedAction: { actionId: "open-ditc", label: "Choose Incoming Track", affectedDomains: ["DITC", "Decks"] },
      priority: "Recommended Next", relatedDeckIds: [decks[0].id], fingerprint: `${decks[0].id}|${decks[0].loadedTrack.name}|${context.ditc.playableTracks}`
    });
    if (decks.length !== 2 || !decks[0].bpm || !decks[1].bpm) return rules;
    const [a, b] = decks;
    const difference = Math.abs(a.bpm - b.bpm);
    const percent = difference / Math.max(a.bpm, b.bpm) * 100;
    const threshold = Number(context.creativePreferences?.preferredTempoShift || 4);
    if (percent <= threshold) return [];
    const extreme = percent > Number(context.creativePreferences?.warningThreshold || 8);
    rules.push({
      ruleId: "smart-mix-large-bpm-jump", domain: "Smart Mix", type: "Playback Risk",
      title: "These tracks need a shorter transition",
      summary: `Deck A and Deck B differ by ${difference.toFixed(1)} BPM, beyond the preferred ${threshold}% tempo-shift range.`,
      explanation: "A long beatmatched blend would stretch one track. A short filter handoff, quick cut, or drop mix preserves both records more naturally.",
      evidence: [{ label: "Deck A BPM", value: a.bpm }, { label: "Deck B BPM", value: b.bpm }, { label: "BPM difference", value: `${difference.toFixed(1)} BPM` }, { label: "Difference", value: `${percent.toFixed(1)}%` }, { label: "Preferred shift", value: `${threshold}%` }],
      confidence: 0.92, confidenceBasis: "Both loaded decks have BPM analysis and the configured tempo limit is known",
      expectedImpact: "Avoid audible tempo stretching during the handoff", difficulty: "Easy", beginnerFriendly: true,
      learningNote: "DJs often use effects, drop mixes, or quick cuts when tempos are far apart.",
      advancedDetails: { bpmDifference: difference, percentDifference: percent, preferredThreshold: threshold, keyA: a.key || "Not analyzed", keyB: b.key || "Not analyzed" },
      suggestedAction: { actionId: "smart-safe-transition", label: "Build Safer Plan", affectedDomains: ["Smart Mix", "Decks"] },
      alternativeActions: [{ actionId: "open-smart-mix", label: "Edit in Smart Mix" }],
      previewCapability: { available: true, label: "Preview Plan", actionId: "smart-safe-transition" },
      applyCapability: { available: true, label: "Apply Safer Plan", actionId: "smart-safe-transition" },
      undoCapability: { available: false, reason: "A scheduled or active transition remains controlled by Smart Mix Cancel and manual override." },
      priority: extreme ? "Needs Attention" : "Recommended Next", source: "Tempo safety rule",
      relatedDeckIds: [a.id, b.id], fingerprint: `${a.loadedTrack.name}|${a.bpm}|${b.loadedTrack.name}|${b.bpm}|${threshold}`,
      warnings: [extreme ? "A long automatic beatmatch may exceed the configured safety range." : "Prefer a shorter overlap."]
    });
    return rules;
  }

  function arrangementRules(context) {
    const arrangement = context.arrangement || {};
    if (!arrangement.clipCount) return [];
    const rules = [];
    const playable = Number(context.ditc?.playableTracks || 0) + (context.decks || []).filter((deck) => deck.loadedTrack).length;
    if (arrangement.introStatus === "Not planned" && playable) rules.push({
      ruleId: "arrangement-missing-intro", domain: "Arrangement", type: "Structure",
      title: "Create a clear intro", summary: "The arrangement has content but no clip is identified as an intro.",
      explanation: "A defined opening gives the first full track a deliberate entrance and leaves room for a drop, spoken tag, or rhythmic setup.",
      evidence: [{ label: "Arrangement clips", value: arrangement.clipCount }, { label: "Intro status", value: arrangement.introStatus }, { label: "Playable sources", value: playable }],
      confidence: 0.86, expectedImpact: "Give the project a deliberate opening", beginnerFriendly: true,
      learningNote: "An intro can be short; its job is to establish the project before the first full section.",
      suggestedAction: { actionId: "start-mission:generate-intro", label: "Start Intro Mission", affectedDomains: ["Beat Forge", "Harmony Lab", "Pads", "Arrangement"] },
      priority: "Recommended Next", relatedClipIds: (arrangement.clips || []).map((clip) => clip.id), fingerprint: `${arrangement.clipCount}|${arrangement.introStatus}|${playable}`
    });
    if (arrangement.outroStatus === "Not planned") rules.push({
      ruleId: "arrangement-missing-outro", domain: "Arrangement", type: "Structure",
      title: "Add an intentional outro", summary: "The current arrangement ends without an identified outro.",
      explanation: "An outro creates a clean ending for recording or export instead of stopping on an unresolved section.",
      evidence: [{ label: "Timeline length", value: `${Number(arrangement.timelineLength || 0).toFixed(1)} seconds` }, { label: "Clip count", value: arrangement.clipCount }, { label: "Outro status", value: arrangement.outroStatus }],
      confidence: 0.9, expectedImpact: "Create a deliberate ending", beginnerFriendly: true,
      suggestedAction: { actionId: "start-mission:generate-outro", label: "Start Outro Mission", affectedDomains: ["Beat Forge", "Harmony Lab", "Arrangement"] },
      priority: "Needs Attention", relatedClipIds: (arrangement.clips || []).map((clip) => clip.id), fingerprint: `${arrangement.clipCount}|${arrangement.outroStatus}|${arrangement.timelineLength}`
    });
    if ((arrangement.unresolvedGaps || []).length) {
      const gap = arrangement.unresolvedGaps[0];
      rules.push({
        ruleId: "arrangement-empty-gap", domain: "Arrangement", type: "Timeline Risk",
        title: "Fill the empty timeline region", summary: `The arrangement contains a ${Number(gap.duration).toFixed(1)}-second gap.`,
        explanation: "Unless silence is intentional, this region will interrupt the mix or exported arrangement.",
        evidence: [{ label: "Gap start", value: `${Number(gap.start).toFixed(1)} seconds` }, { label: "Gap end", value: `${Number(gap.end).toFixed(1)} seconds` }, { label: "Gap duration", value: `${Number(gap.duration).toFixed(1)} seconds` }],
        confidence: 0.96, expectedImpact: "Prevent unintended silence", difficulty: "Easy", beginnerFriendly: true,
        suggestedAction: { actionId: "open-arrangement", label: "Inspect Gap", affectedDomains: ["Arrangement"] },
        priority: "Needs Attention", relatedClipIds: (arrangement.clips || []).map((clip) => clip.id), fingerprint: `${gap.start}|${gap.end}|${arrangement.clipCount}`
      });
    }
    return rules;
  }

  function beatRules(context) {
    const beat = context.beatForge || {};
    if (!beat.activePattern) return [];
    const arrangementHasBeat = (context.arrangement?.clips || []).some((clip) => clip.sourceKind === "drums" || clip.type === "drums");
    const loadedDeck = (context.decks || []).find((deck) => deck.loadedTrack);
    const rules = [];
    if (loadedDeck) rules.push({
      ruleId: "beat-match-loaded-deck", domain: "Beat Forge", type: "Rhythm",
      title: "Preview a lighter transition groove", summary: `${beat.activePattern.name} can be compared with a sparser pattern around the loaded deck.`,
      explanation: "A lighter kick pattern leaves space for the record while preserving the current Beat Forge idea until you explicitly apply it.",
      evidence: [{ label: "Pattern", value: beat.activePattern.name }, { label: "Pattern BPM", value: beat.bpm || "Not set" }, { label: "Loaded deck", value: loadedDeck.loadedTrack.name }, { label: "Deck BPM", value: loadedDeck.bpm || "Not analyzed" }],
      confidence: loadedDeck.bpm ? 0.82 : 0.58, expectedImpact: "Reduce rhythmic masking around a transition", difficulty: "Intermediate", beginnerFriendly: true,
      suggestedAction: { actionId: "beat-match", label: "Apply Lighter Groove", affectedDomains: ["Beat Forge"] },
      previewCapability: { available: true, label: "Preview Groove", actionId: "beat-match" },
      applyCapability: { available: true, label: "Apply Groove", actionId: "beat-match" },
      undoCapability: { available: true, label: "Undo", actionId: "beat-match" },
      priority: "Creative Opportunity", relatedDeckIds: [loadedDeck.id], relatedPatternIds: [beat.activePattern.id], fingerprint: `${beat.activePattern.id}|${beat.patternVersion}|${loadedDeck.loadedTrack.name}|${loadedDeck.bpm}`
    });
    if (!arrangementHasBeat) rules.push({
      ruleId: "beat-send-arrangement", domain: "Beat Forge", type: "Workflow",
      title: "Place the active beat in Arrangement", summary: `${beat.activePattern.name} is active but is not represented on the timeline.`,
      explanation: "Sending the canonical pattern to Arrangement creates an editable performance clip without changing Beat Forge playback.",
      evidence: [{ label: "Pattern", value: beat.activePattern.name }, { label: "Pattern version", value: beat.patternVersion }, { label: "Arrangement beat clips", value: 0 }],
      confidence: 0.94, expectedImpact: "Turn the rhythm idea into editable arrangement material", difficulty: "Easy", beginnerFriendly: true,
      suggestedAction: { actionId: "beat-to-arrangement", label: "Add to Arrangement", affectedDomains: ["Beat Forge", "Arrangement"] },
      applyCapability: { available: true, label: "Add to Arrangement", actionId: "beat-to-arrangement" },
      undoCapability: { available: true, label: "Undo", actionId: "beat-to-arrangement" },
      priority: context.project?.projectPhase === "Producing" ? "Recommended Next" : "Creative Opportunity", relatedPatternIds: [beat.activePattern.id], fingerprint: `${beat.activePattern.id}|${beat.patternVersion}|${context.arrangement?.clipCount || 0}`
    });
    return rules;
  }

  function harmonyRules(context) {
    const harmony = context.harmonyLab || {};
    const loadedDeck = (context.decks || []).find((deck) => deck.loadedTrack && deck.key);
    const arrangementHasHarmony = (context.arrangement?.clips || []).some((clip) => clip.sourceKind === "keys" || clip.type === "keys");
    const rules = [];
    if (!harmony.melody && (loadedDeck || context.beatForge?.activePattern)) rules.push({
      ruleId: "harmony-create-supported", domain: "Harmony Lab", type: "Harmony",
      title: "Create harmony from the current musical context", summary: loadedDeck ? `Deck ${loadedDeck.id.toUpperCase()} has key evidence (${loadedDeck.key}); Harmony Lab has no active material.` : "Beat Forge is active and Harmony Lab has no material yet.",
      explanation: loadedDeck ? "Harmony Match can use the analyzed deck key and tempo to create a previewable progression." : "Harmony Lab can create a restrained idea around the active Beat Forge pocket, but key compatibility remains experimental until a key is analyzed.",
      evidence: [{ label: "Harmony material", value: "None" }, ...(loadedDeck ? [{ label: "Deck key", value: loadedDeck.key }, { label: "Deck BPM", value: loadedDeck.bpm || "Not analyzed" }] : [{ label: "Beat pattern", value: context.beatForge.activePattern.name }])],
      confidence: loadedDeck ? 0.84 : 0.48, expectedImpact: "Add a musical layer while preserving the existing rhythm", difficulty: "Intermediate", beginnerFriendly: true,
      suggestedAction: { actionId: "harmony-match", label: "Apply Harmony Match", affectedDomains: ["Harmony Lab"] },
      previewCapability: { available: true, label: "Preview Harmony", actionId: "harmony-match" },
      applyCapability: { available: true, label: "Apply Harmony", actionId: "harmony-match" },
      undoCapability: { available: true, label: "Undo", actionId: "harmony-match" },
      priority: "Creative Opportunity", relatedDeckIds: loadedDeck ? [loadedDeck.id] : [], fingerprint: `${loadedDeck?.loadedTrack.name || context.beatForge.activePattern.name}|${loadedDeck?.key || "no-key"}|${context.beatForge?.patternVersion || 0}`,
      warnings: loadedDeck ? [] : ["Project key is not analyzed; treat this as an experiment."]
    });
    if (harmony.melody && !arrangementHasHarmony) rules.push({
      ruleId: "harmony-send-arrangement", domain: "Harmony Lab", type: "Workflow",
      title: "Place the harmony idea in Arrangement", summary: `${harmony.melody.name} exists in Harmony Lab but not on the timeline.`,
      explanation: "Sending it to Arrangement preserves the Harmony pattern as editable performance events.",
      evidence: [{ label: "Harmony pattern", value: harmony.melody.name }, { label: "Notes", value: harmony.melody.noteCount }, { label: "Arrangement harmony clips", value: 0 }],
      confidence: 0.94, expectedImpact: "Turn the harmony sketch into arrangement material", difficulty: "Easy", beginnerFriendly: true,
      suggestedAction: { actionId: "harmony-to-arrangement", label: "Add to Arrangement", affectedDomains: ["Harmony Lab", "Arrangement"] },
      applyCapability: { available: true, label: "Add to Arrangement", actionId: "harmony-to-arrangement" },
      undoCapability: { available: true, label: "Undo", actionId: "harmony-to-arrangement" },
      priority: "Recommended Next", relatedPatternIds: [harmony.melody.name], fingerprint: `${harmony.melody.name}|${harmony.melody.version}|${context.arrangement?.clipCount || 0}`
    });
    return rules;
  }

  function padRules(context) {
    const pads = context.pads || {};
    const rules = [];
    if (!pads.assignedPadCount && context.ditc?.playableTracks > 0) rules.push({
      ruleId: "pads-build-from-ditc", domain: "Pads", type: "Workflow",
      title: "Prepare a playable pad bank", summary: `Bank ${pads.activeBank || "A"} has no playable assignments while DITC has ${context.ditc.playableTracks} local track${context.ditc.playableTracks === 1 ? "" : "s"}.`,
      explanation: "The existing Pad AI Builder can create a reviewable local-source plan without inventing or downloading audio.",
      evidence: [{ label: "Assigned pads", value: 0 }, { label: "Playable DITC tracks", value: context.ditc.playableTracks }, { label: "Active bank", value: pads.activeBank || "A" }],
      confidence: 0.88, expectedImpact: "Create performance-ready pad options from local audio", difficulty: "Easy", beginnerFriendly: true,
      suggestedAction: { actionId: "start-mission:build-pad-bank", label: "Start Pad Bank Mission", affectedDomains: ["DITC", "Pads"] },
      priority: "Creative Opportunity", fingerprint: `${pads.activeBank}|0|${context.ditc.playableTracks}`
    });
    if (pads.activeLoops?.length && (context.smartMix?.enabled || context.smartMix?.currentPlan?.length)) rules.push({
      ruleId: "pads-stop-loop-before-transition", domain: "Pads", type: "Playback Risk",
      title: "Stop the pad loop before the transition", summary: `${pads.activeLoops.length} pad loop${pads.activeLoops.length === 1 ? " is" : "s are"} active while a Smart Mix transition is active or planned.`,
      explanation: "Stopping the loop before the handoff prevents an extra rhythm or vocal from masking both decks.",
      evidence: [{ label: "Active pad loops", value: pads.activeLoops.join(", ") }, { label: "Smart Mix state", value: context.smartMix.state || "Planned" }],
      confidence: 0.9, expectedImpact: "Reduce transition clutter", difficulty: "Easy", beginnerFriendly: true,
      suggestedAction: { actionId: "stop-pad-loops", label: "Stop Pad Loops", affectedDomains: ["Pads"] },
      applyCapability: { available: true, label: "Stop Loops", actionId: "stop-pad-loops" },
      priority: "Needs Attention", relatedPadIds: pads.activeLoops, fingerprint: `${pads.activeLoops.join("-")}|${context.smartMix.state}`
    });
    const recent = new Set((pads.recentTriggers || []).map((item) => Number(item.pad)));
    const unused = (pads.assignedPads || []).find((pad) => !recent.has(Number(pad.index)) && !/loop/i.test(pad.mode || ""));
    if (unused) rules.push({
      ruleId: "pads-unused-one-shot", domain: "Pads", type: "Performance Opportunity",
      title: `Preview unused Pad ${unused.index}`, summary: `${unused.name} is playable in Bank ${pads.activeBank} and has not been triggered recently.`,
      explanation: "A short one-shot can add a deliberate accent without changing the pad bank or arrangement.",
      evidence: [{ label: "Pad", value: unused.index }, { label: "Name", value: unused.name }, { label: "Mode", value: unused.mode }, { label: "Recent use", value: "Not in recent triggers" }],
      confidence: 0.76, expectedImpact: "Add a controlled performance accent", difficulty: "Easy", beginnerFriendly: true,
      suggestedAction: { actionId: "preview-pad", label: `Preview Pad ${unused.index}`, affectedDomains: ["Pads", "Playback"] },
      previewCapability: { available: true, label: "Preview Pad", actionId: "preview-pad" },
      priority: "Optional Experiment", relatedPadIds: [unused.index], fingerprint: `${pads.activeBank}|${unused.index}|${unused.name}|${(pads.recentTriggers || []).length}`
    });
    return rules;
  }

  function stemRules(context) {
    const stems = context.stems || {};
    if (!(stems.availableStemTypes || []).length) return [];
    const bass = stems.availableStemTypes.find((name) => /bass/i.test(name));
    const vocal = stems.availableStemTypes.find((name) => /vocal/i.test(name));
    const chosen = bass || vocal || stems.availableStemTypes[0];
    return [{
      ruleId: "stems-preview-transition-part", domain: "Stem Lab", type: "Remix Opportunity",
      title: `Preview the ${chosen} stem`, summary: `${stems.availableStemTypes.length} prepared stem${stems.availableStemTypes.length === 1 ? " is" : "s are"} available for a transition or remix layer.`,
      explanation: bass ? "Previewing the bass stem helps decide whether removing outgoing low end would create a cleaner handoff." : "Preview the isolated part before routing it to a deck or pad.",
      evidence: [{ label: "Available stems", value: stems.availableStemTypes.join(", ") }, { label: "Suggested preview", value: chosen }],
      confidence: 0.88, expectedImpact: "Evaluate a stem-based transition without changing routing", difficulty: "Intermediate", beginnerFriendly: true,
      suggestedAction: { actionId: "preview-stem", label: `Preview ${chosen}`, affectedDomains: ["Stem Lab", "Playback"] },
      previewCapability: { available: true, label: "Preview Stem", actionId: "preview-stem" },
      priority: "Creative Opportunity", fingerprint: `${stems.separatedTracks?.[0]?.source || "source"}|${chosen}|${stems.availableStemTypes.join("-")}`,
      advancedDetails: { availableStemTypes: stems.availableStemTypes, selectedStem: stems.selectedStem || "None" }
    }];
  }

  function ditcAndPlanningRules(context) {
    const rules = [];
    if (!context.ditc?.totalTracks && !(context.decks || []).some((deck) => deck.loadedTrack) && !context.arrangement?.clipCount && !context.beatForge?.activePattern && !context.harmonyLab?.melody && !context.pads?.assignedPadCount) return rules;
    if (context.ditc?.playableTracks > 0 && context.ditc.playableTracks < 3 && !context.arrangement?.clipCount) rules.push({
      ruleId: "project-collect-more-tracks", domain: "Project Planning", type: "Planning",
      title: "Add a few more playable tracks", summary: `DITC currently has ${context.ditc.playableTracks} playable track${context.ditc.playableTracks === 1 ? "" : "s"}.`,
      explanation: "A small additional pool gives Smart Mix and Arrangement enough material to create contrast and a deliberate ending.",
      evidence: [{ label: "Playable DITC tracks", value: context.ditc.playableTracks }, { label: "Arrangement clips", value: context.arrangement?.clipCount || 0 }],
      confidence: 0.8, expectedImpact: "Increase viable sequencing and transition options", difficulty: "Easy", beginnerFriendly: true,
      suggestedAction: { actionId: "open-ditc", label: "Open DITC", affectedDomains: ["DITC"] },
      priority: "Recommended Next", fingerprint: `${context.ditc.playableTracks}|${context.arrangement?.clipCount || 0}`
    });
    const favorite = (context.ditc?.favorites || []).find((item) => !(context.ditc.selectedTracks || []).some((selected) => selected.id === item.id));
    if (favorite && context.ditc.playableTracks) rules.push({
      ruleId: "ditc-unused-favorite", domain: "DITC", type: "Track Opportunity",
      title: "Revisit an unused favorite", summary: `${favorite.name} is favorited but is not in the current DITC selection.`,
      explanation: "A known favorite may provide contrast or a transition option without relying on an unverified reference track.",
      evidence: [{ label: "Favorite", value: favorite.name }, { label: "Current selection", value: `${context.ditc.selectedTracks?.length || 0} tracks` }, { label: "Playable local tracks", value: context.ditc.playableTracks }],
      confidence: 0.7, expectedImpact: "Surface a trusted option for sequencing", difficulty: "Easy", beginnerFriendly: true,
      suggestedAction: { actionId: "open-ditc", label: "Review in DITC", affectedDomains: ["DITC"] },
      priority: "Creative Opportunity", relatedTrackIds: [favorite.id], fingerprint: `${favorite.id}|${context.ditc.selectedTracks?.length || 0}`
    });
    if (!context.project?.genre && context.ditc?.totalTracks >= 2) rules.push({
      ruleId: "project-confirm-identity", domain: "Project Planning", type: "Identity",
      title: "Confirm the project direction", summary: "The project has music but no confirmed genre identity.",
      explanation: "Confirming the direction improves future ranking without changing any tracks or playback.",
      evidence: [{ label: "Project genre", value: "Not set" }, { label: "Available tracks", value: context.ditc.totalTracks }],
      confidence: 0.72, expectedImpact: "Make later recommendations more relevant", difficulty: "Easy", beginnerFriendly: true,
      suggestedAction: { actionId: "open-project-intelligence", label: "Review Project Context", affectedDomains: ["Project Planning"] },
      priority: "Recommended Next", fingerprint: `${context.ditc.totalTracks}|no-genre`
    });
    return rules;
  }

  function recordingRules(context) {
    const rules = [];
    if (context.arrangement?.clipCount && context.playback?.recordingStatus === "Not recording" && context.project?.projectProgress >= 45) rules.push({
      ruleId: "recording-capture-test-mix", domain: "Recording", type: "Milestone",
      title: "Capture a test mix", summary: `The arrangement has ${context.arrangement.clipCount} clips and project progress is ${context.project.projectProgress}%.`,
      explanation: "A test recording reveals balance and pacing issues before export. Starting it is explicit and can be stopped immediately.",
      evidence: [{ label: "Arrangement clips", value: context.arrangement.clipCount }, { label: "Project progress", value: `${context.project.projectProgress}%` }, { label: "Recording status", value: context.playback.recordingStatus }],
      confidence: 0.78, expectedImpact: "Create a reviewable test take", difficulty: "Easy", beginnerFriendly: true,
      suggestedAction: { actionId: "start-mix-recording", label: "Start Test Recording", affectedDomains: ["Recording", "Playback"] },
      applyCapability: { available: true, label: "Start Recording", actionId: "start-mix-recording" },
      undoCapability: { available: true, label: "Stop Recording", actionId: "start-mix-recording" },
      priority: "Recommended Next", fingerprint: `${context.arrangement.clipCount}|${context.project.projectProgress}|${context.playback.recordingStatus}`
    });
    if (context.arrangement?.exportReadiness && context.playback?.recordingStatus === "Take ready") rules.push({
      ruleId: "export-ready", domain: "Export Readiness", type: "Milestone",
      title: "Export the completed test take", summary: "The arrangement structure is ready and a recorded take is available.",
      explanation: "Exporting now creates a test version without altering the arrangement.",
      evidence: [{ label: "Arrangement export readiness", value: "Ready" }, { label: "Recording", value: "Take ready" }],
      confidence: 0.98, expectedImpact: "Create a shareable review version", difficulty: "Easy", beginnerFriendly: true,
      suggestedAction: { actionId: "download-mix", label: "Download Test Mix", affectedDomains: ["Export Readiness"] },
      applyCapability: { available: true, label: "Download", actionId: "download-mix" },
      priority: "Recommended Next", fingerprint: `${context.arrangement.timelineLength}|take-ready`
    });
    return rules;
  }

  function mixtapeRules(context) {
    const mixtape = context.mixtape || {};
    if (!mixtape.referenceAnalysis || !(mixtape.recommendations || []).length) return [];
    return [{
      ruleId: "mixtape-review-blueprint", domain: "Mixtape Intelligence", type: "Reference",
      title: "Review the reference blueprint", summary: `${mixtape.referenceAnalysis.name} produced ${mixtape.recommendations.length} project chapter recommendation${mixtape.recommendations.length === 1 ? "" : "s"}.`,
      explanation: "The blueprint can inform the project without copying or automatically applying the reference structure.",
      evidence: [{ label: "Reference", value: mixtape.referenceAnalysis.name }, { label: "Detected identity", value: mixtape.detectedIdentity || "Not inferred" }, { label: "Blueprint chapters", value: mixtape.recommendations.length }],
      confidence: 0.68, expectedImpact: "Turn reference analysis into an editable plan", difficulty: "Intermediate", beginnerFriendly: false,
      suggestedAction: { actionId: "open-mixtape-analysis", label: "Review Blueprint", affectedDomains: ["Mixtape Intelligence"] },
      priority: "Creative Opportunity", fingerprint: `${mixtape.referenceAnalysis.name}|${mixtape.recommendations.length}`
    }];
  }

  function generateRules(context) {
    return [
      ...deckRules(context), ...arrangementRules(context), ...beatRules(context), ...harmonyRules(context),
      ...padRules(context), ...stemRules(context), ...ditcAndPlanningRules(context), ...recordingRules(context), ...mixtapeRules(context)
    ];
  }

  function rankRecommendations(recommendations, context) {
    rankingScores = {};
    return [...recommendations].map((recommendation) => {
      let score = PRIORITY_WEIGHT[recommendation.priority] || 0;
      score += Math.round(recommendation.confidence * 100);
      if (recommendation.applyCapability.available) score += 12;
      if (recommendation.previewCapability.available) score += 8;
      if (recommendation.beginnerFriendly) score += 4;
      if (recommendation.savedForLater) score -= 20;
      recommendation.rankingScore = score;
      rankingScores[recommendation.recommendationId] = score;
      return recommendation;
    }).sort((a, b) => b.rankingScore - a.rankingScore || a.title.localeCompare(b.title));
  }

  function generateProjectRecommendations(context = getContext()) {
    if (!context) return [];
    const rules = generateRules(context);
    triggeredRuleIds = rules.map((rule) => rule.ruleId);
    generatedCount = rules.length;
    const normalized = rules.map((rule) => normalizeRecommendation(rule, context));
    const generated = normalized.filter((recommendation) => {
      const prior = history[recommendation.recommendationId];
      return !(prior && ["Rejected", "Dismissed"].includes(prior.status));
    });
    const generatedIds = new Set(generated.map((item) => item.recommendationId));
    const undoableApplied = Object.values(history)
      .filter((item) => item.status === "Applied" && item.undoToken && item.recommendation && !generatedIds.has(item.recommendation.recommendationId))
      .map((item) => ({ ...safeClone(item.recommendation), status: "Applied", undoToken: item.undoToken }));
    return rankRecommendations([...generated, ...undoableApplied], context);
  }

  function generateDomainRecommendations(domain, context = getContext()) {
    return generateProjectRecommendations(context).filter((item) => item.domain === domain);
  }

  function validateRecommendation(recommendation, context = getContext(), options = {}) {
    validatedCount += 1;
    if (!recommendation || !context) { rejectedByValidation += 1; return { valid: false, reason: "Recommendation or project context is unavailable." }; }
    const candidates = generateRules(context).map((rule) => normalizeRecommendation(rule, context));
    const currentMatch = candidates.find((candidate) => candidate.recommendationId === recommendation.recommendationId);
    if (!currentMatch) { rejectedByValidation += 1; return { valid: false, stale: true, reason: "The supporting project condition no longer exists." }; }
    if (!options.allowStale && Number(recommendation.contextVersion) !== Number(context.contextVersion)) {
      staleCount += 1;
      rejectedByValidation += 1;
      return { valid: false, stale: true, reason: "This recommendation was created before the project changed.", refreshed: currentMatch };
    }
    return { valid: true, refreshed: currentMatch };
  }

  function updateHistory(recommendation, patch) {
    const safeRecommendation = safeClone({ ...recommendation, undoToken: patch.undoToken ?? recommendation.undoToken ?? null });
    history[recommendation.recommendationId] = { ...(history[recommendation.recommendationId] || {}), recommendationId: recommendation.recommendationId, recommendation: safeRecommendation, ...patch, updatedAt: new Date().toISOString() };
    persistHistory();
    const active = current.find((item) => item.recommendationId === recommendation.recommendationId);
    if (active) Object.assign(active, patch);
  }

  async function perform(id, mode, options = {}) {
    const recommendation = current.find((item) => item.recommendationId === id);
    const validation = validateRecommendation(recommendation, getContext(), { allowStale: options.force });
    if (!validation.valid) {
      if (recommendation) updateHistory(recommendation, { status: validation.stale ? "Stale" : "Failed" });
      notify({ type: "validation-failed", mode, recommendation, validation });
      return { success: false, ...validation, recommendation };
    }
    const capability = mode === "preview" ? recommendation.previewCapability : recommendation.applyCapability;
    if (!capability?.available || !capability.actionId) return { success: false, reason: capability?.reason || `${mode} is unavailable.`, recommendation };
    try {
      const result = await executeAction(capability.actionId, recommendation, { mode, force: options.force });
      if (!result?.success) {
        updateHistory(recommendation, { status: "Failed" });
        if (mode === "apply") lastApplyResult = result?.message || "Apply failed";
        notify({ type: "action-failed", mode, recommendation, result });
        return { success: false, reason: result?.message || "The action could not be completed.", recommendation };
      }
      const status = mode === "preview" ? "Previewed" : "Applied";
      updateHistory(recommendation, { status, undoToken: result.undoToken || null });
      if (mode === "apply") lastApplyResult = result.message || `Applied ${recommendation.title}`;
      notify({ type: `${mode}-complete`, mode, recommendation, result });
      return { success: true, recommendation, result };
    } catch (error) {
      lastError = error.message || `${mode} failed`;
      updateHistory(recommendation, { status: "Failed" });
      return { success: false, reason: lastError, recommendation };
    }
  }

  function previewRecommendation(id, options) { return perform(id, "preview", options); }
  function applyRecommendation(id, options) { return perform(id, "apply", options); }

  function rejectRecommendation(id, reason = "No reason provided") {
    const recommendation = current.find((item) => item.recommendationId === id);
    if (!recommendation) return false;
    updateHistory(recommendation, { status: "Rejected", rejectionReason: reason });
    current = current.filter((item) => item.recommendationId !== id);
    notify({ type: "rejected", recommendation, reason });
    return true;
  }

  function dismissRecommendation(id) {
    const recommendation = current.find((item) => item.recommendationId === id);
    if (!recommendation) return false;
    updateHistory(recommendation, { status: "Dismissed" });
    current = current.filter((item) => item.recommendationId !== id);
    notify({ type: "dismissed", recommendation });
    return true;
  }

  function saveRecommendation(id) {
    const recommendation = current.find((item) => item.recommendationId === id);
    if (!recommendation) return false;
    updateHistory(recommendation, { status: "Saved", savedForLater: true });
    notify({ type: "saved", recommendation });
    return true;
  }

  function restoreRecommendation(id) {
    if (!history[id]) return false;
    delete history[id];
    persistHistory();
    refreshRecommendations({ reason: "Dismissal undone" });
    return true;
  }

  async function undoRecommendation(id) {
    const recommendation = current.find((item) => item.recommendationId === id) || safeClone(history[id]?.recommendation);
    if (!recommendation) return { success: false, reason: "Recommendation is unavailable." };
    if (!recommendation.undoCapability?.available && !history[id]?.undoToken) return { success: false, reason: recommendation.undoCapability?.reason || "Undo is unavailable." };
    try {
      const result = await executeAction(recommendation.undoCapability?.actionId || recommendation.suggestedAction?.actionId, recommendation, { mode: "undo", undoToken: history[id]?.undoToken || recommendation.undoToken });
      lastUndoResult = result?.message || (result?.success ? "Undo completed" : "Undo failed");
      if (result?.success) updateHistory(recommendation, { status: "Undone", undoToken: null });
      notify({ type: result?.success ? "undo-complete" : "undo-failed", recommendation, result });
      return result;
    } catch (error) { lastError = error.message || "Undo failed"; lastUndoResult = lastError; return { success: false, reason: lastError }; }
  }

  function notify(meta) {
    const snapshot = getRecommendations();
    subscribers.forEach((listener) => { try { listener(snapshot, meta); } catch (error) { lastError = error.message || "Recommendation subscriber failed"; } });
  }

  function refreshRecommendations(options = {}) {
    lastRefreshReason = options.reason || "Manual refresh";
    current = generateProjectRecommendations(getContext());
    notify({ type: "refreshed", reason: lastRefreshReason, contextVersion: getContext()?.contextVersion });
    return getRecommendations();
  }

  function scheduleRefresh(reason = "Project context updated", delay = 160) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshRecommendations({ reason }), delay);
  }

  function resolveReference(text) {
    const value = String(text || "").toLowerCase();
    const numbered = value.match(/(?:suggestion|recommendation)\s+(\d+)/);
    if (numbered) return current[Number(numbered[1]) - 1] || null;
    return current.find((item) => value.includes(item.recommendationId.toLowerCase()) || value.includes(item.title.toLowerCase()) || (value.includes("safer transition") && item.ruleId === "smart-mix-large-bpm-jump")) || null;
  }

  function getPromptSummary() {
    return current.slice(0, 8).map((item, index) => ({ number: index + 1, recommendationId: item.recommendationId, domain: item.domain, title: item.title, summary: item.summary, explanation: item.explanation, confidenceLabel: item.confidenceLabel, primaryAction: item.suggestedAction?.label || null, alternatives: item.alternativeActions.map((action) => action.label), contextVersion: item.contextVersion }));
  }

  function configure(options = {}) {
    projectId = String(options.projectId || projectId);
    if (typeof options.getContext === "function") getContext = options.getContext;
    if (typeof options.executeAction === "function") executeAction = options.executeAction;
    loadHistory();
    return refreshRecommendations({ reason: "Engine initialized" });
  }

  function subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); }
  function getRecommendations() { return safeClone(current, []); }
  function getRecommendation(id) { return safeClone(current.find((item) => item.recommendationId === id), null); }
  function getDiagnostics() { return { engineStatus: "Ready", contextVersionUsed: getContext()?.contextVersion ?? null, numberGenerated: generatedCount, numberValidated: validatedCount, numberRejectedByValidation: rejectedByValidation, recommendationDomains: [...new Set(current.map((item) => item.domain))], ruleIdsTriggered: triggeredRuleIds, rankingScores, staleCount, lastRefreshReason, lastApplyResult, lastUndoResult, lastEngineError: lastError, activeRecommendations: current.length, historyRecords: Object.keys(history).length }; }

  global.ContextualRecommendations = Object.freeze({
    configure, generateProjectRecommendations, generateDomainRecommendations, rankRecommendations, validateRecommendation,
    applyRecommendation, previewRecommendation, rejectRecommendation, dismissRecommendation, undoRecommendation,
    saveRecommendation, restoreRecommendation, refreshRecommendations, scheduleRefresh, resolveReference, getPromptSummary,
    getRecommendations, getRecommendation, getDiagnostics, subscribe, STATUSES: [...STATUSES]
  });
})(window);
