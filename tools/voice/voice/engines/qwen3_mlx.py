"""(A) DEFAULT — Qwen3-TTS 12Hz 0.6B CustomVoice, 8-bit MLX (mlx-community, Apache-2.0, ~2 GB).

Memory discipline (the 2026-10-05 crash was a python3.11 at 12 GB):
  * mx.set_memory_limit(2.5 GB) + mx.set_cache_limit(128 MB), mx.clear_cache() after every line;
  * STREAMING decode (stream=True, 1 s chunks). mlx-audio's non-streaming path decodes the whole
    utterance in one vocoder pass: a 20 s line measured > 5 GB footprint (guard kill). Streaming
    keeps the same line at ~2.8 GB peak;
  * max_tokens bounded by text length (no runaway babble);
  * the worker handles <= 20 lines and exits; memrun.sh kills it above 4000 MB.
The 0.6B CustomVoice model has no phoneme input and no reliable instruct control -> polyphone
locks are rendered as homophones (pinyin.py), style comes from the speaker choice + ffmpeg post.
"""
from __future__ import annotations
import numpy as np

from .base import Engine
from .. import config
from ..fx import ROBOT, WARM

REPO = "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit"
REVISION = "049ef77fe8816b536193c0c25f9a214d17921282"
GEN = {"temperature": 0.9, "top_k": 50, "top_p": 1.0, "repetition_penalty": 1.05}


class Qwen3MLX(Engine):
    name = "qwen3"
    stochastic = True         # sampled decoding (seeded): bad takes are re-rolled by build --reroll
    license = "Apache-2.0 (Qwen3-TTS; mlx-community 8-bit conversion)"
    sample_rate = 24000
    voices = {
        # Serena: warm, gentle young female (Mandarin) -> story narrator, slowed slightly
        "narrator": {"synth": {"speaker": "serena"}, "post": {"tempo": 0.9}},
        # Vivian: bright young female -> robot companion: +3 % pitch, subtle digital tint
        "companion": {"synth": {"speaker": "vivian"}, "post": {"pitch": 1.03, "tempo": 0.97, "fx": ROBOT}},
        # tap-to-read words: clear and slower
        "word": {"synth": {"speaker": "serena"}, "post": {"tempo": 0.9}},
        # placeholder until dad's own recordings (content/narration/overrides/<id>.m4a) exist
        "dad": {"synth": {"speaker": "uncle_fu"}, "post": {}},
        # 鲁班 (gear-fort's rival craftsman, 2026-10-08 audition): Dylan = clear, confident young Beijing male; kept
        # in his Beijing-dialect codec (cleanest ASR of 4 male candidates; 普通话 is Beijing-based), lowered 4 % and
        # warmed so he sounds a mature, cheerful master — clearly not 墨子 (Uncle_Fu: older, low, mellow).
        "luban": {"synth": {"speaker": "dylan"}, "post": {"pitch": 0.96, "fx": WARM}},
    }

    def __init__(self):
        try:
            import importlib.metadata as md
            lib = md.version("mlx-audio") + "/mlx" + md.version("mlx")
        except Exception:
            lib = "?"
        self.version = f"{REPO}@{REVISION[:12]};mlx-audio={lib};stream=1.0;gen={GEN}"
        self.model = None
        self._peak = 0.0

    def available(self):
        snap = config.HF_HOME / "hub" / ("models--" + REPO.replace("/", "--")) / "snapshots" / REVISION
        if not (snap / "model.safetensors").exists():
            return False, f"model not downloaded: run `voice setup --engine qwen3` (-> {snap})"
        try:
            import mlx_audio  # noqa: F401
        except Exception as e:
            return False, f"mlx-audio missing: {e}"
        return True, ""

    def load(self):
        import mlx.core as mx
        mx.set_memory_limit(int(config.MLX_MEMORY_LIMIT_GB * 1024 ** 3))
        mx.set_cache_limit(config.MLX_CACHE_LIMIT_MB * 1024 ** 2)
        from mlx_audio.tts.utils import load_model
        self.mx = mx
        self.model = load_model(REPO)
        self.sample_rate = self.model.sample_rate

    def synth(self, text, role, seed):
        mx = self.mx
        syn = self.preset(role)["synth"]
        spk = syn["speaker"]
        n = sum(1 for c in text if not c.isspace())
        mx.random.seed(int(seed))
        # Dylan (Beijing) / Eric (Sichuan) are dialect speakers: mlx-audio switches language="chinese" to their
        # dialect codec id. "dialect": False keeps the speaker's timbre but asks for standard Mandarin (普通话).
        tc = self.model.config.talker_config
        orig = tc.spk_is_dialect
        if syn.get("dialect") is False and (orig or {}).get(spk):
            tc.spk_is_dialect = {**orig, spk: False}
        try:
            res = self.model.generate_custom_voice(
                text=text, speaker=spk, language="chinese", max_tokens=min(4096, 25 + 8 * n),
                stream=True, streaming_interval=1.0, **GEN)
            parts = [np.array(r.audio, dtype=np.float32).reshape(-1) for r in res]
        finally:
            tc.spk_is_dialect = orig
        audio = np.concatenate(parts) if parts else np.zeros(0, np.float32)
        self._peak = max(self._peak, mx.get_peak_memory() / 1e9)
        return audio, self.sample_rate

    def after_item(self):
        self.mx.clear_cache()

    def stats(self):
        return {"mlx_peak_gb": round(self._peak, 2)}
