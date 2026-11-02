#!/usr/bin/env python3
"""Voice audition (算术站): builds a SCRATCH copy of tools/voice with ten audition roles (the repo's tools/voice is not touched), and the
audition yaml. usage: setup-scratch.py WORKDIR   -> WORKDIR/voice-scratch/, WORKDIR/content/narration/voice-audition.yaml, candidates.json"""
import json, shutil, sys
from pathlib import Path
work = Path(sys.argv[1]); repo = Path(__file__).resolve().parents[4]
dst = work / "voice-scratch"
shutil.rmtree(dst, ignore_errors=True)
shutil.copytree(repo / "tools/voice", dst, ignore=shutil.ignore_patterns("__pycache__", "eval"))
INSTRUCT = "语气平稳、清晰、温和，像老师一样自然地说话。不要撒娇，不要拖长音，不要上扬，不要气声。"
CANDS = [  # key, label, one-line, engine, role
    ("X",  "X 基线：Serena（现在的旁白）", "爸爸不喜欢的声音，对照用", "qwen3", "au_x"),
    ("X2", "X2 Serena + 平稳指令", "同一个声线，加“平稳、不撒娇”指令", "qwen3", "au_xi"),
    ("A",  "A 火星搭档：Vivian + 机器人音效", "拼音电台一直在用的机器人声线（偏亮的女声 + 轻微电子味）", "qwen3", "au_a"),
    ("A2", "A2 火星搭档 + 平稳指令", "同上，加平稳指令", "qwen3", "au_ai"),
    ("B",  "B Uncle_Fu（成年男声）", "低沉、温和的成年男声（项目里的“墨子/爸爸”声线）", "qwen3", "au_b"),
    ("B2", "B2 Uncle_Fu + 平稳指令", "同上，加平稳指令", "qwen3", "au_bi"),
    ("C",  "C Dylan + 暖色（年轻男声）", "鲁班声线：年轻男声，带一点北京腔", "qwen3", "au_c"),
    ("C2", "C2 Dylan + 暖色 + 平稳指令", "同上，加平稳指令", "qwen3", "au_ci"),
    ("E",  "E Eric（普通话）", "偏中性的男声，原为四川口音，已强制标准普通话；个别字可能不准", "qwen3", "au_e"),
    ("D",  "D Kokoro 男声（轻量引擎）", "另一个引擎的男声；这个引擎读不了很短的词（几/乘/五…），只有整句", "kokoro", "dad"),
]
(work / "candidates.json").write_text(json.dumps([dict(zip(("key", "label", "note", "engine", "role"), c)) for c in CANDS], ensure_ascii=False, indent=1))
cfg = (dst / "voice/config.py"); s = cfg.read_text()
s = s.replace('ROLES = ("narrator", "companion", "word", "dad", "luban")', 'ROLES = ("narrator", "companion", "word", "dad", "luban", "au_x", "au_xi", "au_a", "au_ai", "au_b", "au_bi", "au_c", "au_ci", "au_e")')
cfg.write_text(s)
q = dst / "voice/engines/qwen3_mlx.py"; s = q.read_text()
extra = f'''
    voices.update({{
        "au_x": {{"synth": {{"speaker": "serena"}}, "post": {{"tempo": 0.9}}}},
        "au_xi": {{"synth": {{"speaker": "serena", "instruct": {INSTRUCT!r}}}, "post": {{"tempo": 0.9}}}},
        "au_a": {{"synth": {{"speaker": "vivian"}}, "post": {{"pitch": 1.03, "tempo": 0.97, "fx": ROBOT}}}},
        "au_ai": {{"synth": {{"speaker": "vivian", "instruct": {INSTRUCT!r}}}, "post": {{"pitch": 1.03, "tempo": 0.97, "fx": ROBOT}}}},
        "au_b": {{"synth": {{"speaker": "uncle_fu"}}, "post": {{}}}},
        "au_bi": {{"synth": {{"speaker": "uncle_fu", "instruct": {INSTRUCT!r}}}, "post": {{}}}},
        "au_c": {{"synth": {{"speaker": "dylan"}}, "post": {{"pitch": 0.96, "fx": WARM}}}},
        "au_ci": {{"synth": {{"speaker": "dylan", "instruct": {INSTRUCT!r}}}, "post": {{"pitch": 0.96, "fx": WARM}}}},
        "au_e": {{"synth": {{"speaker": "eric", "dialect": False}}, "post": {{}}}},
    }})
'''
marker = "    def __init__(self):"
assert marker in s
s = s.replace(marker, extra.lstrip("\n") + "\n" + marker, 1)
s = s.replace("language=\"chinese\", max_tokens=min(4096, 25 + 8 * n),", "language=\"chinese\", instruct=syn.get(\"instruct\"), max_tokens=min(4096, 25 + 8 * n),")
assert 'instruct=syn.get' in s
q.write_text(s)
TEXTS = [("t01", "几"), ("t02", "等于"), ("t03", "乘"), ("t04", "除以"), ("t05", "等于几？"), ("t06", "五乘二等于几？"), ("t07", "五"), ("t08", "二"),
         ("t09", "几乘五等于六十五"), ("t10", "六十五"), ("t11", "方框乘五等于六十五"), ("t12", "方框"),
         ("t13", "先算十乘五，再算三乘五，最后把两个数合起来。"), ("t14", "八道题做完了，下一阶已经开启。"), ("t15", "七"), ("t16", "十三"), ("t17", "三百四十七")]
(work / "texts.json").write_text(json.dumps(TEXTS, ensure_ascii=False))
for eng in ("qwen3", "kokoro"):
    lines = [{"id": f"vo.{c[0]}.{k}", "role": c[4], "text": t, "seed": 1242} for c in CANDS if c[3] == eng for k, t in TEXTS]
    d = work / f"content-{eng}" / "narration"; d.mkdir(parents=True, exist_ok=True)
    (d / "voice-audition.yaml").write_text(json.dumps({"game": "voice-audition", "lines": lines}, ensure_ascii=False, indent=1))
print("scratch ready:", dst, "| lines qwen3", 17 * 9, "kokoro", 17)
