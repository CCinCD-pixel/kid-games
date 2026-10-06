/**
 * V14 (palette half; the pixel read-back half is in tests/shots.spec.ts): every AI body colour and every
 * energy colour stands apart from each floor's three tones — CIEDE2000 ≥ 25 against the floor's mid tone,
 * and his skins are kept findable by the white outline (checked for contrast ≥ 2:1 on every tone).
 */
import { describe, expect, it } from 'vitest';
import { FLOORS, AI_NAMES } from '../src/sim/venues';
import { STAR_COLORS, hex2rgb, aiBodyOn } from '../src/render/art';
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
    it(`${v}: his white outline ≥ 2:1 on every floor tone`, () => { for (const t of tones) expect(contrast([255, 255, 255], hex2rgb(t))).toBeGreaterThanOrEqual(2); });
  }
});
