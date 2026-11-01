#!/usr/bin/env node
/**
 * Objective pronunciation audit (never plays audio). Combines the tone audit (tone.json, our pitch tracker) and the ASR
 * transcripts (asr.json, paraformer) with pinyin-pro toned pinyin:
 *   - syllables: ASR text -> toned pinyin vs the syllable of the SOURCE file (exact / tone differs / sound differs)
 *   - narration lines (yaml spoken text = norm ?? text) and word clips: ASR text vs spoken text, syllable by syllable
 * Honest limits: paraformer is a language-model ASR - isolated syllables come back as frequent words and it cannot judge tone or
 * accent; the pitch tracker names 4 shapes. A pass is NOT proof of correct pronunciation, a mismatch is a lead for the ear.
 * usage: node pronunciation-audit.mjs [OUT_DIR]   (default ~/kid-games-work/pinyin-audit/out-r3; needs tone.json + asr.json)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinyin } from 'pinyin-pro';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const OUT = process.argv[2] ?? path.join(os.homedir(), 'kid-games-work/pinyin-audit/out-r3');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8'));
const yaml = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'content/narration/pinyin-station.yaml'), 'utf8')).lines.map((l) => [l.id, l]));
const asr = JSON.parse(fs.readFileSync(path.join(OUT, 'asr.json'), 'utf8'));
const tone = JSON.parse(fs.readFileSync(path.join(OUT, 'tone.json'), 'utf8'));

const py = (text) => pinyin(text.replace(/[^㐀-鿿A-Za-z]/g, ''), { toneType: 'num', type: 'array', v: true }).map((s) => (/\d$/.test(s) ? s : s + '5'));
const toneless = (s) => s.replace(/\d$/, '');
const nameToPinyin = (name) => name.replace(/uu/g, 'v');

// ---- syllables ------------------------------------------------------------------------------------------------------
const syl = [];
const seen = new Set();
for (const [id, c] of Object.entries(manifest)) {
  if (!id.startsWith('py.syl.')) continue;
  const file = c.src.split('/').pop();
  const name = /^human\.(.+?)\.[0-9a-f]{8}\./.exec(file)?.[1];
  if (!name || seen.has(file)) continue;
  seen.add(file);
  const expected = nameToPinyin(name);
  const heard = [asr[id].raw, asr[id].norm];
  const cands = heard.flatMap((t) => (t ? py(t) : []));
  const verdict = cands.includes(expected) ? 'exact' : cands.some((s) => toneless(s) === toneless(expected)) ? 'tone-differs' : 'sound-differs';
  const t = tone.clips.find((r) => r.file === file);
  syl.push({ name, ids: (tone.clips.find((r) => r.file === file)?.ids) ?? [id], expected, heardRaw: asr[id].raw, heardNorm: asr[id].norm, heardPinyin: [...new Set(cands)], verdict,
    tone: t ? { expected: t.expectedTone, predicted: t.predictedTone, confidence: t.confidence } : null });
}
const count = (rows, f) => rows.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {});

// ---- narration lines + words ---------------------------------------------------------------------------------------
function align(a, b) {
  // Levenshtein over syllable arrays: equal toned = 0, same sound other tone = .5, else 1
  const cost = (x, y) => (x === y ? 0 : toneless(x) === toneless(y) ? 0.5 : 1);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost(a[i - 1], b[j - 1]));
  const ops = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + cost(a[i - 1], b[j - 1])) { if (cost(a[i - 1], b[j - 1])) ops.push([a[i - 1], b[j - 1]]); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push([a[i - 1], '']); i--; }
    else { ops.push(['', b[j - 1]]); j--; }
  }
  return { distance: d[a.length][b.length], ops: ops.reverse() };
}
const lines = [];
for (const [id, c] of Object.entries(manifest)) {
  if (id.startsWith('py.syl.')) continue;
  const y = yaml[id];
  const spoken = (y?.norm ?? y?.text ?? c.text).replace(/\{\w+\}/g, '');
  const exp = py(spoken), got = py(asr[id].raw);
  const { distance, ops } = align(exp, got);
  lines.push({ id, role: c.role, text: c.text, spoken, heard: asr[id].raw, distance, ops, latin: /[A-Za-z]/.test(asr[id].raw) });
}
const flagged = lines.filter((l) => l.distance > 0 || l.latin).sort((a, b) => b.distance - a.distance);
const report = {
  generated: new Date().toISOString(),
  syllables: { count: syl.length, byVerdict: count(syl, (r) => r.verdict), rows: syl },
  tone: tone.summary,
  lines: { count: lines.length, flagged: flagged.length, rows: lines },
};
fs.writeFileSync(path.join(OUT, 'pronunciation-audit.json'), JSON.stringify(report, null, 1));
const md = [`# pronunciation audit (${report.generated})`, '',
  `syllable files ${syl.length}: ${JSON.stringify(report.syllables.byVerdict)}`,
  `tone shape (pitch tracker): ${tone.summary.correct}/${tone.summary.files} = ${tone.summary.accuracy}; wrong ${tone.summary.wrong.join(' ')}; low confidence ${tone.summary.lowConfidence.join(' ')}`,
  `narration/word clips ${lines.length}: flagged ${flagged.length}`, '', '| id | spoken | ASR heard | syllable differences (expected→heard) |', '|---|---|---|---|',
  ...flagged.map((l) => `| ${l.id} | ${l.spoken} | ${l.heard} | ${l.ops.map(([a, b]) => `${a || '∅'}→${b || '∅'}`).join(' ')}${l.latin ? ' LATIN' : ''} |`)];
fs.writeFileSync(path.join(OUT, 'pronunciation-audit.md'), md.join('\n') + '\n');
console.log(md.slice(0, 4).join('\n'));
