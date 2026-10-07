// V9 — 锦囊谜题 (spec §4.10): every shipped drill re-proved on the TS kernel.
// Always: the reference solution holds in the game's multi-lane sim at exactly par (3★), budgets/stars follow the
// group rule, the PvZ habit (P2) fails, every drill needs 2+ cards (P4) and its group's 锦囊 cards (P3).
// GF_PZ=1 (or GF_FULL=1) adds the exact solver: par and the cheapest solution classes equal the frozen data (P1),
// every cheapest solution of every lane uses the machine's feared card (P7 strong form, 26/26 lanes), variety (P5),
// random placement holds <= 5 % and equals the frozen share (P6).
import { describe, expect, it } from 'vitest';
import PZ from '../../../../content/gear-fort/puzzles.json';
import { puzzleSim, puzzleLevel, playLane, solveLane, naiveHolds, randomHolds, costOf, puzzleStars, classOf, lastOf, type Puzzle } from './puzzle';
import { step, canPlace } from './sim';
import { sec } from './rules';

const ALL = (PZ as unknown as { puzzles: Puzzle[] }).puzzles;
const FULL = !!(process.env.GF_PZ || process.env.GF_FULL);
const TARGET: Record<number, string[]> = { 1: ['lobber', 'wall', 'pit'], 2: ['burner', 'spikes', 'beam', 'lobber'], 4: ['lobber', 'burner', 'beam'] };
const runToEnd = (p: Puzzle, placed: { card: string; lane: number; col: number }[]) => {
  const S = puzzleSim(p, placed); const cap = sec(lastOf(p) + 120);
  while (!S.result && S.tick < cap) step(S, null);
  return S;
};

describe('V9 锦囊谜题 (static drills)', () => {
  it('12 drills: P1-01…05, P2-01…05, P2-09, P2-10 with the v1 unlocks', () => {
    expect(ALL.map((p) => p.id)).toEqual(['P1-01', 'P1-02', 'P1-03', 'P1-04', 'P1-05', 'P2-01', 'P2-02', 'P2-03', 'P2-04', 'P2-05', 'P2-09', 'P2-10']);
    for (const p of ALL) expect(p.unlock).toBe(p.group === 1 ? '1-6' : p.group === 2 ? '1-10' : '2-10');
  });
  for (const p of ALL) {
    it(`${p.id}: reference solution holds in the game at par; budget, stars, P2, P3, P4`, () => {
      const placed = p.lanes.flatMap((l) => l.best.map((b) => ({ card: b.card, lane: l.lane, col: b.col })));
      expect(costOf(placed)).toBe(p.par);
      expect(p.lanes.reduce((a, l) => a + l.par, 0)).toBe(p.par);
      expect(p.budget).toBe(p.par + (p.group === 1 ? 0 : 20 * p.lanes.length));
      expect([p.star3, p.star2]).toEqual([p.par, p.par + 40]);
      const S = runToEnd(p, placed);
      expect(S.result).toBe('win');
      expect(S.grain).toBe(p.budget - p.par);
      expect(puzzleStars(p, p.par)).toBe(3);
      // the budget is enforced by the kernel's own placement rule (no cooldowns in a drill)
      const S0 = puzzleSim(p, []); const lane = p.lanes[0].lane;
      expect(canPlace(S0, p.deck[0], lane, 0)).toBeNull();
      expect(puzzleLevel(p).lanes.reduce((a, b) => a + b, 0)).toBe(p.lanes.length);
      for (const l of p.lanes) {
        expect(playLane(l.wave, l.best)).toBe(true);
        expect(naiveHolds(l.wave, l.par + 20, p.group >= 2)).toBe(false); // P2
      }
      expect(new Set(p.lanes.flatMap((l) => l.best.map((b) => b.card))).size).toBeGreaterThanOrEqual(2); // P4
      expect(p.lanes.some((l) => l.classes.some((c) => TARGET[p.group].some((t) => c.split('+').includes(t))))).toBe(true); // P3
    }, 60_000);
  }
  it.runIf(FULL)('P1 + P7 (strong): exact cheapest solutions per lane equal the frozen data; every one uses the feared card', () => {
    const bad: string[] = []; let lanes = 0;
    for (const p of ALL) for (const l of p.lanes) {
      lanes++;
      const s = solveLane(l.wave, p.deck, 3);
      if (s.par !== l.par) bad.push(`${p.id} lane ${l.lane}: par ${s.par} ≠ ${l.par}`);
      if (JSON.stringify(s.classes.slice().sort()) !== JSON.stringify(l.classes.slice().sort())) bad.push(`${p.id} lane ${l.lane}: classes ${s.classes} ≠ ${l.classes}`);
      if (s.classes.length > 3) bad.push(`${p.id} lane ${l.lane}: ${s.classes.length} classes`);
      if (!s.p7all) bad.push(`${p.id} lane ${l.lane}: a cheapest solution skips the feared card`);
      if (classOf(l.best) !== l.classes[0] && !l.classes.includes(classOf(l.best))) bad.push(`${p.id} lane ${l.lane}: best not cheapest`);
    }
    expect(lanes).toBe(26);
    expect(bad).toEqual([]);
  }, 600_000);
  it.runIf(FULL)('P5 variety: every drill adds a lane class the previous one did not use; a class at most 3× per group', () => {
    const bad: string[] = [];
    for (const g of [1, 2, 4]) {
      const ps = ALL.filter((p) => p.group === g); const use: Record<string, number> = {};
      ps.forEach((p, i) => {
        const cls = p.lanes.map((l) => classOf(l.best));
        if (i > 0) { const prev = new Set(ps[i - 1].lanes.map((l) => classOf(l.best))); if (cls.every((c) => prev.has(c))) bad.push(`${p.id}: no new class`); }
        for (const c of cls) use[c] = (use[c] || 0) + 1;
      });
      for (const [c, n] of Object.entries(use)) if (n > 3) bad.push(`group ${g}: ${c} ×${n}`);
    }
    expect(bad).toEqual([]);
  });
  it.runIf(FULL)('P6: random placement within the budget holds <= 5 % (equal to the frozen share)', () => {
    const bad: string[] = [];
    for (const p of ALL) { const r = randomHolds(p.lanes, p.deck, p.budget); if (r > 0.05 || Math.abs(r - p.randomHold) > 1e-9) bad.push(`${p.id}: ${r} (frozen ${p.randomHold})`); }
    expect(bad).toEqual([]);
  }, 600_000);
});
