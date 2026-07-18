(function initializeProjectAssetRegistry(global) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const PREFIX = `deckforge-project-assets:v${SCHEMA_VERSION}`;
  const registry = global.DeckForgeProjectRegistry;
  const ASSET_TYPES = Object.freeze(["Audio Track", "Stem", "Stem Group", "Recording", "Export", "Pad Sample", "Pad Recording", "Beat Sample", "Beat Forge Render", "Harmony Lab Render", "Arrangement Render", "Waveform", "Artwork", "Project Document", "Cue Sheet", "Tracklist", "Project Package", "Temporary Processing File", "Provider Metadata Reference", "Arrangement Clip", "Deck State", "Reference"]);
  const FILTERS = Object.freeze(["All", "Missing", "Needs Relink", "Duplicate", "Unused", "Shared", "Project Owned", "Generated", "Temporary", "Audio", "Stems", "Recordings", "Exports", "Artwork", "Documents", "Trash"]);
  const SORTS = Object.freeze(["Name", "Type", "Date Added", "Last Used", "Size", "Duration", "Reference Count", "Status"]);
  const AUDIO_TYPES = new Set(["Audio Track", "Stem", "Recording", "Export", "Pad Sample", "Pad Recording", "Beat Sample", "Beat Forge Render", "Harmony Lab Render", "Arrangement Render"]);
  const DOCUMENT_TYPES = new Set(["Project Document", "Cue Sheet", "Tracklist", "Project Package"]);
  let lastError = null;
  let lastValidation = null;
  let lastRelink = null;
  let lastCleanup = null;

  function now() { return new Date().toISOString(); }
  function clone(value, fallback = null) { try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; } }
  function id(prefix = "asset") { return `${prefix}-${global.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`; }
  function key(projectId) { return `${PREFIX}:${projectId}`; }
  function activeId() { const projectId = registry?.getSession()?.projectId; if (!projectId) throw new Error("No active project owns this asset."); return projectId; }
  function safeText(value, fallback = "") { return String(value ?? fallback).trim().slice(0, 500); }
  function safeNumber(value) { if (value == null || value === "") return null; const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
  function privatePath(value) { return typeof value === "string" && (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)); }
  function persistedObjectUrl(value) { return typeof value === "string" && value.startsWith("blob:"); }
  function ensureActive(projectId) { if (!registry?.owns(projectId)) throw new Error("Asset ownership does not match the active project."); }

  function load(projectId = activeId()) {
    try {
      const saved = JSON.parse(localStorage.getItem(key(projectId)) || "null");
      if (!saved) return [];
      if (saved.schemaVersion !== SCHEMA_VERSION || saved.projectId !== projectId || !Array.isArray(saved.assets)) throw new Error("Asset registry metadata is incompatible or belongs to another project.");
      return saved.assets;
    } catch (error) { lastError = error.message || "Asset registry could not be read."; return []; }
  }

  function save(assets, projectId = activeId()) {
    try { localStorage.setItem(key(projectId), JSON.stringify({ schemaVersion: SCHEMA_VERSION, projectId, assets, updatedAt: now() })); return true; }
    catch (error) { lastError = error.message || "Asset registry could not be saved."; throw error; }
  }

  function sourceType(input = {}) {
    if (input.sourceType) return safeText(input.sourceType, "Unknown");
    if (input.providerReference) return "Provider Metadata";
    if (input.backendReference) return "Backend Output";
    if (input.persistentReference) return "Persistent Reference";
    if (input.localReference) return "Local File";
    if (input.generated) return "Generated";
    return input.assetType === "Provider Metadata Reference" || input.assetType === "Track Reference" ? "Metadata Only" : "Project";
  }

  function normalizeReference(reference, asset = {}) {
    if (typeof reference === "string") return { referenceId: id("reference"), domain: asset.owningDomain || "Unknown", itemId: reference, itemLabel: reference, usageType: "Legacy reference", active: true, historical: false, lastUsedAt: asset.updatedAt || null, destination: null };
    const input = reference && typeof reference === "object" ? reference : {};
    return {
      referenceId: safeText(input.referenceId || id("reference")), domain: safeText(input.domain || asset.owningDomain || "Unknown"), itemId: safeText(input.itemId || input.sourceId || input.id || "unknown"),
      itemLabel: safeText(input.itemLabel || input.label || input.name || input.itemId || "Project reference"), usageType: safeText(input.usageType || input.type || "Uses asset"),
      active: input.active !== false, historical: input.historical === true, lastUsedAt: input.lastUsedAt || null, destination: input.destination ? safeText(input.destination) : null
    };
  }

  function normalize(input = {}, projectId = activeId()) {
    if (input.projectId && input.projectId !== projectId) throw new Error("An asset cannot be reassigned to another project.");
    const timestamp = now(); const assetType = ASSET_TYPES.includes(input.assetType) ? input.assetType : ({ "Generated Stem": "Stem", "Master Recording": "Recording", "Local Audio Reference": "Audio Track", "Track Reference": "Provider Metadata Reference" })[input.assetType] || "Reference";
    const references = Array.isArray(input.references) ? input.references.map((reference) => normalizeReference(reference, input)) : [];
    const displayName = safeText(input.displayName || input.name || input.originalFilename || "Untitled asset", "Untitled asset").slice(0, 160);
    const shared = input.shared === true; const projectReferences = Array.isArray(input.projectReferences) ? [...new Set(input.projectReferences.filter(Boolean))] : [];
    if (shared && !projectReferences.includes(projectId)) projectReferences.unshift(projectId);
    return {
      schemaVersion: SCHEMA_VERSION, assetId: safeText(input.assetId || id()), projectId, sharedOwnerProjectId: input.sharedOwnerProjectId ? safeText(input.sharedOwnerProjectId) : null, assetType, owningDomain: safeText(input.owningDomain || "Unknown"), createdBy: safeText(input.createdBy || "user"),
      sourceType: sourceType(input), sourceId: input.sourceId == null ? null : safeText(input.sourceId), displayName, name: displayName, originalFilename: input.originalFilename ? safeText(input.originalFilename) : null,
      mimeType: input.mimeType ? safeText(input.mimeType) : null, sizeBytes: safeNumber(input.sizeBytes ?? input.metadata?.sizeBytes ?? input.metadata?.size), duration: safeNumber(input.duration), checksum: input.checksum ? safeText(input.checksum) : null,
      checksumKind: input.checksumKind ? safeText(input.checksumKind) : null, localReference: clone(input.localReference, null), persistentReference: clone(input.persistentReference, null), backendReference: clone(input.backendReference, null), providerReference: clone(input.providerReference, null),
      shared, sharedAssetId: shared ? safeText(input.sharedAssetId || input.assetId || "") || null : null, projectReferences, generated: input.generated === true, linked: input.linked === true, missing: input.missing === true,
      relinkRequired: input.relinkRequired === true, temporary: input.temporary === true, favorite: input.favorite === true, recoveryRequired: input.recoveryRequired === true, activeJobId: input.activeJobId ? safeText(input.activeJobId) : null,
      references, usageCount: references.filter((reference) => reference.active).length, referenceCount: references.length, createdAt: input.createdAt || timestamp, updatedAt: input.updatedAt || timestamp,
      lastUsedAt: input.lastUsedAt || references.map((reference) => reference.lastUsedAt).filter(Boolean).sort().at(-1) || null, validationStatus: safeText(input.validationStatus || "Not Validated"),
      duplicateStatus: safeText(input.duplicateStatus || "Not Checked"), trash: input.trash?.trashed === true ? { trashed: true, trashedAt: input.trash.trashedAt || timestamp, reason: safeText(input.trash.reason || "Moved to Project Trash"), undo: clone(input.trash.undo, null) } : { trashed: false, trashedAt: null, reason: null, undo: null },
      lineage: clone(input.lineage, []), metadataLink: clone(input.metadataLink, null), metadata: clone(input.metadata, {}) || {}
    };
  }

  function sharedForProject(projectId) {
    return registry.listProjects({ includeArchived: true }).flatMap((project) => project.projectId === projectId ? [] : load(project.projectId).filter((asset) => asset.shared === true && Array.isArray(asset.projectReferences) && asset.projectReferences.includes(projectId)).map((asset) => ({ ...asset, sharedOwnerProjectId: project.projectId })));
  }

  function list(projectId = activeId(), options = {}) {
    if (!registry.owns(projectId) && !options.allowInactive) return [];
    const owned = load(projectId); const shared = options.includeShared === false ? [] : sharedForProject(projectId);
    return [...owned, ...shared].filter((asset) => options.includeTrash ? true : !asset.trash?.trashed).map((asset) => normalize(asset, asset.projectId));
  }

  function get(assetId, projectId = activeId(), options = {}) { return list(projectId, { ...options, includeTrash: true }).find((asset) => asset.assetId === assetId) || null; }

  function register(input = {}) {
    const projectId = input.projectId || activeId(); ensureActive(projectId); const assets = load(projectId);
    const existing = input.assetId ? assets.findIndex((item) => item.assetId === input.assetId) : input.sourceId ? assets.findIndex((item) => item.sourceId === input.sourceId && item.owningDomain === input.owningDomain) : -1;
    const asset = normalize(existing >= 0 ? { ...assets[existing], ...input, references: input.references ?? assets[existing].references, updatedAt: now() } : input, projectId);
    if (assets.some((item, index) => index !== existing && item.assetId === asset.assetId)) throw new Error("Duplicate immutable asset ID rejected.");
    if (existing >= 0) { const comparable = { ...asset, updatedAt: assets[existing].updatedAt }; if (JSON.stringify(comparable) === JSON.stringify(assets[existing])) return clone(assets[existing]); }
    if (existing >= 0) assets[existing] = asset; else assets.push(asset); save(assets, projectId); notify(existing >= 0 ? "asset-updated" : "asset-registered", asset); return clone(asset);
  }

  function update(assetId, changes = {}, projectId = activeId()) {
    ensureActive(projectId); const assets = load(projectId); const index = assets.findIndex((item) => item.assetId === assetId); if (index < 0) throw new Error("Asset not found.");
    const asset = normalize({ ...assets[index], ...changes, assetId, projectId, updatedAt: now() }, projectId); assets[index] = asset; save(assets, projectId); notify("asset-updated", asset); return clone(asset);
  }

  function markMissing(assetId, missing = true, projectId = activeId(), reason = null) { return update(assetId, { missing, relinkRequired: missing, validationStatus: missing ? "Relink Required" : "Not Validated", metadata: { ...(get(assetId, projectId, { allowInactive: true })?.metadata || {}), missingReason: reason } }, projectId); }

  function usage(assetId, projectId = activeId()) { const asset = get(assetId, projectId); return asset ? { assetId, references: asset.references, active: asset.references.filter((item) => item.active), historical: asset.references.filter((item) => item.historical), domains: [...new Set(asset.references.map((item) => item.domain))] } : null; }

  function addReference(assetId, reference, projectId = activeId()) {
    const asset = get(assetId, projectId); if (!asset) throw new Error("Asset not found."); const next = normalizeReference(reference, asset); const references = [...asset.references.filter((item) => !(item.domain === next.domain && item.itemId === next.itemId && item.usageType === next.usageType)), next];
    return update(assetId, { references, lastUsedAt: next.lastUsedAt || now() }, projectId);
  }

  function removeReference(assetId, referenceId, projectId = activeId()) { const asset = get(assetId, projectId); if (!asset) return null; return update(assetId, { references: asset.references.filter((item) => item.referenceId !== referenceId) }, projectId); }

  function validateAsset(input, options = {}) {
    const asset = typeof input === "string" ? get(input, options.projectId || activeId(), { includeTrash: true }) : input; if (!asset) return { status: "Corrupted Metadata", errors: ["Asset record is missing."], warnings: [] };
    const errors = []; const warnings = [];
    if (!asset.assetId || !asset.projectId || !asset.owningDomain) errors.push("Required ownership metadata is incomplete.");
    if (options.projectId && asset.projectId !== options.projectId && !asset.shared) errors.push("Asset ownership conflicts with this project.");
    if (asset.missing) warnings.push("The source is missing."); if (asset.relinkRequired) warnings.push("A replacement source must be linked.");
    if ([asset.localReference, asset.persistentReference, asset.backendReference, asset.providerReference].some((value) => Object.values(value || {}).some(persistedObjectUrl))) errors.push("A temporary object URL was persisted as an asset reference.");
    if (asset.localReference && Object.values(asset.localReference).some(privatePath)) warnings.push("A private absolute path is present and will be excluded from exports.");
    if (asset.shared && !asset.projectReferences.includes(asset.projectId)) errors.push("Shared-state ownership is inconsistent.");
    if (asset.references.some((reference) => !reference.domain || !reference.itemId)) errors.push("One or more usage references are invalid.");
    if (asset.activeJobId) warnings.push(`Asset is currently being processed by ${asset.owningDomain}.`);
    let status = errors.length ? errors.some((message) => /ownership/i.test(message)) ? "Ownership Conflict" : errors.some((message) => /object URL|reference/i.test(message)) ? "Unsupported Reference" : "Corrupted Metadata" : asset.missing ? asset.relinkRequired ? "Relink Required" : "Missing" : warnings.length ? "Valid with Warnings" : "Valid";
    return { assetId: asset.assetId, projectId: asset.projectId, status, errors, warnings, checkedAt: now() };
  }

  function validateAll(projectId = activeId()) {
    ensureActive(projectId); const assets = load(projectId); const ids = new Set(); const duplicateIds = new Set(); assets.forEach((asset) => { if (ids.has(asset.assetId)) duplicateIds.add(asset.assetId); ids.add(asset.assetId); });
    const results = assets.map((asset) => { const result = validateAsset(asset, { projectId }); if (duplicateIds.has(asset.assetId)) { result.errors.push("Duplicate immutable asset ID detected."); result.status = "Corrupted Metadata"; } asset.validationStatus = result.status; asset.updatedAt = now(); return result; });
    save(assets, projectId); lastValidation = { projectId, checkedAt: now(), results }; notify("asset-validation-changed", { projectId, results }); return clone(lastValidation);
  }

  function duplicateSignal(a, b) {
    if (a.assetId === b.assetId) return null;
    if (a.checksum && b.checksum && a.checksum === b.checksum && a.checksumKind !== "file-metadata" && b.checksumKind !== "file-metadata") return { classification: "Exact Duplicate", confidence: 1, signals: ["Exact checksum"] };
    if (a.persistentReference?.key && a.persistentReference.key === b.persistentReference?.key) return { classification: "Exact Duplicate", confidence: 1, signals: ["Same persistent reference"] };
    if (a.backendReference?.outputId && a.backendReference.outputId === b.backendReference?.outputId) return { classification: "Exact Duplicate", confidence: 1, signals: ["Same backend output"] };
    if (a.shared && b.sharedAssetId && a.sharedAssetId === b.sharedAssetId) return { classification: "Shared Reference", confidence: 1, signals: ["Same shared asset"] };
    const sameFile = a.originalFilename && b.originalFilename && a.originalFilename.toLowerCase() === b.originalFilename.toLowerCase(); const sameSize = a.sizeBytes != null && b.sizeBytes != null && a.sizeBytes === b.sizeBytes;
    if (sameFile && sameSize) return { classification: "Probable Duplicate", confidence: .82, signals: ["Matching filename and size"] };
    const metaA = a.metadata || {}; const metaB = b.metadata || {}; const sameTitle = metaA.title && metaB.title && metaA.title.toLowerCase() === metaB.title.toLowerCase(); const sameArtist = metaA.artist && metaB.artist && metaA.artist.toLowerCase() === metaB.artist.toLowerCase(); const closeDuration = a.duration && b.duration && Math.abs(a.duration - b.duration) <= 1;
    if (sameTitle && sameArtist && closeDuration) return { classification: "Possible Metadata Duplicate", confidence: .65, signals: ["Matching title, artist, and duration"] };
    const parentsA = new Set((a.lineage || []).map((item) => item.assetId || item.sourceAssetId).filter(Boolean)); const commonParent = (b.lineage || []).some((item) => parentsA.has(item.assetId || item.sourceAssetId));
    if (commonParent) return { classification: "Different Version", confidence: .75, signals: ["Common generated lineage"] };
    return null;
  }

  function findDuplicates(projectId = activeId()) {
    const assets = list(projectId); const groups = [];
    for (let first = 0; first < assets.length; first += 1) for (let second = first + 1; second < assets.length; second += 1) { const signal = duplicateSignal(assets[first], assets[second]); if (signal) groups.push({ duplicateId: id("duplicate"), assetA: assets[first].assetId, assetB: assets[second].assetId, ...signal }); }
    return groups;
  }

  function usageStatus(asset) {
    if (asset.references.some((item) => item.active)) return "In Use";
    if (asset.references.some((item) => item.historical) || asset.recoveryRequired) return "Historical Only";
    if (asset.activeJobId) return "Unknown Usage";
    if (asset.favorite) return "Intentionally Retained";
    return "Unused";
  }

  function removalPlan(assetId, projectId = activeId()) {
    const asset = get(assetId, projectId, { includeTrash: true }); if (!asset) throw new Error("Asset not found."); const activeReferences = asset.references.filter((item) => item.active); const blockers = [];
    if (activeReferences.length) blockers.push(`${activeReferences.length} active project reference${activeReferences.length === 1 ? "" : "s"}`); if (asset.activeJobId) blockers.push(`active ${asset.owningDomain} processing job`); if (asset.recoveryRequired) blockers.push("project recovery requirement");
    if (asset.favorite) blockers.push("intentional project favorite"); if (asset.shared && asset.projectReferences.filter((id) => id !== asset.projectId).length) blockers.push("other project references to this shared asset");
    return { assetId, projectId, assetName: asset.displayName, assetType: asset.assetType, shared: asset.shared, referenceCount: asset.referenceCount, references: asset.references, sizeBytes: asset.sizeBytes, undoAvailable: !asset.trash.trashed, safeToRemove: blockers.length === 0, blockers, externalFileDeletionSupported: false };
  }

  function moveToTrash(assetId, options = {}, projectId = activeId()) { const plan = removalPlan(assetId, projectId); if (!plan.safeToRemove && options.force !== true) throw new Error(`Asset cannot be removed safely: ${plan.blockers.join(", ")}.`); const asset = get(assetId, projectId, { includeTrash: true }); const updated = update(assetId, { trash: { trashed: true, trashedAt: now(), reason: options.reason || "Moved to Project Trash", undo: { asset: clone(asset), createdAt: now() } } }, projectId); notify("asset-removed", updated); return updated; }
  function restoreFromTrash(assetId, projectId = activeId()) { const asset = get(assetId, projectId, { includeTrash: true }); if (!asset?.trash?.trashed) throw new Error("Asset is not in Project Trash."); return update(assetId, { trash: { trashed: false } }, projectId); }
  function permanentlyDelete(assetId, projectId = activeId()) { ensureActive(projectId); const plan = removalPlan(assetId, projectId); const asset = get(assetId, projectId, { includeTrash: true }); if (!asset?.trash?.trashed) throw new Error("Move the asset to Project Trash before permanent deletion."); if (!plan.safeToRemove) throw new Error(`Asset cannot be deleted: ${plan.blockers.join(", ")}.`); const assets = load(projectId); save(assets.filter((item) => item.assetId !== assetId), projectId); notify("asset-deleted", asset); return true; }
  function remove(assetId, projectId = activeId()) { return permanentlyDelete(assetId, projectId); }

  function relink(assetId, replacement = {}, projectId = activeId()) {
    const asset = get(assetId, projectId); if (!asset) throw new Error("Asset not found."); const warnings = [];
    if (replacement.mimeType && asset.mimeType && replacement.mimeType.split("/")[0] !== asset.mimeType.split("/")[0]) warnings.push("Replacement file type differs from the original.");
    if (replacement.duration && asset.duration && Math.abs(replacement.duration - asset.duration) / Math.max(.01, asset.duration) > .25) warnings.push("Replacement duration differs by more than 25%.");
    if (replacement.sizeBytes && asset.sizeBytes && Math.abs(replacement.sizeBytes - asset.sizeBytes) / Math.max(1, asset.sizeBytes) > .5) warnings.push("Replacement size differs substantially.");
    if (replacement.checksum && asset.checksum && replacement.checksum !== asset.checksum) warnings.push("Replacement checksum does not match.");
    const updated = update(assetId, { linked: true, missing: false, relinkRequired: false, validationStatus: warnings.length ? "Valid with Warnings" : "Valid", localReference: replacement.localReference || asset.localReference, persistentReference: replacement.persistentReference || asset.persistentReference, sourceId: replacement.sourceId || asset.sourceId, originalFilename: replacement.originalFilename || asset.originalFilename, mimeType: replacement.mimeType || asset.mimeType, sizeBytes: replacement.sizeBytes ?? asset.sizeBytes, duration: replacement.duration ?? asset.duration, checksum: replacement.checksum || asset.checksum, metadata: { ...asset.metadata, relink: { linkedAssetId: replacement.linkedAssetId || null, matchMethod: replacement.matchMethod || "Manual", matchConfidence: replacement.matchConfidence ?? null, userConfirmed: replacement.userConfirmed !== false, keepExistingTiming: replacement.keepExistingTiming !== false, linkedAt: now(), warnings } } }, projectId);
    lastRelink = { assetId, projectId, linkedAt: now(), warnings }; notify("asset-relinked", updated); return { asset: updated, warnings };
  }

  function linkMetadata(metadataAssetId, localAssetId, details = {}, projectId = activeId()) {
    const metadataAsset = get(metadataAssetId, projectId); const localAsset = get(localAssetId, projectId); if (!metadataAsset || !localAsset) throw new Error("Both metadata and local audio assets are required."); if (metadataAsset.assetType !== "Provider Metadata Reference") throw new Error("The selected source is not a metadata-only reference."); if (!AUDIO_TYPES.has(localAsset.assetType) || localAsset.missing) throw new Error("The selected local asset is not playable audio.");
    const link = { metadataReferenceId: metadataAsset.assetId, linkedAssetId: localAsset.assetId, matchMethod: details.matchMethod || "Manual", matchConfidence: details.matchConfidence ?? null, userConfirmed: details.userConfirmed !== false, linkedAt: now(), originalProvider: details.originalProvider || metadataAsset.providerReference?.provider || metadataAsset.metadata?.provider || null, title: details.title || metadataAsset.metadata?.title || null, artist: details.artist || metadataAsset.metadata?.artist || null, album: details.album || metadataAsset.metadata?.album || null, durationComparison: metadataAsset.duration && localAsset.duration ? { metadata: metadataAsset.duration, local: localAsset.duration, difference: Math.abs(metadataAsset.duration - localAsset.duration) } : null };
    const updated = update(metadataAssetId, { linked: true, missing: false, relinkRequired: false, metadataLink: link }, projectId); addReference(localAssetId, { domain: metadataAsset.owningDomain, itemId: metadataAsset.sourceId || metadataAsset.assetId, itemLabel: metadataAsset.displayName, usageType: "Linked local audio", active: true, lastUsedAt: now() }, projectId); notify("asset-relinked", updated); return updated;
  }

  function markShared(assetId, shared = true, projectId = activeId()) { const asset = get(assetId, projectId); if (!asset) throw new Error("Asset not found."); if (shared && asset.generated) throw new Error("Generated assets cannot be shared automatically."); const updated = update(assetId, { shared, sharedAssetId: shared ? asset.sharedAssetId || asset.assetId : null, projectReferences: shared ? [...new Set([projectId, ...(asset.projectReferences || [])])] : [projectId] }, projectId); notify("asset-shared-state-changed", updated); return updated; }
  function linkSharedToProject(assetId, targetProjectId, projectId = activeId()) { const asset = get(assetId, projectId); if (!asset?.shared) throw new Error("Promote the asset to Shared before adding another project reference."); if (!registry.getProject(targetProjectId)) throw new Error("Target project not found."); return update(assetId, { projectReferences: [...new Set([...asset.projectReferences, targetProjectId])] }, projectId); }

  function resolveDuplicate(retainedId, duplicateId, action = "Use Asset A Everywhere", projectId = activeId()) {
    const retained = get(retainedId, projectId); const duplicate = get(duplicateId, projectId); if (!retained || !duplicate) throw new Error("Both duplicate assets are required."); const signal = duplicateSignal(retained, duplicate); if (!signal) throw new Error("These assets do not have a supported duplicate signal.");
    if (action === "Keep Both" || action === "Mark as Different Versions") { update(retainedId, { metadata: { ...retained.metadata, duplicateDecision: { action, otherAssetId: duplicateId, decidedAt: now() } } }, projectId); update(duplicateId, { metadata: { ...duplicate.metadata, duplicateDecision: { action, otherAssetId: retainedId, decidedAt: now() } } }, projectId); return { retained, duplicate, action }; }
    const merged = [...retained.references]; duplicate.references.forEach((reference) => { if (!merged.some((item) => item.domain === reference.domain && item.itemId === reference.itemId && item.usageType === reference.usageType)) merged.push(reference); });
    const updated = update(retainedId, { references: merged, metadata: { ...retained.metadata, duplicateResolution: { action, removedAssetId: duplicateId, classification: signal.classification, undo: clone(duplicate), decidedAt: now() } } }, projectId);
    update(duplicateId, { references: [], metadata: { ...duplicate.metadata, replacedByAssetId: retainedId } }, projectId); moveToTrash(duplicateId, { reason: `Duplicate resolved using ${retained.displayName}` }, projectId); notify("duplicate-resolved", updated); return { retained: updated, removedAssetId: duplicateId, action, classification: signal.classification };
  }

  function cleanupTemporary(projectId = activeId()) { const candidates = list(projectId).filter((asset) => asset.temporary); const cleaned = []; const blocked = []; candidates.forEach((asset) => { const plan = removalPlan(asset.assetId, projectId); if (plan.safeToRemove) { moveToTrash(asset.assetId, { reason: "Safe temporary cleanup" }, projectId); cleaned.push(asset.assetId); } else blocked.push({ assetId: asset.assetId, blockers: plan.blockers }); }); lastCleanup = { projectId, cleanedAt: now(), cleaned, blocked, recoverableBytes: candidates.filter((asset) => cleaned.includes(asset.assetId)).reduce((sum, asset) => sum + (asset.sizeBytes || 0), 0) }; notify("temporary-cleanup-completed", lastCleanup); return clone(lastCleanup); }

  function storageSummary(projectId = activeId(), options = {}) {
    const assets = list(projectId, { allowInactive: options.allowInactive === true }); const unique = [...new Map(assets.map((asset) => [asset.sharedAssetId || asset.assetId, asset])).values()]; const sum = (items) => items.reduce((total, asset) => total + (asset.sizeBytes || 0), 0);
    const projectOwned = unique.filter((asset) => !asset.shared && asset.projectId === projectId); const shared = unique.filter((asset) => asset.shared); const categories = { recordings: sum(unique.filter((asset) => asset.assetType === "Recording")), stems: sum(unique.filter((asset) => ["Stem", "Stem Group"].includes(asset.assetType))), exports: sum(unique.filter((asset) => asset.assetType === "Export")), generatedAudio: sum(unique.filter((asset) => asset.generated && AUDIO_TYPES.has(asset.assetType))), artworkAndWaveforms: sum(unique.filter((asset) => ["Artwork", "Waveform"].includes(asset.assetType))), temporary: sum(unique.filter((asset) => asset.temporary)) };
    return { projectId, totalKnownBytes: sum(projectOwned) + sum(shared), projectOwnedBytes: sum(projectOwned), sharedBytes: sum(shared), unknownSizeCount: unique.filter((asset) => asset.sizeBytes == null).length, missingSizeUnknown: unique.some((asset) => asset.missing && asset.sizeBytes == null), categories };
  }

  function filterAsset(asset, filter, duplicates) {
    if (filter === "Missing") return asset.missing; if (filter === "Needs Relink") return asset.relinkRequired; if (filter === "Duplicate") return duplicates.has(asset.assetId); if (filter === "Unused") return usageStatus(asset) === "Unused"; if (filter === "Shared") return asset.shared; if (filter === "Project Owned") return !asset.shared; if (filter === "Generated") return asset.generated; if (filter === "Temporary") return asset.temporary; if (filter === "Audio") return AUDIO_TYPES.has(asset.assetType); if (filter === "Stems") return ["Stem", "Stem Group"].includes(asset.assetType); if (filter === "Recordings") return asset.assetType === "Recording"; if (filter === "Exports") return asset.assetType === "Export"; if (filter === "Artwork") return asset.assetType === "Artwork"; if (filter === "Documents") return DOCUMENT_TYPES.has(asset.assetType); if (filter === "Trash") return asset.trash?.trashed; return !asset.trash?.trashed;
  }

  function query(options = {}) {
    const projectId = options.projectId || activeId(); const search = safeText(options.search).toLowerCase(); const filter = FILTERS.includes(options.filter) ? options.filter : "All"; const sort = SORTS.includes(options.sort) ? options.sort : "Name"; const duplicateIds = new Set(findDuplicates(projectId).flatMap((item) => [item.assetA, item.assetB]));
    const assets = list(projectId, { includeTrash: filter === "Trash" }).filter((asset) => filterAsset(asset, filter, duplicateIds)).filter((asset) => !search || [asset.displayName, asset.originalFilename, asset.assetType, asset.owningDomain, asset.sourceType, asset.metadata?.artist, asset.metadata?.title, asset.providerReference?.provider, ...(asset.metadata?.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(search));
    const status = (asset) => asset.missing ? "Missing" : asset.relinkRequired ? "Needs Relink" : asset.validationStatus;
    const sorters = { Name: (a, b) => a.displayName.localeCompare(b.displayName), Type: (a, b) => a.assetType.localeCompare(b.assetType) || a.displayName.localeCompare(b.displayName), "Date Added": (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)), "Last Used": (a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")), Size: (a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1), Duration: (a, b) => (b.duration ?? -1) - (a.duration ?? -1), "Reference Count": (a, b) => b.referenceCount - a.referenceCount, Status: (a, b) => status(a).localeCompare(status(b)) };
    return assets.sort(sorters[sort]);
  }

  function exportManifest(projectId = activeId()) {
    const manifest = { product: "DeckForge Project Asset Manifest", schemaVersion: SCHEMA_VERSION, projectId, exportedAt: now(), storage: storageSummary(projectId), assets: list(projectId, { includeTrash: true }).map((asset) => ({ assetId: asset.assetId, displayName: asset.displayName, assetType: asset.assetType, owningDomain: asset.owningDomain, projectId: asset.projectId, shared: asset.shared, projectReferences: asset.shared ? asset.projectReferences : [asset.projectId], sourceType: asset.sourceType, sizeBytes: asset.sizeBytes, duration: asset.duration, checksum: asset.checksum, missing: asset.missing, relinkRequired: asset.relinkRequired, referenceCount: asset.referenceCount, references: asset.references.map((reference) => ({ domain: reference.domain, itemId: reference.itemId, itemLabel: reference.itemLabel, usageType: reference.usageType, active: reference.active, historical: reference.historical, lastUsedAt: reference.lastUsedAt })), lineage: asset.lineage, validationStatus: asset.validationStatus, generated: asset.generated, temporary: asset.temporary, trashed: asset.trash.trashed, location: { localReferenceAvailable: Boolean(asset.localReference), persistentReferenceAvailable: Boolean(asset.persistentReference), backendReferenceAvailable: Boolean(asset.backendReference), providerReferenceAvailable: Boolean(asset.providerReference) }, metadata: { title: asset.metadata?.title || null, artist: asset.metadata?.artist || null, album: asset.metadata?.album || null, tags: asset.metadata?.tags || [] } })) };
    return JSON.stringify(manifest, null, 2);
  }

  function diagnostics(projectId = registry.getSession()?.projectId) {
    if (!projectId) return { projectId: null, totalAssets: 0, lastError };
    const assets = list(projectId, { includeTrash: true }); const duplicates = findDuplicates(projectId); return { projectId, totalAssets: assets.length, projectOwnedAssets: assets.filter((asset) => !asset.shared).length, sharedAssets: assets.filter((asset) => asset.shared).length, missingAssets: assets.filter((asset) => asset.missing).length, duplicateCandidates: duplicates.length, unusedAssets: assets.filter((asset) => usageStatus(asset) === "Unused").length, temporaryAssets: assets.filter((asset) => asset.temporary).length, trashedAssets: assets.filter((asset) => asset.trash.trashed).length, invalidReferences: assets.filter((asset) => ["Unsupported Reference", "Corrupted Metadata"].includes(asset.validationStatus)).length, ownershipConflicts: assets.filter((asset) => asset.validationStatus === "Ownership Conflict").length, lastValidation, lastRelink, lastCleanup, lastAssetError: lastError };
  }

  function notify(type, detail) { try { global.dispatchEvent(new CustomEvent("deckforge:project-assets-changed", { detail: { type, detail: clone(detail), projectId: detail?.projectId || registry.getSession()?.projectId || null, at: now() } })); } catch { /* Events are optional in non-browser tests. */ } }

  global.DeckForgeProjectAssets = Object.freeze({ SCHEMA_VERSION, PREFIX, ASSET_TYPES, FILTERS, SORTS, register, update, list, get, markMissing, addReference, removeReference, usage, validateAsset, validateAll, findDuplicates, duplicateSignal, usageStatus, removalPlan, moveToTrash, restoreFromTrash, permanentlyDelete, remove, relink, linkMetadata, markShared, linkSharedToProject, resolveDuplicate, cleanupTemporary, storageSummary, query, exportManifest, diagnostics });
})(window);
