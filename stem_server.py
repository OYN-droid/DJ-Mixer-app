#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys
import tempfile
from email.parser import BytesParser
from email.policy import default
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
STEMS_ROOT = ROOT / "generated_stems"
MODEL = os.environ.get("DECKFORGE_STEM_MODEL", "htdemucs_6s")


class DeckForgeHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/stems":
            self.send_error(404)
            return
        demucs_bin = demucs_command()
        if demucs_bin is None:
            self.send_json(
                503,
                {
                    "error": "Demucs is not installed. Install it into a Python 3.11/3.12 environment for true AI stem separation.",
                },
            )
            return

        upload = self.read_audio_upload()
        if upload is None:
            self.send_json(400, {"error": "Missing audio upload."})
            return

        STEMS_ROOT.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            tmp_path = Path(tmp)
            input_path = tmp_path / safe_name(upload["filename"])
            with input_path.open("wb") as handle:
                handle.write(upload["content"])

            output_root = tmp_path / "out"
            cmd = [
                demucs_bin,
                "--name",
                MODEL,
                "--out",
                str(output_root),
                str(input_path),
            ]
            try:
                subprocess.run(cmd, check=True, cwd=ROOT)
            except subprocess.CalledProcessError as exc:
                self.send_json(500, {"error": f"Stem separation failed: {exc}"})
                return

            source_dir = output_root / MODEL / input_path.stem
            if not source_dir.exists():
                self.send_json(500, {"error": "Demucs did not produce a stem folder."})
                return

            job_id = next(tempfile._get_candidate_names())
            public_dir = STEMS_ROOT / job_id
            public_dir.mkdir(parents=True, exist_ok=True)
            stems = []
            for wav_path in sorted(source_dir.glob("*.wav")):
                public_path = public_dir / wav_path.name
                shutil.copy2(wav_path, public_path)
                stem_id = wav_path.stem.replace("other", "guitarKeys")
                stems.append(
                    {
                        "id": stem_id,
                        "name": stem_name(stem_id),
                        "fileName": wav_path.name,
                        "url": f"/generated_stems/{job_id}/{wav_path.name}",
                    }
                )

            self.send_json(200, {"stems": stems})

    def read_audio_upload(self):
        length = int(self.headers.get("Content-Length", "0"))
        content_type = self.headers.get("Content-Type", "")
        body = self.rfile.read(length)
        raw = (
            f"Content-Type: {content_type}\r\n"
            "MIME-Version: 1.0\r\n\r\n"
        ).encode("utf-8") + body
        message = BytesParser(policy=default).parsebytes(raw)
        if not message.is_multipart():
            return None
        for part in message.iter_parts():
            disposition = part.get_content_disposition()
            name = part.get_param("name", header="content-disposition")
            filename = part.get_filename()
            if disposition == "form-data" and name == "audio" and filename:
                return {
                    "filename": filename,
                    "content": part.get_payload(decode=True),
                }
        return None

    def send_json(self, status, payload):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def safe_name(name):
    keep = [char for char in name if char.isalnum() or char in "._- "]
    return "".join(keep).strip() or "upload.wav"


def demucs_command():
    local = ROOT / ".venv-stems" / "bin" / "demucs"
    if local.exists():
        return str(local)
    app_venv = ROOT / ".venv" / "bin" / "demucs"
    if app_venv.exists():
        return str(app_venv)
    return shutil.which("demucs")


def stem_name(stem_id):
    names = {
        "vocals": "Vocals",
        "drums": "Drums",
        "bass": "Bass",
        "guitar": "Guitar",
        "piano": "Keys/Synth",
        "guitarKeys": "Guitar/Keys",
        "other": "Other",
    }
    return names.get(stem_id, stem_id.title())


if __name__ == "__main__":
    os.chdir(ROOT)
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("", port), DeckForgeHandler)
    print(f"DeckForge server running at http://localhost:{port}/")
    print("Install Demucs for true AI stems: python3 -m pip install demucs")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
