"""compare.html — listen to every demo line in every engine side by side, with the QC numbers.

    python -m voice compare [--games hub,story-box,numbers-demo] [--engines qwen3,kokoro,say]

Reads reports/<game>.<engine>.qc.json + out/<engine>/public/audio/<game>/audio-manifest.json (run
`voice build` first) and logs/memrun.log (peak memory per engine), writes VOICE_HOME/compare.html.
Audio is referenced by relative path (out/<engine>/public/audio/...), so open the file locally.
"""
from __future__ import annotations
import json, re, subprocess
from pathlib import Path

from . import config

ENGINE_INFO = {
    "qwen3": {"label": "Qwen3-TTS 0.6B CustomVoice 8-bit (MLX)", "role": "default",
              "disk": ["hf/hub"], "license": "Apache-2.0"},
    "kokoro": {"label": "Kokoro-82M v1.1-zh int8 (sherpa-onnx)", "role": "light fallback",
               "disk": ["models/kokoro-int8-multi-lang-v1_1"], "license": "Apache-2.0"},
    "say": {"label": "macOS say · Tingting", "role": "preview only", "disk": [], "license": "macOS system voice"},
}


def _du_mb(rel: str) -> int | None:
    p = config.VOICE_HOME / rel
    if not p.exists():
        return None
    out = subprocess.run(["du", "-sk", str(p)], capture_output=True, text=True).stdout.split()  # HF blobs, no symlink double count
    return round(int(out[0]) / 1024) if out else None


def _mem_peaks() -> dict:
    """max peak RSS / phys_footprint per tag prefix from memrun.log (all runs so far)."""
    peaks = {}
    log = config.LOGS / "memrun.log"
    if not log.exists():
        return peaks
    for ln in log.read_text("utf-8", "replace").splitlines():
        m = re.search(r"\[(\w+):[^\]]*\] exit=(\d+) peak_rss=(\d+)MB peak_footprint=(\d+)MB wall=(\d+)s", ln)
        if not m or m.group(2) != "0":
            continue
        tag, rss, fp = m.group(1), int(m.group(3)), int(m.group(4))
        p = peaks.setdefault(tag, {"rss": 0, "footprint": 0, "runs": 0})
        p["rss"], p["footprint"], p["runs"] = max(p["rss"], rss), max(p["footprint"], fp), p["runs"] + 1
    return peaks


