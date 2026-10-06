#!/usr/bin/env node
// content/military-chess/narration.yaml (one JSON flow mapping per line) → content/military-chess/lines.json
// (id, role, text). The page bundles lines.json; site/military-chess/validate/lines.test.ts asserts both stay in sync.
//   node tools/military-chess/narration-json.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(ROOT, 'content/military-chess/narration.yaml');
const out = path.join(ROOT, 'content/military-chess/lines.json');
const lines = fs.readFileSync(src, 'utf8').split('\n').filter((l) => l.trim().startsWith('- {')).map((l) => {
  const o = JSON.parse(l.trim().slice(2));
  return { id: o.id, role: o.role, text: o.text };
});
const ids = new Set();
for (const l of lines) {
  if (ids.has(l.id)) throw new Error(`duplicate id ${l.id}`);
  ids.add(l.id);
}
fs.writeFileSync(out, JSON.stringify(lines, null, 1) + '\n');
console.log(`narration-json: ${lines.length} lines → ${path.relative(ROOT, out)}`);
