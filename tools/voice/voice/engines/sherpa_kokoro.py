"""(B) LIGHT FALLBACK — Kokoro-82M v1.1-zh, int8 ONNX via sherpa-onnx (CPU, Apache-2.0, ~210 MB).

~550 MB RSS, CPU only, deterministic (a re-roll cannot help, so build does not re-roll it).
Lower accuracy than Qwen3 (bake-off CER 0.072 vs 0.025 with the fp32 model) and a flatter
delivery, but it runs anywhere. Polyphone locks -> homophones (its zh frontend is lexicon + jieba).
KNOWN LIMIT: the int8 model returns NaN for 1-2 syllable chunks (a lone word / number, or a short
first phrase like "哇，"), often nondeterministically. Leading interjections are glued to the next
phrase; a clip that is all NaN is left out of the manifest (runtime speech fallback) and QC flags it
"empty". Voice words and numbers with qwen3.
Speaker ids: 3..57 zf_* (female), 58..102 zm_* (male) in kokoro-multi-lang-v1_1.
"""
from __future__ import annotations
import re

import numpy as np

from .base import Engine
from .. import config
from ..fx import ROBOT

DIR = config.MODELS / "kokoro-int8-multi-lang-v1_1"


class SherpaKokoro(Engine):
    name = "kokoro"
    license = "Apache-2.0 (Kokoro-82M v1.1-zh; sherpa-onnx int8 export)"
    sample_rate = 24000
    # sids picked by a 55-voice screen (scratch/kokoro_screen/screen.json): all candidates CER 0.034;
    # narrator = mid pitch (~220 Hz median F0); companion = bright (~300 Hz).
    # Kokoro's own speed MUST stay 1.0: at 0.85-0.9 the int8 model appends a "了"-like vowel after
    # commas and at the end (ASR round-trip, 2026-10-05); slower delivery is done by ffmpeg atempo.
    voices = {
        "narrator": {"synth": {"sid": 17, "speed": 1.0}, "post": {"tempo": 0.92}},
        "companion": {"synth": {"sid": 11, "speed": 1.0}, "post": {"pitch": 1.02, "fx": ROBOT}},
        "word": {"synth": {"sid": 17, "speed": 1.0}, "post": {"tempo": 0.9}},
        "dad": {"synth": {"sid": 60, "speed": 1.0}, "post": {}},
    }

    def render(self, item) -> str:
        # a sentence-final 。 often gets a trailing "了/呀" vowel from the int8 model; the subtitle keeps it
        t = super().render(item).rstrip("。，、")
        # sherpa-onnx synthesises punctuation-delimited chunks separately and the int8 model returns NaN
        # for a 1-2 syllable chunk ("哇，" "滴滴，"): glue a short leading interjection to what follows
        return re.sub(r"^([\u4e00-\u9fff]{1,2})[，、！]", r"\1", t) if len(t) > 4 else t

    def __init__(self):
        try:
            import importlib.metadata as md
            lib = md.version("sherpa-onnx")
        except Exception:
            lib = "?"
        self.version = f"kokoro-int8-multi-lang-v1_1;sherpa-onnx={lib};adapter=2"
        self.tts = None

    def available(self):
        if not (DIR / "model.int8.onnx").exists():
            return False, f"model not downloaded: run `voice setup --engine kokoro` (-> {DIR})"
        return True, ""

    def load(self):
        import sherpa_onnx
        d = DIR
        cfg = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                    model=str(d / "model.int8.onnx"), voices=str(d / "voices.bin"), tokens=str(d / "tokens.txt"),
                    data_dir=str(d / "espeak-ng-data"), dict_dir=str(d / "dict"),
                    lexicon=f"{d}/lexicon-us-en.txt,{d}/lexicon-zh.txt"),
                num_threads=4, provider="cpu"),
            rule_fsts=f"{d}/date-zh.fst,{d}/phone-zh.fst,{d}/number-zh.fst", max_num_sentences=1)
        self.tts = sherpa_onnx.OfflineTts(cfg)
        self.sample_rate = self.tts.sample_rate

    def synth(self, text, role, seed):
        s = self.preset(role)["synth"]
        a = self.tts.generate(text, sid=int(s["sid"]), speed=float(s.get("speed", 1.0)))
        x = np.asarray(a.samples, dtype=np.float32)
        bad = ~np.isfinite(x)
        if bad.any() and not bad.all():   # a NaN chunk inside a longer line: keep the rest, QC flags the gap
            x = np.where(bad, 0.0, x).astype(np.float32)
        return x, a.sample_rate
