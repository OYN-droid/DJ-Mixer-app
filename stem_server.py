#!/usr/bin/env python3
"""Local DeckForge server with bounded, cancellable Demucs stem jobs."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.request
import uuid
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
STEMS_ROOT = ROOT / "generated_stems"
MAX_UPLOAD_BYTES = int(os.environ.get("DECKFORGE_STEM_MAX_BYTES", 500 * 1024 * 1024))
MAX_CONCURRENT_JOBS = max(1, int(os.environ.get("DECKFORGE_STEM_CONCURRENCY", "1")))
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ANTHROPIC_MODEL = os.environ.get("DECKFORGE_RECOMMEND_MODEL", "claude-sonnet-5")
SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".aif", ".aiff", ".flac", ".m4a", ".ogg", ".opus"}
DEMUCS_SEGMENT = os.environ.get("DECKFORGE_STEM_SEGMENT", "7")
MODELS = {
    "two": {"model": "htdemucs", "args": ["--two-stems", "vocals", "--segment", DEMUCS_SEGMENT], "label": "Vocals + Instrumental"},
    "four": {"model": "htdemucs", "args": ["--segment", DEMUCS_SEGMENT], "label": "Vocals, Drums, Bass + Other"},
    "six": {"model": os.environ.get("DECKFORGE_STEM_MODEL", "htdemucs_6s"), "args": ["--segment", DEMUCS_SEGMENT], "label": "Vocals, Drums, Bass, Guitar, Piano + Other"},
}

JOBS = {}
JOB_LOCK = threading.Lock()
JOB_SLOTS = threading.Semaphore(MAX_CONCURRENT_JOBS)


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def public_job(job):
    return {key: value for key, value in job.items() if not key.startswith("_") and key != "temporaryFiles"}


def update_job(job_id, **changes):
    with JOB_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return None
        job.update(changes)
        return job


class DeckForgeHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/stem-capabilities":
            available = demucs_command() is not None
            self.send_json(200, {
                "available": available,
                "modes": [
                    {"id": mode, "label": config["label"], "supported": available, "model": config["model"]}
                    for mode, config in MODELS.items()
                ],
                "quality": [{"id": "balanced", "label": "Balanced", "supported": available}],
                "maxUploadBytes": MAX_UPLOAD_BYTES,
                "concurrencyLimit": MAX_CONCURRENT_JOBS,
                "progressKind": "estimated-stages",
            })
            return
        if path == "/api/stem-jobs":
            with JOB_LOCK:
                jobs = [public_job(job) for job in JOBS.values()]
            self.send_json(200, {"jobs": jobs})
            return
        job_id = self.job_id_from_path(path)
        if job_id:
            with JOB_LOCK:
                job = JOBS.get(job_id)
                payload = public_job(job) if job else None
            self.send_json(200, payload) if payload else self.send_json(404, {"error": "Stem job not found."})
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/similar-tracks":
            self.handle_similar_tracks()
            return
        if path not in {"/api/stem-jobs", "/api/stems"}:
            self.send_error(404)
            return
        if demucs_command() is None:
            self.send_json(503, {"error": "Demucs is not installed. Install it in a Python 3.11/3.12 environment to enable AI separation."})
            return
        try:
            upload = self.read_multipart_upload()
        except ValueError as error:
            self.send_json(413 if "large" in str(error).lower() else 400, {"error": str(error)})
            return
        if not upload:
            self.send_json(400, {"error": "Missing audio upload."})
            return
        extension = Path(upload["filename"]).suffix.lower()
        if extension not in SUPPORTED_EXTENSIONS:
            self.send_json(415, {"error": f"Unsupported audio format: {extension or 'unknown'}."})
            return
        fields = upload["fields"]
        mode = fields.get("separationMode", "four")
        if mode not in MODELS:
            self.send_json(400, {"error": "Unsupported separation mode."})
            return
        job_id = uuid.uuid4().hex
        temp_dir = Path(tempfile.mkdtemp(prefix="deckforge-stems-"))
        input_path = temp_dir / safe_name(upload["filename"])
        input_path.write_bytes(upload["content"])
        job = {
            "jobId": job_id,
            "projectId": fields.get("projectId") or "local-project",
            "contextVersion": int(fields.get("contextVersion") or 0),
            "creationTimestamp": fields.get("creationTimestamp") or timestamp(),
            "sourceTrackId": fields.get("sourceTrackId") or None,
            "sourceName": Path(upload["filename"]).stem,
            "separationMode": mode,
            "model": MODELS[mode]["model"],
            "quality": "balanced",
            "status": "Queued",
            "progress": 0,
            "progressEstimated": True,
            "currentStage": "Waiting for a processing slot",
            "startedAt": None,
            "completedAt": None,
            "cancelledAt": None,
            "error": None,
            "outputs": [],
            "retryCount": 0,
            "_tempDir": str(temp_dir),
            "_inputPath": str(input_path),
            "_cancelRequested": False,
            "_process": None,
        }
        with JOB_LOCK:
            JOBS[job_id] = job
        threading.Thread(target=process_job, args=(job_id,), daemon=True).start()
        self.send_json(202, public_job(job))

    def handle_similar_tracks(self):
        if not ANTHROPIC_API_KEY:
            self.send_json(503, {"error": "ANTHROPIC_API_KEY is not configured on the server. Set it as an environment variable before starting stem_server.py."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 20000:
                raise ValueError("Request body missing or too large.")
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(body, dict):
                raise ValueError("Request body must be a JSON object.")
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": f"Invalid request body: {error}"})
            return

        track = {
            "title": str(body.get("title", ""))[:200],
            "artist": str(body.get("artist", ""))[:200],
            "bpm": body.get("bpm"),
            "key": str(body.get("key", ""))[:20],
            "genre": str(body.get("genre", ""))[:100],
            "energy": str(body.get("energy", ""))[:20],
            "mood": str(body.get("mood", ""))[:100],
        }
        if not track["title"] and not track["artist"]:
            self.send_json(400, {"error": "At least a title or artist is required."})
            return

        prompt = (
            "You are a DJ's music research assistant helping build a live set or mixtape. "
            "Given a track's analyzed attributes below, search the web and suggest 5 similar "
            "tracks or artists suited for a set transition or mixtape inclusion. For each, give "
            "a one-sentence reason grounded in tempo, energy, genre, or era compatibility. "
            "Do not include citation tags, footnote markers, or any markup other than plain text "
            "in your response. "
            "Respond with ONLY a JSON array, no other text, in this exact shape: "
            '[{"title": "...", "artist": "...", "reason": "..."}]\n\n'
            f"Track: {json.dumps(track)}"
        )

        payload = json.dumps({
            "model": ANTHROPIC_MODEL,
            "max_tokens": 4096,
            "tools": [{"type": "web_search_20250305", "name": "web_search"}],
            "messages": [{"role": "user", "content": prompt}],
        }).encode("utf-8")

        request = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception as error:
            self.send_json(502, {"error": f"Anthropic API request failed: {error}"})
            return

        try:
            text_blocks = [block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"]
            raw_text = "".join(text_blocks).strip()
            start = raw_text.index("[")
            end = raw_text.rindex("]") + 1
            suggestions = json.loads(raw_text[start:end])
            if not isinstance(suggestions, list):
                raise ValueError("Suggestion response is not a list.")
        except (AttributeError, TypeError, ValueError, json.JSONDecodeError):
            self.send_json(502, {"error": "Could not parse a suggestion list from the model response."})
            return

        cleaned = []
        for item in suggestions[:5]:
            if isinstance(item, dict) and item.get("title") and item.get("artist"):
                cleaned.append({
                    "title": str(item["title"])[:200],
                    "artist": str(item["artist"])[:200],
                    "reason": str(item.get("reason", ""))[:300],
                })
        self.send_json(200, {"track": track, "suggestions": cleaned})

    def do_DELETE(self):
        job_id = self.job_id_from_path(urlparse(self.path).path)
        if not job_id:
            self.send_error(404)
            return
        with JOB_LOCK:
            job = JOBS.get(job_id)
            if not job:
                self.send_json(404, {"error": "Stem job not found."})
                return
            if job["status"] == "Complete":
                output_dir = STEMS_ROOT / job_id
                shutil.rmtree(output_dir, ignore_errors=True)
                del JOBS[job_id]
                self.send_json(200, {"jobId": job_id, "status": "Removed"})
                return
            job["_cancelRequested"] = True
            process = job.get("_process")
        if process and process.poll() is None:
            process.terminate()
        update_job(job_id, status="Cancelled", progress=0, currentStage="Cancelled by user", cancelledAt=timestamp())
        self.send_json(200, public_job(JOBS[job_id]))

    def read_multipart_upload(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid upload size.") from error
        if length <= 0:
            return None
        if length > MAX_UPLOAD_BYTES + 1024 * 1024:
            raise ValueError(f"Upload is too large. Limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            raise ValueError("Stem uploads must use multipart form data.")
        body = self.rfile.read(length)
        raw = (f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n").encode("utf-8") + body
        message = BytesParser(policy=default).parsebytes(raw)
        if not message.is_multipart():
            return None
        result = {"fields": {}}
        for part in message.iter_parts():
            if part.get_content_disposition() != "form-data":
                continue
            name = part.get_param("name", header="content-disposition")
            filename = part.get_filename()
            content = part.get_payload(decode=True) or b""
            if name == "audio" and filename:
                if len(content) > MAX_UPLOAD_BYTES:
                    raise ValueError(f"Upload is too large. Limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
                result.update({"filename": filename, "content": content})
            elif name:
                result["fields"][name] = content.decode("utf-8", errors="replace")[:200]
        return result if result.get("filename") else None

    @staticmethod
    def job_id_from_path(path):
        prefix = "/api/stem-jobs/"
        return path[len(prefix):].split("/", 1)[0] if path.startswith(prefix) else None

    def send_json(self, status, payload):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def process_job(job_id):
    with JOB_SLOTS:
        with JOB_LOCK:
            job = JOBS.get(job_id)
            if not job:
                return
            cancelled_before_start = job.get("_cancelRequested")
            cancelled_temp_dir = Path(job["_tempDir"])
            if cancelled_before_start:
                input_path = None
                temp_dir = cancelled_temp_dir
                mode = None
            else:
                input_path = Path(job["_inputPath"])
                temp_dir = Path(job["_tempDir"])
                mode = job["separationMode"]
        if cancelled_before_start:
            shutil.rmtree(cancelled_temp_dir, ignore_errors=True)
            return
        config = MODELS[mode]
        output_root = temp_dir / "out"
        update_job(job_id, status="Preparing", progress=12, currentStage="Preparing model", startedAt=timestamp())
        # Keep Demucs in-process and serial; JOB_SLOTS separately limits concurrent processes.
        cmd = [demucs_command(), "--name", config["model"], "--out", str(output_root), "-j", "0", *config["args"], str(input_path)]
        try:
            update_job(job_id, status="Separating", progress=35, currentStage="Separating audio")
            process = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
            update_job(job_id, _process=process)
            _, stderr = process.communicate()
            with JOB_LOCK:
                cancelled = JOBS.get(job_id, {}).get("_cancelRequested", False)
            if cancelled:
                update_job(job_id, status="Cancelled", progress=0, currentStage="Cancelled by user", cancelledAt=timestamp())
                return
            if process.returncode:
                raise RuntimeError((stderr or "Demucs separation failed.")[-500:])
            update_job(job_id, status="Encoding", progress=78, currentStage="Encoding stems")
            source_dir = output_root / config["model"] / input_path.stem
            if not source_dir.exists():
                raise RuntimeError("Demucs did not produce a stem folder.")
            public_dir = STEMS_ROOT / job_id
            public_dir.mkdir(parents=True, exist_ok=True)
            outputs = []
            for wav_path in sorted(source_dir.glob("*.wav")):
                public_path = public_dir / safe_name(wav_path.name)
                shutil.copy2(wav_path, public_path)
                raw_id = wav_path.stem
                stem_id = "instrumental" if raw_id == "no_vocals" else raw_id
                outputs.append({
                    "id": stem_id,
                    "projectId": job["projectId"],
                    "jobId": job_id,
                    "contextVersion": job.get("contextVersion", 0),
                    "creationTimestamp": job.get("creationTimestamp"),
                    "name": stem_name(stem_id),
                    "fileName": public_path.name,
                    "url": f"/generated_stems/{job_id}/{public_path.name}",
                    "generated": True,
                    "sourceName": input_path.stem,
                })
            if not outputs:
                raise RuntimeError("No stem output files were produced.")
            update_job(job_id, status="Finalizing", progress=92, currentStage="Finalizing output metadata")
            update_job(job_id, status="Complete", progress=100, currentStage="Complete", completedAt=timestamp(), outputs=outputs, error=None)
        except Exception as error:
            update_job(job_id, status="Failed", currentStage="Processing failed", error=str(error) or "Stem separation failed.")
        finally:
            update_job(job_id, _process=None)
            shutil.rmtree(temp_dir, ignore_errors=True)


def safe_name(name):
    keep = [char for char in name if char.isalnum() or char in "._- "]
    return "".join(keep).strip() or "upload.wav"


def demucs_command():
    for candidate in (ROOT / ".venv-stems" / "bin" / "demucs", ROOT / ".venv" / "bin" / "demucs"):
        if candidate.exists():
            return str(candidate)
    return shutil.which("demucs")


def stem_name(stem_id):
    return {
        "vocals": "Vocals", "instrumental": "Instrumental", "drums": "Drums",
        "bass": "Bass", "guitar": "Guitar", "piano": "Piano", "other": "Other",
    }.get(stem_id, stem_id.replace("_", " ").title())


if __name__ == "__main__":
    os.chdir(ROOT)
    STEMS_ROOT.mkdir(exist_ok=True)
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), DeckForgeHandler)
    print(f"DeckForge server running at http://localhost:{port}/")
    print(f"Stem jobs: concurrency {MAX_CONCURRENT_JOBS}, upload limit {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
