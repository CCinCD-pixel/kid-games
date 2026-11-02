import { describe, expect, it } from 'vitest';
import { estimate, isDone, newPlacement, recordProbe, simulateLearner } from '../src/math/placement';
import { seededRandom } from '../src/math/problems';

describe('测起点', () => {
  it('staircase: start 5, +1 per right (+2 after two in a row), -2 per wrong', () => {
    const s = newPlacement();
    expect(s.tier).toBe(5);
    recordProbe(s, true); expect(s.tier).toBe(6);
    recordProbe(s, true); expect(s.tier).toBe(8);
    recordProbe(s, false); expect(s.tier).toBe(6);
    recordProbe(s, false); expect(s.tier).toBe(4);
    for (let i = 0; i < 12; i++) recordProbe(s, false);
    expect(s.tier).toBe(1);
    for (let i = 0; i < 12; i++) recordProbe(s, true);
    expect(s.tier).toBe(10);
  });
  it('always stops in 6-9 questions', () => {
    for (const rights of [[], [true], [false], [true, false]]) {
      const s = newPlacement();
      let guard = 0;
      while (!isDone(s) && guard++ < 20) recordProbe(s, rights.length ? rights[s.probes.length % rights.length] : true);
      expect(s.probes.length).toBeGreaterThanOrEqual(6); expect(s.probes.length).toBeLessThanOrEqual(9);
    }
  });

  const run = (shape: { steepness: number; slip: number }, runs = 1000) => {
    const rng = seededRandom(`place:${shape.steepness}:${shape.slip}`);
    const perLevel: { hit: number; questions: number; low: number; high: number }[] = [];
    let hit = 0, questions = 0, total = 0;
    for (let level = 1; level <= 10; level++) {
      const row = { hit: 0, questions: 0, low: 0, high: 0 };
      for (let i = 0; i < runs / 10; i++) {
        const r = simulateLearner(level, rng, shape);
        const off = r.start - level;
        if (Math.abs(off) <= 1) row.hit++; else if (off < 0) row.low++; else row.high++;
        row.questions += r.questions;
      }
      perLevel.push(row); hit += row.hit; questions += row.questions; total += runs / 10;
    }
    return { hit: hit / total, avg: questions / total, perLevel };
  };

  it('1000 simulated learners (smooth fall-off, 10 % slips): >= 90 % land within one tier, mean <= 9 questions', () => {
    const result = run({ steepness: 1.8, slip: 0.1 });
    console.log(`main model: within ±1 tier ${(result.hit * 100).toFixed(1)} %, mean questions ${result.avg.toFixed(2)}`);
    console.log(result.perLevel.map((r, i) => `L${i + 1}: ${(r.hit / 100 * 100).toFixed(0)}% (low ${r.low}, high ${r.high}, q ${(r.questions / 100).toFixed(1)})`).join('\n'));
    expect(result.hit).toBeGreaterThanOrEqual(0.9);
    expect(result.avg).toBeLessThanOrEqual(9);
    for (const row of result.perLevel) expect(row.hit / 100).toBeGreaterThanOrEqual(0.8);
  });
  it('robustness: steeper / flatter learners and more slips', () => {
    for (const shape of [{ steepness: 2.8, slip: 0.1 }, { steepness: 1.2, slip: 0.1 }, { steepness: 1.8, slip: 0.15 }, { steepness: 1.8, slip: 0.05 }]) {
      const r = run(shape);
      console.log(`steepness ${shape.steepness} slip ${shape.slip}: within ±1 ${(r.hit * 100).toFixed(1)} %, mean q ${r.avg.toFixed(2)}`);
      expect(r.hit).toBeGreaterThanOrEqual(0.8);
      expect(r.avg).toBeLessThanOrEqual(9);
    }
  });
  it('is conservative: a lucky run of wrong guesses at the top does not skip a stage (estimate never above the highest tier answered right + 1)', () => {
    const s = newPlacement();
    [true, true, true, false, false, true].forEach((r) => recordProbe(s, r));
    const highestRight = Math.max(...s.probes.filter((p) => p.right).map((p) => p.tier));
    expect(estimate(s.probes)).toBeLessThanOrEqual(highestRight + 1);
  });
});
