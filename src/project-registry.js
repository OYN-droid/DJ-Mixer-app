(function initializeProjectRegistry(global) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const REGISTRY_KEY = `deckforge-project-registry:v${SCHEMA_VERSION}`;
  const SESSION_KEY = `deckforge-active-project-session:v${SCHEMA_VERSION}`;
  const STORAGE_PREFIX = `deckforge-project:v${SCHEMA_VERSION}`;
  const BACKUP_PREFIX = `deckforge-migration-backup:v${SCHEMA_VERSION}`;
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
  function project(projectId) { const found = registry.projects.find((item) => item.projectId === projectId && item.status !== "Deleted"); return found ? clone(found) : null; }
  function listProjects(options = {}) { return registry.projects.filter((item) => options.includeDeleted || item.status !== "Deleted").sort((a, b) => String(b.lastOpenedAt || b.updatedAt).localeCompare(String(a.lastOpenedAt || a.updatedAt))).map((item) => clone(item)); }

  function normalizeProject(input = {}, forcedId = null) {
    const timestamp = now(); const projectId = forcedId || input.projectId || id();
    if (!validProjectId(projectId)) throw new Error("Project IDs must be immutable safe identifiers.");
    return { schemaVersion: SCHEMA_VERSION, projectId, name: cleanName(input.name), description: String(input.description || "").slice(0, 500), status: "Active", createdAt: input.createdAt || timestamp, updatedAt: timestamp, lastOpenedAt: input.lastOpenedAt || null, closedAt: null, migration: input.migration || { status: "Not required", migratedAt: null, copiedDomains: [], backupKey: null, errors: [] }, metadata: clone(input.metadata, {}) || {} };
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
    const previousVersion = Number(session?.contextVersion || 0);
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
  function deleteProject(projectId) { if (session?.projectId === projectId) throw new Error("Close the active project before deleting it."); const item = registry.projects.find((entry) => entry.projectId === projectId); if (!item) return false; item.status = "Deleted"; item.deletedAt = now(); item.updatedAt = item.deletedAt; persistRegistry(); return true; }
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

  function bootstrap() {
    try { const saved = JSON.parse(localStorage.getItem(REGISTRY_KEY) || "null"); if (saved?.schemaVersion === SCHEMA_VERSION && Array.isArray(saved.projects)) registry = saved; }
    catch (error) { lastError = error.message; }
    try { const savedSession = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); if (savedSession?.projectId && registry.projects.some((item) => item.projectId === savedSession.projectId && item.status !== "Deleted")) session = savedSession; }
    catch (error) { lastError = error.message; }
    if (!registry.projects.some((item) => item.status !== "Deleted")) {
      let legacy = null; try { legacy = JSON.parse(localStorage.getItem("deckforge-producer-studio") || "null"); } catch { /* migration reports malformed data later */ }
      const legacyId = validProjectId(legacy?.projectId) ? legacy.projectId : "deckforge-session";
      createProject({ name: legacy?.projectName || "DeckForge Session", description: legacy?.description || "", createdAt: legacy?.createdAt }, { projectId: legacyId, open: true, reason: "legacy-bootstrap" });
    } else if (!session) openProject(listProjects()[0].projectId, { reason: "session-recovery" });
    migrateLegacy(session.projectId);
    return { project: activeProject(), session: activeSession() };
  }

  bootstrap();
  global.DeckForgeProjectRegistry = Object.freeze({ SCHEMA_VERSION, REGISTRY_KEY, SESSION_KEY, STORAGE_PREFIX, LEGACY_DOMAINS, createProject, openProject, closeProject, renameProject, updateProject, deleteProject, getProject: project, listProjects, getActiveProject: activeProject, getSession: activeSession, owns, beginSwitch, storageKey, read, write, remove, migrateLegacy, diagnostics: () => ({ activeProjectId: session?.projectId || null, session: activeSession(), projectCount: listProjects().length, lastError, migrations: listProjects().map((item) => ({ projectId: item.projectId, migration: item.migration })) }) });
})(window);
