(function initializeRecordingService(global) {
  const STORAGE_PREFIX = "deckforge-recordings";
  const SCHEMA_VERSION = 1;
  const VALID_STATUSES = new Set(["Ready", "Recording", "Paused", "Finalizing", "Complete", "Cancelled", "Failed", "Missing", "Deleted"]);
  const records = new Map();
  const runtime = new Map();
  let projectId = "local-project";
  let activeId = null;
  let onEvent = () => {};
  let addToArrangement = null;

  function id(prefix = "recording") { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function now() { return new Date().toISOString(); }
  function clone(value, fallback = null) { try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; } }
  function key() { return `${STORAGE_PREFIX}:${projectId}`; }
  function extensionForMime(mime = "") { if (/ogg/i.test(mime)) return "ogg"; if (/mp4|m4a|aac/i.test(mime)) return "m4a"; if (/mpeg|mp3/i.test(mime)) return "mp3"; if (/wav/i.test(mime)) return "wav"; return "webm"; }
  function safeName(value = "recording") { return String(value).trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 100) || "recording"; }
  function publicRecord(record) { return clone(record, {}); }

  function supportedFormats() {
    if (typeof global.MediaRecorder !== "function") return [];
    const candidates = [
      { mimeType: "audio/webm;codecs=opus", format: "WebM", codec: "Opus", extension: "webm" },
      { mimeType: "audio/ogg;codecs=opus", format: "Ogg", codec: "Opus", extension: "ogg" },
      { mimeType: "audio/mp4;codecs=mp4a.40.2", format: "M4A", codec: "AAC", extension: "m4a" },
      { mimeType: "audio/webm", format: "WebM", codec: "Browser default", extension: "webm" }
    ];
    return candidates.filter((item, index) => (!global.MediaRecorder.isTypeSupported || global.MediaRecorder.isTypeSupported(item.mimeType)) && candidates.findIndex((candidate) => candidate.mimeType === item.mimeType) === index);
  }

  function persist() {
    try { global.localStorage?.setItem(key(), JSON.stringify({ schemaVersion: SCHEMA_VERSION, projectId, records: [...records.values()].filter((record) => record.status !== "Deleted").map((record) => ({ ...record, audioReference: record.status === "Complete" ? { kind: "runtime-blob", available: false } : record.audioReference })) })); return true; }
    catch (error) { onEvent({ type: "persistence-failed", error: error.message || "Recording history could not be saved." }); return false; }
  }

  function restore() {
    records.clear();
    try {
      const saved = JSON.parse(global.localStorage?.getItem(key()) || "null");
      (saved?.schemaVersion === SCHEMA_VERSION ? saved.records : []).forEach((item) => { const record = { ...item }; if (record.status === "Complete") { record.status = "Missing"; record.audioReference = { kind: "relink-required", available: false }; record.error = "The browser recording Blob is unavailable after reload. Record again or relink an exported file."; } records.set(record.recordingId, record); });
    } catch { /* Empty history is safer than corrupt state. */ }
    return listRecordings(projectId, { includeCancelled: true, includeMissing: true });
  }

  function configure(options = {}) { projectId = options.projectId || projectId; onEvent = typeof options.onEvent === "function" ? options.onEvent : onEvent; addToArrangement = typeof options.addToArrangement === "function" ? options.addToArrangement : addToArrangement; return restore(); }

  async function startRecording(options = {}) {
    if (activeId) throw new Error("Another audio recording is already active.");
    if (typeof global.MediaRecorder !== "function") throw new Error("MediaRecorder is unavailable in this browser.");
    const stream = options.stream;
    if (!stream?.getAudioTracks?.().length) throw new Error("The selected recording destination has no audio track.");
    const formats = supportedFormats(); if (!formats.length) throw new Error("This browser exposes no supported audio recording MIME type.");
    const chosen = formats.find((item) => item.mimeType === options.mimeType) || formats[0];
    const recordingId = id(); const startedAt = now();
    const record = { recordingId, projectId, name: safeName(options.name || `${options.sourceType || "Master"} Recording`), sourceType: options.sourceType || "Master", sourceIds: clone(options.sourceIds, []), recordingMode: options.recordingMode || "Master Output", status: "Ready", startedAt, stoppedAt: null, duration: 0, format: chosen.format, mimeType: chosen.mimeType, sampleRate: Number(options.sampleRate || options.audioContext?.sampleRate || 0) || null, channelCount: Number(options.channelCount || stream.getAudioTracks()[0]?.getSettings?.().channelCount || 2), bitDepth: null, sizeBytes: 0, audioReference: null, waveformReference: null, markers: clone(options.markers, []), tracklistReference: clone(options.tracklistReference, null), metadata: clone(options.metadata, {}), error: null, createdAt: startedAt, updatedAt: startedAt };
    let recorder;
    try { recorder = new global.MediaRecorder(stream, { mimeType: chosen.mimeType, ...(options.audioBitsPerSecond ? { audioBitsPerSecond: options.audioBitsPerSecond } : {}) }); }
    catch { recorder = new global.MediaRecorder(stream); record.mimeType = recorder.mimeType || chosen.mimeType; record.format = /ogg/i.test(record.mimeType) ? "Ogg" : /mp4|m4a/i.test(record.mimeType) ? "M4A" : "WebM"; }
    const state = { recorder, chunks: [], bytes: 0, startedMs: Date.now(), pausedMs: 0, pauseStartedMs: null, cancelRequested: false, resolver: null, rejecter: null, url: null, blob: null };
    runtime.set(recordingId, state); records.set(recordingId, record); activeId = recordingId;
    recorder.ondataavailable = (event) => { if (event.data?.size) { state.chunks.push(event.data); state.bytes += event.data.size; onEvent({ type: "recording-data", recordingId, bytes: state.bytes, chunkCount: state.chunks.length }); } };
    recorder.onerror = (event) => { record.status = "Failed"; record.error = event.error?.message || "MediaRecorder failed."; record.updatedAt = now(); activeId = null; persist(); onEvent({ type: "recording-failed", recording: publicRecord(record) }); state.rejecter?.(new Error(record.error)); };
    recorder.onstop = () => {
      record.stoppedAt = now(); record.duration = Math.max(0, (Date.now() - state.startedMs - state.pausedMs) / 1000); record.updatedAt = now(); activeId = null;
      if (state.cancelRequested) { record.status = "Cancelled"; state.chunks = []; record.sizeBytes = 0; persist(); onEvent({ type: "recording-cancelled", recording: publicRecord(record) }); state.resolver?.(publicRecord(record)); return; }
      const blob = new Blob(state.chunks, { type: recorder.mimeType || record.mimeType }); record.mimeType = blob.type || record.mimeType; record.format = /ogg/i.test(record.mimeType) ? "Ogg" : /mp4|m4a/i.test(record.mimeType) ? "M4A" : /mpeg/i.test(record.mimeType) ? "MP3" : "WebM"; record.sizeBytes = blob.size;
      if (!blob.size || record.duration <= 0) { record.status = "Failed"; record.error = !blob.size ? "The recorder produced a zero-byte output." : "The recorder produced no measurable duration."; state.blob = null; }
      else { state.blob = blob; state.url = URL.createObjectURL(blob); record.status = "Complete"; record.audioReference = { kind: "runtime-blob", available: true }; record.error = null; }
      state.chunks = []; persist(); onEvent({ type: record.status === "Complete" ? "recording-complete" : "recording-failed", recording: publicRecord(record) }); state.resolver?.(publicRecord(record));
    };
    recorder.start(Number(options.timeslice || 1000)); record.status = "Recording"; record.updatedAt = now(); persist(); onEvent({ type: "recording-started", recording: publicRecord(record) }); return publicRecord(record);
  }

  function pauseRecording(recordingId = activeId) { const state = runtime.get(recordingId); const record = records.get(recordingId); if (!state || !record || state.recorder.state !== "recording") throw new Error("Recording is not active."); state.recorder.pause(); state.pauseStartedMs = Date.now(); record.status = "Paused"; record.updatedAt = now(); persist(); onEvent({ type: "recording-paused", recording: publicRecord(record) }); return publicRecord(record); }
  function resumeRecording(recordingId = activeId) { const state = runtime.get(recordingId); const record = records.get(recordingId); if (!state || !record || state.recorder.state !== "paused") throw new Error("Recording is not paused."); state.pausedMs += Date.now() - state.pauseStartedMs; state.pauseStartedMs = null; state.recorder.resume(); record.status = "Recording"; record.updatedAt = now(); persist(); onEvent({ type: "recording-resumed", recording: publicRecord(record) }); return publicRecord(record); }
  function stopRecording(recordingId = activeId) { const state = runtime.get(recordingId); const record = records.get(recordingId); if (!state || !record || !["recording", "paused"].includes(state.recorder.state)) return Promise.resolve(record ? publicRecord(record) : null); if (state.recorder.state === "paused" && state.pauseStartedMs) { state.pausedMs += Date.now() - state.pauseStartedMs; state.pauseStartedMs = null; } record.status = "Finalizing"; record.updatedAt = now(); onEvent({ type: "recording-finalizing", recording: publicRecord(record) }); return new Promise((resolve, reject) => { state.resolver = resolve; state.rejecter = reject; state.recorder.stop(); }); }
  function cancelRecording(recordingId = activeId) { const state = runtime.get(recordingId); if (!state) return Promise.resolve(null); state.cancelRequested = true; return stopRecording(recordingId); }
  function getRecording(recordingId) { const record = records.get(recordingId); return record ? publicRecord(record) : null; }
  function listRecordings(requestProjectId = projectId, options = {}) { return [...records.values()].filter((record) => record.projectId === requestProjectId && record.status !== "Deleted" && (options.includeCancelled || record.status !== "Cancelled") && (options.includeMissing !== false || record.status !== "Missing")).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(publicRecord); }
  function getRuntime(recordingId) { return runtime.get(recordingId) || null; }
  function previewRecording(recordingId) { const record = records.get(recordingId); const state = runtime.get(recordingId); if (record?.status !== "Complete" || !state?.url) throw new Error("This recording is not available for preview."); return { url: state.url, mimeType: record.mimeType, name: record.name }; }
  function renameRecording(recordingId, name) { const record = records.get(recordingId); if (!record) throw new Error("Recording not found."); record.name = safeName(name); record.updatedAt = now(); persist(); onEvent({ type: "recording-renamed", recording: publicRecord(record) }); return publicRecord(record); }
  function updateRecording(recordingId, changes = {}) { const record = records.get(recordingId); if (!record) throw new Error("Recording not found."); if (changes.metadata) record.metadata = { ...record.metadata, ...clone(changes.metadata, {}) }; if (Array.isArray(changes.markers)) record.markers = clone(changes.markers, []); if (changes.tracklistReference) record.tracklistReference = clone(changes.tracklistReference, null); record.updatedAt = now(); persist(); onEvent({ type: "recording-updated", recording: publicRecord(record) }); return publicRecord(record); }
  function deleteRecording(recordingId) { const record = records.get(recordingId); const state = runtime.get(recordingId); if (!record) return false; if (recordingId === activeId) throw new Error("Stop or cancel the active recording before deleting it."); if (state?.url) URL.revokeObjectURL(state.url); runtime.delete(recordingId); record.status = "Deleted"; record.audioReference = null; record.waveformReference = null; record.updatedAt = now(); persist(); onEvent({ type: "recording-deleted", recordingId }); return true; }
  async function waveform(recordingId, audioContext, points = 96) { const record = records.get(recordingId); const state = runtime.get(recordingId); if (!record || !state?.blob || !audioContext) throw new Error("Recording audio is unavailable for waveform analysis."); if (record.waveformReference?.peaks?.length) return clone(record.waveformReference.peaks, []); const buffer = await audioContext.decodeAudioData(await state.blob.arrayBuffer()); const data = buffer.getChannelData(0); const block = Math.max(1, Math.floor(data.length / points)); const peaks = Array.from({ length: points }, (_, index) => { let peak = 0; for (let sample = index * block; sample < Math.min(data.length, (index + 1) * block); sample += Math.max(1, Math.floor(block / 64))) peak = Math.max(peak, Math.abs(data[sample] || 0)); return peak; }); record.waveformReference = { kind: "real-peaks", peaks }; record.duration = buffer.duration; record.sampleRate = buffer.sampleRate; record.channelCount = buffer.numberOfChannels; persist(); return peaks;
  }
  function exportRecording(recordingId, options = {}) { const record = records.get(recordingId); const state = runtime.get(recordingId); if (record?.status !== "Complete" || !state?.blob || !state.url) throw new Error("Recording output is unavailable."); const extension = extensionForMime(record.mimeType); const filename = `${safeName(options.filename || record.name)}.${extension}`; if (options.download !== false) { const anchor = document.createElement("a"); anchor.href = state.url; anchor.download = filename; anchor.click(); } onEvent({ type: "recording-exported", recording: publicRecord(record), filename }); return { filename, mimeType: record.mimeType, sizeBytes: state.blob.size, url: state.url, blob: state.blob };
  }
  async function addRecordingToArrangement(recordingId) { const record = records.get(recordingId); const state = runtime.get(recordingId); if (!record || record.status !== "Complete" || !state?.blob || typeof addToArrangement !== "function") throw new Error("This recording cannot be added to Arrangement."); return addToArrangement(publicRecord(record), state.blob); }
  function diagnostics() { const active = activeId ? records.get(activeId) : null; const state = activeId ? runtime.get(activeId) : null; return { activeRecordingId: activeId, recordingSource: active?.sourceType || null, recorderType: state?.recorder?.constructor?.name || null, mimeType: active?.mimeType || null, chunkCount: state?.chunks?.length || 0, recordedBytes: state?.bytes || 0, recordingDuration: state ? Math.max(0, (Date.now() - state.startedMs - state.pausedMs) / 1000) : active?.duration || 0, activeObjectUrlCount: [...runtime.values()].filter((item) => item.url).length, lastError: [...records.values()].reverse().find((record) => record.error)?.error || null, supportedFormats: supportedFormats() }; }
  function cleanup() { runtime.forEach((state) => { if (state.url) URL.revokeObjectURL(state.url); }); runtime.clear(); activeId = null; }

  global.DeckForgeRecordingService = Object.freeze({ configure, supportedFormats, startRecording, pauseRecording, resumeRecording, stopRecording, cancelRecording, getRecording, listRecordings, getRuntime, previewRecording, renameRecording, updateRecording, deleteRecording, waveform, exportRecording, addRecordingToArrangement, diagnostics, cleanup, extensionForMime, safeName, VALID_STATUSES: [...VALID_STATUSES], SCHEMA_VERSION });
})(window);
