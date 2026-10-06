import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
// @ts-expect-error -- plain ESM helper with JSDoc types
import { lintTone } from '../../../tools/check-content.mjs';
import lines from '../../../content/military-chess/lines.json';

const ROOT = path.resolve(__dirname, '../../..');
const YAML = fs.readFileSync(path.join(ROOT, 'content/military-chess/narration.yaml'), 'utf8');
const L = lines as Array<{ id: string; role: string; text: string; pinyin?: Record<string, string> }>;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []));
}

describe('narration lines (spec §7.3)', () => {
  test('narration.yaml: every line is a JSON flow mapping, in sync with lines.json', () => {
    const entries = YAML.split('\n').filter((l) => l.trim().startsWith('- {')).map((l) => JSON.parse(l.trim().slice(2)));
    expect(entries.length).toBe(L.length);
    expect(entries.map((e) => ({ id: e.id, role: e.role, text: e.text }))).toEqual(L.map((l) => ({ id: l.id, role: l.role, text: l.text })));
    expect(YAML).toMatch(/^game: military-chess$/m);
  });
  test('342 lines (the spec 340 + 2 for the 残局 locks), unique ids, roles narrator / companion / word', () => {
    expect(L.length).toBe(342);
    expect(new Set(L.map((l) => l.id)).size).toBe(L.length);
    for (const l of L) expect(['narrator', 'companion', 'word']).toContain(l.role);
  });
  test('no template variables, no arabic digits; tone lint clean; bubble lengths', () => {
    for (const l of L) {
      expect(l.text, l.id).not.toMatch(/[{}]/);
      expect(l.text, l.id).not.toMatch(/[0-9]/);
      expect(lintTone(l.text), l.id).toEqual([]);
      if (l.id.startsWith('mc.i.')) expect([...l.text].length, l.id).toBeLessThanOrEqual(15);
      if (l.role === 'companion') expect([...l.text].length, l.id).toBeLessThanOrEqual(24);
    }
  });
  test('lines with the child\'s name have a .plain twin', () => {
    const ids = new Set(L.map((l) => l.id));
    for (const l of L) if (l.text.includes('小步步')) expect(ids.has(l.id + '.plain'), l.id).toBe(true);
  });
  test('every line id referenced by the game code exists', () => {
    const ids = new Set(L.map((l) => l.id));
    const files = walk(path.join(ROOT, 'site/military-chess/src'));
    const missing: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/'(mc\.[a-z0-9.一-鿿]+)'/g)) {
        const id = m[1];
        if (/^mc\.(rail|boom|mine|shovel|whistle|reveal|sting|flag|handoff|tally)$/.test(id)) continue; // synth sound names
        if (id.endsWith('.')) continue; // prefixes built at runtime (checked below)
        if (!ids.has(id)) missing.push(`${path.relative(ROOT, f)}: ${id}`);
      }
    }
    // runtime-built ids
    for (const n of ['工兵', '排长', '连长', '营长', '团长', '旅长', '师长', '军长', '司令', '炸弹', '地雷', '军旗']) expect(ids.has(`mc.w.${n}`)).toBe(true);
    for (const r of ['flag', 'mine', 'bomb', 'keep', 'camp']) expect(ids.has(`mc.why.deploy.${r}`)).toBe(true);
    for (const t of ['balanced', 'fortress', 'lightning', 'mine']) expect(ids.has(`mc.dep.t.${t}`)).toBe(true);
    expect(missing).toEqual([]);
  });
  test('no Math.random in the game code (seeded createRng only)', () => {
    for (const f of walk(path.join(ROOT, 'site/military-chess/src'))) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random/);
  });
});
