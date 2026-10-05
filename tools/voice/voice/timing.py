"""Per-character timings for subtitles / karaoke highlight (manifest `words: [{ch, t0, t1}]`).

Method "estimate" (default, no model):
  1. speech region and pauses from 10 ms RMS frames of the processed clip (energy VAD,
     threshold = loudest-5% minus 32 dB; pauses >= 80 ms);
  2. split the subtitle into punctuation-delimited phrases; every CJK char = 1 syllable, a digit
     run = the syllables of its Chinese reading, latin runs ~1 syllable / 3 letters;
  3. dynamic programming matches phrase boundaries to detected pauses (monotonic; rewards long
     pauses near the boundary's syllable-proportional position);
  4. between matched pauses, time is distributed by syllable weight.
  Punctuation gets the pause span (t0 = end of previous char, t1 = start of next).
Method "asr" (when the QC pass ran and Paraformer returned token timestamps and the clip
transcribed cleanly): ASR token start times anchor the chars, ends = next start.
Which method was used is recorded per clip in the QC report.
"""
from __future__ import annotations
import re

import numpy as np
import soundfile as sf

from .textnorm import CJK, spoken

BREAK = set("，。！？；：、…—,.!?;:")


def units(text: str):
    """[(display_string, syllable_weight)] — weight 0 = punctuation; whitespace dropped."""
    out, i = [], 0
    while i < len(text):
        c = text[i]
        if CJK.match(c):
            out.append((c, 1.0)); i += 1
        elif c.isdigit():
            m = re.match(r"\d+(?:\.\d+)?", text[i:]).group(0)
            nxt = text[i + len(m):i + len(m) + 1]
            out.append((m, float(max(1, len(spoken(m + nxt)) - len(nxt)))))
            i += len(m)
        elif c.isascii() and c.isalpha():
            m = re.match(r"[A-Za-z]+", text[i:]).group(0)
            out.append((m, max(1.0, len(m) / 3))); i += len(m)
        elif c.isspace():
            i += 1
        else:
            out.append((c, 0.0)); i += 1
    return out


def speech_frames(path):
    a, sr = sf.read(str(path), dtype="float32", always_2d=True)
    a = a.mean(axis=1)
    hop, win = int(sr * 0.01), int(sr * 0.025)
    if len(a) < win * 2:
        return None
    fr = np.lib.stride_tricks.sliding_window_view(a, win)[::hop]
    db = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-9)
    thr = max(np.percentile(db, 95) - 32.0, -60.0)
    return db > thr, hop / sr, len(a) / sr


def pauses(voiced, step, min_s=0.08):
    idx = np.flatnonzero(voiced)
    if len(idx) == 0:
        return None, None, []
    s0, s1 = idx[0], idx[-1]
    out, run = [], None
    for i in range(s0, s1 + 1):
        if not voiced[i]:
            run = i if run is None else run
        elif run is not None:
            if (i - run) * step >= min_s:
                out.append((run * step, i * step))
            run = None
    return s0 * step, (s1 + 1) * step + 0.015, out


def speech_shape(path) -> dict | None:
    """{"speech_sec": first-to-last voiced frame, "max_pause": longest internal pause,
        "pause_sec": all internal pauses >= 80 ms} (QC input)."""
    sf_ = speech_frames(path)
    if sf_ is None:
        return None
    voiced, step, _ = sf_
    s0, s1, ps = pauses(voiced, step)
    if s0 is None:
        return {"speech_sec": 0.0, "max_pause": 0.0, "pause_sec": 0.0}
    return {"speech_sec": round(s1 - s0, 3), "max_pause": round(max([z - a for a, z in ps], default=0.0), 3),
            "pause_sec": round(sum(z - a for a, z in ps), 3)}


