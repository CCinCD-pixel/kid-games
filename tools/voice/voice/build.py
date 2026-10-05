"""Orchestrator: content yaml -> cached engine wavs -> ffmpeg -> m4a + audio-manifest.json -> QC report.

This process never loads a model. Model work happens in short-lived workers started one at a
time through memrun.sh (<= BATCH_MAX lines each, memory-guarded, foreground).

Cache keys
  raw_key = sha1(engine, engine.version, synth preset (voice), seed, rendered text) -> cache/raw/<raw_key>.wav
  key     = sha1(raw_key, role, post preset, speed, PIPELINE_VERSION, loudness, codec) -> <stem>.<key[:8]>.m4a
  (so the published file name changes whenever text, role, engine, version, voice or seed change)
Dad's recordings (content/narration/overrides/<id>.m4a|wav) replace the engine for that id.

Re-roll (stochastic engines, QC on): a clip with a HARD QC flag (qc.HARD_FLAGS: real mis-reading,
polyphone mismatch, babble/hesitation pace, repeated word, empty) is re-synthesised with seeds
base+1, base+2 ... (up to --reroll) and the best-scoring take wins (qc.score). Winning seeds are
written to <content>/narration/_takes/<game>.<engine>.json so later builds reproduce them without
re-rolling; an entry is ignored as soon as the line's text, voice or engine version changes.
Takes already synthesised are cached, so re-ranking them after a QC change costs no model time.
"""
from __future__ import annotations
import dataclasses, hashlib, json, re, subprocess, time
from collections import Counter
from pathlib import Path

from . import config, content, post, qc, timing
from .engines import get as get_engine


