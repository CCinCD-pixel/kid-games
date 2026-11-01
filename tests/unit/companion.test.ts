import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The companion modules touch the DOM only when mounted; lint their source text so this runs in
// Node without a DOM.
const INDEX = fs.readFileSync(path.resolve(__dirname, '../../kit/companion/index.ts'), 'utf8');
const ART = fs.readFileSync(path.resolve(__dirname, '../../kit/companion/art.ts'), 'utf8');

describe('companion house rules (plan §4.4)', () => {
  it('has no sad / crying / disappointed mood', () => {
    for (const src of [INDEX, ART]) {
      const moods = /export const MOODS[^=]*=\s*\[([^\]]*)\]/.exec(src)![1];
      expect(moods).not.toMatch(/sad|cry|upset|disappoint|lonely|angry/i);
      expect(src.replace(/sad moods are intentionally unsupported/, '')).not.toMatch(/['"](sad|crying|disappointed|lonely)['"]/);
    }
    // aliases map only to the seven cheerful moods
    const alias = /const ALIAS[^=]*=\s*\{([^}]*)\}/.exec(ART)![1];
    expect(alias).not.toMatch(/sad|cry|upset|disappoint/i);
  });

  it('kit entry keeps the documented API (drop-in for games written against the stub)', () => {
    expect(INDEX).toContain('export function mount');
    expect(INDEX).toContain('export async function sayLine');
    expect(INDEX).toContain("['idle', 'happy', 'thinking', 'surprised', 'encouraging', 'celebrating', 'sleepy']");
    for (const name of ['setMood(', 'say(', 'hush(', 'react(', 'lookAt(', 'destroy(']) expect(ART).toContain(name);
    expect(ART).toContain("'idle', 'happy', 'thinking', 'surprised', 'encouraging', 'celebrating', 'sleepy'");
  });
});

describe('accessories (setAccessory)', () => {
  it('declares the 军师 and 教练 accessories and the signature reactions', () => {
    expect(ART).toContain("export type AccessoryId = 'junshi' | 'coach'");
    expect(ART).toContain('setAccessory');
    expect(ART).toContain("'fan'");
    expect(ART).toContain("'cap'");
    expect(INDEX).toContain('ACCESSORIES');
    // never adds a sad look through the back door
    expect(ART.slice(ART.indexOf('export type AccPart'), ART.indexOf('/* ------------------------------------------------------------------ mount')).replace(/[^a-z]/gi, ' ')).not.toMatch(/\b(sad|cry|crying|tear|tears)\b/i);
  });

  it('draws well-formed SVG for every accessory part', async () => {
    const { accessorySvg, ACCESSORIES } = await import('../../kit/companion/art');
    for (const kind of ACCESSORIES) {
      for (const part of ['back', 'front', 'hand'] as const) {
        const svg = accessorySvg(kind, part, 'x1');
        expect(svg).not.toMatch(/NaN|undefined|Infinity/);
        expect((svg.match(/<g[ >]/g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length);
        for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) expect(svg, `${kind}/${part} uses #${m[1]}`).toContain(`id="${m[1]}"`);
        const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
    expect(accessorySvg('junshi', 'front', 'x1').length).toBeGreaterThan(500);
    expect(accessorySvg('junshi', 'hand', 'x1')).toContain('b-acc-fan');
    expect(accessorySvg('coach', 'front', 'x1').length).toBeGreaterThan(500);
    expect(accessorySvg('coach', 'hand', 'x1')).toBe('');
  });
});

