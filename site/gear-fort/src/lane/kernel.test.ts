// Kernel contracts (spec §8.2, §8.9): rules equal the frozen data; src/lane/** is theme-free (no CJK, no theme/kit/DOM
// imports) and deterministic (no Math.random / Date / performance / transcendental math); the page never imports bots.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as R from './rules';
import { UNITS, ENEMIES } from './tables';

const DIR = __dirname;
const SRC = path.resolve(DIR, '..');
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [path.join(d, e.name)] : []);
const RULES = JSON.parse(fs.readFileSync(path.resolve(SRC, '../../../content/gear-fort/rules.json'), 'utf8')) as Record<string, unknown>;

describe('kernel contracts', () => {
  it('rule constants equal content/gear-fort/rules.json', () => {
    for (const [k, v] of Object.entries(RULES)) expect((R as Record<string, unknown>)[k], k).toEqual(v);
    expect(R.sec(6)).toBe(120);
  });
  it('13 v1 cards and 9 v1 machines (+ 铜盾甲兵) in the tables', () => {
    expect(Object.entries(UNITS).filter(([, u]) => u.v1).length).toBe(13);
    expect(Object.entries(ENEMIES).filter(([, e]) => e.v1).length).toBe(9);
    expect(ENEMIES.shielder_m).toBeTruthy(); // 铜盾甲兵: data flagged v2, first appears in 2-10 (举一反三)
  });
  it('src/lane/** is theme-agnostic and deterministic', () => {
    const bad: string[] = [];
    for (const f of files(DIR)) {
      const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/[一-鿿]/.test(src)) bad.push(`${path.basename(f)}: CJK`);
      if (/from '(?:\.\.\/theme|@kit|\.\.\/render|\.\.\/screens)/.test(src)) bad.push(`${path.basename(f)}: theme/kit/DOM import`);
      if (/Math\.(random|sin|cos|tan|exp|log|sqrt|pow|hypot|atan2)\b|\bDate\b|performance\./.test(src)) bad.push(`${path.basename(f)}: non-deterministic call`);
      if (/(?<![.\w])(?:document|window)\./.test(src)) bad.push(`${path.basename(f)}: DOM`);
    }
    expect(bad).toEqual([]);
  });
  it('the page entry never imports the bots (makeK / makeC stay out of the bundle)', () => {
    const page = files(SRC).filter((f) => !f.includes(`${path.sep}bots${path.sep}`) && !f.includes(`${path.sep}lane${path.sep}`));
    const bad = page.filter((f) => /from '\.\.?\/(?:\.\.\/)?bots\/(?:k|c|run|evaluate|common)'/.test(fs.readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
  it('art parts are shaded only through shadePart (no flat fills in parts.ts)', () => {
    const src = fs.readFileSync(path.resolve(SRC, 'art/parts.ts'), 'utf8');
    expect(/fillStyle\s*=/.test(src)).toBe(false);
  });
});