def collect(games, engines):
    from .textnorm import for_scoring
    data = {"games": [], "engines": {}}
    peaks = _mem_peaks()
    for e in engines:
        info = dict(ENGINE_INFO.get(e, {"label": e, "role": "", "disk": [], "license": ""}))
        info["disk_mb"] = sum(_du_mb(d) or 0 for d in info.pop("disk")) or None
        info["mem"] = peaks.get(e)
        info["games"] = {}
        data["engines"][e] = info
    data["asr_mem"] = peaks.get("asr")
    data["asr_disk_mb"] = _du_mb("models/paraformer-zh")
    for g in games:
        rows = {}
        order = []
        for e in engines:
            rp = config.REPORTS / f"{g}.{e}.qc.json"
            mp = config.OUT / e / "public" / "audio" / g / "audio-manifest.json"
            if not rp.exists() or not mp.exists():
                continue
            rep = json.loads(rp.read_text("utf-8"))
            man = json.loads(mp.read_text("utf-8"))
            s = rep["summary"]
            data["engines"][e]["games"][g] = {"rtf": s["rtf"], "cer_lines": s["qc"]["cer_mean_lines"],
                                              "cer_all": s["qc"]["cer_mean_all"], "hard": len(s["qc"]["hard_flagged"]),
                                              "clips": s["clips"], "rerolled": len(s.get("rerolled") or {})}
            for c in rep["clips"]:
                if c["id"] not in rows:
                    rows[c["id"]] = {"id": c["id"], "text": c["text"], "role": c["role"], "kind": c["kind"], "cells": {}}
                    order.append(c["id"])
                q = c["qc"] or {}
                mf = man.get(c["id"]) or {}
                rows[c["id"]]["cells"][e] = {
                    "src": f"out/{e}/public{c['file']}" if c["file"] else None,
                    "dur": c["durationMs"], "words": mf.get("words"), "cer": q.get("cer"), "hyp": q.get("hyp"),
                    "flags": q.get("flags", []), "hard": q.get("hard", []), "cps": q.get("cps"),
                    "syl_err": q.get("syl_err"), "syl": len(for_scoring(c["spoken"])),
                    "seed": c["seed"], "takes": max(len(c.get("tried") or []), len(c.get("takes") or []), 1)}
        data["games"].append({"id": g, "rows": [rows[i] for i in order]})
    # engine-level aggregates over every clip shown (sentences = lines with >= SHORT_SYL syllables)
    from .textnorm import for_scoring
    for e, info in data["engines"].items():
        sent, short, hard, total, rer, se, sn = [], [], 0, 0, 0, 0, 0
        for g in data["games"]:
            for r in g["rows"]:
                c = r["cells"].get(e)
                if not c:
                    continue
                total += 1
                hard += bool(c["hard"])
                rer += c["takes"] > 1
                if c["cer"] is None:
                    continue
                se += c.get("syl_err") or 0
                sn += c.get("syl") or 0
                (sent if r["kind"] == "line" and len(for_scoring(r["text"])) >= config.SHORT_SYL else short).append(c["cer"])
        info["agg"] = {"cer_sentences": round(sum(sent) / len(sent), 4) if sent else None, "n_sentences": len(sent),
                       "cer_short": round(sum(short) / len(short), 4) if short else None, "n_short": len(short),
                       "hard": hard, "clips": total, "rerolled": rer, "syl_err_rate": round(se / sn, 4) if sn else None}
    return data


