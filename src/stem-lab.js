(function initializeStemLabEngine(global) {
  const STORAGE_KEY = "deckforge-stem-lab-v2";
  const TERMINAL = new Set(["Complete", "Cancelled", "Failed"]);

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function id(prefix = "stem") { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

  function normalizeJob(job = {}) {
    return {
      jobId: job.jobId || id("job"), projectId: job.projectId || "local-project", sourceTrackId: job.sourceTrackId || null,
      sourceName: job.sourceName || "Untitled source", separationMode: job.separationMode || "four", model: job.model || "Unknown",
      quality: job.quality || "balanced", status: job.status || "Queued", progress: Number(job.progress || 0),
      progressEstimated: job.progressEstimated !== false, currentStage: job.currentStage || "Waiting",
      startedAt: job.startedAt || null, completedAt: job.completedAt || null, cancelledAt: job.cancelledAt || null,
      error: job.error || null, outputs: Array.isArray(job.outputs) ? job.outputs : [], retryCount: Number(job.retryCount || 0),
    };
  }

  function createState() {
    return {
      version: 2, mode: "simple", separationMode: "four", quality: "balanced", jobs: [], favorites: [], recentPrompts: [],
      graph: { graphId: id("graph"), name: "Untitled Stem Graph", nodes: [], routes: [], updatedAt: null },
      mashup: { vocalStemId: null, instrumentalStemId: null, status: "Draft", warnings: [] },
      mixSettings: {}, exportHistory: [], selectedStemId: null, lastBackendError: null, lastPreviewError: null,
    };
  }

  function serializable(state) {
    return {
      version: 2, mode: state.mode, separationMode: state.separationMode, quality: state.quality,
      jobs: state.jobs.map(normalizeJob), favorites: [...state.favorites], recentPrompts: state.recentPrompts.slice(0, 20),
      graph: clone(state.graph), mashup: clone(state.mashup), mixSettings: clone(state.mixSettings), exportHistory: state.exportHistory.slice(0, 30),
    };
  }

  function save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable(state))); return true; }
    catch { return false; }
  }

  function restore() {
    const state = createState();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || saved.version !== 2) return state;
      Object.assign(state, saved, { jobs: (saved.jobs || []).map((job) => ({ ...normalizeJob(job), restored: true })) });
      return state;
    } catch { return state; }
  }

  function upsertJob(state, incoming) {
    const job = normalizeJob(incoming);
    const index = state.jobs.findIndex((item) => item.jobId === job.jobId);
    if (index >= 0) state.jobs[index] = { ...state.jobs[index], ...job };
    else state.jobs.unshift(job);
    save(state);
    return job;
  }

  function validateRoute(graph, fromId, toId) {
    if (!fromId || !toId) return { valid: false, reason: "Choose both a source and destination node." };
    if (fromId === toId) return { valid: false, reason: "A node cannot route to itself." };
    const from = graph.nodes.find((node) => node.nodeId === fromId);
    const to = graph.nodes.find((node) => node.nodeId === toId);
    if (!from || !to) return { valid: false, reason: "One of the graph nodes is missing." };
    if (["Source Track", "Stem", "Deck", "Pad", "Beat Forge", "Harmony Lab", "Mixer", "Bus", "Effect"].includes(to.type) === false && !["Arrangement", "Export", "Smart Mix Transition"].includes(to.type)) return { valid: false, reason: `${to.type} cannot receive audio.` };
    if (graph.routes.some((route) => route.from === fromId && route.to === toId)) return { valid: false, reason: "That route already exists." };
    const reaches = (start, target, visited = new Set()) => {
      if (start === target) return true;
      if (visited.has(start)) return false;
      visited.add(start);
      return graph.routes.filter((route) => route.from === start).some((route) => reaches(route.to, target, visited));
    };
    if (reaches(toId, fromId)) return { valid: false, reason: "Route rejected because it would create a feedback loop." };
    return { valid: true, reason: "Valid route." };
  }

  function proposeGraph(prompt, stems = []) {
    const text = String(prompt || "").trim();
    const lower = text.toLowerCase();
    const wanted = stems.filter((stem) => lower.includes(stem.name.toLowerCase()) || (lower.includes("vocal") && /vocal/i.test(stem.name)) || (lower.includes("instrumental") && /instrumental|other|music/i.test(stem.name)));
    const selected = wanted.length ? wanted : stems.slice(0, 2);
    const nodes = selected.map((stem) => ({ nodeId: id("node"), type: "Stem", name: stem.name, source: stem.sourceName || "Current separation", status: "Ready", gain: 1, muted: false, solo: false }));
    const destinationType = lower.includes("pad") ? "Pad" : lower.includes("beat forge") ? "Beat Forge" : lower.includes("deck") ? "Deck" : "Arrangement";
    const destination = { nodeId: id("node"), type: destinationType, name: `${destinationType} Output`, source: "Project", status: "Ready", gain: 1, muted: false, solo: false };
    nodes.push(destination);
    const routes = selected.map((_, index) => ({ routeId: id("route"), from: nodes[index].nodeId, to: destination.nodeId, gain: 1, muted: false }));
    const missing = [];
    if (lower.includes("vocal") && !stems.some((stem) => /vocal/i.test(stem.name))) missing.push("Vocal stem");
    if (lower.includes("instrumental") && !stems.some((stem) => /instrumental|other|music/i.test(stem.name))) missing.push("Instrumental stem");
    return { prompt: text, nodes, routes, effects: [], gainChanges: [], destinations: [destination.name], warnings: missing.length ? ["Requested sources are missing; Apply is disabled."] : [], missing, confidence: missing.length ? 0.42 : selected.length ? 0.86 : 0.28 };
  }

  global.StemLabEngine = { STORAGE_KEY, TERMINAL, createState, normalizeJob, upsertJob, save, restore, validateRoute, proposeGraph, id };
})(window);
