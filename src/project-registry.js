(function initializeProjectRegistry(global) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const REGISTRY_KEY = `deckforge-project-registry:v${SCHEMA_VERSION}`;
  const SESSION_KEY = `deckforge-active-project-session:v${SCHEMA_VERSION}`;
  const STORAGE_PREFIX = `deckforge-project:v${SCHEMA_VERSION}`;
  const BACKUP_PREFIX = `deckforge-migration-backup:v${SCHEMA_VERSION}`;
  const REPAIR_BACKUP_PREFIX = `deckforge-project-repair-backup:v${SCHEMA_VERSION}`;
  const PROJECT_TYPES = Object.freeze(["Empty Project", "Mixtape", "Live Set", "Remix", "Mashup", "Beat Project", "Scratch Session", "Practice Session"]);
  const OWNED_STORAGE_PREFIXES = Object.freeze([
    `deckforge-project-assets:v${SCHEMA_VERSION}`,
    "deckforge-recordings",
    "deckforge-exports",
    "deckforge-project-intelligence",
    "deckforge-contextual-recommendations",
    "deckforge-creative-missions",
    `deckforge-producer-memory:v${SCHEMA_VERSION}`,
    "deckforge-arrangement-studio"
  ]);
  const LEGACY_DOMAINS = Object.freeze({
    "deckforge-producer-studio": "producer-studio",
    "deckforge-pad-workspace": "pads",
    "deckforge-sources": "ditc-sources",
    "deckforge-ditc-metadata": "ditc-metadata",
    "deckforge-smart-prompt-history": "smart-mix-history",
    "deckforge-smart-prompt-recipes": "smart-mix-recipes",
    "deckforge-harmony-lab": "harmony-lab",
    "deckforge-beat-forge": "beat-forge",
    "deckforge-stem-lab-v2": "stem-lab"
  });
  let registry = { schemaVersion: SCHEMA_VERSION, projects: [], updatedAt: null };
  let session = null;
  let lastError = null;

  function now() { return new Date().toISOString(); }
  function clone(value, fallback = null) { try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; } }
  function id(prefix = "project") { return `${prefix}-${global.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`; }
  function cleanName(value) { return String(value || "Untitled Project").trim().replace(/\s+/g, " ").slice(0, 100) || "Untitled Project"; }
  function validProjectId(value) { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(value); }
  function storageKey(domain, projectId = session?.projectId) { if (!projectId || !domain) throw new Error("Project storage requires a projectId and domain."); return `${STORAGE_PREFIX}:${projectId}:${domain}`; }
  function persistRegistry() { registry.updatedAt = now(); localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry)); }
  function persistSession() { if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); }
  function project(projectId, options = {}) { const found = registry.projects.find((item) => item.projectId === projectId && (options.includeDeleted || item.status !== "Deleted")); return found ? clone(found) : null; }
  function listProjects(options = {}) { return registry.projects.filter((item) => (options.includeDeleted || item.status !== "Deleted") && (options.includeArchived || item.status !== "Archived")).sort((a, b) => String(b.lastOpenedAt || b.updatedAt).localeCompare(String(a.lastOpenedAt || a.updatedAt))).map((item) => clone(item)); }

  function normalizeProject(input = {}, forcedId = null) {
    const timestamp = now(); const projectId = forcedId || input.projectId || id();
    if (!validProjectId(projectId)) throw new Error("Project IDs must be immutable safe identifiers.");
    const metadata = clone(input.metadata, {}) || {};
    metadata.type = PROJECT_TYPES.includes(input.type || metadata.type) ? (input.type || metadata.type) : "Empty Project";
    metadata.favorite = input.favorite === true || metadata.favorite === true;
    metadata.tags = Array.isArray(metadata.tags) ? metadata.tags.slice(0, 30).map((tag) => String(tag).slice(0, 60)) : [];
    return { schemaVersion: SCHEMA_VERSION, projectId, name: cleanName(input.name), description: String(input.description || "").slice(0, 500), status: input.status === "Archived" ? "Archived" : "Active", createdAt: input.createdAt || timestamp, updatedAt: timestamp, lastOpenedAt: input.lastOpenedAt || null, closedAt: null, archivedAt: input.archivedAt || null, migration: input.migration || { status: "Not required", migratedAt: null, copiedDomains: [], backupKey: null, errors: [] }, metadata };
  }

  function createProject(input = {}, options = {}) {
    const item = normalizeProject(input, options.projectId || null);
    if (registry.projects.some((existing) => existing.projectId === item.projectId)) throw new Error("That immutable projectId already exists.");
    registry.projects.push(item); persistRegistry();
    if (options.open !== false) openProject(item.projectId, { reason: options.reason || "created" });
    return project(item.projectId);
  }

  function openProject(projectId, options = {}) {
    const item = registry.projects.find((entry) => entry.projectId === projectId && entry.status !== "Deleted");
    if (!item) throw new Error("Project not found.");
    if (item.status === "Archived") throw new Error("Restore this archived project before opening it.");
    const previousVersion = Number(session?.contextVersion || 0);
    if (session?.projectId && session.projectId !== projectId) { const previous = registry.projects.find((entry) => entry.projectId === session.projectId); if (previous && previous.status !== "Archived") { previous.status = "Closed"; previous.closedAt = now(); previous.updatedAt = previous.closedAt; } }
    item.status = "Active"; item.closedAt = null; item.lastOpenedAt = now(); item.updatedAt = item.lastOpenedAt;
    session = { sessionId: id("session"), projectId: item.projectId, contextVersion: previousVersion + 1, openedAt: item.lastOpenedAt, creationTimestamp: item.createdAt, reason: options.reason || "opened", switching: false };
    persistRegistry(); persistSession(); return clone(session);
  }

  function closeProject(projectId = session?.projectId) {
    if (!projectId || session?.projectId !== projectId) return false;
    const item = registry.projects.find((entry) => entry.projectId === projectId); if (item) { item.status = "Closed"; item.closedAt = now(); item.updatedAt = item.closedAt; }
    session = null; persistRegistry(); persistSession(); return true;
  }

  function renameProject(projectId, name) { const item = registry.projects.find((entry) => entry.projectId === projectId && entry.status !== "Deleted"); if (!item) throw new Error("Project not found."); item.name = cleanName(name); item.updatedAt = now(); persistRegistry(); return project(projectId); }
  function updateProject(projectId, changes = {}) { const item = registry.projects.find((entry) => entry.projectId === projectId && entry.status !== "Deleted"); if (!item) throw new Error("Project not found."); if (changes.name !== undefined) item.name = cleanName(changes.name); if (changes.description !== undefined) item.description = String(changes.description).slice(0, 500); if (changes.metadata) item.metadata = { ...item.metadata, ...(clone(changes.metadata, {}) || {}) }; item.updatedAt = now(); persistRegistry(); return project(projectId); }
  function favoriteProject(projectId, favorite = true) { const item = registry.projects.find((entry) => entry.projectId === projectId && entry.status !== "Deleted"); if (!item) throw new Error("Project not found."); item.metadata = { ...(item.metadata || {}), favorite: favorite === true }; item.updatedAt = now(); persistRegistry(); return project(projectId); }
  function markProjectOpened(projectId) { const item = registry.projects.find((entry) => entry.projectId === projectId && entry.status !== "Deleted"); if (!item || item.status === "Archived") throw new Error("Project is unavailable."); item.status = "Active"; item.lastOpenedAt = now(); item.updatedAt = item.lastOpenedAt; persistRegistry(); return project(projectId); }
  function archiveProject(projectId) { if (session?.projectId === projectId) throw new Error("Close the active project before archiving it."); const item = registry.projects.find((entry) => entry.projectId === projectId && entry.status !== "Deleted"); if (!item) throw new Error("Project not found."); item.status = "Archived"; item.archivedAt = now(); item.updatedAt = item.archivedAt; persistRegistry(); return project(projectId, { includeDeleted: true }); }
  function restoreProject(projectId) { const item = registry.projects.find((entry) => entry.projectId === projectId && entry.status === "Archived"); if (!item) throw new Error("Archived project not found."); item.status = "Closed"; item.archivedAt = null; item.updatedAt = now(); persistRegistry(); return project(projectId); }
  function ownedStorageKeys(projectId) {
    const scopedPrefix = `${STORAGE_PREFIX}:${projectId}:`;
    return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key) => key && (key.startsWith(scopedPrefix) || OWNED_STORAGE_PREFIXES.some((prefix) => key === `${prefix}:${projectId}`)));
  }
  function rewriteProjectOwnership(value, sourceProjectId, targetProjectId) {
    if (Array.isArray(value)) return value.map((item) => rewriteProjectOwnership(item, sourceProjectId, targetProjectId));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "projectId" && item === sourceProjectId ? targetProjectId : rewriteProjectOwnership(item, sourceProjectId, targetProjectId)]));
  }
  function destinationOwnedKey(key, sourceProjectId, targetProjectId) {
    const scopedPrefix = `${STORAGE_PREFIX}:${sourceProjectId}:`;
    if (key.startsWith(scopedPrefix)) return `${STORAGE_PREFIX}:${targetProjectId}:${key.slice(scopedPrefix.length)}`;
    return key.replace(new RegExp(`:${sourceProjectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), `:${targetProjectId}`);
  }
  function duplicateProject(projectId, input = {}) {
    const source = project(projectId); if (!source) throw new Error("Project not found.");
    const copy = createProject({ name: input.name || `${source.name} Copy`, description: source.description, type: source.metadata?.type, metadata: { ...(source.metadata || {}), favorite: false, duplicatedFromProjectId: source.projectId, duplicatedAt: now() } }, { open: false });
    const copiedKeys = [];
    try {
      ownedStorageKeys(source.projectId).forEach((key) => {
        const raw = localStorage.getItem(key); const parsed = JSON.parse(raw); const owned = rewriteProjectOwnership(parsed, source.projectId, copy.projectId);
        if (/^deckforge-(recordings|exports):/.test(key)) {
          const items = owned.records || owned.jobs || [];
          items.forEach((item) => { if (item.status === "Complete") { item.status = "Missing"; item.error = "Runtime output is not copied. Recreate or relink this output."; } });
        }
        const destination = destinationOwnedKey(key, source.projectId, copy.projectId); localStorage.setItem(destination, JSON.stringify(owned)); JSON.parse(localStorage.getItem(destination)); copiedKeys.push(destination);
      });
      updateProject(copy.projectId, { metadata: { duplicatedStorageKeys: copiedKeys.length } });
      return project(copy.projectId);
    } catch (error) {
      copiedKeys.forEach((key) => localStorage.removeItem(key));
      const item = registry.projects.find((entry) => entry.projectId === copy.projectId); if (item) registry.projects.splice(registry.projects.indexOf(item), 1); persistRegistry();
      throw new Error(`Project duplication failed safely: ${error.message}`);
    }
  }
  function validateProject(projectId, options = {}) {
    const item = registry.projects.find((entry) => entry.projectId === projectId && entry.status !== "Deleted"); if (!item) return { valid: false, projectId, issues: [{ code: "missing-project", message: "Project registry entry is missing.", repairable: false }], checkedAt: now() };
    const issues = [];
    if (!PROJECT_TYPES.includes(item.metadata?.type)) issues.push({ code: "missing-type", message: "Project type is missing or unsupported.", repairable: true });
    ownedStorageKeys(projectId).forEach((key) => { try { const value = JSON.parse(localStorage.getItem(key)); if (value?.projectId && value.projectId !== projectId) issues.push({ code: "ownership", key, message: "Stored project ownership does not match the registry.", repairable: true }); } catch { issues.push({ code: "invalid-json", key, message: "Project storage contains invalid JSON.", repairable: false }); } });
    const result = { valid: issues.length === 0, projectId, issues, checkedAt: now() };
    if (options.persist !== false) { item.metadata = { ...(item.metadata || {}), validation: { valid: result.valid, issueCount: issues.length, checkedAt: result.checkedAt } }; item.updatedAt = now(); persistRegistry(); }
    return clone(result);
  }
  function repairProject(projectId) {
    const validation = validateProject(projectId); const repairable = validation.issues.filter((issue) => issue.repairable); if (!repairable.length) return { repaired: false, validation, message: validation.valid ? "No repair is needed." : "The detected issue cannot be repaired automatically." };
    const backupKey = `${REPAIR_BACKUP_PREFIX}:${projectId}:${Date.now()}`; const backup = { projectId, createdAt: now(), registry: project(projectId), entries: {} };
    ownedStorageKeys(projectId).forEach((key) => { backup.entries[key] = localStorage.getItem(key); }); localStorage.setItem(backupKey, JSON.stringify(backup));
    const item = registry.projects.find((entry) => entry.projectId === projectId); if (repairable.some((issue) => issue.code === "missing-type")) item.metadata = { ...(item.metadata || {}), type: "Empty Project" };
    repairable.filter((issue) => issue.code === "ownership").forEach((issue) => { const parsed = JSON.parse(localStorage.getItem(issue.key)); localStorage.setItem(issue.key, JSON.stringify(rewriteProjectOwnership(parsed, parsed.projectId, projectId))); });
    item.updatedAt = now(); persistRegistry(); const next = validateProject(projectId); return { repaired: next.valid, validation: next, backupKey, message: next.valid ? "Project metadata and ownership were repaired." : "Some project issues still need review." };
  }
  function deleteProject(projectId, options = {}) { if (session?.projectId === projectId) throw new Error("Close the active project before deleting it."); const item = registry.projects.find((entry) => entry.projectId === projectId); if (!item) return false; if (options.purge) ownedStorageKeys(projectId).forEach((key) => localStorage.removeItem(key)); item.status = "Deleted"; item.deletedAt = now(); item.updatedAt = item.deletedAt; persistRegistry(); return true; }
  function activeProject() { return session ? project(session.projectId) : null; }
  function activeSession() { return clone(session); }
  function owns(projectId, contextVersion = null) { return Boolean(session && !session.switching && projectId === session.projectId && (contextVersion == null || Number(contextVersion) === Number(session.contextVersion))); }
  function beginSwitch(targetProjectId) { if (!project(targetProjectId)) throw new Error("Target project not found."); if (session) { session.switching = true; session.switchTargetProjectId = targetProjectId; persistSession(); } return activeSession(); }

  function read(domain, fallback = null, projectId = session?.projectId) { try { const raw = localStorage.getItem(storageKey(domain, projectId)); return raw == null ? clone(fallback, fallback) : JSON.parse(raw); } catch (error) { lastError = error.message; return clone(fallback, fallback); } }
  function write(domain, value, projectId = session?.projectId) { const payload = value && typeof value === "object" && !Array.isArray(value) ? { ...clone(value, {}), projectId } : value; localStorage.setItem(storageKey(domain, projectId), JSON.stringify(payload)); return true; }
  function remove(domain, projectId = session?.projectId) { localStorage.removeItem(storageKey(domain, projectId)); }

  function migrateLegacy(projectId = session?.projectId) {
    const item = registry.projects.find((entry) => entry.projectId === projectId); if (!item) throw new Error("Migration requires a registered project.");
    if (item.migration?.status === "Complete") return clone(item.migration);
    const backup = { schemaVersion: SCHEMA_VERSION, projectId, createdAt: now(), entries: {} }; const copiedDomains = []; const errors = [];
    Object.entries(LEGACY_DOMAINS).forEach(([legacyKey, domain]) => {
      const raw = localStorage.getItem(legacyKey); if (raw == null) return;
      backup.entries[legacyKey] = raw;
      try { const parsed = JSON.parse(raw); const owned = Array.isArray(parsed) ? parsed.map((entry) => entry && typeof entry === "object" ? { ...entry, projectId } : entry) : parsed && typeof parsed === "object" ? { ...parsed, projectId } : parsed; const destination = storageKey(domain, projectId); if (localStorage.getItem(destination) == null) { localStorage.setItem(destination, JSON.stringify(owned)); JSON.parse(localStorage.getItem(destination)); copiedDomains.push(domain); } }
      catch (error) { errors.push(`${legacyKey}: ${error.message}`); }
    });
    const backupKey = `${BACKUP_PREFIX}:${projectId}:${Date.now()}`; localStorage.setItem(backupKey, JSON.stringify(backup));
    item.migration = { status: errors.length ? "Completed with errors" : "Complete", migratedAt: now(), copiedDomains, backupKey, errors, strategy: "Copy, validate, switch; legacy keys preserved" }; item.updatedAt = now(); persistRegistry();
    return clone(item.migration);
  }

  function requestedProjectId() {
    const match = String(global.location?.hash || "").match(/^#\/project\/([^/]+)/);
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch { return null; }
  }

  function bootstrap() {
    try { const saved = JSON.parse(localStorage.getItem(REGISTRY_KEY) || "null"); if (saved?.schemaVersion === SCHEMA_VERSION && Array.isArray(saved.projects)) registry = saved; }
    catch (error) { lastError = error.message; }
    const requestedId = requestedProjectId(); let savedSession = null;
    try { savedSession = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch (error) { lastError = error.message; }
    if (!registry.projects.some((item) => item.status !== "Deleted")) {
      let legacy = null; try { legacy = JSON.parse(localStorage.getItem("deckforge-producer-studio") || "null"); } catch { /* migration reports malformed data later */ }
      const hasLegacyData = Object.keys(LEGACY_DOMAINS).some((key) => localStorage.getItem(key) != null);
      if (hasLegacyData) {
        const legacyId = validProjectId(legacy?.projectId) ? legacy.projectId : "deckforge-session";
        const migrated = createProject({ name: legacy?.projectName || "DeckForge Session", description: legacy?.description || "", createdAt: legacy?.createdAt }, { projectId: legacyId, open: false });
        migrateLegacy(migrated.projectId);
      }
    }
    const requested = requestedId ? registry.projects.find((item) => item.projectId === requestedId && !["Deleted", "Archived"].includes(item.status)) : null;
    if (requested && savedSession?.projectId === requested.projectId) {
      session = { ...savedSession, switching: false }; requested.status = "Active"; requested.closedAt = null; persistSession();
      if (requested.migration?.status !== "Complete") migrateLegacy(requested.projectId);
    } else {
      session = null; persistSession();
      registry.projects.forEach((item) => { if (item.status === "Active") { item.status = "Closed"; item.closedAt = item.closedAt || now(); } });
      if (registry.projects.length) persistRegistry();
    }
    return { project: activeProject(), session: activeSession() };
  }

  bootstrap();
  global.DeckForgeProjectRegistry = Object.freeze({ SCHEMA_VERSION, REGISTRY_KEY, SESSION_KEY, STORAGE_PREFIX, LEGACY_DOMAINS, PROJECT_TYPES, createProject, openProject, closeProject, renameProject, updateProject, favoriteProject, markProjectOpened, archiveProject, restoreProject, duplicateProject, validateProject, repairProject, deleteProject, getProject: project, listProjects, getActiveProject: activeProject, getSession: activeSession, owns, beginSwitch, storageKey, read, write, remove, migrateLegacy, ownedStorageKeys, diagnostics: () => { const all = listProjects({ includeArchived: true }); return { activeProjectId: session?.projectId || null, session: activeSession(), projectCount: all.length, archivedCount: all.filter((item) => item.status === "Archived").length, favoriteCount: all.filter((item) => item.metadata?.favorite).length, failedValidations: all.filter((item) => item.metadata?.validation?.valid === false).length, lastError, migrations: all.map((item) => ({ projectId: item.projectId, migration: item.migration })) }; } });
})(window);
