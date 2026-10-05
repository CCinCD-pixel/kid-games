"""Engine adapter interface.

An engine turns (text, role, seed) into a mono float32 waveform. Everything else — caching,
silence trim, loudness, AAC, timings, QC, manifest — is engine-independent, so swapping engines
never changes game code (the runtime only reads audio-manifest.json).

Two halves of a voice preset per role:
  synth : parameters the engine itself uses (speaker / sid / speed ...) -> part of the RAW cache key
  post  : ffmpeg-side shaping {tempo, pitch, fx}                         -> part of the FINAL key only
so re-tuning the robot effect or the tempo never re-runs the model.
"""
from __future__ import annotations
import numpy as np

from .. import pinyin


class Engine:
    name = "base"
    version = "0"             # anything that changes the waveform: model revision, library version, decode mode
    pinyin_style = "homophone"
    needs_guard = True        # run in a separate process under memrun.sh
    stochastic = False        # True: a different seed gives a different take -> QC failures are re-rolled
    sample_rate = 24000
    license = ""
    voices: dict = {}         # role -> {"synth": {...}, "post": {...}}

    # ---- orchestrator side (no model loaded) -------------------------------------------------
    def available(self) -> tuple[bool, str]:
        return True, ""

    def preset(self, role: str) -> dict:
        v = self.voices.get(role) or self.voices.get("narrator")
        return {"synth": dict(v.get("synth", {})), "post": dict(v.get("post", {}))}

    def render(self, item) -> str:
        """Engine input text: pinyin locks rendered in this engine's style."""
        return pinyin.render(item.spoken, item.overrides, self.pinyin_style, getattr(item, "forced", frozenset()))

    # ---- worker side ---------------------------------------------------------------------------
    def load(self) -> None:
        pass

    def synth(self, text: str, role: str, seed: int) -> tuple[np.ndarray, int]:
        raise NotImplementedError

    def after_item(self) -> None:
        pass

    def stats(self) -> dict:
        return {}
