#!/usr/bin/env node
/**
 * Scores narration takes by ASR -> pinyin-pro TONED syllables against the spoken text (norm ?? text), and picks a seed per line.
 * Takes are voice-pipeline QC report rows (tools/voice, one row per synthesised line): either the real ids (default seed) or
 * candidate lines `alt.<id>.<seed>` built in a scratch game. A take is "consistent" when every toned syllable agrees and the
 * pipeline raised no hard QC flag. Honest limit: this only says the ASR heard the expected words with the expected toned
 * syllables - it cannot judge tone realisation, accent or naturalness (dad's ear does).
 * usage: node site/mars-base/tools/voice-pick-seeds.mjs REPORT.json OUT.json [--ids a,b,c]
 */
import fs from 'node:fs';
import { pinyin } from 'pinyin-pro';

const [report, outFile, ...rest] = process.argv.slice(2);
const only = rest[0] === '--ids' ? new Set(rest[1].split(',')) : null;
const rep = JSON.parse(fs.readFileSync(report, 'utf8'));
const py = (t) => pinyin(t.replace(/[^㐀-鿿A-Za-z]/g, ''), { toneType: 'num', type: 'array', v: true }).map((s) => (/\d$/.test(s) ? s : s + '5'));
const bare = (s) => s.replace(/\d$/, '');
function align(a, b) {
  const cost = (x, y) => (x === y ? 0 : bare(x) === bare(y) ? 0.5 : 1);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost(a[i - 1], b[j - 1]));
  const ops = []; let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + cost(a[i - 1], b[j - 1])) { if (cost(a[i - 1], b[j - 1])) ops.push(`${a[i - 1]}>${b[j - 1]}`); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push(`${a[i - 1]}>_`); i--; }
    else { ops.push(`_>${b[j - 1]}`); j--; }
  }
  return { distance: d[a.length][b.length], ops: ops.reverse() };
}
const by = {};
for (const r of rep.clips) {
  const m = /^alt\.(.+)\.(\d+)$/.exec(r.id);
  const id = m ? m[1] : r.id; if (only && !only.has(id)) continue;
  if (!r.qc) continue;
  const { distance, ops } = align(py(r.spoken), py(r.qc.hyp));
  (by[id] ??= []).push({ seed: m ? +m[2] : r.seed, d: distance, ops, hard: r.qc.hard ?? [], hyp: r.qc.hyp, ms: r.durationMs, spoken: r.spoken });
}
const out = {};
for (const [id, rows] of Object.entries(by)) {
  rows.sort((a, b) => a.seed - b.seed);
  const good = rows.filter((r) => r.d === 0 && r.hard.length === 0);
  const pick = good[0] ?? [...rows].sort((a, b) => a.d - b.d || a.hard.length - b.hard.length || a.seed - b.seed)[0];
  out[id] = { seed: pick.seed, distance: pick.d, ops: pick.ops, consistent: pick.d === 0 && pick.hard.length === 0, hyp: pick.hyp, spoken: pick.spoken, tried: rows.map((r) => `${r.seed}:${r.d}${r.hard.length ? '!' + r.hard.join('+') : ''}`).join(' ') };
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
const bad = Object.entries(out).filter(([, v]) => !v.consistent);
console.log(`${Object.keys(out).length} lines, ${Object.keys(out).length - bad.length} consistent, ${bad.length} not`);
for (const [id, v] of bad) console.log(id.padEnd(18), `seed ${v.seed} d=${v.distance}`, v.ops.join(' '), '|', v.spoken, '=>', v.hyp, '|', v.tried);
