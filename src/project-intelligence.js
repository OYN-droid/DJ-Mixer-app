(function initializeProjectIntelligence(global) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STORAGE_PREFIX = "deckforge-project-intelligence";
  const DOMAINS = ["project", "ditc", "decks", "smartMix", "pads", "beatForge", "harmonyLab", "stems", "arrangement", "mixtape", "playback", "aiHistory", "creativePreferences", "producerMemory", "systemStatus"];
  const subscribers = new Set();
  let projectId = "deckforge-session";
  let adapter = null;
  let persistenceStatus = "Not initialized";
  let lastError = "None";
  let latestEvent = null;
  let staleRecommendationCount = 0;

  const context = createEmptyContext(projectId);

  function createEmptyContext(id) {
    const now = new Date().toISOString();
    return {
      project: { projectId: id, projectName: "DeckForge Session", createdAt: now, updatedAt: now },
      ditc: {},
      decks: [],
      smartMix: {},
      pads: {},
      beatForge: {},
      harmonyLab: {},
      stems: {},
      arrangement: {},
      mixtape: {},
      playback: {},
      aiHistory: { decisions: [], recentSummary: null },
      creativePreferences: {},
      producerMemory: { projectId: id, count: 0, preferences: [] },
      systemStatus: {},
      timestamps: { createdAt: now, updatedAt: now, lastMeaningfulUpdate: null },
      contextVersion: 0,
      schemaVersion: SCHEMA_VERSION
    };
  }

  function storageKey(id = projectId) {
    return `${STORAGE_PREFIX}:${id}`;
  }

  function safeClone(value, fallback = null) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      lastError = error.message || "Context serialization failed";
      return fallback;
    }
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
      return result;
    }, {});
    return value;
  }

  function stableStringify(value) {
    return JSON.stringify(stableValue(value));
  }

  function loadPersisted(id) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(id)) || "null");
      if (!saved || saved.schemaVersion !== SCHEMA_VERSION) {
        persistenceStatus = saved ? "Schema reset" : "No saved context";
        return;
      }
      context.project = { ...context.project, ...(saved.project || {}), projectId: id };
      context.aiHistory = { decisions: [], recentSummary: null, ...(saved.aiHistory || {}) };
      context.creativePreferences = saved.creativePreferences || {};
      context.contextVersion = Number(saved.contextVersion) || 0;
      context.timestamps = { ...context.timestamps, ...(saved.timestamps || {}) };
      if (saved.progressFactors) context.project.progressFactors = saved.progressFactors;
      persistenceStatus = "Restored";
    } catch (error) {
      persistenceStatus = "Restore failed";
      lastError = error.message || "Context restore failed";
    }
  }

  function persist() {
    try {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        project: context.project,
        aiHistory: context.aiHistory,
        creativePreferences: context.creativePreferences,
        progressFactors: context.project.progressFactors || [],
        contextVersion: context.contextVersion,
        timestamps: context.timestamps
      };
      localStorage.setItem(storageKey(), JSON.stringify(payload));
      persistenceStatus = "Saved";
      return true;
    } catch (error) {
      persistenceStatus = "Save failed";
      lastError = error.message || "Context persistence failed";
      return false;
    }
  }

  function configure(options = {}) {
    projectId = String(options.projectId || projectId);
    adapter = typeof options.adapter === "function" ? options.adapter : adapter;
    const fresh = createEmptyContext(projectId);
    Object.keys(context).forEach((key) => delete context[key]);
    Object.assign(context, fresh);
    loadPersisted(projectId);
    return context;
  }

  function normalizeDecision(decision = {}, event = {}) {
    const timestamp = decision.timestamp || event.timestamp || new Date().toISOString();
    return {
      id: decision.id || (global.crypto?.randomUUID ? global.crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      timestamp,
      domain: decision.domain || event.domain || "AI",
      action: decision.action || event.type || "Context updated",
      summary: decision.summary || event.summary || decision.action || event.type || "Project context updated",
      before: safeClone(decision.before, null),
      after: safeClone(decision.after, null),
      undoRef: decision.undoRef || null,
      initiatedBy: decision.initiatedBy || "user"
    };
  }

  function appendDecision(decision, event) {
    const record = normalizeDecision(decision, event);
    const decisions = [record, ...(context.aiHistory?.decisions || []).filter((item) => item.id !== record.id)].slice(0, 200);
    const previousSummary = context.aiHistory?.recentSummary || {};
    context.aiHistory = {
      ...(context.aiHistory || {}),
      decisions,
      recentSummary: {
        ...previousSummary,
        generatedAt: record.timestamp,
        events: decisions.slice(0, 5).map((item) => item.summary)
      }
    };
    return record;
  }

  function notify(meta) {
    const snapshot = getContextSnapshot();
    subscribers.forEach((listener) => {
      try { listener(snapshot, meta); } catch (error) { lastError = error.message || "Context subscriber failed"; }
    });
    global.dispatchEvent(new CustomEvent("deckforge:project-context-updated", { detail: { contextVersion: context.contextVersion, event: meta, snapshot } }));
  }

  function applySnapshot(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== "object") return false;
    const event = {
      id: options.id || `${Date.now()}-${Math.random()}`,
      domain: options.domain || "systemStatus",
      type: options.type || "context-synced",
      summary: options.summary || "Project context updated",
      timestamp: options.timestamp || new Date().toISOString(),
      meaningful: options.meaningful !== false
    };
    const changedDomains = [];
    DOMAINS.forEach((domain) => {
      if (!(domain in snapshot)) return;
      const next = safeClone(snapshot[domain], Array.isArray(snapshot[domain]) ? [] : {});
      if (stableStringify(context[domain]) !== stableStringify(next)) {
        context[domain] = next;
        changedDomains.push(domain);
      }
    });
    if (options.decision) {
      const record = appendDecision(options.decision, event);
      event.decisionId = record.id;
      if (!changedDomains.includes("aiHistory")) changedDomains.push("aiHistory");
    }
    if (!changedDomains.length && !options.force) return false;
    context.timestamps.updatedAt = event.timestamp;
    if (event.meaningful) {
      context.contextVersion += 1;
      context.timestamps.lastMeaningfulUpdate = event.timestamp;
    }
    context.project = { ...(context.project || {}), projectId, updatedAt: event.timestamp };
    context.systemStatus = {
      ...(context.systemStatus || {}),
      registeredDomains: DOMAINS.filter((domain) => domain in context),
      latestContextEvent: event,
      persistenceStatus,
      lastContextError: lastError
    };
    latestEvent = event;
    persist();
    notify({ ...event, changedDomains, contextVersion: context.contextVersion });
    return true;
  }

  function syncFromAdapter(options = {}) {
    if (!adapter) {
      lastError = "No project context adapter is registered";
      return false;
    }
    try {
      return applySnapshot(adapter(), options);
    } catch (error) {
      lastError = error.message || "Project context adapter failed";
      return false;
    }
  }

  function updateProjectContext(domain, payload, options = {}) {
    if (!DOMAINS.includes(domain)) throw new Error(`Unknown Project Intelligence domain: ${domain}`);
    const current = Array.isArray(context[domain]) ? context[domain] : (context[domain] || {});
    const next = Array.isArray(payload) ? payload : { ...current, ...(payload || {}) };
    return applySnapshot({ [domain]: next }, { ...options, domain });
  }

  function recordDecision(decision = {}) {
    const event = { domain: decision.domain || "AI", type: decision.action || "decision-recorded", summary: decision.summary, meaningful: true };
    const record = normalizeDecision(decision, event);
    applySnapshot({}, { ...event, force: true, decision: record });
    return record;
  }

  function subscribeToProjectContext(listener) {
    if (typeof listener !== "function") return () => {};
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  function getProjectContext() {
    return context;
  }

  function getContextSnapshot() {
    return safeClone(context, createEmptyContext(projectId));
  }

  function getContextVersion() {
    return context.contextVersion;
  }

  function getContextSummary(options = {}) {
    const include = new Set(options.include || ["project", "ditc", "decks", "smartMix", "pads", "beatForge", "harmonyLab", "stems", "arrangement", "mixtape", "aiHistory", "producerMemory"]);
    const summary = { contextVersion: context.contextVersion, generatedAt: new Date().toISOString() };
    if (include.has("project")) summary.project = context.project;
    if (include.has("ditc")) summary.ditc = {
      totalTracks: context.ditc.totalTracks || 0,
      selectedTracks: context.ditc.selectedTracks || [],
      currentCollection: context.ditc.currentCollection || "all"
    };
    if (include.has("decks")) summary.decks = (context.decks || []).map((deck) => ({ id: deck.id, loadedTrack: deck.loadedTrack, playbackState: deck.playbackState, bpm: deck.bpm, key: deck.key }));
    if (include.has("smartMix")) summary.smartMix = { enabled: context.smartMix.enabled, state: context.smartMix.state, incomingDeck: context.smartMix.incomingDeck, transitionStyle: context.smartMix.transitionStyle, trigger: context.smartMix.trigger };
    if (include.has("beatForge")) summary.beatForge = { activePattern: context.beatForge.activePattern, activeKit: context.beatForge.activeKit, activeGroove: context.beatForge.activeGroove, section: context.beatForge.section, playbackState: context.beatForge.playbackState };
    if (include.has("harmonyLab")) summary.harmonyLab = { activeInstrument: context.harmonyLab.activeInstrument, currentKey: context.harmonyLab.currentKey, currentScale: context.harmonyLab.currentScale, activeChordProgression: context.harmonyLab.activeChordProgression, melody: context.harmonyLab.melody, playbackState: context.harmonyLab.playbackState };
    if (include.has("pads")) summary.pads = { activeBank: context.pads.activeBank, activeScene: context.pads.activeScene, assignedPadCount: context.pads.assignedPadCount, activeLoops: context.pads.activeLoops };
    if (include.has("stems")) summary.stems = { separatedTracks: context.stems.separatedTracks, availableStemTypes: context.stems.availableStemTypes, selectedStem: context.stems.selectedStem };
    if (include.has("arrangement")) summary.arrangement = { timelineLength: context.arrangement.timelineLength, clipCount: context.arrangement.clipCount, introStatus: context.arrangement.introStatus, outroStatus: context.arrangement.outroStatus, unresolvedGaps: context.arrangement.unresolvedGaps };
    if (include.has("mixtape")) summary.mixtape = { referenceAnalysis: context.mixtape.referenceAnalysis, detectedIdentity: context.mixtape.detectedIdentity, themes: context.mixtape.themes };
    if (include.has("aiHistory")) summary.recentDecisions = (context.aiHistory?.decisions || []).slice(0, 8).map(({ timestamp, domain, action, summary: detail, initiatedBy }) => ({ timestamp, domain, action, summary: detail, initiatedBy }));
    if (include.has("producerMemory")) summary.producerMemory = context.producerMemory;
    return summary;
  }

  function isContextVersionCurrent(version) {
    const current = Number(version) === context.contextVersion;
    if (!current) staleRecommendationCount += 1;
    return current;
  }

  function getDiagnostics() {
    const snapshot = getContextSnapshot();
    return {
      contextVersion: context.contextVersion,
      lastUpdate: context.timestamps.updatedAt,
      registeredDomains: DOMAINS.filter((domain) => domain in context),
      missingDomainAdapters: adapter ? [] : [...DOMAINS],
      currentProjectId: projectId,
      latestContextEvent: latestEvent,
      subscriberCount: subscribers.size,
      persistenceStatus,
      lastContextError: lastError,
      snapshotSize: JSON.stringify(snapshot).length,
      staleRecommendationCount
    };
  }

  global.ProjectIntelligence = Object.freeze({
    configure,
    syncFromAdapter,
    updateProjectContext,
    subscribeToProjectContext,
    getProjectContext,
    getContextSnapshot,
    getContextSummary,
    getContextVersion,
    recordDecision,
    isContextVersionCurrent,
    getDiagnostics,
    persist
  });
})(window);
