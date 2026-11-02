import { describe, expect, it } from 'vitest';
import {
  PASS_SCORE, QUESTIONS_PER_STAGE, STAGES, TRACKS, borrowCount, calc, carryCount, checkProblem, inStage, mulCarries, problemKey, problemText,
  questionsFor, sampleFor, variationFor, warmupFor, evalExpr, type Problem, type Stage,
} from '../src/math/problems';
import { splittable } from '../src/math/split';

/** independent column arithmetic, written separately from the game code */
function columnCarries(a: number, b: number): number {
  const x = String(a).split('').reverse().map(Number), y = String(b).split('').reverse().map(Number);
  let carry = 0, count = 0;
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const s = (x[i] ?? 0) + (y[i] ?? 0) + carry; carry = s >= 10 ? 1 : 0; count += carry; }
  return count;
}
function columnBorrows(a: number, b: number): number {
  const x = String(a).split('').reverse().map(Number), y = String(b).split('').reverse().map(Number);
  let borrow = 0, count = 0;
  for (let i = 0; i < x.length; i++) { const d = x[i] - (y[i] ?? 0) - borrow; borrow = d < 0 ? 1 : 0; count += borrow; }
  return count;
}

const stageOf = (id: string): Stage => STAGES.find((s) => s.id === id)!;
const sampleMany = (stage: Stage, n: number): Problem[] => Array.from({ length: n }, (_, i) => sampleFor(stage, `t:${stage.id}:${i}`, i));

describe('stage table', () => {
  it('has 44 stages: four 10-step lines and a 4-step mixed line, with short mission names', () => {
    expect(STAGES).toHaveLength(44);
    expect(TRACKS.map((t) => [t.op, t.stages.length])).toEqual([['add', 10], ['sub', 10], ['mul', 10], ['div', 10], ['mix', 4]]);
    expect(PASS_SCORE).toBeLessThan(QUESTIONS_PER_STAGE);
    const names = new Set<string>();
    for (const stage of STAGES) {
      expect(stage.title.length, stage.title).toBeLessThanOrEqual(8);
      expect(stage.title, stage.title).not.toMatch(/[A-Za-z0-9]/);
      expect(stage.title).toMatch(/^[一-鿿]+$/);
      names.add(stage.title);
    }
    expect(names.size).toBeGreaterThanOrEqual(40);   // a few classic names repeat on purpose (货物箱 / 货架 ...) but never twice on one line
    for (const t of TRACKS) expect(new Set(t.stages.map((s) => s[0])).size).toBe(t.stages.length);
  });
});

describe('column helpers agree with an independent implementation', () => {
  it('carries, borrows', () => {
    for (let a = 0; a <= 999; a += 7) for (let b = 0; b <= 999 - a; b += 11) expect(carryCount(a, b), `${a}+${b}`).toBe(columnCarries(a, b));
    for (let a = 0; a <= 999; a += 7) for (let b = 0; b <= a; b += 11) expect(borrowCount(a, b), `${a}-${b}`).toBe(columnBorrows(a, b));
    expect(carryCount(37, 63)).toBe(2);
    expect(borrowCount(100, 37)).toBe(2);
    expect(mulCarries(13, 5)).toBe(1);
    expect(mulCarries(12, 3)).toBe(0);
    expect(mulCarries(47, 5)).toBe(2);
  });
});

describe('every stage: generator output belongs to the stage definition', () => {
  for (const stage of STAGES) {
    it(`${stage.id} ${stage.title}`, () => {
      for (const round of [1, 2, 3, 17, 40]) {
        const questions = questionsFor(stage, round);
        expect(questions).toHaveLength(QUESTIONS_PER_STAGE);
        expect(questionsFor(stage, round)).toEqual(questions);                           // same seed, same round
        expect(new Set(questions.map(problemKey)).size).toBe(QUESTIONS_PER_STAGE);        // no repeats in a round
        for (const q of questions) {
          expect(checkProblem(q), problemText(q)).toBe(true);
          expect(inStage(stage, q), `${stage.id}: ${problemText(q)}`).toBe(true);
        }
      }
      for (const q of sampleMany(stage, 400)) expect(inStage(stage, q), `${stage.id}: ${problemText(q)}`).toBe(true);
    });
  }
  it('a missed problem can always be replaced by a different one of the same stage', () => {
    for (const stage of STAGES) for (const round of [1, 2, 25]) {
      const used = new Set(questionsFor(stage, round).map(problemKey));
      for (let index = 0; index < QUESTIONS_PER_STAGE; index++) {
        const q = variationFor(stage, round, index);
        expect(used.has(problemKey(q)), `${stage.id}:${round}:${index}`).toBe(false);
        expect(inStage(stage, q)).toBe(true);
      }
    }
  });
});

