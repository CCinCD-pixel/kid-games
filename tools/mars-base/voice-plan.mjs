#!/usr/bin/env node
// Voice-step staging for 火星基地 (docs/VOICE.md "Part files" + "Memory-safe procedure"). Does NOT run any model.
//   node tools/mars-base/voice-plan.mjs            # (re)creates ~/kid-games-work/voice-stage/mars-base/{full,b01..b12} + run.sh and prints the plan
// full/narration/  = symlinks: mars-base.yaml → content/mars-base/narration.yaml, mars-base.numbers.yaml → …numbers.yaml, _lexicon.yaml, overrides, _takes
// bNN/narration/   = a slice of the same lines (real file) — a batch only WARMS the content-addressed TTS/QC caches (output goes to out-bNN, never to the repo);
//                    the final `full` build then assembles the manifest from cache in minutes and is the only one that writes public/audio/mars-base (+ --prune).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAGE = path.join(os.homedir(), 'kid-games-work/voice-stage/mars-base');
const text = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const split = (y) => { const head = y.slice(0, y.indexOf('lines:\n') + 7); const items = y.slice(head.length).split(/\n(?=  - id: )/).map((x) => x.replace(/\n+$/, '')); return { head, items }; };
const idOf = (it) => it.match(/id: (\S+)/)[1];
const base = split(text('content/mars-base/narration.yaml')).items; const nums = split(text('content/mars-base/narration.numbers.yaml')).items;
const n = (it) => Number(idOf(it).replace('mars.num.', ''));
const ten = (it) => n(it) <= 120 || n(it) % 10 === 0;
const lowNums = nums.filter(ten); const restNums = nums.filter((it) => !ten(it));
const chunk = (a, k) => { const sz = Math.ceil(a.length / k); return Array.from({ length: k }, (_, i) => a.slice(i * sz, (i + 1) * sz)).filter((x) => x.length); };
const batches = [...chunk(base, 4), ...chunk(lowNums, 2), ...chunk(restNums, 6)];
const link = (src, dst) => { fs.rmSync(dst, { force: true, recursive: true }); fs.symlinkSync(src, dst); };
const mk = (dir) => { fs.mkdirSync(path.join(dir, 'narration'), { recursive: true }); link(path.join(ROOT, 'content/narration/_lexicon.yaml'), path.join(dir, 'narration/_lexicon.yaml')); link(path.join(ROOT, 'content/narration/overrides'), path.join(dir, 'narration/overrides')); fs.mkdirSync(path.join(ROOT, 'content/mars-base/_takes'), { recursive: true }); link(path.join(ROOT, 'content/mars-base/_takes'), path.join(dir, 'narration/_takes')); };
fs.mkdirSync(STAGE, { recursive: true });
mk(path.join(STAGE, 'full')); link(path.join(ROOT, 'content/mars-base/narration.yaml'), path.join(STAGE, 'full/narration/mars-base.yaml')); link(path.join(ROOT, 'content/mars-base/narration.numbers.yaml'), path.join(STAGE, 'full/narration/mars-base.numbers.yaml'));
const head = split(text('content/mars-base/narration.yaml')).head.replace(/^#.*\n/, '# slice (voice-plan.mjs) of content/mars-base/narration*.yaml\n');
batches.forEach((b, i) => { const dir = path.join(STAGE, `b${String(i + 1).padStart(2, '0')}`); mk(dir); fs.writeFileSync(path.join(dir, 'narration/mars-base.yaml'), head + b.join('\n') + '\n'); });
const nb = batches.length; const pad = (i) => String(i).padStart(2, '0');
fs.writeFileSync(path.join(STAGE, 'run.sh'), `#!/bin/bash
# usage: run.sh <01..${pad(nb)}|full>   — ONE foreground model process chain per call (≤ 20-line guarded workers inside); never run two at once.
set -euo pipefail
export VOICE_HOME=\${VOICE_HOME:-$HOME/kid-games-work/voice}
free=$(memory_pressure -Q | awk -F': ' '/free percentage/{gsub("%","",$2);print $2+0}'); [ "\${free:-100}" -ge 25 ] || { echo "only \${free}% free — wait (sleep 60) and retry"; exit 75; }
cd ${ROOT}
if [ "$1" = full ]; then
  tools/voice/voice.sh build --game mars-base --engine qwen3 --content ${STAGE}/full --out ${ROOT} --prune
  node tools/mars-base/voice-split-manifest.mjs
else
  tools/voice/voice.sh build --game mars-base --engine qwen3 --content ${STAGE}/b$1 --out ${STAGE}/out-b$1
fi
`, { mode: 0o755 });
console.log(`staging: ${STAGE}\nbatches (${nb}): ${batches.map((b, i) => `b${pad(i + 1)}=${b.length}`).join(' ')}  (sentences+fragments ${base.length}, numbers ${nums.length})`);
console.log(`run each:  ${STAGE}/run.sh 01 … ${pad(nb)}   then   ${STAGE}/run.sh full   (assembles public/audio/mars-base, splits numbers-manifest.json)`);
