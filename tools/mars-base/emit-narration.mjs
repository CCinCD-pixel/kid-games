#!/usr/bin/env node
// Emit the narration YAML of 火星基地 from content/mars-base/lines.json (single source) — spec §7.2 / appendix A5.
//   node tools/mars-base/emit-narration.mjs --scope v1 --count           # print the counts, gate: sentences ≤ 400, total ≤ 1450
//   node tools/mars-base/emit-narration.mjs --scope v1 --write        # content/mars-base/narration.yaml (sentences + fragments) + narration.numbers.yaml (mars.num.*)
//   node tools/mars-base/emit-narration.mjs --scope v1 --out some.yaml  # everything in one file (ad hoc)
//   Layout = gear-fort's: `narration.yaml` + part file `narration.numbers.yaml`, staged for the voice pipeline by tools/mars-base/voice-plan.mjs
//   (docs/VOICE.md "Part files"); audio is NOT generated here — see the voice-step note in ~/kid-games-work/state/rr/progress-build-mars.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i < 0 ? dflt : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const scope = opt('scope', 'v1');
const { lines } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/mars-base/lines.json'), 'utf8'));
const picked = lines.filter((l) => l.scope === scope);
const nums = picked.filter((l) => l.id.startsWith('mars.num.'));
const frags = picked.filter((l) => l.fragment && !l.id.startsWith('mars.num.'));
// "templated" lines carry a {n}/{d}/{zone}… placeholder: a TTS model would read the braces, so they are NOT synthesised as sentence clips. At run time
// they are spoken as fragment + number clips (voice/compose.ts, not built) or, until then, by the speech fallback with the filled-in text (always shown).
const templated = picked.filter((l) => !l.fragment && !l.devOnly && /\{\w+\}/.test(l.text));
const sentences = picked.filter((l) => !l.fragment && !l.devOnly && !templated.includes(l));
if (opt('count', false)) {
  console.log(`scope ${scope}: ${picked.length - templated.length} clips = ${sentences.length} sentences + ${frags.length} fragments + ${nums.length} numbers  (+ ${templated.length} templated lines kept out of the TTS set: ${templated.map((l) => l.id.replace(/^mars\./, '')).join(' ')})`);
  const bad = [];
  if (scope === 'v1' && sentences.length > 400) bad.push(`sentences ${sentences.length} > 400`);
  if (scope === 'v1' && picked.length - templated.length > 1450) bad.push(`total ${picked.length - templated.length} > 1450`);
  if (bad.length) { console.error('FAIL ' + bad.join('; ')); process.exit(1); }
  console.log('within the gate (sentences ≤ 400, total ≤ 1450)');
}
const q = (s) => JSON.stringify(s);
const yamlOf = (ls, what) => {
  const out = ['# GENERATED from content/mars-base/lines.json (scope ' + scope + ', ' + what + ') by tools/mars-base/emit-narration.mjs — do not edit', 'game: mars-base', 'lines:'];
  for (const l of ls) {
    out.push(`  - id: ${l.id}`, `    role: ${l.role}`, `    text: ${q(l.text)}`);
    if (l.norm && l.norm !== l.text) out.push(`    norm: ${q(l.norm)}`);
    // `fragment` (head 0 / tail 20 ms clips for overlapped composition) is a kit/voice request (docs: kit requests); not emitted until the pipeline knows it
  }
  return out.join('\n') + '\n';
};
const dest = opt('out', null);
if (dest && dest !== true) { fs.writeFileSync(path.resolve(ROOT, dest), yamlOf(picked, 'all')); console.log(`wrote ${dest} (${picked.length} lines)`); }
if (opt('write', false)) {
  const base = picked.filter((l) => !l.id.startsWith('mars.num.') && !l.devOnly && !templated.includes(l));
  fs.writeFileSync(path.join(ROOT, 'content/mars-base/narration.yaml'), yamlOf(base, 'sentences + fragments'));
  fs.writeFileSync(path.join(ROOT, 'content/mars-base/narration.numbers.yaml'), yamlOf(nums, 'numbers 0-1000'));
  console.log(`wrote content/mars-base/narration.yaml (${base.length}; ${templated.length} templated lines left out) + narration.numbers.yaml (${nums.length})`);
}
