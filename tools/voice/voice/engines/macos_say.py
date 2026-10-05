"""macOS `say` (Tingting, zh_CN). Zero download, zero model memory, very accurate (bake-off CER 0.02)
but robotic prosody — a last-resort / preview engine. Not redistributable as a product voice
without checking Apple's licence terms; fine for local previews."""
from __future__ import annotations
import subprocess, tempfile, os
import numpy as np
import soundfile as sf

from .base import Engine
from .. import config
from ..fx import ROBOT


class MacOSSay(Engine):
    name = "say"
    needs_guard = False
    license = "macOS system voice (preview use)"
    sample_rate = 24000
    voices = {
        "narrator": {"synth": {"voice": "Tingting", "rate": 170}, "post": {}},
        "companion": {"synth": {"voice": "Tingting", "rate": 185}, "post": {"pitch": 1.05, "fx": ROBOT}},
        "word": {"synth": {"voice": "Tingting", "rate": 150}, "post": {}},
        "dad": {"synth": {"voice": "Tingting", "rate": 170}, "post": {"pitch": 0.85}},
    }

    def __init__(self):
        self.version = "macos-say;" + subprocess.run(["sw_vers", "-productVersion"], capture_output=True, text=True).stdout.strip()

    def available(self):
        out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
        return ("Tingting" in out), ("" if "Tingting" in out else "voice Tingting not installed")

    def synth(self, text, role, seed):
        s = self.preset(role)["synth"]
        fd, path = tempfile.mkstemp(suffix=".wav", dir=str(config.CACHE))
        os.close(fd)
        try:
            subprocess.run(["say", "-v", s["voice"], "-r", str(s["rate"]), "-o", path, "--file-format=WAVE",
                            f"--data-format=LEF32@{self.sample_rate}", text], check=True)
            a, sr = sf.read(path, dtype="float32")
        finally:
            os.unlink(path)
        return a.reshape(-1), sr
