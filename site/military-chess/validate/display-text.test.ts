/** content/military-chess/display-text.txt (font subset input, §8.12 #3) lists every displayed CJK character (QA r3). */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const CJK = /[　-〿㐀-鿿＀-￯]/gu;

test('display-text.txt is current (re-run: node tools/military-chess/dump-text.mjs)', () => {
  const used = new Set<string>();
  const take = (s: string) => { for (const c of s.match(CJK) ?? []) used.add(c); };
  for (const f of ['lines.json', 'lessons.json', 'endgames.json', 'cards.json', 'templates.json']) take(fs.readFileSync(path.join(ROOT, 'content/military-chess', f), 'utf8'));
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []));
  for (const f of walk(path.join(ROOT, 'site/military-chess/src'))) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:])\/\/ .*$/gm, '$1');
    for (const m of src.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) take(m[1] ?? m[2] ?? m[3] ?? '');
  }
  const listed = new Set(fs.readFileSync(path.join(ROOT, 'content/military-chess/display-text.txt'), 'utf8').split('\n').slice(1).join('').match(CJK) ?? []);
  expect([...used].filter((c) => !listed.has(c)).join('')).toBe('');
});
