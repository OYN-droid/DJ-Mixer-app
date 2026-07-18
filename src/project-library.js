(function initializeProjectLibrary(global) {
  "use strict";

  const registry = global.DeckForgeProjectRegistry;
  const ASSET_PREFIX = "deckforge-project-assets:v1";
  const FILTERS = Object.freeze(["All", "Favorites", "Archived", "Mixtapes", "Live Sets", "Remixes", "Mashups", "Practice", "Missing Assets", "Needs Repair"]);
  const SORTS = Object.freeze(["Recently Opened", "Recently Created", "Alphabetical", "Progress", "Project Type"]);
  function clone(value, fallback = null) { try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; } }
  function readJson(key, fallback = null) { try { const raw = localStorage.getItem(key); return raw == null ? clone(fallback, fallback) : JSON.parse(raw); } catch { return clone(fallback, fallback); } }
  function safeDate(value) { const time = Date.parse(value || ""); return Number.isFinite(time) ? time : 0; }
  function formatDuration(seconds) { if (!Number.isFinite(seconds) || seconds <= 0) return null; const total = Math.round(seconds); const hours = Math.floor(total / 3600); const minutes = Math.floor((total % 3600) / 60); const rest = total % 60; return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`; }
  function projectOverview(project) {
    const projectId = project.projectId;
    const sources = readJson(registry.storageKey("ditc-sources", projectId), []);
    const arrangement = readJson(`deckforge-arrangement-studio:${projectId}`, null);
    const recordings = readJson(`deckforge-recordings:${projectId}`, { records: [] })?.records || [];
    const exports = readJson(`deckforge-exports:${projectId}`, { jobs: [] })?.jobs || [];
    const assetService = global.DeckForgeProjectAssets;
    const assets = assetService?.list(projectId, { allowInactive: true, includeTrash: true }) || readJson(`${ASSET_PREFIX}:${projectId}`, { assets: [] })?.assets || [];
    const intelligence = readJson(`deckforge-project-intelligence:${projectId}`, null);
    const clips = Array.isArray(arrangement?.clips) ? arrangement.clips : [];
    const durationSeconds = clips.reduce((max, clip) => Math.max(max, Number(clip.startTime ?? clip.start ?? 0) + Number(clip.duration || 0)), 0);
    const progressFactors = Array.isArray(intelligence?.project?.progressFactors) ? intelligence.project.progressFactors : [];
    const completedFactors = progressFactors.filter((factor) => factor.complete === true).length;
    const progress = progressFactors.length ? Math.round(completedFactors / progressFactors.length * 100) : null;
    const visibleRecordings = recordings.filter((record) => !["Deleted", "Cancelled"].includes(record.status));
    const visibleExports = exports.filter((job) => job.status !== "Deleted").sort((a, b) => safeDate(b.completedAt || b.createdAt) - safeDate(a.completedAt || a.createdAt));
    const missingAssetCount = assets.filter((asset) => asset.missing || asset.relinkRequired).length;
    const unusedAssetCount = assetService ? assets.filter((asset) => !asset.trash?.trashed && assetService.usageStatus(asset) === "Unused").length : 0;
    const assetStorage = assetService?.storageSummary(projectId, { allowInactive: true }) || { totalKnownBytes: 0, unknownSizeCount: assets.filter((asset) => asset.sizeBytes == null).length };
    const validation = registry.validateProject(projectId, { persist: false });
    return {
      ...project,
      type: project.metadata?.type || "Empty Project",
      favorite: project.metadata?.favorite === true,
      tags: Array.isArray(project.metadata?.tags) ? project.metadata.tags : [],
      genre: project.metadata?.genre || null,
      artwork: /^data:image\//.test(project.metadata?.artwork || "") ? project.metadata.artwork : null,
      progress,
      durationSeconds: durationSeconds || null,
      durationLabel: formatDuration(durationSeconds),
      trackCount: Array.isArray(sources) ? sources.length : 0,
      arrangementStatus: !arrangement ? "Not started" : clips.length ? "In progress" : "Empty",
      arrangementClipCount: clips.length,
      recordingCount: visibleRecordings.length,
      latestExport: visibleExports[0] ? { name: visibleExports[0].name, status: visibleExports[0].status, format: visibleExports[0].format, createdAt: visibleExports[0].completedAt || visibleExports[0].createdAt } : null,
      missingAssetCount,
      unusedAssetCount,
      assetStorage,
      consolidationStatus: "Unavailable in browser build",
      needsRepair: !validation.valid,
      validation
    };
  }
  function matchesFilter(project, filter) {
    if (filter === "Favorites") return project.favorite;
    if (filter === "Archived") return project.status === "Archived";
    if (filter === "Mixtapes") return project.type === "Mixtape";
    if (filter === "Live Sets") return project.type === "Live Set";
    if (filter === "Remixes") return project.type === "Remix";
    if (filter === "Mashups") return project.type === "Mashup";
    if (filter === "Practice") return project.type === "Practice Session";
    if (filter === "Missing Assets") return project.missingAssetCount > 0;
    if (filter === "Needs Repair") return project.needsRepair;
    return project.status !== "Archived";
  }
  function query(options = {}) {
    const search = String(options.search || "").trim().toLowerCase(); const filter = FILTERS.includes(options.filter) ? options.filter : "All"; const sort = SORTS.includes(options.sort) ? options.sort : "Recently Opened";
    const projects = registry.listProjects({ includeArchived: true }).map(projectOverview).filter((project) => matchesFilter(project, filter)).filter((project) => !search || [project.name, project.type, project.genre, ...project.tags].filter(Boolean).join(" ").toLowerCase().includes(search));
    const sorters = {
      "Recently Opened": (a, b) => safeDate(b.lastOpenedAt || b.updatedAt) - safeDate(a.lastOpenedAt || a.updatedAt),
      "Recently Created": (a, b) => safeDate(b.createdAt) - safeDate(a.createdAt),
      Alphabetical: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      Progress: (a, b) => (b.progress ?? -1) - (a.progress ?? -1),
      "Project Type": (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
    };
    return projects.sort(sorters[sort]);
  }
  function diagnostics() { const projects = registry.listProjects({ includeArchived: true }).map(projectOverview); return { projectCount: projects.length, activeProject: registry.getActiveProject()?.projectId || null, archivedCount: projects.filter((item) => item.status === "Archived").length, favoriteCount: projects.filter((item) => item.favorite).length, failedValidations: projects.filter((item) => item.needsRepair).length, missingAssetCount: projects.reduce((count, item) => count + item.missingAssetCount, 0) }; }
  global.DeckForgeProjectLibrary = Object.freeze({ FILTERS, SORTS, PROJECT_TYPES: registry.PROJECT_TYPES, projectOverview, query, diagnostics });
})(window);
