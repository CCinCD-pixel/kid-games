"""Cloud engine STUB — the seam for a paid voice later (Azure / Volcano / iFlytek / ElevenLabs ...).

Nothing here calls the network. To make it real:
  1. implement synth() with the provider SDK/REST call (read the key from an env var, never commit it);
  2. pick voices per role in `voices` (e.g. Azure zh-CN-XiaoxiaoNeural / -XiaoyiNeural);
  3. pinyin_style = "ssml" renders polyphone locks as <phoneme alphabet="sapi" ph="huan 2">还</phoneme>;
     wrap the text in <speak>/<voice> SSML in synth();
  4. set `version` to provider+voice+API version so cached clips regenerate when the voice changes.
`voice build --game X --engine cloud` then produces the same manifest/m4a layout as the local engines.
"""
from __future__ import annotations
import os

from .base import Engine


class CloudStub(Engine):
    name = "cloud"
    needs_guard = False
    pinyin_style = "ssml"
    version = "cloud-stub;provider=" + os.environ.get("VOICE_CLOUD_PROVIDER", "none")
    voices = {
        "narrator": {"synth": {"voice": "zh-CN-XiaoxiaoNeural", "style": "story"}, "post": {}},
        "companion": {"synth": {"voice": "zh-CN-XiaoyiNeural", "style": "cheerful"}, "post": {}},
        "word": {"synth": {"voice": "zh-CN-XiaoxiaoNeural", "rate": "-15%"}, "post": {}},
        "dad": {"synth": {"voice": "zh-CN-YunxiNeural"}, "post": {}},
        "luban": {"synth": {"voice": "zh-CN-YunjianNeural", "style": "cheerful"}, "post": {}},
    }

    def available(self):
        return False, "cloud engine is a stub: implement voice/engines/cloud_stub.py (see docstring)"

    def synth(self, text, role, seed):
        raise NotImplementedError("cloud engine not configured")
