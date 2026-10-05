"""Model worker: ONE engine, at most config.BATCH_MAX lines, then exit.

Always started by the orchestrator through memrun.sh (never in the background, never two at once):
    memrun.sh -t qwen3:hub:b1 -- python -m voice.worker <jobs.json>
jobs.json = {"engine": "qwen3", "jobs": [{"key", "text", "role", "seed", "out"}]}
Each finished line is written immediately (raw wav + .json meta), so a guard kill loses nothing done.
"""
from __future__ import annotations
import json, os, sys, time, resource
from pathlib import Path

import numpy as np
import soundfile as sf

from . import config
from .engines import get


def main(jobs_path: str) -> int:
    spec = json.loads(Path(jobs_path).read_text("utf-8"))
    jobs = spec["jobs"]
    if len(jobs) > config.BATCH_MAX:
        print(f"refusing {len(jobs)} jobs > BATCH_MAX {config.BATCH_MAX}", file=sys.stderr)
        return 2
    eng = get(spec["engine"])
    t0 = time.time()
    eng.load()
    load_sec = time.time() - t0
    print(f"[worker] {eng.name} loaded in {load_sec:.1f}s", flush=True)
    for j in jobs:
        out = Path(j["out"])
        t = time.time()
        audio, sr = eng.synth(j["text"], j["role"], j["seed"])
        gen = time.time() - t
        eng.after_item()
        audio = np.asarray(audio, dtype=np.float32).reshape(-1)
        if audio.size == 0 or not np.isfinite(audio).all():
            print(f"[worker] {j['key'][:8]} produced no/invalid audio", file=sys.stderr, flush=True)
            continue
        tmp = out.with_suffix(".part.wav")
        sf.write(str(tmp), audio, sr, subtype="FLOAT")
        os.replace(tmp, out)
        dur = audio.size / sr
        meta = {"engine": eng.name, "engine_version": eng.version, "text": j["text"], "role": j["role"],
                "seed": j["seed"], "sr": sr, "gen_sec": round(gen, 3), "audio_sec": round(dur, 3),
                "rtf": round(gen / max(dur, 1e-6), 3), "load_sec": round(load_sec, 1)}
        out.with_suffix(".json").write_text(json.dumps(meta, ensure_ascii=False), "utf-8")
        print(f"[worker] {j['key'][:8]} {dur:5.2f}s audio in {gen:5.2f}s  {j['text'][:24]}", flush=True)
    st = eng.stats()
    st["maxrss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1048576, 1)
    st["load_sec"] = round(load_sec, 1)
    st["wall_sec"] = round(time.time() - t0, 1)
    Path(jobs_path).with_suffix(".stats.json").write_text(json.dumps(st), "utf-8")
    print(f"[worker] done {st}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
