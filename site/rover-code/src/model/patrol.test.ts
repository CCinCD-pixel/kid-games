import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cost, parseProg, run, slotsOf } from './sim';
import { TIERS, dailySeed, generatePatrol, shortest, type Tier } from './patrol';

const SEEDS = ['2026-11-09', 'a', 'b', 'c', 'seed-42', '0', '1', '2'];

describe('月面巡逻 generator', () => {
  for (const tier of [1, 2, 3] as Tier[]) {
    it(`tier ${tier}: every seed makes a level that can be solved in exactly the fewest cards, inside the tier's range`, () => {
      for (const seed of SEEDS) {
        const lv = generatePatrol(seed, tier);
        const prog = parseProg(lv.solution.main);
        expect(run(lv, DEFAULT_CONFIG, prog).res, `${seed}`).toBe('win');
        expect(cost(prog)).toBe(lv.expectMin);
        expect(lv.expectMin).toBeGreaterThanOrEqual(TIERS[tier].min[0]);
        expect(lv.expectMin).toBeLessThanOrEqual(TIERS[tier].min[1]);
        expect(lv.slots).toBe(lv.expectMin + 3);
        expect(slotsOf(lv, DEFAULT_CONFIG)).toBe(lv.slots);
        expect(shortest(lv, lv.cards as never)?.n).toBe(lv.expectMin);          // nothing shorter exists
        expect(lv.req.length).toBe(TIERS[tier].samples);
      }
    });
  }
  it('the same seed and tier always make the same level; different seeds make different ones', () => {
    expect(generatePatrol('x', 2).map).toEqual(generatePatrol('x', 2).map);
    const maps = new Set(SEEDS.map((s) => generatePatrol(s, 2).map.join('/')));
    expect(maps.size).toBeGreaterThan(5);
  });
  it('a level with samples cannot be solved without taking them', () => {
    const lv = generatePatrol('s', 3);
    const flat = lv.solution.main;
    expect(flat).toContain('P');
    expect(run(lv, DEFAULT_CONFIG, parseProg(flat.replace(/P/g, ''))).res).not.toBe('win');
  });
  it('the daily seed is the local date', () => { expect(dailySeed(new Date(2026, 10, 9))).toBe('2026-11-09'); });
});
