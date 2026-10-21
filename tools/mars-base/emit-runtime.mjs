#!/usr/bin/env node
// Build-time filter (spec §8.6): write the SLIM runtime line table (scope v1, no number clips) that the game imports.
//   node tools/mars-base/emit-runtime.mjs          → site/mars-base/src/data/lines.v1.json   (id → text)
//   node tools/mars-base/emit-runtime.mjs --check  → exit 1 when the file is out of date (vitest runs the same check)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { lines } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/mars-base/lines.json'), 'utf8'));
const table = {};
for (const l of lines) if (l.scope === 'v1' && !l.id.startsWith('mars.num.')) table[l.id] = l.text;
const out = JSON.stringify(table);
const dest = path.join(ROOT, 'site/mars-base/src/data/lines.v1.json');
if (process.argv.includes('--check')) { const cur = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : ''; if (cur !== out) { console.error('lines.v1.json is out of date — run node tools/mars-base/emit-runtime.mjs'); process.exit(1); } console.log('lines.v1.json up to date'); }
else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, out); console.log(`wrote ${Object.keys(table).length} lines (${out.length} bytes)`); }
