(function initializeExportService(global) {
  const STORAGE_PREFIX = "deckforge-exports";
  const SCHEMA_VERSION = 1;
  const jobs = new Map();
  const runtime = new Map();
  let projectId = "local-project";
  let adapters = {};
  let onEvent = () => {};

  function id() { return `export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function now() { return new Date().toISOString(); }
  function clone(value, fallback = null) { try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; } }
  function key() { return `${STORAGE_PREFIX}:${projectId}`; }
  function safeName(value = "export") { return String(value).trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 120) || "export"; }
  function publicJob(job) { return clone(job, {}); }

  function persist() { try { global.localStorage?.setItem(key(), JSON.stringify({ schemaVersion: SCHEMA_VERSION, projectId, jobs: [...jobs.values()].filter((job) => job.status !== "Deleted").map((job) => ({ ...job, outputReference: job.status === "Complete" ? { kind: "runtime-output", available: false } : job.outputReference })) })); return true; } catch (error) { onEvent({ type: "export-persistence-failed", error: error.message || "Export history could not be saved." }); return false; } }
  function restore() { jobs.clear(); runtime.clear(); try { const saved = JSON.parse(global.localStorage?.getItem(key()) || "null"); (saved?.schemaVersion === SCHEMA_VERSION ? saved.jobs : []).forEach((item) => { const job = { ...item }; if (job.status === "Complete") { job.status = "Missing"; job.outputReference = { kind: "expired-runtime-output", available: false }; job.error = "The browser export output expired after reload. Retry the export to recreate it."; } jobs.set(job.exportId, job); runtime.set(job.exportId, { adapterInput: null, cancelRequested: false, blob: null, url: null, filename: null, lastResult: null }); }); } catch { /* Ignore corrupt history. */ } return listExports(projectId, { includeMissing: true }); }
  function configure(options = {}) { projectId = options.projectId || projectId; adapters = options.adapters || adapters; onEvent = typeof options.onEvent === "function" ? options.onEvent : onEvent; return restore(); }

  function createExportJob(options = {}) {
    const exportId = id(); const createdAt = now(); const job = { exportId, projectId, sourceType: options.sourceType || "Project", sourceId: options.sourceId || null, name: safeName(options.name || "DeckForge Export"), format: options.format || "JSON", outputType: options.outputType || "Project Metadata", quality: options.quality || "Standard", status: "Draft", progress: 0, stage: "Draft", startedAt: null, completedAt: null, cancelledAt: null, outputReference: null, sizeBytes: 0, duration: Number(options.duration || 0) || null, warnings: clone(options.warnings, []), validationResults: null, metadata: clone(options.metadata, {}), settings: clone(options.settings, {}), error: null, retryCount: Number(options.retryCount || 0), contextVersion: Number(options.contextVersion || 0), creationTimestamp: createdAt, createdAt, updatedAt: createdAt };
    jobs.set(exportId, job); runtime.set(exportId, { adapterInput: options.adapterInput || null, cancelRequested: false, blob: null, url: null, filename: null, lastResult: null }); persist(); onEvent({ type: "export-created", export: publicJob(job) }); return publicJob(job);
  }

  function adapterFor(job) { return adapters[job.outputType] || adapters[job.sourceType] || null; }
  async function validateExport(input) {
    const job = typeof input === "string" ? jobs.get(input) : input?.exportId ? jobs.get(input.exportId) || input : input;
    if (!job) throw new Error("Export job not found."); const adapter = adapterFor(job); const base = [];
    if (!job.name) base.push("A filename is required."); if (!job.format) base.push("An output format is required.");
    let result = { status: base.length ? "Blocked" : "Ready", errors: base, warnings: [], details: {} };
    if (adapter?.validate) { const extra = await adapter.validate(publicJob(job), runtime.get(job.exportId)?.adapterInput); result = { status: extra.status || (extra.errors?.length ? "Blocked" : extra.warnings?.length ? "Ready with Warnings" : "Ready"), errors: [...base, ...(extra.errors || [])], warnings: extra.warnings || [], details: extra.details || {} }; if (result.errors.length) result.status = "Blocked"; }
    else if (!adapter) result = { status: "Blocked", errors: [`${job.outputType} export is not implemented.`], warnings: [], details: {} };
    job.validationResults = clone(result, {}); job.warnings = [...new Set([...(job.warnings || []), ...(result.warnings || [])])]; job.status = result.status === "Blocked" ? "Blocked" : "Ready"; job.stage = "Validated"; job.updatedAt = now(); persist(); onEvent({ type: "export-validated", export: publicJob(job), validation: result }); return result;
  }

  async function startExport(exportId) {
    const job = jobs.get(exportId); const state = runtime.get(exportId); if (!job || !state) throw new Error("Export job not found.");
    const registry = global.DeckForgeProjectRegistry; if (registry && !registry.owns(job.projectId, job.contextVersion || null)) throw new Error("Export ownership no longer matches the active project session.");
    const validation = await validateExport(exportId); if (validation.status === "Blocked") return publicJob(job);
    const adapter = adapterFor(job); state.cancelRequested = false; job.status = "Rendering"; job.stage = adapter?.method === "realtime" ? "Real-time capture" : "Generating output"; job.progress = 10; job.startedAt = now(); job.error = null; job.updatedAt = now(); persist(); onEvent({ type: "export-started", export: publicJob(job) });
    try {
      const result = await adapter.generate(publicJob(job), state.adapterInput, { isCancelled: () => state.cancelRequested, progress: (progress, stage) => { job.progress = Math.max(10, Math.min(95, Number(progress || 0))); job.stage = stage || job.stage; job.updatedAt = now(); onEvent({ type: "export-progress", export: publicJob(job) }); } });
      if (registry && !registry.owns(job.projectId, job.contextVersion || null)) throw new Error("Export completed after its project session closed; the result was discarded.");
      if (state.cancelRequested) { job.status = "Cancelled"; job.cancelledAt = now(); job.stage = "Cancelled"; job.progress = 0; job.updatedAt = now(); persist(); onEvent({ type: "export-cancelled", export: publicJob(job) }); return publicJob(job); }
      let blob = result?.blob || null; if (!blob && result?.text != null) blob = new Blob([result.text], { type: result.mimeType || "text/plain" }); if (!blob?.size) throw new Error("The exporter produced a zero-byte output.");
      if (state.url) URL.revokeObjectURL(state.url); state.blob = blob; state.url = URL.createObjectURL(blob); state.filename = safeName(result.filename || `${job.name}.${result.extension || "bin"}`); state.lastResult = result;
      job.status = "Complete"; job.stage = "Complete"; job.progress = 100; job.completedAt = now(); job.sizeBytes = blob.size; job.duration = Number(result.duration || job.duration || 0) || null; job.format = result.format || job.format; job.outputReference = { kind: "runtime-output", available: true, filename: state.filename, mimeType: blob.type }; job.metadata = { ...job.metadata, ...(clone(result.metadata, {}) || {}) }; job.warnings = [...new Set([...(job.warnings || []), ...(result.warnings || [])])]; job.updatedAt = now(); persist(); onEvent({ type: "export-complete", export: publicJob(job) }); return publicJob(job);
    } catch (error) { job.status = state.cancelRequested ? "Cancelled" : "Failed"; job.stage = job.status; job.error = error.message || "Export failed."; job.updatedAt = now(); if (state.cancelRequested) job.cancelledAt = now(); persist(); onEvent({ type: job.status === "Cancelled" ? "export-cancelled" : "export-failed", export: publicJob(job) }); return publicJob(job); }
  }

  function cancelExport(exportId) { const job = jobs.get(exportId); const state = runtime.get(exportId); if (!job || !state || !["Rendering", "Encoding", "Finalizing", "Ready"].includes(job.status)) return false; state.cancelRequested = true; if (job.status === "Ready") { job.status = "Cancelled"; job.stage = "Cancelled"; job.cancelledAt = now(); job.updatedAt = now(); persist(); onEvent({ type: "export-cancelled", export: publicJob(job) }); } return true; }
  async function retryExport(exportId) { const job = jobs.get(exportId); if (!job || !["Failed", "Cancelled", "Missing", "Blocked"].includes(job.status)) throw new Error("This export is not retryable."); job.retryCount += 1; job.status = "Draft"; job.error = null; job.progress = 0; job.stage = "Retrying"; job.updatedAt = now(); return startExport(exportId); }
  function getExportStatus(exportId) { const job = jobs.get(exportId); return job ? publicJob(job) : null; }
  function getExportResult(exportId) { const job = jobs.get(exportId); const state = runtime.get(exportId); return job?.status === "Complete" && state?.blob ? { job: publicJob(job), blob: state.blob, url: state.url, filename: state.filename } : null; }
  function downloadExport(exportId) { const result = getExportResult(exportId); if (!result) throw new Error("Export output is unavailable. Retry the export first."); const anchor = document.createElement("a"); anchor.href = result.url; anchor.download = result.filename; anchor.click(); onEvent({ type: "export-downloaded", export: result.job }); return result.job; }
  function deleteExport(exportId) { const job = jobs.get(exportId); const state = runtime.get(exportId); if (!job) return false; if (["Rendering", "Encoding", "Finalizing"].includes(job.status)) throw new Error("Cancel the active export before deleting it."); if (state?.url) URL.revokeObjectURL(state.url); runtime.delete(exportId); job.status = "Deleted"; job.outputReference = null; job.updatedAt = now(); persist(); onEvent({ type: "export-deleted", exportId }); return true; }
  function listExports(requestProjectId = projectId, options = {}) { return [...jobs.values()].filter((job) => job.projectId === requestProjectId && job.status !== "Deleted" && (options.includeMissing !== false || job.status !== "Missing")).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(publicJob); }
  function duplicateSettings(exportId) { const job = jobs.get(exportId); const state = runtime.get(exportId); if (!job) throw new Error("Export job not found."); return createExportJob({ ...publicJob(job), name: `${job.name} Copy`, retryCount: 0, adapterInput: state?.adapterInput || null }); }
  function diagnostics() { const active = [...jobs.values()].find((job) => ["Rendering", "Encoding", "Finalizing"].includes(job.status)); return { activeExportId: active?.exportId || null, exportMethod: active ? adapterFor(active)?.method || "browser" : null, exportStage: active?.stage || null, exportProgress: active?.progress || 0, validationStatus: active?.validationResults?.status || null, activeObjectUrlCount: [...runtime.values()].filter((state) => state.url).length, lastRenderError: [...jobs.values()].reverse().find((job) => job.error)?.error || null, temporaryFileCount: 0 }; }
  function cleanup() { runtime.forEach((state) => { if (state.url) URL.revokeObjectURL(state.url); }); runtime.clear(); }

  global.DeckForgeExportService = Object.freeze({ configure, createExportJob, validateExport, startExport, cancelExport, retryExport, getExportStatus, getExportResult, downloadExport, deleteExport, listExports, duplicateSettings, diagnostics, cleanup, safeName, SCHEMA_VERSION });
})(window);
