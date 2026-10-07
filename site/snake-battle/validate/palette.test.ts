/**
 * V14 (palette half; the pixel read-back half is in tests/shots.spec.ts): every AI body colour and every
 * energy colour stands apart from each floor's three tones — CIEDE2000 ≥ 25 against the floor's mid tone,
 * and his skins are kept findable by the white outline (checked for contrast ≥ 2:1 on every tone).
 */
import { describe, expect, it } from 'vitest';
import { FLOORS, AI_NAMES } from '../src/sim/venues';
import { STAR_COLORS, hex2rgb, aiBodyOn, SKINS } from '../src/render/art';
import { dE00, contrast } from './color';

describe('V14 palette vs floors', () => {
  const personas = ['forager', 'hunter', 'coiler', 'scavenger', 'skittish', 'daredevil'];
  for (const [v, tones] of Object.entries(FLOORS)) {
    const mid = hex2rgb(tones[1]);
    it(`${v}: AI bodies + energy ΔE00 ≥ 25 vs the mid tone`, () => {
      const bad: string[] = [];
      for (const c of Object.keys(AI_NAMES.palette)) for (const p of personas) { const d = dE00(aiBodyOn(c, p, v), mid); if (d < 25) bad.push(`${c}/${p} ${d.toFixed(1)}`); }
      for (const s of STAR_COLORS) { const d = dE00(hex2rgb(s), mid); if (d < 25) bad.push(`star ${s} ${d.toFixed(1)}`); }
      expect(bad).toEqual([]);
    });
    // QA r2: every tone, not only the mid one. The dark/mid tones hold ≥ 25; the light highlight tone (ridges, bands,
    // the black-hole disc rim) is a regression floor at 14 (measured minimum 14.9: 紫 forager on the black-hole rim)
    it(`${v}: AI bodies + energy stand apart from all three tones (≥ 25 dark/mid, ≥ 14 highlight)`, () => {
      const bad: string[] = [];
      tones.forEach((t, i) => {
        const T = hex2rgb(t), min = i === 2 ? 14 : 25;
        for (const c of Object.keys(AI_NAMES.palette)) for (const p of personas) { const d = dE00(aiBodyOn(c, p, v), T); if (d < min) bad.push(`tone${i} ${c}/${p} ${d.toFixed(1)}`); }
        for (const st of STAR_COLORS) { const d = dE00(hex2rgb(st), T); if (d < min) bad.push(`tone${i} star ${st} ${d.toFixed(1)}`); }
      });
      expect(bad).toEqual([]);
    });
    it(`${v}: every skin keeps its white outline ≥ 2:1 and its accent apart from the body`, () => {
      for (const sk of SKINS) { for (const t of tones) expect(contrast([255, 255, 255], hex2rgb(t))).toBeGreaterThanOrEqual(2); expect(dE00(hex2rgb(sk.base), hex2rgb(sk.accent))).toBeGreaterThan(5); }
    });
    it(`${v}: his white outline ≥ 2:1 on every floor tone`, () => { for (const t of tones) expect(contrast([255, 255, 255], hex2rgb(t))).toBeGreaterThanOrEqual(2); });
  }
});
