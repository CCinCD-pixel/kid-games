"""Paths, limits and output format of the voice pipeline.

The CODE lives in the repo (tools/voice/). Everything heavy or machine-local lives under
VOICE_HOME (default ~/kid-games-work/voice — never /tmp, which is wiped on reboot, and never git):
the Python venv, model weights (hf/, models/), the synthesis cache, QC reports and logs.
"""
from __future__ import annotations
import os
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[1]          # <repo>/tools/voice (contains the `voice` package)
REPO = PIPELINE.parents[1]                              # <repo>
VOICE_HOME = Path(os.environ.get("VOICE_HOME", Path.home() / "kid-games-work" / "voice"))
CONTENT = Path(os.environ.get("VOICE_CONTENT", REPO / "content"))   # <content>/narration/<game>.yaml
MODELS = VOICE_HOME / "models"
HF_HOME = VOICE_HOME / "hf"
CACHE = VOICE_HOME / "cache"          # raw/ (engine wav), proc/ (post-processed wav), qc/ (ASR results), jobs/
REPORTS = VOICE_HOME / "reports"
LOGS = VOICE_HOME / "logs"
OUT = VOICE_HOME / "out"              # default output root: out/<engine>/public/audio/<game>/
MEMRUN = PIPELINE / "memrun.sh"     # writes its log to VOICE_HOME/logs/memrun.log
PYTHON = VOICE_HOME / ".venv" / "bin" / "python"

# Bump when the post-processing chain changes in a way that changes the bytes of every clip.
PIPELINE_VERSION = "3"

# --- resource rules (2026-10-05 crash) -------------------------------------------------------
BATCH_MAX = 20            # lines per model process, then the process exits
GUARD_LIMIT_MB = 4000     # memrun kills the model process tree above this RSS / phys_footprint
MIN_FREE_PCT = 30         # memrun waits until memory_pressure free% >= this before starting a model
MLX_MEMORY_LIMIT_GB = 2.5 # mx.set_memory_limit (soft); measured peak with streaming decode ~2.8 GB
MLX_CACHE_LIMIT_MB = 128  # mx.set_cache_limit; mx.clear_cache() after every line

# --- output format -----------------------------------------------------------------------------
LOUDNORM = {"I": -16.0, "TP": -1.5, "LRA": 11.0}
TP_ENCODE_MARGIN = 1.0    # loudnorm aims TP-1.0 dB on PCM so the AAC-decoded true peak stays <= -1.5 dBTP
SAMPLE_RATE = 44100
CODEC = {"encoder": "aac_at", "fallback": "aac", "bitrate": "40k", "channels": 1}
LEAD_MS = 50              # silence added before speech after trimming
TAIL_MS = 200             # silence added after speech after trimming

ROLES = ("narrator", "companion", "word", "dad", "luban")

# --- QC ----------------------------------------------------------------------------------------
ASR_DIR = MODELS / "paraformer-zh"          # sherpa-onnx paraformer-zh 2024-03-09 int8 (~227 MB)
CER_FLAG = 0.08
# speech-structure checks (measured on the processed clip by timing.speech_shape)
# pace of sentences: too slow = articulation rate (syllables / speech time minus the pauses that
# punctuation explains, <= 0.7 s per mark) under min_art -> babble, mumbling, stalls; too fast =
# overall chars/s (pauses included) over max_cps. Calibrated on 112 clean takes (3 engines, 2026-10-05).
PACE = {"narrator": {"min_art": 2.6, "max_cps": 4.6}, "companion": {"min_art": 2.8, "max_cps": 5.2},
        "dad": {"min_art": 2.6, "max_cps": 5.0}, "luban": {"min_art": 2.6, "max_cps": 5.2},
        "word": {"min_art": 1.0, "max_cps": 4.5}}
PAUSE_PER_BREAK = 0.7
SHORT_SYL = 6                 # lines with fewer syllables (and all words) use the duration rule instead of pace
SHORT_SEC_PER_SYL = (0.12, 0.5)  # short items: speech must last 0.12*n .. 0.5*n + SLACK seconds
SHORT_SEC_SLACK = 0.5
SHORT_MAX_PAUSE = 0.30        # a pause inside a word / number = a repeat or a stumble
LINE_MAX_PAUSE = 1.20         # a pause longer than this inside a sentence = hesitation / babble
REROLL = 3                    # default extra seeds tried for clips with hard QC flags (stochastic engines)


def env_for_models() -> dict:
    env = dict(os.environ)
    env.update({
        "HF_HOME": str(HF_HOME),
        "HF_HUB_OFFLINE": env.get("HF_HUB_OFFLINE", "1"),
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "TOKENIZERS_PARALLELISM": "false",
        "OMP_NUM_THREADS": "4",
        "PYTHONPATH": str(PIPELINE),
        "VOICE_HOME": str(VOICE_HOME),
        "PYTHONWARNINGS": "ignore",
    })
    return env
