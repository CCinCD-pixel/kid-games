"""ASR round-trip QC.

Worker half (separate process under memrun.sh, light model only):
    python -m voice.qc <jobs.json>      jobs = [{"key", "path"}]  -> cache/qc/<key>.json
  sherpa-onnx Paraformer-zh 2024-03-09 int8 (~227 MB file, ~0.5 GB RSS), CPU, 2 threads.

Analysis half (orchestrator, no model):
  CER on the normalised spoken text; syllable errors on FUZZY toneless pinyin (in/ing, en/eng and
  啦/了 merged - Paraformer confuses them on correct speech), so ASR homophone substitutions
  (小步步 -> 小布布) inflate CER but are not counted as TTS errors; polyphone check: for every
  polyphonic char (and every pinyin lock) the ASR char aligned to it must carry the expected reading — a different char with a different reading
  is a MISMATCH; the same char is "unverified" (the ASR cannot tell readings of one char apart);
  speech structure on the processed clip: pace for sentences (articulation rate too low = babble /
  stalls; overall chars/s too high = rushed), a duration window
  for words / numbers / short lines, longest internal pause (babble, hesitations, repeated words).
  HARD flags (cer, polyphone, pace, dur, pause, empty) make build re-roll the seed; score() ranks takes.
"""
from __future__ import annotations
import json, subprocess, sys, time
from functools import lru_cache
from pathlib import Path

import numpy as np

from . import config
from .textnorm import for_scoring

ASR_ID = "paraformer-zh-2024-03-09-int8"
BREAK = set("，。！？；：、…—,.!?;:")
PAD = 0.3


