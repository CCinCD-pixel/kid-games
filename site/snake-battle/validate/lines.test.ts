/**
 * V10 (spec §9.2): every narration id the code can ask for exists — literal ids exactly, template ids by
 * their static prefix — and lines.json (bundled text manifest) is in sync with narration.yaml (the voice
 * step's source).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import lines from '../../../content/snake-battle/lines.json';

const ROOT = path.resolve(__dirname, '../../..');
const IDS = (lines as { id: string; text: string }[]).map((l) => l.id);
const SET = new Set(IDS);
function walk(d: string): string[] { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.ts') ? [path.join(d, e.name)] : []); }

describe('V10 lines', () => {
  it('lines.json ⇔ narration.yaml', () => {
    const yaml = fs.readFileSync(path.join(ROOT, 'content/snake-battle/narration.yaml'), 'utf8');
    const ys = [...yaml.matchAll(/^\s*- id:\s*(\S+)/gm)].map((m) => m[1]);
    expect(ys.length).toBe(238);
    expect([...ys].sort()).toEqual([...IDS].sort());
    for (const l of lines as { id: string; text: string }[]) expect(l.text.trim().length, l.id).toBeGreaterThan(0);
  });
  it('every snake.* id used in src exists', () => {
    const missing: string[] = [];
    for (const f of walk(path.join(ROOT, 'site/snake-battle/src'))) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/['"`](snake\.[a-z0-9_.]+)(\$\{)?/gi)) {
        const id = m[1];
        if (m[2] || id.endsWith('.')) { if (!IDS.some((x) => x.startsWith(id))) missing.push(`${path.basename(f)}: ${id}*`); }
        else if (!SET.has(id)) missing.push(`${path.basename(f)}: ${id}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
