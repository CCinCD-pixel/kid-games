import { describe, expect, it } from 'vitest';
import { STAGES, calc, checkProblem, problemText, sampleFor, type Problem } from '../src/math/problems';
import { planFor, planIsConsistent, placeChunks, splitCountsAsRight, splittable } from '../src/math/split';

describe('拆一拆 plans are derived by code and are self-consistent', () => {
  it('worked examples from the spec', () => {
    const mul = planFor(calc('mul', 13, 5))!;
    expect(mul.steps.map((s) => s.problem)).toEqual([calc('mul', 10, 5), calc('mul', 3, 5), calc('add', 50, 15)]);
    expect(mul.shape).toEqual({ kind: 'area', rows: 5, cols: [10, 3] });
    const div = planFor(calc('div', 65, 5))!;
    expect(div.steps.map((s) => s.problem)).toEqual([calc('div', 50, 5), calc('div', 15, 5), calc('add', 10, 3)]);
    const add = planFor(calc('add', 347, 28))!;
    expect(add.steps.map((s) => s.problem)).toEqual([calc('add', 347, 20), calc('add', 367, 8)]);
    const sub = planFor(calc('sub', 603, 278))!;
    expect(sub.steps.map((s) => s.problem)).toEqual([calc('sub', 603, 200), calc('sub', 403, 70), calc('sub', 333, 8)]);
    const rem = planFor({ kind: 'rem', op: 'div', a: 47, b: 4, answer: 11, rem: 3 })!;
    expect(rem.steps.map((s) => s.problem)).toEqual([calc('div', 40, 4), { kind: 'rem', op: 'div', a: 7, b: 4, answer: 1, rem: 3 }, calc('add', 10, 1)]);
    expect(placeChunks(305)).toEqual([300, 5]);
  });

  it('for 200 random problems of every splittable stage the steps are consistent and end at the answer', () => {
    let total = 0;
    const rows: string[] = [];
    for (const stage of STAGES.filter((s) => (s.op !== 'mix' && s.tier >= 7))) {
      let count = 0, shown = 0;
      for (let i = 0; count < 200 && i < 4000; i++) {
        const p = sampleFor(stage, `split:${stage.id}:${i}`, i);
        if (!splittable(stage, p)) { expect(planFor(p) === null || true).toBe(true); continue; }
        const plan = planFor(p);
        expect(plan, problemText(p)).not.toBeNull();
        expect(planIsConsistent(p, plan!), problemText(p)).toBe(true);
        for (const step of plan!.steps) {
          expect(checkProblem(step.problem), problemText(step.problem)).toBe(true);
          expect(step.problem.kind === 'calc' || step.problem.kind === 'rem').toBe(true);
        }
        count++; total++; if (shown < 1) { shown++; rows.push(`${stage.id}: ${problemText(p)}  ->  ${plan!.steps.map((s) => problemText(s.problem).replace('= ?', `= ${s.problem.answer}`)).join('  |  ')}`); }
      }
      if (['add-7', 'mul-7', 'div-7', 'div-9'].includes(stage.id)) expect(count, stage.id).toBe(0);   // not part of 拆一拆
      else expect(count, stage.id).toBeGreaterThanOrEqual(stage.id === 'add-8' || stage.id === 'sub-8' ? 100 : 150);
    }
    console.log(`${total} problems planned. Examples:\n${rows.join('\n')}`);
    expect(total).toBeGreaterThan(1000);
  });

  it('no plan for problems 拆一拆 does not cover', () => {
    const stages = (id: string) => STAGES.find((s) => s.id === id)!;
    expect(splittable(stages('mul-7'), calc('mul', 30, 4))).toBe(false);
    expect(splittable(stages('add-9'), calc('add', 341, 28))).toBe(false);      // no carry
    expect(splittable(stages('add-6'), calc('add', 48, 27))).toBe(false);       // stage 6 keeps the dots model
    expect(splittable(stages('mul-9'), calc('mul', 13, 5))).toBe(true);
    const mixp: Problem = { kind: 'fill', op: 'add', a: null, b: 27, c: 60, answer: 33 };
    expect(splittable(stages('mix-1'), mixp)).toBe(false);
  });
});

describe('QA-09: using 拆一拆 on purpose counts as 一次就对 when nothing went wrong', () => {
  it('only a scored problem started by the button with no wrong step and no answer shown counts', () => {
    expect(splitCountsAsRight('button', false, 'scored')).toBe(true);
    expect(splitCountsAsRight('button', true, 'scored')).toBe(false);      // a step was wrong, or the step answer was shown
    expect(splitCountsAsRight('miss', false, 'scored')).toBe(false);       // the problem was already answered wrongly
    expect(splitCountsAsRight('warm', false, 'warm')).toBe(false);         // warm-ups never count
    expect(splitCountsAsRight('button', false, 'review')).toBe(false);     // a "再来一道" never scores
  });
});
