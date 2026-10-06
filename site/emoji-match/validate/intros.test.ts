/** V7 lessons and intro scripts (spec §9.2): every lesson is legal on its fixed board and produces `expect`; every intro step produces its expectations. */
import { describe, expect, it } from 'vitest';
import { newGame, parseLevel } from '../src/core';
import { expectMet, lessonMet, runStep, stepToOp } from '../src/core/expect';
import { INTRO_ORDER, INTROS, LEVELS } from '../src/content';

describe('V7 lessons', () => {
  it.each(LEVELS.filter((d) => d.lesson).map((d) => [d.id, d] as const))('%s', (_id, d) => {
    const L = parseLevel(d);
    const st = newGame(L, 1);
    const ls = d.lesson!;
    const mv = 'tap' in ls ? stepToOp(st, { tap: ls.tap }).move! : stepToOp(st, { from: ls.from, to: ls.to }).move!;
    expect(lessonMet(ls.expect, st, mv).ok).toBe(true);
  });
  it('12 lesson levels', () => expect(LEVELS.filter((d) => d.lesson).length).toBe(12));
});

describe('V7 intro scripts', () => {
  it('22 v1 intro cards in INTRO_ORDER', () => expect(INTROS.map((i) => i.id)).toEqual(INTRO_ORDER));
  it.each(INTROS.map((i) => [i.id, i] as const))('%s', (_id, it0) => {
    const st = newGame(parseLevel({ id: `intro-${it0.id}`, colors: it0.colors ?? 'rygbp', grid: it0.grid, dust: it0.dust, ice: it0.ice, exits: it0.exits, objectives: it0.objectives ?? [{ energy: 999 }], refill: false, fixedBoard: true }), 0, { log: true });
    it0.steps.forEach((s, k) => {
      const { res, a, b } = runStep(st, s);
      for (const e of s.expect) expect(`${k + 1}:${e}:${expectMet(e, st, res, a, b)}`).toBe(`${k + 1}:${e}:true`);
    });
  });
});
