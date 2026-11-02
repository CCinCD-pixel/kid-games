"""Chooses, per candidate, the clip of each isolated word (几 乘 五) among seeds 1242-1247: the first whose ASR text has the SAME toned pinyin as the
word (pypinyin) and whose speech is a plausible length (<= 1.0 s for one syllable); reports how many of the 6 seeds were usable
(a stability measure). usage: pick-isolated.py WORKDIR -> WORKDIR/choice.json"""
import json, sys
from pathlib import Path
from pypinyin import lazy_pinyin, Style
w = Path(sys.argv[1]); home = Path.home()
reports = {}
for name in ("voice-audition.qwen3", "voice-audition-alt.qwen3"):
    for r in json.loads((home / f"kid-games-work/voice/reports/{name}.qc.json").read_text())["clips"]: reports[r["id"]] = r
f0 = {r["id"]: r for r in json.loads((w / "f0.json").read_text())}
T = dict(json.loads((w / "texts.json").read_text())); choice, stab = {}, {}
for c in json.loads((w / "candidates.json").read_text()):
    k = c["key"]
    if c["engine"] != "qwen3": continue
    for t in ("t01", "t03", "t07"):
        tries = [(1242, f"vo.{k}.{t}")] + [(s, f"vo.{k}.{t}.s{s}") for s in range(1243, 1248)]
        ok = []
        for seed, cid in tries:
            r = reports.get(cid); hyp = ((r or {}).get("qc") or {}).get("hyp", "")
            good = lazy_pinyin(hyp, style=Style.TONE3) == lazy_pinyin(T[t], style=Style.TONE3) and f0.get(cid, {}).get("speechSec", 9) <= 1.0
            if good: ok.append((seed, cid))
        stab[f"{k}.{t}"] = len(ok)
        choice[f"vo.{k}.{t}"] = {"id": (ok[0][1] if ok else f"vo.{k}.{t}"), "seed": (ok[0][0] if ok else 1242), "usable": bool(ok), "stable": f"{len(ok)}/6"}
(w / "choice.json").write_text(json.dumps(choice, ensure_ascii=False, indent=1))
for k in ("X", "X2", "A", "A2", "B", "B2", "C", "C2", "E"): print(k.ljust(3), {t: stab[f"{k}.{t}"] for t in ("t01", "t03", "t07")})