describe('stage definitions say what the spec says (examples in, counter-examples out)', () => {
  const inS = (id: string, p: Problem) => inStage(stageOf(id), p);
  const fillP = (op: 'add' | 'sub' | 'mul' | 'div', a: number | null, b: number | null, c: number, answer: number): Problem => ({ kind: 'fill', op, a, b, c, answer });
  it('add / sub', () => {
    expect(inS('add-7', fillP('add', 37, null, 100, 63))).toBe(true);
    expect(inS('add-7', { kind: 'expr', op: 'add', nums: [28, 15, 12], ops: ['add', 'add'], answer: 55 })).toBe(true);
    expect(inS('add-7', { kind: 'expr', op: 'add', nums: [58, 45, 12], ops: ['add', 'add'], answer: 115 })).toBe(false);   // sum over 100
    expect(inS('add-8', calc('add', 230, 450))).toBe(true);
    expect(inS('add-8', calc('add', 360, 270))).toBe(true);
    expect(inS('add-8', calc('add', 347, 28))).toBe(false);
    expect(inS('add-9', calc('add', 347, 28))).toBe(true);
    expect(inS('add-9', calc('add', 476, 45))).toBe(true);
    expect(inS('add-9', calc('add', 976, 45))).toBe(false);                              // 1021 > 999
    expect(inS('add-10', calc('add', 276, 358))).toBe(true);
    expect(inS('add-10', calc('add', 676, 458))).toBe(false);
    expect(inS('sub-7', calc('sub', 100, 37))).toBe(true);
    expect(inS('sub-7', calc('sub', 82, 47))).toBe(true);
    expect(inS('sub-7', calc('sub', 87, 42))).toBe(false);                               // no borrow
    expect(inS('sub-8', calc('sub', 500, 230))).toBe(true);
    expect(inS('sub-8', calc('sub', 900, 350))).toBe(true);
    expect(inS('sub-8', calc('sub', 1000 as number, 300))).toBe(false);                  // minuend stays <= 999
    expect(inS('sub-9', calc('sub', 432, 58))).toBe(true);
    expect(inS('sub-10', calc('sub', 603, 278))).toBe(true);
  });
  it('mul / div', () => {
    for (const [a, b] of [[30, 4], [20, 7], [3, 200]]) expect(inS('mul-7', calc('mul', a, b)), `${a}x${b}`).toBe(true);
    expect(inS('mul-7', calc('mul', 30, 40))).toBe(false);
    for (const [a, b] of [[12, 3], [21, 4], [32, 3]]) expect(inS('mul-8', calc('mul', a, b)), `${a}x${b}`).toBe(true);
    expect(inS('mul-8', calc('mul', 13, 5))).toBe(false);
    for (const [a, b] of [[13, 5], [15, 5], [17, 2], [25, 4]]) expect(inS('mul-9', calc('mul', a, b)), `${a}x${b}`).toBe(true);
    expect(inS('mul-9', calc('mul', 24, 3))).toBe(false);
    for (const [a, b] of [[24, 3], [36, 4], [47, 5], [18, 6]]) expect(inS('mul-10', calc('mul', a, b)), `${a}x${b}`).toBe(true);
    expect(inS('mul-10', calc('mul', 12, 3))).toBe(false);
    expect(inS('div-7', calc('div', 60, 3))).toBe(true);
    expect(inS('div-7', calc('div', 80, 4))).toBe(true);
    expect(inS('div-7', calc('div', 56, 7))).toBe(true);
    for (const [a, b] of [[65, 5], [84, 4], [96, 3]]) expect(inS('div-8', calc('div', a, b)), `${a}/${b}`).toBe(true);
    expect(inS('div-8', calc('div', 60, 3))).toBe(false);
    expect(inS('div-9', { kind: 'rem', op: 'div', a: 17, b: 5, answer: 3, rem: 2 })).toBe(true);
    expect(inS('div-9', { kind: 'rem', op: 'div', a: 29, b: 6, answer: 4, rem: 5 })).toBe(true);
    expect(inS('div-9', { kind: 'rem', op: 'div', a: 47, b: 4, answer: 11, rem: 3 })).toBe(false);
    expect(inS('div-10', { kind: 'rem', op: 'div', a: 47, b: 4, answer: 11, rem: 3 })).toBe(true);
    expect(inS('div-10', { kind: 'rem', op: 'div', a: 83, b: 5, answer: 16, rem: 3 })).toBe(true);
  });
  it('mix', () => {
    expect(inS('mix-1', fillP('add', null, 27, 60, 33))).toBe(true);
    expect(inS('mix-1', fillP('sub', 81, null, 46, 35))).toBe(true);
    expect(inS('mix-2', fillP('mul', null, 5, 65, 13))).toBe(true);
    expect(inS('mix-2', fillP('div', 72, null, 8, 9))).toBe(true);
    expect(inS('mix-3', { kind: 'cmp', op: 'mul', left: { nums: [17, 5], ops: ['mul'] }, right: { nums: [80], ops: [] }, answer: 1 })).toBe(true);
    expect(inS('mix-3', { kind: 'cmp', op: 'add', left: { nums: [36, 47], ops: ['add'] }, right: { nums: [90], ops: [] }, answer: -1 })).toBe(true);
    expect(inS('mix-3', { kind: 'cmp', op: 'add', left: { nums: [36, 47], ops: ['add'] }, right: { nums: [90], ops: [] }, answer: 1 })).toBe(false);  // wrong answer
    expect(inS('mix-4', { kind: 'expr', op: 'mul', nums: [3, 5, 7], ops: ['mul', 'add'], answer: 22 })).toBe(true);
    expect(inS('mix-4', { kind: 'expr', op: 'mul', nums: [40, 6, 5], ops: ['sub', 'mul'], answer: 10 })).toBe(true);
    expect(inS('mix-4', { kind: 'expr', op: 'mul', nums: [40, 6, 5], ops: ['sub', 'mul'], answer: 170 })).toBe(false);
  });
});