def sha1(obj) -> str:
    return hashlib.sha1(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def file_sha1(p: Path) -> str:
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


# ------------------------------------------------------------------------------------- takes
def _take_sig(it, eng) -> str:
    return sha1({"engine": eng.name, "v": eng.version, "synth": eng.preset(it.role)["synth"], "text": it.rendered})


def _prior_tried(it, eng, takes) -> set:
    t = takes.get(it.id) or {}
    return set(t.get("tried", [])) if t.get("sig") == _take_sig(it, eng) and t.get("base") == it.base_seed else set()


def load_takes(path: Path) -> dict:
    try:
        return json.loads(path.read_text("utf-8")).get("takes", {})
    except (FileNotFoundError, ValueError):
        return {}


def save_takes(path: Path, eng, takes: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {"_": "seeds chosen by `voice build --reroll` (QC-scored); delete an entry to re-roll that line",
           "engine": eng.name, "takes": dict(sorted(takes.items()))}
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", "utf-8")


# ------------------------------------------------------------------------------------- plan
def plan(items, eng, takes: dict | None = None):
    for it in items:
        pr = eng.preset(it.role)
        if it.recording:
            it.rendered = it.spoken
            it.raw_key = sha1({"recording": file_sha1(it.recording)})
            pr = {"synth": {}, "post": {}}
        else:
            it.rendered = eng.render(it)
            t = (takes or {}).get(it.id)
            if t and t.get("sig") == _take_sig(it, eng) and t.get("base") == it.base_seed:
                it.seed = int(t["seed"])
            it.raw_key = sha1({"engine": eng.name, "engine_version": eng.version, "synth": pr["synth"],
                               "seed": it.seed, "text": it.rendered})
        it.key = sha1({"raw": it.raw_key, "role": it.role, "post": pr["post"], "speed": it.speed,
                       "v": config.PIPELINE_VERSION, "loud": config.LOUDNORM, "tpm": config.TP_ENCODE_MARGIN,
                       "codec": config.CODEC, "sr": config.SAMPLE_RATE, "pad": [config.LEAD_MS, config.TAIL_MS]})
        it._post = pr["post"]


def run_guarded(tag: str, args: list[str], limit_mb: int = config.GUARD_LIMIT_MB) -> int:
    cmd = [str(config.MEMRUN), "-l", str(limit_mb), "-w", str(config.MIN_FREE_PCT), "-t", tag, "--",
           str(config.PYTHON), *args]
    print(f"  $ memrun {tag}: {' '.join(args[:3])} ...", flush=True)
    return subprocess.run(cmd, cwd=str(config.PIPELINE), env=config.env_for_models()).returncode


# ------------------------------------------------------------------------------------- stages
def synthesize(items, eng, game: str, batch: int) -> list[dict]:
    raw_dir = config.CACHE / "raw"; raw_dir.mkdir(parents=True, exist_ok=True)
    jobs_dir = config.CACHE / "jobs"; jobs_dir.mkdir(parents=True, exist_ok=True)
    todo = [it for it in items if not it.recording and not (raw_dir / f"{it.raw_key}.wav").exists()]
    seen, uniq = set(), []
    for it in todo:  # identical text+voice+seed is synthesised once
        if it.raw_key not in seen:
            seen.add(it.raw_key); uniq.append(it)
    stats = []
    if not uniq:
        return stats
    ok, why = eng.available()
    if not ok:
        raise SystemExit(f"engine {eng.name} unavailable: {why}")
    batch = max(1, min(batch, config.BATCH_MAX))
    nb = (len(uniq) + batch - 1) // batch
    print(f"[tts] {eng.name}: {len(uniq)} lines to synthesise in {nb} guarded batch(es) of <= {batch}", flush=True)
    for b in range(nb):
        chunk = uniq[b * batch:(b + 1) * batch]
        jp = jobs_dir / f"{game}.{eng.name}.{int(time.time())}.b{b + 1}.json"
        jp.write_text(json.dumps({"engine": eng.name, "jobs": [
            {"key": it.raw_key, "text": it.rendered, "role": it.role, "seed": it.seed,
             "out": str(raw_dir / f"{it.raw_key}.wav")} for it in chunk]}, ensure_ascii=False), "utf-8")
        if eng.needs_guard:
            rc = run_guarded(f"{eng.name}:{game}:b{b + 1}/{nb}", ["-m", "voice.worker", str(jp)])
        else:
            rc = subprocess.run([str(config.PYTHON), "-m", "voice.worker", str(jp)], cwd=str(config.PIPELINE),
                                env=config.env_for_models()).returncode
        st = jp.with_suffix(".stats.json")
        if st.exists():
            stats.append(json.loads(st.read_text()))
        if rc != 0:
            msg = {137: "killed by the memory guard (see logs/memrun.log) - scale down, do not retry blindly",
                   75: "not started: memory too low / another model process running"}.get(rc, f"exit {rc}")
            raise SystemExit(f"[tts] batch {b + 1}/{nb} failed: {msg}")
    return stats


def qc_available() -> bool:
    return (config.ASR_DIR / "model.int8.onnx").exists()


def run_qc(items, game: str) -> None:
    todo = [it for it in items if qc.cached(it.key) is None]
    if not todo:
        return
    jp = config.CACHE / "jobs" / f"{game}.qc.{int(time.time())}.json"
    jp.write_text(json.dumps([{"key": it.key, "path": str(it.m4a)} for it in todo]), "utf-8")
    rc = run_guarded(f"asr:{game}", ["-m", "voice.qc", str(jp)], limit_mb=1500)
    if rc != 0:
        print(f"[qc] ASR worker failed (exit {rc}); report will lack QC", flush=True)


def realize(items, eng, game: str, out_dir: Path, batch: int, do_qc: bool) -> list[dict]:
    """synthesise (guarded) -> post-process -> ASR QC -> it.meta / it.shape / it.asr / it.q"""
    stats = synthesize(items, eng, game, batch)
    proc_dir = config.CACHE / "proc"
    for it in items:
        it.m4a = out_dir / f"{it.stem}.{it.hash8}.m4a"
        it.proc = proc_dir / f"{it.key}.wav"
        it.failed = False
        raw = it.recording or (config.CACHE / "raw" / f"{it.raw_key}.wav")
        if not raw.exists():  # the engine returned no audio: leave the id out of the manifest
            print(f"[build] {it.id}: engine produced no audio - left out (runtime speech fallback)", flush=True)
            it.failed, it.meta, it.shape = True, {"durationMs": 0}, None
            continue
        info_p = proc_dir / f"{it.key}.json"
        if not (it.m4a.exists() and it.proc.exists() and info_p.exists()):
            info = post.process(raw, it.proc, it.m4a, it._post, it.speed)
            info_p.write_text(json.dumps(info), "utf-8")
        it.meta = json.loads(info_p.read_text())
        it.shape = timing.speech_shape(it.proc)
    ok_items = [it for it in items if not it.failed]
    if do_qc:
        run_qc(ok_items, game)
    for it in items:
        it.asr = qc.cached(it.key) if do_qc and not it.failed else None
        it.q = qc.analyze(it, it.asr, it.shape) if it.asr else None
        if it.failed:
            it.q = {"hyp": "", "cer": 1.0, "syl_err": len(it.spoken), "per_toneless": 1.0, "per_tone": 1.0,
                    "polyphones": [], "flags": ["empty"], "hard": ["empty"], "pace_dev": 0.0}
    return stats


def reroll(items, eng, game, out_dir, batch, rounds, takes) -> tuple[list[dict], dict]:
    """Replace clips with hard QC flags by better seeds. Returns (worker stats, {id: [(seed, score, flags)]})."""
    stats, history = [], {}
    for r in range(1, rounds + 1):
        bad = [(i, it) for i, it in enumerate(items)
               if it.q and it.q["hard"] and not it.recording and len(history.get(it.id, [])) < 1 + rounds]
        if not bad:
            break
        print(f"[reroll] round {r}: {len(bad)} clip(s) with hard flags: "
              + ", ".join(f"{it.id}({'/'.join(it.q['hard'])})" for _, it in bad), flush=True)
        cands = []
        for _, it in bad:
            # seeds tried in earlier builds are re-scored from cache (no model run), so a QC change re-ranks them
            tried = {s for s, _, _ in history.get(it.id, [])} | {it.seed}
            k = 1
            while it.base_seed + k in tried:
                k += 1
            cands.append(dataclasses.replace(it, seed=it.base_seed + k))
        plan(cands, eng, None)
        stats += realize(cands, eng, game, out_dir, batch, True)
        for (i, it), c in zip(bad, cands):
            h = history.setdefault(it.id, [(it.seed, qc.score(it.q), it.q["flags"])])
            h.append((c.seed, qc.score(c.q), c.q["flags"] if c.q else ["no-qc"]))
            win, lose = (c, it) if qc.score(c.q) < qc.score(it.q) else (it, c)
            items[i] = win
            lose.m4a.unlink(missing_ok=True)
    for it in items:
        if it.id in history:
            prev = _prior_tried(it, eng, takes)
            takes[it.id] = {"seed": it.seed, "base": it.base_seed, "sig": _take_sig(it, eng),
                            "score": qc.score(it.q), "flags": it.q["flags"] if it.q else [],
                            "tried": sorted(prev | {s for s, _, _ in history[it.id]})}
    return stats, history


# ------------------------------------------------------------------------------------- build
def build(game: str, engine: str, out_root: Path | None = None, content_dir: Path | None = None,
          do_qc: bool = True, only: list[str] | None = None, batch: int = config.BATCH_MAX, prune: bool = False,
          rounds: int | None = None):
    t_start = time.time()
    content_dir = Path(content_dir or config.CONTENT)
    doc, items = content.load(game, content_dir)
    if only:
        items = [it for it in items if any(re.fullmatch(o.replace("*", ".*"), it.id) for o in only)]
    eng = get_engine(engine)
    takes_path = content_dir / "narration" / "_takes" / f"{game}.{eng.name}.json"
    takes = load_takes(takes_path) if eng.stochastic else {}
    plan(items, eng, takes)
    out_root = Path(out_root or (config.OUT / eng.name))
    out_dir = out_root / "public" / "audio" / game
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"[build] {game}: {len(items)} clips, engine {eng.name} ({eng.version[:60]}...), out {out_dir}", flush=True)
    if do_qc and not qc_available():
        print("[qc] ASR model missing - run `voice setup --engine asr`; building without QC", flush=True)
        do_qc = False

    tts_stats = realize(items, eng, game, out_dir, batch, do_qc)
    rounds = config.REROLL if rounds is None else rounds
    history = {}
    if do_qc and eng.stochastic and rounds > 0:
        st, history = reroll(items, eng, game, out_dir, batch, rounds, takes)
        tts_stats += st
        if history:
            save_takes(takes_path, eng, takes)
            print(f"[reroll] takes -> {takes_path}", flush=True)

    # timings + manifest + report
    manifest, rows = {}, []
    for it in items:
        if it.failed:
            rows.append({"id": it.id, "role": it.role, "kind": it.kind, "text": it.text, "spoken": it.spoken,
                         "engine_text": it.rendered, "file": None, "durationMs": 0, "timing": None, "gen_sec": None,
                         "audio_sec": None, "recording": None, "seed": it.seed, "takes": history.get(it.id), "tried": [it.seed],
                         "shape": None, "loudnorm_in": None, "qc": it.q})
            continue
        dur = it.meta["durationMs"]
        words, method = None, None
        if not it.templated:
            if it.asr and it.q and it.q["cer"] == 0 and it.asr.get("timestamps"):
                words = timing.from_asr(it.text, it.asr["hyp"], it.asr["timestamps"], it.proc, dur)
                method = "asr" if words else None
            if words is None:
                words = timing.estimate(it.text, it.proc, dur)
                method = "estimate" if words else None
        clip = {"src": f"/audio/{game}/{it.m4a.name}", "text": it.text, "durationMs": dur, "role": it.role}
        if words:
            clip["words"] = words
        if it.kind == "word" and it.word_pinyin:
            clip["pinyin"] = it.word_pinyin
        manifest[it.id] = clip
        rawmeta_p = config.CACHE / "raw" / f"{it.raw_key}.json"
        rawmeta = json.loads(rawmeta_p.read_text()) if rawmeta_p.exists() else {}
        rows.append({"id": it.id, "role": it.role, "kind": it.kind, "text": it.text, "spoken": it.spoken,
                     "engine_text": it.rendered, "file": clip["src"], "durationMs": dur, "timing": method,
                     "gen_sec": rawmeta.get("gen_sec"), "audio_sec": rawmeta.get("audio_sec"),
                     "recording": str(it.recording) if it.recording else None, "seed": it.seed,
                     "takes": history.get(it.id), "shape": it.shape,
                     "tried": sorted(_prior_tried(it, eng, takes) | {s for s, _, _ in history.get(it.id, [])} | {it.seed}),
                     "loudnorm_in": it.meta.get("loudnorm_in"), "qc": it.q})
    (out_dir / "audio-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), "utf-8")

    if prune:
        keep = {Path(c["src"]).name for c in manifest.values()} | {"audio-manifest.json"}
        for f in out_dir.iterdir():
            if f.name not in keep and re.fullmatch(r".+\.[0-9a-f]{8}\.m4a", f.name):
                f.unlink()

    return write_report(game, eng, rows, tts_stats, time.time() - t_start, out_dir)


def write_report(game, eng, rows, tts_stats, wall, out_dir):
    config.REPORTS.mkdir(parents=True, exist_ok=True)
    gen = [r["gen_sec"] for r in rows if r["gen_sec"]]
    aud = [r["audio_sec"] for r in rows if r["gen_sec"]]
    with_qc = [r for r in rows if r["qc"]]
    lines_qc = [r for r in with_qc if r["kind"] == "line"]
    flagged = [r for r in with_qc if r["qc"]["flags"]]
    hard = [r for r in with_qc if r["qc"]["hard"]]
    poly = [p for r in with_qc for p in r["qc"]["polyphones"]]
    rer = [r for r in rows if r["takes"]]
    summary = {
        "game": game, "engine": eng.name, "engine_version": eng.version, "clips": len(rows),
        "out": str(out_dir), "wall_sec": round(wall, 1),
        "rtf": round(sum(gen) / sum(aud), 3) if aud else None,
        "workers": tts_stats,
        "qc": {
            "asr": qc.ASR_ID, "checked": len(with_qc),
            "cer_mean_lines": round(sum(r["qc"]["cer"] for r in lines_qc) / len(lines_qc), 4) if lines_qc else None,
            "cer_mean_all": round(sum(r["qc"]["cer"] for r in with_qc) / len(with_qc), 4) if with_qc else None,
            "per_toneless_mean": round(sum(r["qc"]["per_toneless"] for r in with_qc) / len(with_qc), 4) if with_qc else None,
            "flagged": [r["id"] for r in flagged],
            "hard_flagged": {r["id"]: r["qc"]["hard"] for r in hard},
            "polyphones": {s: sum(p["status"] == s for p in poly) for s in ("ok", "unverified", "MISMATCH", "deleted")},
        },
        "rerolled": {r["id"]: r["takes"] for r in rer},
        "timing_methods": dict(Counter(str(r["timing"]) for r in rows)),
    }
    rep = {"summary": summary, "clips": rows}
    jp = config.REPORTS / f"{game}.{eng.name}.qc.json"
    jp.write_text(json.dumps(rep, ensure_ascii=False, indent=1), "utf-8")
    md = [f"# QC {game} · {eng.name}", "", f"`{eng.version}`", "",
          f"clips {len(rows)} · RTF {summary['rtf']} · CER(lines) {summary['qc']['cer_mean_lines']} · "
          f"flagged {len(flagged)} (hard {len(hard)}) · re-rolled {len(rer)} · polyphones {summary['qc']['polyphones']} · "
          f"timings {summary['timing_methods']}", "",
          "| id | role | seed | dur ms | cps | max pause | CER | PERtl | flags | ASR hears |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        q = r["qc"] or {}
        md.append(f"| {r['id']} | {r['role']} | {r['seed']} | {r['durationMs']} | {q.get('cps', '')} | "
                  f"{q.get('max_pause', '')} | {q.get('cer', '')} | {q.get('per_toneless', '')} | "
                  f"{' '.join(q.get('flags', []))} | {q.get('hyp', '')} |")
    if rer:
        md += ["", "## Re-rolls (seed, score, flags; lower score wins)", ""]
        for r in rer:
            md.append(f"- {r['id']}: " + " → ".join(f"{s}:{sc}{'(' + ','.join(f) + ')' if f else ''}" for s, sc, f in r["takes"])
                      + f"  ⇒ seed {r['seed']}")
    (config.REPORTS / f"{game}.{eng.name}.qc.md").write_text("\n".join(md) + "\n", "utf-8")
    print(f"[report] {jp}", flush=True)
    s = summary
    print(f"[done] {game}/{eng.name}: {s['clips']} clips, RTF {s['rtf']}, CER(lines) {s['qc']['cer_mean_lines']}, "
          f"hard-flagged {s['qc']['hard_flagged']}, re-rolled {len(rer)}, polyphones {s['qc']['polyphones']}, "
          f"timings {s['timing_methods']}, wall {s['wall_sec']}s", flush=True)
    return rep
