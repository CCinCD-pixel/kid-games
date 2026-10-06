#!/usr/bin/env node
// @ts-check
/**
 * content/snake-battle/narration.yaml → content/snake-battle/lines.json (spec §7.4).
 *
 *   node tools/snake-battle/narration-json.mjs [--check]
 *
 * The yaml is the block subset the voice pipeline reads (`- id:` / `role:` / `text:` / `norm:` /
 * `pinyin: { 长到: zhǎng dào }`). lines.json is the bundled text manifest: subtitles + the system
 * zh-CN voice work before the voice step has produced any clips. `--check` exits 1 when stale.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const YAML = path.join(ROOT, 'content/snake-battle/narration.yaml');
const OUT = path.join(ROOT, 'content/snake-battle/lines.json');

/** @param {string} src */
export function parseNarration(src) {
  /** @type {Array<Record<string, any>>} */
  const lines = [];
  let cur = null;
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = /^\s*(- )?([a-z]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, dash, key, val] = m;
    if (dash && key === 'id') { cur = { id: val.trim() }; lines.push(cur); continue; }
    if (!cur) continue;
    if (key === 'pinyin') {
      const body = val.trim().replace(/^\{|\}$/g, '');
      /** @type {Record<string,string>} */
      const map = {};
      for (const part of body.split(',')) { const [k, v] = part.split(':'); if (k && v) map[k.trim()] = v.trim(); }
      cur.pinyin = map;
    } else cur[key] = val.trim().replace(/^['"]|['"]$/g, '');
  }
  return lines;
}

const lines = parseNarration(fs.readFileSync(YAML, 'utf8'));
const json = JSON.stringify(lines, null, 1) + '\n';
if (process.argv.includes('--check')) {
  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (old !== json) { console.error('lines.json is stale: run node tools/snake-battle/narration-json.mjs'); process.exit(1); }
  console.log(`lines.json up to date (${lines.length} lines)`);
} else {
  fs.writeFileSync(OUT, json);
  const long = lines.filter((l) => [...l.text.replace(/\{[a-z]+\}/g, 'XX')].length > 15);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${lines.length} lines; >15 chars: ${long.map((l) => l.id).join(', ') || 'none'}`);
}
