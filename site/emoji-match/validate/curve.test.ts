/**
 * V5 curve shape (spec §4.3, §9.2) on the tuned evidence in levels.json, plus the endurance model
 * (§0A.4: 4–6 weeks at 3 sessions × 12 min) and the constellation gates (last gate ≤ 1.1 × the
 * expected first-pass stars). The evidence itself is re-derived by the simulator on the real engine
 * (`node tools/emoji-match/tune.mjs --compare` → 40/40 identical).
 */
import { describe, expect, it } from 'vitest';
import constellations from '../../../content/emoji-match/constellations.json';
import { EPISODES, LEVELS } from '../src/content';
import { curveReport, GATES, PER_WEEK, SESSION_MIN } from '../../../tools/emoji-match/sim/curve';
import { bandOf } from '../../../tools/emoji-match/sim/difficulty';

describe('V5 curve', () => {
  const rep = curveReport(EPISODES, LEVELS);
  it('every level carries bot evidence and sits in its band', () => {
    for (const d of LEVELS) {
      const s = d.sim as Record<string, number>;
      for (const k of ['K', 'G', 'R', 'L', 'KH', 'Kho']) expect(typeof s?.[k], `${d.id}.${k}`).toBe('number');
      const [lo, hi] = bandOf(d);
      expect(s.K).toBeGreaterThanOrEqual(lo); expect(s.K).toBeLessThanOrEqual(hi);
    }
  });
  it('curve rules (T ≥ .95, R ≥ .88, boss ≤ H + .03, adjacent drop ≤ .30, L ≥ .70, H/B guards, held-out ±.05)', () => {
    expect(rep.errs).toEqual([]);
    expect(rep.maxDrop).toBeLessThanOrEqual(0.30);
  });
  it('endurance: fixed content ≈ 3.5–6 weeks of 3 × 12 min (model and ×1.5 conservative)', () => {
    const wk = SESSION_MIN * PER_WEEK, total = rep.totalMin + rep.puzzleMin;
    expect(total / wk).toBeGreaterThan(3.4);
    expect((total * 1.5) / wk).toBeLessThan(6.5);
  });
  it('constellation gates = constellations.json and the last ≤ 1.1 × expected first-pass stars', () => {
    expect((constellations as { constellations: { gate: number }[] }).constellations.map((c) => c.gate)).toEqual(GATES);
    expect(GATES[GATES.length - 1]).toBeLessThanOrEqual(1.1 * rep.expectedStars);
  });
});
