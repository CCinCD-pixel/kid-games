"""Merge f0.json + spec.json into per-candidate tables (stdout + tables.json). usage: tables.py WORKDIR"""
import json, sys
from pathlib import Path
import numpy as np
w = Path(sys.argv[1]); f0 = {r["id"]: r for r in json.loads((w / "f0.json").read_text())}; sp = json.loads((w / "spec.json").read_text())
cands = json.loads((w / "candidates.json").read_text()); choice = json.loads((w / "choice.json").read_text())
cid = lambda k, t: choice.get(f"vo.{k}.{t}", {}).get("id", f"vo.{k}.{t}")
fmt = lambda v: "-" if v is None else (f"{v:+.1f}" if isinstance(v, float) else str(v))
out = {}
print("== 孤立的“几” (t01)；末尾升降单位=半音，正数=上扬；Hz 为中位基频")
print("cand | medianHz | rangeSt | end-start | end-lowest | end-median | speech s | HF>4k | aperiod | LUFS | usable seeds of 6")
for c in cands:
    k = c["key"]; r = f0.get(cid(k, "t01")); s = sp.get(cid(k, "t01"))
    if not r: print(f"{k:3s} | (no clip: {c['engine']} cannot voice a one-syllable word)"); out[k] = {"t01": None}; continue
    out[k] = {"t01": {**r, **(s or {}), "usable": choice.get(f"vo.{k}.t01", {}).get("usable"), "stable": choice.get(f"vo.{k}.t01", {}).get("stable"), "chosenId": cid(k, "t01")}}
    print(f"{k:3s} | {fmt(r.get('medianHz'))} | {fmt(r.get('rangeSt'))} | {fmt(r.get('endVsStartSt'))} | {fmt(r.get('endVsLowestSt'))} | {fmt(r.get('endVsMedianSt'))} | {r['speechSec']} | {s['hf4k']} | {fmt(r.get('aperiodicity'))} | {s['lufs']} | {choice.get(f'vo.{k}.t01', {}).get('stable')} usable={choice.get(f'vo.{k}.t01', {}).get('usable')}")
print("\n== 整句平均 (t05 等于几？ t06 五乘二等于几？ t09 几乘五等于六十五 t11 方框乘五等于六十五 t13 提示句 t14 结算句)")
print("cand | medianHz | rangeSt | sentence-end vs median | chars/s | HF>4k | aperiod | LUFS")
S = ["t05", "t06", "t09", "t11", "t13", "t14"]
for c in cands:
    k = c["key"]; rows = [f0[f"vo.{k}.{t}"] for t in S if f"vo.{k}.{t}" in f0 and "medianHz" in f0[f"vo.{k}.{t}"]]
    if not rows: continue
    m = lambda key: float(np.mean([r[key] for r in rows if r.get(key) is not None]))
    hf = float(np.mean([sp[f"vo.{k}.{t}"]["hf4k"] for t in S if f"vo.{k}.{t}" in sp])); lu = float(np.mean([sp[f"vo.{k}.{t}"]["lufs"] for t in S if f"vo.{k}.{t}" in sp]))
    agg = {"medianHz": round(m("medianHz")), "rangeSt": round(m("rangeSt"), 1), "endVsMedianSt": round(m("endVsMedianSt"), 1), "charsPerSec": round(m("charsPerSec"), 2), "hf4k": round(hf, 3), "aperiodicity": round(m("aperiodicity"), 3), "lufs": round(lu, 1), "n": len(rows)}
    out[k]["sentences"] = agg
    print(f"{k:3s} | {agg['medianHz']} | {agg['rangeSt']} | {agg['endVsMedianSt']:+.1f} | {agg['charsPerSec']} | {agg['hf4k']} | {agg['aperiodicity']} | {agg['lufs']}  (n={agg['n']})")
(w / "tables.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