# ------------------------------------------------------------------------------- worker
def _decode16k(path: Path) -> np.ndarray:
    from .post import FF
    r = subprocess.run([FF, "-v", "error", "-nostdin", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


def worker(jobs_path: str) -> int:
    import sherpa_onnx
    jobs = json.loads(Path(jobs_path).read_text("utf-8"))
    rec = sherpa_onnx.OfflineRecognizer.from_paraformer(
        paraformer=str(config.ASR_DIR / "model.int8.onnx"), tokens=str(config.ASR_DIR / "tokens.txt"),
        num_threads=2, sample_rate=16000, feature_dim=80, decoding_method="greedy_search")
    out_dir = config.CACHE / "qc"
    out_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    for j in jobs:
        a = _decode16k(Path(j["path"]))
        pad = np.zeros(int(16000 * PAD), np.float32)
        st = rec.create_stream()
        st.accept_waveform(16000, np.concatenate([pad, a, pad]))
        rec.decode_stream(st)
        r = st.result
        stamps = [round(float(t) - PAD, 3) for t in (getattr(r, "timestamps", None) or [])]
        res = {"asr": ASR_ID, "hyp": r.text, "tokens": list(getattr(r, "tokens", []) or []), "timestamps": stamps}
        (out_dir / f"{j['key']}.{ASR_ID}.json").write_text(json.dumps(res, ensure_ascii=False), "utf-8")
    print(f"[qc] {len(jobs)} clips in {time.time() - t0:.1f}s", flush=True)
    return 0


def cached(key: str):
    p = config.CACHE / "qc" / f"{key}.{ASR_ID}.json"
    return json.loads(p.read_text("utf-8")) if p.exists() else None


# ------------------------------------------------------------------------------- analysis
def _align(ref: str, hyp: str):
    """Levenshtein alignment -> list of (ref_index|None, hyp_index|None)."""
    n, m = len(ref), len(hyp)
    d = np.zeros((n + 1, m + 1), dtype=np.int32)
    d[:, 0] = np.arange(n + 1); d[0, :] = np.arange(m + 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (ref[i - 1] != hyp[j - 1]))
    i, j, out = n, m, []
    while i > 0 or j > 0:
        if i > 0 and j > 0 and d[i, j] == d[i - 1, j - 1] + (ref[i - 1] != hyp[j - 1]):
            out.append((i - 1, j - 1)); i, j = i - 1, j - 1
        elif i > 0 and d[i, j] == d[i - 1, j] + 1:
            out.append((i - 1, None)); i -= 1
        else:
            out.append((None, j - 1)); j -= 1
    return out[::-1], int(d[n, m])


def fuzzy(p: str) -> str:
    """Toneless syllable with the confusions Paraformer makes on CORRECT speech merged:
    front/back nasals (星港 xing -> 新港 xin; even macOS Tingting is heard that way) and the
    sentence-final particle 啦/了 (la5/le5), 哇/呀/哪 -> a5."""
    tone = p[-1] if p and p[-1].isdigit() else ""
    b = p.rstrip("012345")
    if b.endswith("ing"):
        b = b[:-1]
    elif b.endswith("eng") and b != "eng":
        b = b[:-1]
    if tone == "5":
        b = {"la": "le", "lo": "le", "ya": "a", "wa": "a", "na": "a"}.get(b, b)
    return b


@lru_cache(maxsize=4096)
def _is_polyphone(ch: str) -> bool:
    from pypinyin import pinyin, Style
    rs = pinyin(ch, style=Style.NORMAL, heteronym=True)[0]
    return len(set(rs)) > 1


def _rate(ref, hyp):
    import editdistance
    return editdistance.eval(ref, hyp) / max(1, len(ref))


HARD_FLAGS = {"cer", "polyphone", "pace", "dur", "pause", "empty"}   # trigger a re-roll; "cer(asr-homophone)" does not


def analyze(item, asr: dict, shape: dict | None) -> dict:
    """shape = {"speech_sec", "max_pause"} measured on the processed clip (timing.speech_shape)."""
    from pypinyin import lazy_pinyin, Style
    ref = for_scoring(item.spoken)
    hyp = for_scoring(asr.get("hyp", ""))
    exp3 = item.expected_pinyin()                       # tone3 per CJK char of spoken (locks applied)
    if len(exp3) != len(ref):                           # latin letters etc. -> fall back to pypinyin
        exp3 = lazy_pinyin(ref, style=Style.TONE3, neutral_tone_with_five=True)
    hyp3 = lazy_pinyin(hyp, style=Style.TONE3, neutral_tone_with_five=True) if hyp else []
    strip = lambda p: p.rstrip("012345")
    fz_ref, fz_hyp = [fuzzy(p) for p in exp3], [fuzzy(p) for p in hyp3]
    pairs, _ = _align(ref, hyp)
    for ri, hi in pairs:  # the ASR wrote the very same char: its reading is unknowable, not an error
        if ri is not None and hi is not None and ref[ri] == hyp[hi] and ri < len(fz_ref) and hi < len(fz_hyp):
            fz_hyp[hi] = fz_ref[ri]
    import editdistance
    syl_err = int(editdistance.eval(fz_ref, fz_hyp))
    res = {"hyp": asr.get("hyp", ""), "cer": round(_rate(ref, hyp), 4),
           "syl_err": syl_err, "per_toneless": round(syl_err / max(1, len(fz_ref)), 4),
           "per_tone": round(_rate(exp3, hyp3), 4)}
    lock_idx = set()
    if item.overrides:  # indices are in `spoken` (raw); map to positions in ref (CJK-only string)
        k = 0
        for i, ch in enumerate(item.spoken):
            if ch.strip() and for_scoring(ch):
                if i in item.overrides:
                    lock_idx.add(k)
                k += 1
    poly = []
    for ri, hi in pairs:
        if ri is None or not (ri in lock_idx or _is_polyphone(ref[ri])):
            continue
        want = strip(exp3[ri]) if ri < len(exp3) else ""
        if hi is None:
            status, got = "deleted", ""
        elif hyp[hi] == ref[ri]:
            status, got = "unverified", hyp[hi]
        else:
            got = hyp[hi]
            status = "ok" if hi < len(hyp3) and ri < len(exp3) and fuzzy(hyp3[hi]) == fuzzy(exp3[ri]) else "MISMATCH"
        poly.append({"i": ri, "ch": ref[ri], "want": want, "got": got, "status": status, "locked": ri in lock_idx})
    res["polyphones"] = poly
    flags = []
    if not hyp:
        flags.append("empty")
    elif syl_err >= 1:
        flags.append("cer")                   # at least one syllable the ASR heard differently (fuzzy pinyin)
    elif res["cer"] > config.CER_FLAG:
        flags.append("cer(asr-homophone)")    # only same-sounding characters differ: not a TTS error
    if any(p["status"] == "MISMATCH" for p in poly):
        flags.append("polyphone")
    res["pace_dev"] = 0.0
    syl = max(1, len(ref))
    if shape and shape.get("speech_sec"):
        sp, mp = shape["speech_sec"], shape.get("max_pause", 0.0)
        cps = syl / sp
        res["cps"], res["speech_sec"], res["max_pause"] = round(cps, 2), round(sp, 2), round(mp, 2)
        if item.kind == "line" and syl >= config.SHORT_SYL:
            pace = config.PACE.get(item.role, config.PACE["narrator"])
            breaks = sum(1 for ch in item.text.rstrip("。！？!?.…”\"' ") if ch in BREAK)
            art = syl / max(0.3, sp - min(shape.get("pause_sec", 0.0), breaks * config.PAUSE_PER_BREAK + 0.15))
            res["art"] = round(art, 2)
            if art < pace["min_art"]:
                flags.append("pace")
                res["pace_dev"] = round(pace["min_art"] - art, 2)
            elif cps > pace["max_cps"]:
                flags.append("pace")
                res["pace_dev"] = round(cps - pace["max_cps"], 2)
            if mp > config.LINE_MAX_PAUSE:
                flags.append("pause")
        else:  # words, numbers, short interjections: babble / repeats / truncation show up in length
            lo_s, hi_s = config.SHORT_SEC_PER_SYL[0] * syl, config.SHORT_SEC_PER_SYL[1] * syl + config.SHORT_SEC_SLACK
            if not (lo_s <= sp <= hi_s):
                flags.append("dur")
                res["pace_dev"] = round(lo_s - sp if sp < lo_s else sp - hi_s, 2)
            if mp > config.SHORT_MAX_PAUSE:
                flags.append("pause")
    elif shape is not None:
        flags.append("empty")
    res["flags"] = flags
    res["hard"] = [f for f in flags if f in HARD_FLAGS]
    return res


def score(q: dict | None) -> float:
    """Lower is better. Used to pick the best take when re-rolling seeds."""
    if not q:
        return 1e6
    return round(100 * len(q["hard"]) + 30 * q.get("syl_err", 0) + 20 * q["per_toneless"] + 5 * q["cer"]
                 + 10 * q.get("pace_dev", 0.0)
                 + 2 * max(0.0, q.get("max_pause", 0.0) - 0.6), 3)


if __name__ == "__main__":
    sys.exit(worker(sys.argv[1]))
