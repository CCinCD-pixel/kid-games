#!/usr/bin/env node
/**
 * Seed picker for re-synthesised narration lines. Candidate takes are built as `alt.<id>.<seed>` lines in a scratch voice game
 * (never into the repo); this scores each take by ASR -> pinyin-pro toned syllables against the spoken text and picks the first
 * seed whose syllables ALL agree and that has no hard QC flag, else the take with the fewest differences (listed as not consistent).
 * usage: node site/pinyin-station/tools/audit/pick-seeds.mjs [qc-report.json] [out.json]
 * Honest limit: this proves the ASR heard the expected toned syllables, not that a human hears the right tones.
 */
import fs from 'node:fs';
import { pinyin } from 'pinyin-pro';
const rep = JSON.parse(fs.readFileSync(process.argv[2] ?? process.env.HOME + '/kid-games-work/voice/reports/pinyin-alt.qwen3.qc.json', 'utf8'));
const py = (t) => pinyin(t.replace(/[^㐀-鿿A-Za-z]/g, ''), { toneType: 'num', type: 'array', v: true }).map((s) => (/\d$/.test(s) ? s : s + '5'));
const dist = (a, b) => { const c = (x, y) => (x === y ? 0 : x.replace(/\d$/, '') === y.replace(/\d$/, '') ? 0.5 : 1); const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c(a[i - 1], b[j - 1])); return d[a.length][b.length]; };
const by = {};
for (const r of rep.clips) {
  const m = /^alt\.(.+)\.(\d+)$/.exec(r.id); if (!m) continue;
  const d = dist(py(r.spoken), py(r.qc.hyp));
  (by[m[1]] ??= []).push({ seed: +m[2], d, hard: r.qc.hard ?? [], hyp: r.qc.hyp, ms: r.durationMs });
}
const out = {};
for (const [id, rows] of Object.entries(by)) {
  rows.sort((a, b) => a.seed - b.seed);
  const good = rows.filter((r) => r.d === 0 && r.hard.length === 0);
  const pick = good[0] ?? [...rows].sort((a, b) => a.d - b.d || a.hard.length - b.hard.length || a.seed - b.seed)[0];
  out[id] = { pick: pick.seed, d: pick.d, consistent: pick.d === 0 && pick.hard.length === 0, tried: rows.map((r) => `${r.seed}:${r.d}${r.hard.length ? '!' : ''}`).join(' '), hyp: pick.hyp };
  console.log(id.padEnd(18), 'seed', pick.seed, 'd', pick.d, out[id].consistent ? 'OK ' : 'NOT', '|', out[id].tried, '|', pick.hyp);
}
fs.writeFileSync(process.argv[3] ?? process.env.HOME + '/kid-games-work/pinyin-audit/work/seed-picks.json', JSON.stringify(out, null, 1));
