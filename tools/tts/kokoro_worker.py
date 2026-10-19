#!/usr/bin/env python3
"""Plato's local voice: Kokoro-82M through mlx-audio on Apple silicon, loaded once and kept running.

JSON lines in: {"id", "text", "voice"}. JSON lines out: {"id", "path"} (a 24 kHz WAV, which the caller deletes) or {"id", "error"}.
Started by backend/session/tts.mjs. The first start downloads the weights (~330 MB) to the Hugging Face cache.
"""
import json
import os
import sys
import tempfile

import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

MODEL = os.environ.get("LUNA_TTS_MODEL", "prince-canuma/Kokoro-82M")
model = load_model(MODEL)


def say(text, voice):
    chunks, rate = [], 24000
    for result in model.generate(text=text, voice=voice or "af_heart", speed=1.05, lang_code="a"):
        chunks.append(np.asarray(result.audio, dtype=np.float32).reshape(-1))
        rate = result.sample_rate
    audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    fd, path = tempfile.mkstemp(suffix=".wav", prefix="plato-")
    os.close(fd)
    sf.write(path, audio, rate, subtype="PCM_16")
    return path


for line in sys.stdin:
    try:
        message = json.loads(line)
    except ValueError:
        continue
    try:
        print(json.dumps({"id": message.get("id"), "path": say(message.get("text", ""), message.get("voice"))}), flush=True)
    except Exception as error:  # one bad line never stops the voice
        print(json.dumps({"id": message.get("id"), "error": str(error)[:300]}), flush=True)