TEMPLATE = r"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Narration Engine Compare</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--mute:#6b6b70;--line:#e3e1dc;--accent:#2f6fde;--hi:#ffe08a;
--bad:#c4372c;--badbg:#fdecea;--soft:#7a6a2b;--softbg:#f6f1dc;--ok:#2d7d46;--okbg:#e6f4ea}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#141416;--card:#1e1e22;--ink:#ececf0;--mute:#9a9aa3;
--line:#33333a;--accent:#7aa7ff;--hi:#6b5a12;--bad:#ff8a80;--badbg:#3a1f1d;--soft:#e2cf86;--softbg:#35301a;--ok:#7fd99a;--okbg:#1b3324}}
:root[data-theme=dark]{--bg:#141416;--card:#1e1e22;--ink:#ececf0;--mute:#9a9aa3;--line:#33333a;--accent:#7aa7ff;--hi:#6b5a12;
--bad:#ff8a80;--badbg:#3a1f1d;--soft:#e2cf86;--softbg:#35301a;--ok:#7fd99a;--okbg:#1b3324}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,"PingFang SC",system-ui,sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 10px}
.sub{color:var(--mute);margin:0 0 18px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}.card h3{margin:0 0 2px;font-size:15px}
.card .tag{font-size:12px;color:var(--mute)}.kv{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin-top:8px;font-size:13px}
.kv b{font-weight:600;font-variant-numeric:tabular-nums}.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;min-width:760px}th,td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
th{font-size:12px;color:var(--mute);font-weight:600;position:sticky;top:0;background:var(--card)}tr:last-child td{border-bottom:0}
.txt{font-size:17px;min-width:220px}.txt .ch{border-radius:3px;transition:background .08s}.txt .ch.on{background:var(--hi)}
.id{font-size:11px;color:var(--mute);font-family:ui-monospace,Menlo,monospace}
.cell{display:flex;flex-direction:column;gap:3px;min-width:170px}.row1{display:flex;align-items:center;gap:8px}
button.play{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--bg);color:var(--accent);cursor:pointer;font-size:13px;flex:none}
button.play.on{background:var(--accent);color:var(--card)}button.all{border:1px solid var(--line);background:var(--card);color:var(--accent);border-radius:8px;padding:2px 8px;font-size:12px;cursor:pointer;margin-left:6px}
.num{font-variant-numeric:tabular-nums;font-size:13px}.hyp{font-size:12px;color:var(--mute)}
.b{display:inline-block;font-size:11px;padding:0 6px;border-radius:6px;margin-right:3px}.b.hard{color:var(--bad);background:var(--badbg)}
.b.soft{color:var(--soft);background:var(--softbg)}.b.ok{color:var(--ok);background:var(--okbg)}.miss{color:var(--mute);font-size:13px}
.note{font-size:13px;color:var(--mute);margin-top:6px}
</style></head><body><main>
<h1>Narration engines, side by side</h1>
<p class="sub">Demo set: hub greetings (companion), 精卫填海 opening + tap-to-read words (narrator / word), number clips (companion).
Every clip went through the same chain: trim, voice preset, loudness −16 LUFS / ≤ −1.5 dBTP, AAC 40 kbps mono 44.1 kHz.
QC = Paraformer-zh ASR round-trip. CER counts every character the ASR wrote differently (小步步 → 小布布 too); the syllable error
rate compares fuzzy toneless pinyin, so it counts only what was actually said differently. <span class="b hard">hard</span> flags trigger a seed re-roll on Qwen3; <span class="b soft">soft</span> = ASR heard a same-sounding character.</p>
<div class="cards" id="cards"></div>
<div id="games"></div>
<p class="note">Generated by <code>python -m voice compare</code>. Character highlight uses the manifest's <code>words</code> timings (estimated from pauses + syllable counts).</p>
</main>
<script>
const DATA = __DATA__;
const E = Object.keys(DATA.engines);
const $ = (t, a = {}, ...k) => { const e = document.createElement(t); for (const [x, y] of Object.entries(a)) x === 'class' ? e.className = y : x === 'text' ? e.textContent = y : e.setAttribute(x, y); k.forEach(c => e.append(c)); return e; };
const fmt = (v, d = 3) => v == null ? '–' : (+v).toFixed(d);
// cards
const cards = document.getElementById('cards');
for (const e of E) {
  const i = DATA.engines[e], gs = Object.values(i.games), a = i.agg;
  const avg = k => gs.length ? gs.filter(g => g[k] != null).reduce((s, g) => s + g[k], 0) / Math.max(1, gs.filter(g => g[k] != null).length) : null;
  const kv = $('div', { class: 'kv' });
  const add = (k, v) => kv.append($('span', { text: k }), $('b', { text: v }));
  add('syllable error rate', fmt(a.syl_err_rate));
  add(`CER, ${a.n_sentences} sentences`, fmt(a.cer_sentences));
  add(`CER, ${a.n_short} words/numbers`, fmt(a.cer_short));
  add('clips with hard flags', `${a.hard} / ${a.clips}`);
  add('re-rolled (best of ≤4 seeds)', String(a.rerolled));
  add('RTF (gen ÷ audio)', fmt(avg('rtf'), 2));
  add('peak RSS / footprint', i.mem ? `${i.mem.rss} / ${i.mem.footprint} MB` : 'in-process (no model)');
  add('model on disk', i.disk_mb ? i.disk_mb + ' MB' : '–');
  add('licence', i.license);
  cards.append($('div', { class: 'card' }, $('h3', { text: i.label }), $('div', { class: 'tag', text: e + ' · ' + i.role }), kv));
}
// tables
let cur = null;
function stop() { if (!cur) return; cur.audio.pause(); cur.btn.classList.remove('on'); cur.btn.textContent = '▶'; cur.spans.forEach(s => s.classList.remove('on')); cancelAnimationFrame(cur.raf); const d = cur.done; cur = null; d && d(false); }
function play(cell, btn, spans) {
  return new Promise(res => {
    stop(); if (!cell.src) return res(true);
    const audio = new Audio(cell.src); cur = { audio, btn, spans, raf: 0, done: res };
    btn.classList.add('on'); btn.textContent = '■';
    const w = cell.words || [];
    const tick = () => { if (!cur || cur.audio !== audio) return; const t = audio.currentTime * 1000;
      spans.forEach((s, k) => s.classList.toggle('on', !!w[k] && t >= w[k].t0 && t < Math.max(w[k].t1, w[k].t0 + 60)));
      cur.raf = requestAnimationFrame(tick); };
    audio.onended = () => { const d = cur && cur.done; cur.done = null; stop(); d && d(true); };
    audio.play().then(tick).catch(() => { stop(); res(false); });
  });
}
const root = document.getElementById('games');
for (const g of DATA.games) {
  const h = $('h2', { text: g.id });
  const allBtns = {};
  const thead = $('tr', {}, $('th', { text: 'line' }));
  for (const e of E) { const b = $('button', { class: 'all', text: '▶ all' }); allBtns[e] = b; thead.append($('th', {}, document.createTextNode(e), b)); }
  const tb = $('tbody'); const rowsUi = [];
  for (const r of g.rows) {
    const tx = $('div', { class: 'txt' }); const chars = [];
    const tr = $('tr', {}, $('td', {}, tx, $('div', { class: 'id', text: `${r.id} · ${r.role}` })));
    const ui = { r, cells: {} };
    for (const e of E) {
      const c = r.cells[e]; const td = $('td');
      if (!c || !c.src) { td.append($('span', { class: 'miss', text: c ? 'no audio (engine failed)' : '—' })); tr.append(td); continue; }
      const btn = $('button', { class: 'play', text: '▶', 'aria-label': `play ${e}` });
      const meta = $('span', { class: 'num', text: `${(c.dur / 1000).toFixed(2)} s · CER ${fmt(c.cer, 2)}${c.cps ? ' · ' + c.cps + ' 字/s' : ''}` });
      const fl = $('div');
      if (!c.flags.length) fl.append($('span', { class: 'b ok', text: 'clean' }));
      c.flags.forEach(f => fl.append($('span', { class: 'b ' + (c.hard.includes(f) ? 'hard' : 'soft'), text: f })));
      if (c.takes > 1) fl.append($('span', { class: 'b soft', text: `seed ${c.seed} · best of ${c.takes}` }));
      td.append($('div', { class: 'cell' }, $('div', { class: 'row1' }, btn, meta), fl, $('div', { class: 'hyp', text: 'ASR: ' + (c.hyp || '∅') })));
      tr.append(td); ui.cells[e] = { c, btn };
    }
    // subtitle spans follow the first engine that has word timings
    const ref = E.map(e => r.cells[e]).find(c => c && c.words) ;
    (ref ? ref.words.map(w => w.ch) : [...r.text]).forEach(ch => { const s = $('span', { class: 'ch', text: ch }); chars.push(s); tx.append(s); });
    for (const e of E) { const u = ui.cells[e]; if (u) u.btn.onclick = () => (cur && cur.btn === u.btn) ? stop() : play(u.c, u.btn, chars); }
    ui.chars = chars; rowsUi.push(ui); tb.append(tr);
  }
  for (const e of E) allBtns[e].onclick = async () => { for (const u of rowsUi) { const x = u.cells[e]; if (!x) continue; if (!(await play(x.c, x.btn, u.chars))) break; await new Promise(r => setTimeout(r, 250)); } };
  root.append(h, $('div', { class: 'wrap' }, $('table', {}, $('thead', {}, thead), tb)));
}
</script></body></html>
"""


def make(games, engines, out: Path | None = None) -> Path:
    data = collect(games, engines)
    out = Path(out or (config.VOICE_HOME / "compare.html"))
    out.write_text(TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/")), "utf-8")
    print(f"[compare] {out}  ({sum(len(g['rows']) for g in data['games'])} lines x {len(engines)} engines)")
    return out
