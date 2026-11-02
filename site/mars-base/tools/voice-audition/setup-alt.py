#!/usr/bin/env python3
"""Extra seeds (1243-1247) for the isolated one-syllable words (几 乘 五), because a single seed of a lone syllable is mostly babble or the
wrong word with Qwen3 (that instability is itself a finding). usage: setup-alt.py WORKDIR -> WORKDIR/content-alt/narration/voice-audition-alt.yaml"""
import json, sys
from pathlib import Path
w = Path(sys.argv[1]); C = [c for c in json.loads((w / "candidates.json").read_text()) if c["engine"] == "qwen3"]
T = dict(json.loads((w / "texts.json").read_text())); words = {"t01": T["t01"], "t03": T["t03"], "t07": T["t07"]}
lines = [{"id": f"vo.{c['key']}.{t}.s{seed}", "role": c["role"], "text": txt, "seed": seed} for c in C for t, txt in words.items() for seed in range(1243, 1248)]
d = w / "content-alt" / "narration"; d.mkdir(parents=True, exist_ok=True)
(d / "voice-audition-alt.yaml").write_text(json.dumps({"game": "voice-audition-alt", "lines": lines}, ensure_ascii=False, indent=1))
print(len(lines), "lines")