describe('answers, carries and borrows are what the stage says (sampled 600 per stage)', () => {
  it('stages 7-10 and mix: values, bounds and column facts', () => {
    for (const stage of STAGES.filter((s) => s.tier >= 7 || s.op === 'mix')) {
      for (const q of sampleMany(stage, 600)) {
        if (q.kind === 'calc') {
          expect(q.a).toBeLessThanOrEqual(999); expect(q.b).toBeLessThanOrEqual(999); expect(q.answer).toBeLessThanOrEqual(999);
          if (q.op === 'add') { expect(q.a + q.b).toBe(q.answer); expect(carryCount(q.a, q.b)).toBe(columnCarries(q.a, q.b)); }
          if (q.op === 'sub') { expect(q.a - q.b).toBe(q.answer); expect(q.answer).toBeGreaterThan(0); expect(borrowCount(q.a, q.b)).toBe(columnBorrows(q.a, q.b)); }
          if (q.op === 'mul') expect(q.a * q.b).toBe(q.answer);
          if (q.op === 'div') expect(q.a / q.b).toBe(q.answer);
        }
        if (stage.id === 'add-10' || stage.id === 'add-9') expect(q.kind === 'calc' && columnCarries(q.a, q.b)).toBeGreaterThanOrEqual(0);
        if (stage.id === 'mul-8' && q.kind === 'calc') expect(mulCarries(Math.max(q.a, q.b), Math.min(q.a, q.b))).toBe(0);
        if (stage.id === 'mul-9' && q.kind === 'calc') expect(mulCarries(q.a, q.b)).toBeGreaterThanOrEqual(1);
        if (q.kind === 'expr') expect(evalExpr(q)).toBe(q.answer);
        if (q.kind === 'rem') { expect(q.rem).toBeLessThan(q.b); expect(q.b * q.answer + q.rem).toBe(q.a); }
      }
    }
  });
  it('carry / borrow mix: most add-9, add-10, sub-9, sub-10 problems carry or borrow, but not all', () => {
    for (const id of ['add-9', 'add-10', 'sub-9', 'sub-10']) {
      const list = sampleMany(stageOf(id), 800).filter((q): q is Extract<Problem, { kind: 'calc' }> => q.kind === 'calc');
      const hard = list.filter((q) => (q.op === 'add' ? columnCarries(q.a, q.b) : columnBorrows(q.a, q.b)) > 0).length / list.length;
      console.log(`${id}: ${(hard * 100).toFixed(0)}% of problems carry/borrow`);
      if (id.startsWith('sub')) expect(hard, `${id}: the spec says 退位, so every problem borrows`).toBe(1);
      else { expect(hard).toBeGreaterThan(0.7); expect(hard).toBeLessThan(1); }
    }
  });
});

