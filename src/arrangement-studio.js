(function initializeArrangementStudioEngine(global) {
  // TODO: Migrate live editing ownership into this engine. Until then, app.js editorState is the
  // single source of truth for the active UI; this module only normalizes, persists, versions,
  // validates, imports, and exports arrangement snapshots.
  const SCHEMA_VERSION = 1;
  const STORAGE_PREFIX = "deckforge-arrangement-studio";
  const SOURCE_TYPES = new Set(["DITC Track", "Deck Recording", "Stem", "Pad Recording", "Beat Forge Pattern", "Harmony Lab Pattern", "Transition", "Imported Audio", "Generated Audio", "Performance Events"]);

  function id(prefix = "arrangement") { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function now() { return new Date().toISOString(); }
  function clone(value, fallback = null) { try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; } }
  function storageKey(projectId) { return `${STORAGE_PREFIX}:${projectId || "local-project"}`; }

  function sourceType(clip = {}) {
    const kind = clip.sourceType || clip.sourceKind || clip.type;
    return ({ crate: "DITC Track", deck: "Deck Recording", stem: "Stem", pad: "Pad Recording", drums: "Beat Forge Pattern", keys: "Harmony Lab Pattern", performance: "Performance Events", marker: "Transition", buffer: "Imported Audio", file: "Imported Audio" })[kind] || (SOURCE_TYPES.has(kind) ? kind : "Generated Audio");
  }

  function normalizeLane(lane = {}, order = 0, projectId = null) {
    return {
      laneId: lane.laneId || lane.id || id("lane"), projectId: lane.projectId || projectId, type: lane.type || "Track", name: lane.name || `Lane ${order + 1}`, order,
      muted: Boolean(lane.muted), soloed: Boolean(lane.soloed || lane.solo), armed: Boolean(lane.armed), volume: Number(lane.volume ?? 1),
      pan: Number(lane.pan || 0), colorRole: lane.colorRole || "track", outputBus: lane.outputBus || "Master", collapsed: Boolean(lane.collapsed),
      locked: Boolean(lane.locked), clipIds: Array.isArray(lane.clipIds) ? [...lane.clipIds] : [], automationLaneIds: Array.isArray(lane.automationLaneIds) ? [...lane.automationLaneIds] : [], role: lane.role || lane.type || "Track",
    };
  }

  function safeSourceReference(clip = {}) {
    const source = clip.source || {};
    return {
      sourceId: clip.sourceId || source.id || null, sourceKind: clip.sourceKind || source.sourceKind || null,
      name: clip.sourceName || clip.name || source.label || "Untitled source", fileName: source.fileName || source.file?.name || null,
      provider: source.provider || "Local project", stemJobId: source.alignmentJobId || clip.alignmentJobId || null,
      patternVersion: source.patternSnapshot?.version || clip.metadata?.patternVersion || null,
      playable: source.playable !== false && !clip.missingSource,
    };
  }

  function normalizeClip(clip = {}, lanes = [], projectId = null) {
    const lane = lanes[Number(clip.trackIndex || 0)] || lanes.find((item) => item.laneId === clip.laneId);
    const duration = Math.max(.01, Number(clip.duration || 0));
    return {
      clipId: clip.clipId || clip.id || id("clip"), projectId: clip.projectId || projectId, laneId: clip.laneId || lane?.laneId || null,
      sourceType: sourceType(clip), sourceId: clip.sourceId || clip.source?.id || null, sourceName: clip.sourceName || clip.name || clip.source?.label || "Untitled clip",
      sourceReference: safeSourceReference(clip), startTime: Math.max(0, Number(clip.startTime ?? clip.start ?? 0)), sourceStart: Math.max(0, Number(clip.sourceStart || 0)),
      sourceEnd: Number(clip.sourceEnd || (Number(clip.sourceStart || 0) + duration)), duration, originalDuration: Number(clip.originalDuration || clip.source?.duration || duration),
      gain: Number(clip.gain ?? clip.volume ?? 1), pan: Number(clip.pan || 0), muted: Boolean(clip.muted), locked: Boolean(clip.locked), loop: Boolean(clip.loop),
      fadeIn: Math.max(0, Number(clip.fadeIn || 0)), fadeOut: Math.max(0, Number(clip.fadeOut || 0)), playbackRate: Number(clip.playbackRate || (1 / Math.max(.1, clip.stretch || 1))),
      tempo: clip.tempo || null, originalTempo: clip.originalTempo || clip.source?.analysis?.bpm || null, pitch: Number(clip.pitch || 0), key: clip.key || clip.source?.analysis?.key || null,
      keyLock: Boolean(clip.keyLock), waveformReference: clip.waveformReference || null, colorRole: clip.colorRole || clip.type || "track", createdAt: clip.createdAt || now(), updatedAt: now(),
      metadata: clone({ ...(clip.metadata || {}), type: clip.type, groupId: clip.groupId || null, events: clip.events || null }, {}), missingSource: Boolean(clip.missingSource), relinkRequired: Boolean(clip.relinkRequired),
    };
  }

  function normalizeModel(input = {}, options = {}) {
    const projectId = options.projectId || input.projectId || "local-project";
    const own = (items) => clone(items, []).map((item) => ({ ...item, projectId }));
    const lanes = (input.lanes || input.tracks || []).map((lane, order) => normalizeLane(lane, order, projectId));
    const clips = (input.clips || []).map((clip) => normalizeClip(clip, lanes, projectId));
    lanes.forEach((lane) => { lane.clipIds = clips.filter((clip) => clip.laneId === lane.laneId).map((clip) => clip.clipId); });
    const duration = clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
    return {
      schemaVersion: SCHEMA_VERSION, arrangementId: input.arrangementId || id("arrangement"), projectId, name: input.name || "Main Arrangement",
      version: Number(input.version || 1), BPM: Number(input.BPM || options.BPM || 124), timeSignature: input.timeSignature || "4/4", duration,
      playhead: Number(input.playhead || 0), loopRegion: clone(input.loopRegion, { enabled: false, start: 0, end: 0 }), snapMode: input.snapMode || input.snap || "bar", zoom: Number(input.zoom || 8),
      lanes, clips, markers: own(input.markers || []), transitions: own(input.transitions || []), automation: own(input.automation || []), recordings: own(input.recordings || []),
      tempoMap: clone(input.tempoMap, []), keyMap: clone(input.keyMap, []), selectedClipIds: clone(input.selectedClipIds, input.selectedClipId ? [input.selectedClipId] : []), selectedLaneIds: clone(input.selectedLaneIds, []),
      playbackState: "Idle", recordingState: "Idle", exportState: clone(input.exportState, { status: "Not checked", history: [] }), versions: clone(input.versions, []), activeVersionId: input.activeVersionId || null, workspaceMode: input.workspaceMode || "simple", createdAt: input.createdAt || now(), updatedAt: now(),
    };
  }

  function save(model) {
    const key = storageKey(model.projectId); const payload = normalizeModel(model, { projectId: model.projectId, BPM: model.BPM });
    try {
      const current = localStorage.getItem(key); if (current) localStorage.setItem(`${key}:previous`, current);
      localStorage.setItem(key, JSON.stringify(payload)); return { success: true, savedAt: now(), revision: payload.version };
    } catch (error) { return { success: false, error: error.message || "Arrangement save failed." }; }
  }

  function restore(projectId = "local-project") {
    try { const saved = JSON.parse(localStorage.getItem(storageKey(projectId)) || "null"); return saved?.schemaVersion === SCHEMA_VERSION ? normalizeModel(saved, { projectId }) : null; }
    catch { return null; }
  }

  function validateExport(model, availability = {}) {
    const missing = model.clips.filter((clip) => clip.missingSource || clip.relinkRequired || availability[clip.clipId] === false);
    const warnings = [];
    if (!model.clips.length) warnings.push("Arrangement is empty.");
    if (!model.markers.some((marker) => /intro/i.test(marker.type || marker.label))) warnings.push("No intro marker is defined.");
    if (!model.markers.some((marker) => /outro/i.test(marker.type || marker.label))) warnings.push("No outro marker is defined.");
    if (model.clips.some((clip) => clip.gain > 1.15)) warnings.push("One or more clips may exceed nominal gain.");
    return { status: !model.clips.length || missing.length ? "Blocked" : warnings.length ? "Ready with Warnings" : "Ready", missingFiles: missing.map((clip) => clip.sourceName), warnings, duration: model.duration, expectedOutput: "Arrangement project JSON and cue sheet", format: "JSON / text", estimatedSize: null };
  }

  function exportProject(model) { return JSON.stringify({ product: "DeckForge Arrangement Studio", schemaVersion: SCHEMA_VERSION, exportedAt: now(), arrangement: normalizeModel(model, { projectId: model.projectId, BPM: model.BPM }) }, null, 2); }
  function importProject(value, projectId) { const parsed = typeof value === "string" ? JSON.parse(value) : value; if (!parsed?.arrangement || parsed.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported Arrangement project file."); return normalizeModel(parsed.arrangement, { projectId: projectId || parsed.arrangement.projectId }); }
  function duplicateVersion(model, name) { const copy = normalizeModel(model, { projectId: model.projectId, BPM: model.BPM }); copy.arrangementId = id("arrangement"); copy.name = name || `${model.name} Copy`; copy.version = Number(model.version || 1) + 1; copy.createdAt = now(); return copy; }

  global.ArrangementStudioEngine = Object.freeze({ SCHEMA_VERSION, STORAGE_PREFIX, normalizeLane, normalizeClip, normalizeModel, save, restore, validateExport, exportProject, importProject, duplicateVersion, id });
})(window);