def estimate(text: str, wav_path, duration_ms: int | None = None):
    us = units(text)
    syl = [w for _, w in us]
    W = sum(syl)
    sf_ = speech_frames(wav_path)
    if not us or W == 0 or sf_ is None:
        return None
    voiced, step, total = sf_
    s0, s1, ps = pauses(voiced, step)
    if s0 is None:
        return None
    # phrase boundaries: index in `us` of each breaking punctuation followed by more syllables
    cum, bnds = 0.0, []
    for k, (ch, w) in enumerate(us):
        cum += w
        if w == 0 and ch in BREAK and 0 < cum < W and (not bnds or bnds[-1][1] != cum):
            bnds.append((k, cum))
    D = s1 - s0
    exp = [s0 + c / W * D for _, c in bnds]
    # DP: match boundaries (in order) to pauses (in order)
    B, P = len(bnds), len(ps)
    NEG = -1e9
    dp = np.full((B + 1, P + 1), NEG); dp[0, :] = 0.0
    bt = {}
    for i in range(1, B + 1):
        for j in range(0, P + 1):
            best, arg = dp[i - 1, j], ("skip", j)          # boundary i unmatched
            if j > 0:
                if dp[i, j - 1] > best:
                    best, arg = dp[i, j - 1], ("drop", j - 1)  # pause j unused
                a, z = ps[j - 1]
                sc = 4.0 * min(z - a, 0.6) - 3.0 * abs((a + z) / 2 - exp[i - 1]) / max(D, 1e-3)
                if dp[i - 1, j - 1] + sc > best:
                    best, arg = dp[i - 1, j - 1] + sc, ("match", j - 1)
            dp[i, j], bt[(i, j)] = best, arg
    match = {}
    i, j = B, P
    while i > 0:
        kind, jj = bt[(i, j)]
        if kind == "match":
            match[i - 1] = ps[jj]; i, j = i - 1, jj
        elif kind == "skip":
            i -= 1
        else:
            j = jj
    # segments between matched pauses
    seg_bounds = []
    start_t, start_k = s0, 0
    for bi, (k, _) in enumerate(bnds):
        if bi in match:
            a, z = match[bi]
            seg_bounds.append((start_k, k, start_t, a))
            start_k, start_t = k + 1, z
    seg_bounds.append((start_k, len(us) - 1, start_t, s1))
    t0 = [None] * len(us); t1 = [None] * len(us)
    for (ka, kb, ta, tb) in seg_bounds:
        ws = sum(syl[ka:kb + 1])
        c = 0.0
        for k in range(ka, kb + 1):
            if syl[k] > 0:
                t0[k] = ta + c / ws * (tb - ta)
                c += syl[k]
                t1[k] = ta + c / ws * (tb - ta)
    # punctuation: span from previous syllable end to next syllable start
    for k in range(len(us)):
        if syl[k] == 0:
            prev = next((t1[q] for q in range(k - 1, -1, -1) if syl[q] > 0), s0)
            nxt = next((t0[q] for q in range(k + 1, len(us)) if syl[q] > 0), None)
            t0[k], t1[k] = prev, (nxt if nxt is not None else prev)
    dur = (duration_ms or total * 1000) / 1000
    words = []
    for (ch, _), a, b in zip(us, t0, t1):
        a, b = max(0.0, min(a, dur)), max(0.0, min(b, dur))
        words.append({"ch": ch, "t0": int(round(a * 1000)), "t1": int(round(max(a, b) * 1000))})
    return words


def from_asr(text: str, hyp: str, stamps: list, wav_path, duration_ms: int):
    """Anchor chars on Paraformer token start times when the transcript matches the text."""
    us = units(text)
    if not stamps or len(stamps) != len(hyp) or any(w not in (0.0, 1.0) for _, w in us):
        return None
    chars = [k for k, (_, w) in enumerate(us) if w > 0]
    if "".join(us[k][0] for k in chars) != hyp:
        return None
    sf_ = speech_frames(wav_path)
    if sf_ is None:
        return None
    voiced, step, total = sf_
    s0, s1, _ = pauses(voiced, step)
    # Paraformer stamps are relative to the 16 kHz clip as fed to ASR (0.3 s pad removed by caller)
    starts = [max(0.0, float(t)) for t in stamps]
    t0 = [None] * len(us); t1 = [None] * len(us)
    for n, k in enumerate(chars):
        t0[k] = starts[n]
        t1[k] = starts[n + 1] if n + 1 < len(chars) else s1
        if t1[k] - t0[k] > 0.6:  # trailing pause before the next char: cap the syllable
            t1[k] = t0[k] + 0.35
    for k in range(len(us)):
        if t0[k] is None:
            prev = next((t1[q] for q in range(k - 1, -1, -1) if t1[q] is not None and us[q][1] > 0), s0)
            nxt = next((t0[q] for q in range(k + 1, len(us)) if us[q][1] > 0), None)
            t0[k], t1[k] = prev, (nxt if nxt is not None else prev)
    dur = duration_ms / 1000
    return [{"ch": ch, "t0": int(round(min(a, dur) * 1000)), "t1": int(round(min(max(a, b), dur) * 1000))}
            for (ch, _), a, b in zip(us, t0, t1)]
