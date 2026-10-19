#!/usr/bin/env python3
"""Plato's ears: Qwen3-ASR 1.7B (8-bit, MLX) on this Mac, loaded once and kept running. LUNA_ASR_MODEL is the folder of its
weights (default ./models/qwen3-asr-1.7b-8bit). Development only (server /dev/stt).

JSON lines in: {"id", "path"} (a 16 kHz mono WAV). JSON lines out: {"id", "text"} or {"id", "error"}.
Started by backend/session/stt.mjs.
"""
import json
import os
import sys

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.stt.utils import load

MODEL_PATH = os.environ.get("LUNA_ASR_MODEL", "./models/qwen3-asr-1.7b-8bit")
PROMPT = ("Transcribe English exactly as spoken. The speaker is a CS 3410 student talking about computer systems: binary, "
          "hex like 0x40B80000, two's complement, floats and minifloats, C pointers, malloc and free, logic gates, latches "
          "and flip-flops, RISC-V instructions such as lb, lbu, sw, addi, beq, jal and registers like a0, t0, s1, sp.")
model = load(MODEL_PATH)
model.generate(mx.zeros(16000), max_tokens=4, system_prompt=PROMPT)  # warm: the first real line is fast


def hear(path):
    audio, rate = sf.read(path, dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if rate != 16000:  # the page sends 16 kHz; anything else is resampled simply
        length = int(len(audio) * 16000 / rate)
        audio = np.interp(np.linspace(0, len(audio), length, endpoint=False), np.arange(len(audio)), audio).astype(np.float32)
    rms = float(np.sqrt(np.mean(np.square(audio)))) if len(audio) else 0.0
    if len(audio) < 4800 or float(np.abs(audio).max()) < 0.01 or rms < 0.002:  # under 0.3 s, or (near) silence
        return ""
    text = model.generate(mx.array(audio), max_tokens=256, system_prompt=PROMPT).text.strip()
    # On near-silence the model can recite its own instructions (13 Oct: "Transcribe English exactly as spoken…" arrived as a
    # message): that is nothing heard.
    lower = text.lower()
    if "transcribe english" in lower or "the speaker is a cs 3410 student" in lower or "exactly as spoken" in lower:
        return ""
    return text


for line in sys.stdin:
    try:
        message = json.loads(line)
    except ValueError:
        continue
    try:
        print(json.dumps({"id": message.get("id"), "text": hear(message["path"])}), flush=True)
    except Exception as error:  # one bad recording never stops the ears
        print(json.dumps({"id": message.get("id"), "error": str(error)[:300]}), flush=True)
