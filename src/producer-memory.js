(function initializeProducerMemory(global) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STORAGE_PREFIX = "deckforge-producer-memory";
  const USER_DEFAULTS_KEY = `${STORAGE_PREFIX}:user-defaults:v${SCHEMA_VERSION}`;
  const VALID_STATUSES = new Set(["Proposed", "Confirmed", "Inferred", "Edited", "Rejected", "Archived", "Forgotten", "Conflicted"]);
  const VALID_SCOPES = new Set(["Project", "User Default"]);
  const ACTIVE_STATUSES = new Set(["Proposed", "Confirmed", "Inferred", "Edited", "Conflicted"]);
  const subscribers = new Set();
  let projectId = "deckforge-session";
  let memories = [];
  let observations = {};
  let suppressions = {};
  let changeHistory = [];
  let recoverableSnapshot = null;
  let lastWrite = null;
  let lastMigration = "None required";
  let persistenceStatus = "Not initialized";
  let lastError = "None";

  function now() { return new Date().toISOString(); }
  function id(prefix = "memory") { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function clone(value, fallback = null) { try { return JSON.parse(JSON.stringify(value)); } catch (error) { lastError = error.message; return fallback; } }
  function storageKey(idValue = projectId) { return `${STORAGE_PREFIX}:v${SCHEMA_VERSION}:${idValue}`; }
  function compact(value) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100); }
  function active(memory) { return ACTIVE_STATUSES.has(memory.status) && !isExpired(memory); }
  function isExpired(memory) { return Boolean(memory.expiration && Date.parse(memory.expiration) <= Date.now()); }
  function safeValue(value) {
    if (typeof value === "string") { if (/api[_ -]?key|access[_ -]?token|password|private[_ -]?token|secret[_ -]?key/i.test(value)) return "Sensitive value omitted"; return validateText(value, 1000); }
    if (["number", "boolean"].includes(typeof value) || value === null) return value;
    if (Array.isArray(value)) return value.slice(0, 30).map(safeValue);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 30).filter(([key]) => !/token|secret|credential|audio|waveform|buffer|objecturl|filepath|absolutePath/i.test(key)).map(([key, item]) => [key, safeValue(item)]));
    return String(value);
  }
  function validateText(value, max = 500) {
    const text = String(value ?? "").trim().slice(0, max);
    if (/^(?:file:\/\/|\/[A-Za-z]|[A-Za-z]:\\)/.test(text)) return "Private path omitted";
    return text;
  }
  function normalizeEvidence(evidence) { return (Array.isArray(evidence) ? evidence : []).slice(0, 20).map((item) => ({ label: validateText(item?.label || "Evidence", 120), value: validateText(item?.value ?? item, 300), timestamp: item?.timestamp || now() })); }
  function confidenceLabel(memory) {
    if (memory.userConfirmed || ["Confirmed", "Edited"].includes(memory.status)) return "Confirmed";
    if (memory.confidence >= 0.75 && memory.evidence.length >= 3) return "Strongly Inferred";
    return "Tentative";
  }
  function normalizeEntry(entry = {}) {
    const timestamp = now();
    const userConfirmed = Boolean(entry.userConfirmed);
    const status = VALID_STATUSES.has(entry.status) ? entry.status : userConfirmed ? "Confirmed" : entry.source === "Repeated behavior" ? "Proposed" : "Inferred";
    return {
      memoryId: entry.memoryId || id(), projectId, category: validateText(entry.category || "User-Confirmed Facts", 100), key: compact(entry.key || entry.summary || "preference"), value: safeValue(entry.value),
      summary: validateText(entry.summary || `${entry.key || "Preference"}: ${Array.isArray(entry.value) ? entry.value.join(", ") : entry.value}`, 500), source: validateText(entry.source || "Producer Memory", 160),
      confidence: Math.max(0, Math.min(1, Number(entry.confidence ?? (userConfirmed ? 1 : 0.45)))), evidence: normalizeEvidence(entry.evidence), userConfirmed,
      userEdited: Boolean(entry.userEdited), createdAt: entry.createdAt || timestamp, updatedAt: timestamp, lastUsedAt: entry.lastUsedAt || null, useCount: Math.max(0, Number(entry.useCount || 0)),
      status, scope: VALID_SCOPES.has(entry.scope) ? entry.scope : "Project", expiration: entry.expiration || null, conflictingMemoryIds: Array.isArray(entry.conflictingMemoryIds) ? entry.conflictingMemoryIds : [],
      relatedDecisionIds: Array.isArray(entry.relatedDecisionIds) ? entry.relatedDecisionIds.slice(0, 30) : [], relatedRecommendationIds: Array.isArray(entry.relatedRecommendationIds) ? entry.relatedRecommendationIds.slice(0, 30) : [], unresolved: Boolean(entry.unresolved)
    };
  }
  function validateLoadedMemory(item) { return item && typeof item === "object" && typeof item.memoryId === "string" && typeof item.key === "string" && typeof item.category === "string" && VALID_STATUSES.has(item.status) && item.projectId === projectId; }
  function persist() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({ schemaVersion: SCHEMA_VERSION, projectId, memories, observations, suppressions, changeHistory: changeHistory.slice(0, 20), recoverableSnapshot, updatedAt: now() }));
      lastWrite = now(); persistenceStatus = "Saved"; return true;
    } catch (error) { lastError = error.message; persistenceStatus = "Save failed"; return false; }
  }
  function migrate(saved) {
    if (!saved || saved.schemaVersion === SCHEMA_VERSION) return saved;
    lastMigration = `Unsupported schema ${saved.schemaVersion}; started safely with empty project memory`;
    return null;
  }
  function load() {
    try {
      const saved = migrate(JSON.parse(localStorage.getItem(storageKey()) || "null"));
      if (!saved || saved.projectId !== projectId) { memories = []; observations = {}; suppressions = {}; changeHistory = []; recoverableSnapshot = null; persistenceStatus = "No saved memory"; return; }
      memories = (Array.isArray(saved.memories) ? saved.memories : []).filter(validateLoadedMemory).map(normalizeEntry);
      observations = saved.observations && typeof saved.observations === "object" ? saved.observations : {};
      suppressions = saved.suppressions && typeof saved.suppressions === "object" ? saved.suppressions : {};
      changeHistory = Array.isArray(saved.changeHistory) ? saved.changeHistory.slice(0, 20) : [];
      recoverableSnapshot = Array.isArray(saved.recoverableSnapshot) ? saved.recoverableSnapshot.filter(validateLoadedMemory) : null;
      archiveStaleInferred(false); persistenceStatus = "Restored";
    } catch (error) { memories = []; observations = {}; suppressions = {}; changeHistory = []; lastError = error.message; persistenceStatus = "Restore failed; empty memory loaded"; }
  }
  function snapshot(action, memoryId = null) { changeHistory.unshift({ changeId: id("change"), action, memoryId, at: now(), before: clone(memories, []) }); changeHistory = changeHistory.slice(0, 20); }
  function notify(type, memory = null, detail = {}) { persist(); const payload = { type, memory: clone(memory), ...detail }; subscribers.forEach((fn) => { try { fn(clone(memories, []), payload); } catch (error) { lastError = error.message; } }); return payload; }
  function conflictsFor(entry) { return memories.filter((memory) => active(memory) && memory.memoryId !== entry.memoryId && memory.scope === entry.scope && memory.category === entry.category && memory.key === entry.key && JSON.stringify(memory.value) !== JSON.stringify(entry.value)); }
  function proposeMemory(entry) {
    const normalized = normalizeEntry(entry);
    const duplicate = memories.find((memory) => active(memory) && memory.category === normalized.category && memory.key === normalized.key && JSON.stringify(memory.value) === JSON.stringify(normalized.value));
    if (duplicate) { duplicate.updatedAt = now(); duplicate.evidence = [...duplicate.evidence, ...normalized.evidence].slice(-20); duplicate.confidence = Math.max(duplicate.confidence, normalized.confidence); if (normalized.userConfirmed) { duplicate.userConfirmed = true; duplicate.status = "Confirmed"; } notify("reinforced", duplicate); return clone(duplicate); }
    snapshot("Add memory", normalized.memoryId);
    const conflicts = conflictsFor(normalized);
    if (conflicts.length) { normalized.status = "Conflicted"; normalized.conflictingMemoryIds = conflicts.map((memory) => memory.memoryId); conflicts.forEach((memory) => { memory.status = "Conflicted"; memory.conflictingMemoryIds = [...new Set([...memory.conflictingMemoryIds, normalized.memoryId])]; }); }
    memories.unshift(normalized); notify(conflicts.length ? "conflict-detected" : "proposed", normalized, { conflicts: clone(conflicts, []) }); return clone(normalized);
  }
  function mutate(memoryId, action, updater) { const memory = memories.find((item) => item.memoryId === memoryId); if (!memory) return null; snapshot(action, memoryId); updater(memory); memory.updatedAt = now(); notify(action.toLowerCase().replace(/\s+/g, "-"), memory); return clone(memory); }
  function confirmMemory(memoryId) { return mutate(memoryId, "Confirm memory", (memory) => { memory.status = "Confirmed"; memory.userConfirmed = true; memory.confidence = 1; }); }
  function editMemory(memoryId, value, summary) { return mutate(memoryId, "Edit memory", (memory) => { memory.value = safeValue(value); memory.summary = validateText(summary || `${memory.key.replace(/-/g, " ")}: ${Array.isArray(value) ? value.join(", ") : value}`, 500); memory.status = "Edited"; memory.userConfirmed = true; memory.userEdited = true; memory.confidence = 1; memory.unresolved = false; }); }
  function rejectMemory(memoryId, options = {}) { return mutate(memoryId, "Reject memory", (memory) => { memory.status = "Rejected"; memory.userConfirmed = false; suppressions[`${memory.category}:${memory.key}:${compact(memory.value)}`] = { at: now(), reason: options.reason || "Do not suggest again", expiresAt: options.suppress === false ? new Date(Date.now() + 7 * 86400000).toISOString() : null }; }); }
  function forgetMemory(memoryId) { return mutate(memoryId, "Forget memory", (memory) => { memory.status = "Forgotten"; memory.userConfirmed = false; }); }
  function archiveMemory(memoryId) { return mutate(memoryId, "Archive memory", (memory) => { memory.status = "Archived"; }); }
  function resolveMemoryConflict(memoryId, mode = "replace") {
    const memory = memories.find((item) => item.memoryId === memoryId); if (!memory || memory.status !== "Conflicted") return null;
    snapshot("Resolve memory conflict", memoryId);
    const conflicts = memories.filter((item) => memory.conflictingMemoryIds.includes(item.memoryId));
    if (mode === "replace") conflicts.forEach((item) => { item.status = "Archived"; item.conflictingMemoryIds = []; });
    else conflicts.forEach((item) => { item.status = item.userConfirmed ? "Confirmed" : "Inferred"; item.conflictingMemoryIds = []; });
    memory.status = ["cancel", "mission-only"].includes(mode) ? "Forgotten" : memory.userConfirmed ? "Confirmed" : "Inferred"; memory.conflictingMemoryIds = []; memory.updatedAt = now(); notify("conflict-resolved", memory, { mode }); return clone(memory);
  }
  function getProjectMemories(idValue = projectId, options = {}) { if (idValue !== projectId) return []; return clone(memories.filter((memory) => options.includeInactive || active(memory)), []); }
  function getRelevantMemories(context = {}, options = {}) {
    const excluded = new Set((options.excludeCategories || []).map((item) => item.toLowerCase()));
    const activeMemories = memories.filter((memory) => active(memory) && memory.status !== "Proposed" && memory.status !== "Conflicted" && !excluded.has(memory.category.toLowerCase()));
    const ranked = activeMemories.map((memory) => ({ ...memory, relevance: (memory.userConfirmed ? 100 : 40) + memory.useCount + (memory.category === "Project Identity" ? 15 : 0) + (context?.project?.projectPhase && memory.category === "Arrangement Preferences" ? 5 : 0) })).sort((a, b) => b.relevance - a.relevance);
    return clone(ranked.slice(0, options.limit || 20), []);
  }
  function getMemorySummary(idValue = projectId, options = {}) {
    const relevant = getRelevantMemories({}, options);
    return { projectId: idValue, count: relevant.length, preferences: relevant.map((memory) => ({ memoryId: memory.memoryId, category: memory.category, key: memory.key, value: memory.value, summary: memory.summary, status: memory.status, confidence: confidenceLabel(memory), source: memory.source })) };
  }
  function recordMemoryUse(memoryIds) { (Array.isArray(memoryIds) ? memoryIds : [memoryIds]).forEach((memoryId) => { const memory = memories.find((item) => item.memoryId === memoryId); if (memory) { memory.lastUsedAt = now(); memory.useCount += 1; } }); if (memoryIds?.length) persist(); }
  function observePreference(entry) {
    const key = `${entry.category}:${compact(entry.key)}:${compact(entry.value)}`;
    if (suppressions[key] && (!suppressions[key].expiresAt || Date.parse(suppressions[key].expiresAt) > Date.now())) return null;
    if (suppressions[key]?.expiresAt) delete suppressions[key];
    const observation = observations[key] || { count: 0, evidence: [] };
    observation.count += 1; observation.lastObservedAt = now(); observation.evidence.push({ label: entry.evidenceLabel || "Observed selection", value: validateText(entry.value, 200), timestamp: now() }); observation.evidence = observation.evidence.slice(-10); observations[key] = observation;
    const existing = memories.find((memory) => active(memory) && memory.category === entry.category && memory.key === compact(entry.key) && JSON.stringify(memory.value) === JSON.stringify(entry.value));
    if (!existing && observation.count >= (entry.threshold || 3)) return proposeMemory({ ...entry, source: "Repeated behavior", status: "Proposed", confidence: Math.min(0.85, 0.35 + observation.count * 0.1), evidence: observation.evidence, summary: entry.summary || `${entry.key}: ${entry.value}` });
    persist(); return existing ? clone(existing) : null;
  }
  function archiveStaleInferred(shouldNotify = true) { const cutoff = Date.now() - 90 * 86400000; let count = 0; memories.forEach((memory) => { if (!memory.userConfirmed && memory.status === "Inferred" && Date.parse(memory.updatedAt) < cutoff) { memory.status = "Archived"; count += 1; } }); if (count && shouldNotify) notify("decay-archive", null, { count }); return count; }
  function undoLastChange() { const change = changeHistory.shift(); if (!change?.before) return null; const current = clone(memories, []); memories = change.before.map(normalizeEntry); changeHistory.unshift({ changeId: id("change"), action: `Undo ${change.action}`, at: now(), before: current }); notify("undo", null, { action: change.action }); return clone(memories, []); }
  function clearProjectMemory() { snapshot("Clear project memory"); recoverableSnapshot = clone(memories, []); memories = []; notify("project-cleared"); return true; }
  function resetInferredPreferences() { snapshot("Reset inferred preferences"); memories = memories.filter((memory) => memory.userConfirmed || !["Inferred", "Proposed"].includes(memory.status)); notify("inferred-reset"); return true; }
  function restoreDefaultProjectMemory() { if (!recoverableSnapshot) return false; snapshot("Restore project memory"); memories = recoverableSnapshot.map(normalizeEntry); recoverableSnapshot = null; notify("project-restored"); return true; }
  function clearSessionMemory() { observations = {}; notify("session-cleared"); return true; }
  function promoteToUserDefault(memoryId) { const memory = memories.find((item) => item.memoryId === memoryId); if (!memory || !memory.userConfirmed) return false; try { const saved = JSON.parse(localStorage.getItem(USER_DEFAULTS_KEY) || "[]"); const defaults = Array.isArray(saved) ? saved : []; const promoted = { ...clone(memory), memoryId: id("default"), scope: "User Default", projectId: null, updatedAt: now() }; localStorage.setItem(USER_DEFAULTS_KEY, JSON.stringify([promoted, ...defaults.filter((item) => !(item.category === promoted.category && item.key === promoted.key))].slice(0, 50))); notify("promoted-default", memory); return true; } catch (error) { lastError = error.message; return false; } }
  function getUserDefaults() { try { const saved = JSON.parse(localStorage.getItem(USER_DEFAULTS_KEY) || "[]"); return Array.isArray(saved) ? clone(saved, []) : []; } catch (error) { lastError = error.message; return []; } }
  function exportProjectMemory(idValue = projectId) { return JSON.stringify({ product: "DeckForge Producer Memory", schemaVersion: SCHEMA_VERSION, projectId: idValue, exportedAt: now(), memories: getProjectMemories(idValue, { includeInactive: true }).map(({ memoryId, projectId: itemProjectId, category, key, value, summary, source, confidence, evidence, userConfirmed, userEdited, createdAt, updatedAt, lastUsedAt, useCount, status, scope, expiration, conflictingMemoryIds, relatedDecisionIds, relatedRecommendationIds, unresolved }) => ({ memoryId, projectId: itemProjectId, category, key, value, summary, source, confidence, evidence, userConfirmed, userEdited, createdAt, updatedAt, lastUsedAt, useCount, status, scope, expiration, conflictingMemoryIds, relatedDecisionIds, relatedRecommendationIds, unresolved })) }, null, 2); }
  function importProjectMemory(idValue, data) {
    if (idValue !== projectId) return { success: false, reason: "Import project ID does not match the active project." };
    try { const parsed = typeof data === "string" ? JSON.parse(data) : data; if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.memories)) return { success: false, reason: "Unsupported or malformed Producer Memory file." }; const imported = parsed.memories.slice(0, 200).map((item) => normalizeEntry({ ...item, projectId })).filter(validateLoadedMemory); snapshot("Import project memory"); imported.forEach((item) => { const prior = memories.find((memory) => memory.category === item.category && memory.key === item.key && JSON.stringify(memory.value) === JSON.stringify(item.value)); if (!prior) memories.push(item); }); notify("imported", null, { count: imported.length }); return { success: true, count: imported.length }; } catch (error) { lastError = error.message; return { success: false, reason: "The selected file is not valid Producer Memory JSON." }; }
  }
  function markUnresolved(memoryId, reason) { return mutate(memoryId, "Mark memory unresolved", (memory) => { memory.unresolved = true; memory.evidence.push({ label: "Unresolved", value: validateText(reason, 300), timestamp: now() }); }); }
  function configure(options = {}) { projectId = String(options.projectId || projectId); load(); return getProjectMemories(); }
  function subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); }
  function getDiagnostics() { return { currentProjectId: projectId, totalProjectMemories: memories.length, confirmedMemories: memories.filter((item) => item.userConfirmed && active(item)).length, inferredMemories: memories.filter((item) => item.status === "Inferred").length, proposedMemories: memories.filter((item) => item.status === "Proposed").length, conflictedMemories: memories.filter((item) => item.status === "Conflicted").length, archivedMemories: memories.filter((item) => item.status === "Archived").length, lastMemoryWrite: lastWrite, schemaVersion: SCHEMA_VERSION, persistenceStatus, lastMigration, lastMemoryError: lastError, recoverableSnapshot: Boolean(recoverableSnapshot), undoDepth: changeHistory.length, userDefaults: getUserDefaults().length }; }

  global.ProducerMemory = Object.freeze({ configure, proposeMemory, confirmMemory, editMemory, rejectMemory, forgetMemory, archiveMemory, getProjectMemories, getRelevantMemories, getMemorySummary, resolveMemoryConflict, clearProjectMemory, resetInferredPreferences, restoreDefaultProjectMemory, clearSessionMemory, exportProjectMemory, importProjectMemory, promoteToUserDefault, getUserDefaults, observePreference, recordMemoryUse, archiveStaleInferred, undoLastChange, markUnresolved, getDiagnostics, subscribe, confidenceLabel, SCHEMA_VERSION, VALID_STATUSES: [...VALID_STATUSES] });
})(window);
