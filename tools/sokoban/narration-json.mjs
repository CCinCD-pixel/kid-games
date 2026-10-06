#!/usr/bin/env node
// @ts-check
/**
 * content/sokoban/narration.yaml → content/sokoban/lines.json (spec §7.3).
 *
 *   node tools/sokoban/narration-json.mjs [--check]
 *
 * The yaml uses one flow mapping per line (`- {id: …, role: …, text: …, pinyin: {…}}`), the subset
 * of YAML the voice pipeline reads too. This tiny parser handles exactly that subset (no deps).
 * lines.json is what the page bundles as its text manifest (subtitles + speech fallback before the
 * voice step has produced clips). `--check` exits 1 when lines.json is out of date.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const YAML = path.join(ROOT, 'content/sokoban/narration.yaml');
const JSON_OUT = path.join(ROOT, 'content/sokoban/lines.json');

/** Parse one YAML flow mapping `{a: b, c: {d: e}}` (plain or quoted scalars). */
export function parseFlowMap(src) {
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i += 1; };
  const scalar = (stops) => {
    ws();
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++];
      let out = '';
      while (i < src.length && src[i] !== q) {
        if (q === '"' && src[i] === '\\') { out += src[i + 1]; i += 2; continue; }
        out += src[i++];
      }
      i += 1;
      return out;
    }
    let out = '';
    while (i < src.length && !stops.includes(src[i])) out += src[i++];
    return out.trim();
  };
  const map = () => {
    ws();
    if (src[i] !== '{') throw new Error(`expected { at ${i}: ${src}`);
    i += 1;
    /** @type {Record<string, unknown>} */
    const obj = {};
    for (;;) {
      ws();
      if (src[i] === '}') { i += 1; return obj; }
      const key = scalar([':']);
      if (src[i] !== ':') throw new Error(`expected : after ${key} in ${src}`);
      i += 1;
      ws();
      obj[key] = src[i] === '{' ? map() : scalar([',', '}']);
      ws();
      if (src[i] === ',') i += 1;
    }
  };
  const out = map();
  ws();
  if (i < src.length && !src.slice(i).trim().startsWith('#')) throw new Error(`trailing text: ${src.slice(i)}`);
  return out;
}

export function parseNarrationYaml(text) {
  /** @type {{ game?: string, seed?: number, lines: { id: string, role: string, text: string, pinyin?: Record<string, string> }[] }} */
  const doc = { lines: [] };
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = line.match(/^(\w+):\s*(.*)$/);
    if (top) {
      if (top[1] === 'game') doc.game = top[2];
      else if (top[1] === 'seed') doc.seed = Number(top[2]);
      continue;
    }
    const item = line.match(/^\s+-\s+(\{.*\})\s*$/);
    if (!item) throw new Error(`unsupported yaml line: ${line}`);
    const m = parseFlowMap(item[1]);
    const rec = { id: String(m.id), role: String(m.role), text: String(m.text) };
    if (m.pinyin && typeof m.pinyin === 'object') rec.pinyin = /** @type {Record<string,string>} */ (m.pinyin);
    doc.lines.push(rec);
  }
  return doc;
}

function main() {
  const doc = parseNarrationYaml(fs.readFileSync(YAML, 'utf8'));
  const ids = new Set();
  for (const l of doc.lines) {
    if (ids.has(l.id)) throw new Error(`duplicate id ${l.id}`);
    ids.add(l.id);
  }
  const body = JSON.stringify(doc.lines, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(JSON_OUT) ? fs.readFileSync(JSON_OUT, 'utf8') : '';
    if (cur !== body) {
      console.error('content/sokoban/lines.json is out of date: run node tools/sokoban/narration-json.mjs');
      process.exit(1);
    }
    console.log(`lines.json up to date (${doc.lines.length} lines)`);
    return;
  }
  fs.writeFileSync(JSON_OUT, body);
  console.log(`wrote content/sokoban/lines.json (${doc.lines.length} lines)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
