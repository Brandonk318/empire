#!/usr/bin/env python3
"""Tiny local Kokoro TTS server for Growlord (optional).

Speaks the OpenAI-style route Growlord calls:
  GET  /health                 -> 200 "ok"
  POST /v1/audio/speech        {"input": "...", "voice": "am_michael"} -> audio/wav

Install:  pip install -r tts/requirements.txt   (pulls PyTorch; a few GB)
Run:      python tts/kokoro_server.py           (listens on 127.0.0.1:8880 only)
"""
import io
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import soundfile as sf
from kokoro import KPipeline

HOST = "127.0.0.1"  # localhost only
PORT = int(os.environ.get("KOKORO_PORT", "8880"))
DEFAULT_VOICE = os.environ.get("KOKORO_VOICE", "am_michael")
SAMPLE_RATE = 24000

print("Loading Kokoro (first run downloads the model)...", flush=True)
PIPELINE = KPipeline(lang_code="a")  # American English


def synth(text: str, voice: str) -> bytes:
    chunks = []
    for _, _, audio in PIPELINE(text, voice=voice, speed=1.0):
        if audio is not None:
            chunks.append(np.asarray(audio, dtype=np.float32))
    pcm = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, pcm, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="text/plain"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, b"ok")
        self._send(404, b"not found")

    def do_POST(self):
        if self.path != "/v1/audio/speech":
            return self._send(404, b"not found")
        try:
            length = min(int(self.headers.get("Content-Length", 0)), 100_000)
            req = json.loads(self.rfile.read(length) or b"{}")
            text = str(req.get("input", ""))[:2000].strip()
            if not text:
                return self._send(400, b"no input")
            wav = synth(text, req.get("voice") or DEFAULT_VOICE)
            self._send(200, wav, "audio/wav")
        except Exception as e:  # keep the server alive; Growlord falls back to the browser voice
            self._send(500, str(e).encode())

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Kokoro TTS on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
