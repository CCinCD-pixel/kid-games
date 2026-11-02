"""Loudness (BS.1770 via ffmpeg), true peak, and a breathiness proxy (share of energy above 4 kHz in the louder frames) per audition clip.
usage: spectral-metrics.py WORKDIR -> WORKDIR/spec.json   (numpy only; never plays audio)"""
import json, re, subprocess, sys
from pathlib import Path
import numpy as np
work = Path(sys.argv[1]); rows = {}
for eng in ("qwen3", "kokoro", "alt"):
    d = work / f"out-{eng}/public/audio/voice-audition{'-alt' if eng == 'alt' else ''}"
    for cid, c in json.loads((d / "audio-manifest.json").read_text()).items():
        f = d / c["src"].split("/")[-1]
        e = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(f), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
        s = e[e.rfind("Summary:"):]
        I = re.search(r"I:\s+(-?[\d.]+) LUFS", s); P = re.search(r"Peak:\s+(-?[\d.]+) dBFS", s)
        x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout, dtype=np.float32).astype(np.float64)
        n = len(x) // 400; fr = x[:n * 400].reshape(n, 400) * np.hanning(400); sp = np.abs(np.fft.rfft(fr, axis=1)) ** 2; e_fr = sp.sum(axis=1)
        keep = e_fr > e_fr.max() * 0.05 if n else np.array([], bool)
        hf = float(sp[keep][:, 100:].sum() / (sp[keep].sum() + 1e-18)) if keep.any() else None   # bins 100..200 = 4-8 kHz at 16 kHz / 400
        rows[cid] = {"lufs": float(I.group(1)) if I else None, "tp": float(P.group(1)) if P else None, "hf4k": None if hf is None else round(hf, 4), "durS": round(len(x) / 16000, 2)}
(work / "spec.json").write_text(json.dumps(rows)); print(len(rows), "clips")