describe('QA-05: sub-9 and sub-10 always borrow', () => {
  it('300 rounds of each: every problem borrows, in the stage, and the pool stays big', () => {
    for (const id of ['sub-9', 'sub-10']) {
      const stage = stageOf(id), seen = new Set<string>();
      for (let round = 1; round <= 300; round++) for (const q of questionsFor(stage, round)) {
        expect(q.kind === 'calc' && borrowCount(q.a, q.b), `${id} round ${round}: ${problemText(q)}`).toBeGreaterThanOrEqual(1);
        expect(inStage(stage, q)).toBe(true); seen.add(problemKey(q));
      }
      expect(seen.size, id).toBeGreaterThanOrEqual(60);
      for (let round = 1; round <= 40; round++) for (let k = 0; k < 8; k++) { const v = variationFor(stage, round, k); expect(v.kind === 'calc' && borrowCount(v.a, v.b)).toBeGreaterThanOrEqual(1); }
    }
  });
});

describe('how many different problems each stage can produce', () => {
  it('stages 7-10 and the mixed line: at least 60 different problems (400 seeded rounds + 4000 samples)', () => {
    const rows: string[] = [];
    for (const stage of STAGES) {
      const seen = new Set<string>();
      const target = stage.tier >= 7 || stage.op === 'mix' ? 60 : 8;
      for (let round = 1; round <= 400; round++) for (const q of questionsFor(stage, round)) seen.add(problemKey(q));
      for (let i = 0; i < 4000 && stage.tier >= 7; i++) seen.add(problemKey(sampleFor(stage, `cnt:${stage.id}:${i}`, i)));
      rows.push(`${stage.id.padEnd(6)} ${String(seen.size).padStart(5)}  ${stage.title}`);
      expect(seen.size, stage.id).toBeGreaterThanOrEqual(target);
    }
    console.log(`different problems found per stage:\n${rows.join('\n')}`);
  });
  it('stages 1-6 are the original generators: their domains are small by definition (reported, not padded)', () => {
    const sizes: Record<string, number> = {};
    for (const stage of STAGES.filter((s) => s.tier <= 6 && s.op !== 'mix')) {
      const seen = new Set<string>();
      for (let round = 1; round <= 300; round++) for (const q of questionsFor(stage, round)) seen.add(problemKey(q));
      sizes[stage.id] = seen.size;
    }
    console.log('stages 1-6 distinct problems:', JSON.stringify(sizes));
    expect(Math.min(...Object.values(sizes))).toBeGreaterThanOrEqual(10);
  });
  it('warm-up problems are splittable and differ from the scored eight', () => {
    for (const id of ['add-8', 'add-9', 'add-10', 'sub-7', 'sub-8', 'sub-9', 'sub-10', 'mul-8', 'mul-9', 'mul-10', 'div-8', 'div-10']) {
      const stage = stageOf(id);
      for (const round of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 25, 99]) for (let k = 0; k < 2; k++) {
        const p = warmupFor(stage, round, k, (q) => splittable(stage, q));
        expect(splittable(stage, p)).toBe(true);
        expect(questionsFor(stage, round).map(problemKey)).not.toContain(problemKey(p));
      }
    }
  });
});
