/** V6 puzzles (spec §4.5, §9.2): exhaustive solve on the real engine + the v1.1 acceptance rules. */
import { describe, expect, it } from 'vitest';
import { accept, applyMove, isWon, newGame, parseLevel, solve } from '../src/core';
import { stepToOp } from '../src/core/expect';
import { PUZZLES } from '../src/content';

describe('V6 puzzles', () => {
  it.each(PUZZLES.map((p) => [p.id, p] as const))('%s', (_id, p) => {
    const r = solve(p, p.par, p.trick);
    const v = accept(r, { par: p.par, maxDepth: p.maxDepth, minLegal: 4 });
    expect(v.why).toEqual([]);
    for (const line of [p.solution, ...p.lines]) {
      const st = newGame(parseLevel({ ...p, refill: false, fixedBoard: true }), 0);
      for (const s of line) expect(applyMove(st, stepToOp(st, s).move!).ok).toBe(true);
      expect(isWon(st)).toBe(true);
    }
  });
});
