import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../../tests/helpers/memory-storage';
import { PASS_SCORE, STAGES, calc, stageById, variationFor, type Stage } from '../src/math/problems';
import {
  MATH_SAVE_KEY, applyPlacement, currentOf, defaults, doneCount, highestOpen, normalizeProblem, openMathStore, readMathSave, recordAnswer, sprintOpen, stageOpen, stageStatus, startRun,
} from '../src/math/save';
import { sprintQuestions } from '../src/math/sprint';
import { inStage } from '../src/math/problems';

const S = (id: string): Stage => stageById(id)!;
const put = (storage: MemoryStorage, v: number, data: unknown) => storage.setItem(MATH_SAVE_KEY, JSON.stringify({ v, updatedAt: 1, data }));

describe('save v2: old saves load without loss', () => {
  it('a v1 save (stages 1-6 only, run without the new fields) keeps every opened stage and its run', () => {
    const storage = new MemoryStorage();
    const review = { due: 5, problem: { a: 30, b: 40, op: 'add', answer: 70 } };            // v1 problems have no `kind`
    const oldData = {
      best: { 'add-1': 8, 'add-2': 6, 'add-3': 5, 'sub-1': 5, 'mul-1': 8, 'mul-2': 5, 'div-1': 5 },
      plays: { 'add-1': 3, 'add-2': 1, 'add-3': 2, 'sub-1': 1, 'mul-1': 1, 'mul-2': 1, 'div-1': 1 },
      run: { stageId: 'add-4', round: 2, index: 3, correct: 2, retrying: true, attempts: 2, reviews: [review], reviewed: 1 },
    };
    put(storage, 1, oldData);
    const save = readMathSave(openMathStore(storage));
    expect(save.best).toEqual(oldData.best);
    expect(save.plays).toEqual(oldData.plays);
    expect(save.run).toMatchObject({ stageId: 'add-4', round: 2, index: 3, correct: 2, retrying: true, attempts: 2, reviewed: 1, warm: 0, warmDone: 0, sec: 0 });
    expect(save.run!.reviews[0]).toEqual({ due: 5, problem: { kind: 'calc', op: 'add', a: 30, b: 40, answer: 70 } });
    // every stage that was open before is still open, nothing new opens by itself
    const open = STAGES.filter((s) => stageOpen(save, s)).map((s) => s.id);
    for (const id of ['add-1', 'add-2', 'add-3', 'add-4', 'sub-1', 'sub-2', 'mul-1', 'mul-2', 'mul-3', 'div-1', 'div-2', 'mix-1']) expect(open, id).toContain(id);
    expect(open).not.toContain('add-5'); expect(open).not.toContain('mix-2'); expect(open).not.toContain('add-7');
    expect(save.placed).toEqual({}); expect(save.fast).toEqual({});
    // stored under v2 right after the first load (migration), same key
    const env = JSON.parse(storage.getItem(MATH_SAVE_KEY)!);
    expect(env.v).toBe(2);
    expect(env.data.best).toEqual(oldData.best);
  });

  it('a save written by a newer build is not overwritten by this page', () => {
    const storage = new MemoryStorage();
    put(storage, 3, { best: { 'add-1': 8 } });
    const store = openMathStore(storage);
    const loaded = readMathSave(store);
    expect(loaded.best).toEqual({});
    expect(store.save(loaded)).toBe(false);
    expect(JSON.parse(storage.getItem(MATH_SAVE_KEY)!).v).toBe(3);
  });

  it('round trip keeps placed, fast, lastSec and the guided-run fields', () => {
    const storage = new MemoryStorage();
    const store = openMathStore(storage);
    const s = defaults();
    s.placed = { add: 7, mul: 9 }; s.fast = { add: { best: 41, last: 50, runs: 3 } }; s.lastSec = { 'add-1': 44 };
    startRun(s, S('add-1'));
    store.save(s);
    expect(readMathSave(openMathStore(storage))).toEqual(s);
  });
});

describe('save validation: nothing from storage is trusted', () => {
  const read = (data: unknown) => { const storage = new MemoryStorage(); put(storage, 2, data); return readMathSave(openMathStore(storage)); };
  it('drops invalid entries and keeps valid ones', () => {
    const s = read({
      best: { 'add-1': 9, 'add-2': -1, 'add-3': 2.5, 'nope-1': 3, 'mix-2': 4, 'add-4': 'x', 'sub-10': 8 },
      plays: { 'add-1': -3, 'add-2': 4, 'zzz': 1 },
      placed: { add: 11, sub: 0, mul: 5, mix: 3, div: 'a', bogus: 4 },
      fast: { add: { best: 0 }, sub: { best: 31, last: 'x', runs: 2 }, mul: 'fast', foo: { best: 9 }, mix: { best: 12 } },
      lastSec: { 'add-1': 30, 'add-2': -1, 'x-1': 3 },
      run: { stageId: 'add-9', round: 1, index: 9, correct: 0, retrying: false, attempts: 0, reviews: [], reviewed: 0 },
    });
    expect(s.best).toEqual({ 'mix-2': 4, 'sub-10': 8 });
    expect(s.plays).toEqual({ 'add-2': 4 });
    expect(s.placed).toEqual({ mul: 5 });
    expect(s.fast).toEqual({ sub: { best: 31, runs: 2 }, mix: { best: 12 } });
    expect(s.lastSec).toEqual({ 'add-1': 30 });
    expect(s.run).toBeNull();
  });
  it.each([null, 'text', 7, [], { best: 'x', plays: [], run: 5, placed: [], fast: 3, lastSec: 'x' }])('garbage %j becomes the default save', (garbage) => {
    expect(read(garbage)).toEqual(defaults());
  });
  it('a run with a tampered review (wrong arithmetic, wrong stage, too big) loses only that review', () => {
    const good = { due: 4, problem: calc('add', 347, 28) };
    const run = { stageId: 'add-9', round: 2, index: 1, correct: 1, retrying: false, attempts: 0, reviewed: 0, warm: 0, warmDone: 0, sec: 12 };
    const s = read({ placed: { add: 9 }, run: { ...run, reviews: [good, { due: 5, problem: { kind: 'calc', op: 'add', a: 5, b: 5, answer: 11 } }, { due: 5, problem: calc('mul', 3, 4) }, { due: 99, problem: calc('add', 347, 28) }, { due: 3, problem: { kind: 'calc', op: 'add', a: 5000, b: 5, answer: 5005 } }, 'x'] } });
    expect(s.run!.reviews).toEqual([good]);
    expect(s.run).toMatchObject({ stageId: 'add-9', sec: 12 });
    expect(read({ placed: { add: 9 }, run: { ...run, correct: 3, reviews: [] } }).run).toBeNull();           // more correct than answered
    expect(read({ placed: { add: 9 }, run: { ...run, index: 8, reviews: [] } }).run).toBeNull();             // finished runs are not kept
    expect(read({ placed: { add: 9 }, run: { ...run, stageId: 'add-99' } }).run).toBeNull();
  });
  it('normalizeProblem rebuilds every kind and rejects inconsistent ones', () => {
    expect(normalizeProblem({ kind: 'rem', op: 'div', a: 47, b: 4, answer: 11, rem: 3 })).not.toBeNull();
    expect(normalizeProblem({ kind: 'rem', op: 'div', a: 47, b: 4, answer: 11, rem: 4 })).toBeNull();
    expect(normalizeProblem({ kind: 'fill', op: 'add', a: null, b: 27, c: 60, answer: 33 })).not.toBeNull();
    expect(normalizeProblem({ kind: 'fill', op: 'add', a: null, b: 27, c: 60, answer: 34 })).toBeNull();
    expect(normalizeProblem({ kind: 'expr', op: 'mul', nums: [3, 5, 7], ops: ['mul', 'add'], answer: 22 })).not.toBeNull();
    expect(normalizeProblem({ kind: 'expr', op: 'mul', nums: [3, 5, 7], ops: ['mul', 'add'], answer: 36 })).toBeNull();
    expect(normalizeProblem({ kind: 'cmp', op: 'mul', left: { nums: [17, 5], ops: ['mul'] }, right: { nums: [80], ops: [] }, answer: 1 })).not.toBeNull();
    expect(normalizeProblem({ kind: 'cmp', op: 'mul', left: { nums: [17, 5], ops: ['mul'] }, right: { nums: [80], ops: [] }, answer: -1 })).toBeNull();
    expect(normalizeProblem({ kind: 'weird', op: 'add' })).toBeNull();
  });
});

describe('opening rules, placement and the run', () => {
  it('placement opens up to the start tier, never lowers, and only raises what is open', () => {
    const s = defaults();
    expect(highestOpen(s, 'mul')).toBe(1);
    expect(applyPlacement(s, 'mul', 6)).toBe(true);
    expect(highestOpen(s, 'mul')).toBe(6);
    expect(stageStatus(s, S('mul-5'))).toBe('placed');
    expect(stageStatus(s, S('mul-6'))).toBe('open');
    expect(stageStatus(s, S('mul-7'))).toBe('locked');
    expect(applyPlacement(s, 'mul', 3)).toBe(false);          // lower: ignored
    expect(s.placed.mul).toBe(6);
    // already played far: a lower test changes nothing
    const played = defaults();
    for (let t = 1; t <= 7; t++) played.best[`add-${t}`] = 6;
    expect(highestOpen(played, 'add')).toBe(8);
    expect(applyPlacement(played, 'add', 5)).toBe(false);
    expect(played.placed).toEqual({});
    expect(applyPlacement(played, 'add', 10)).toBe(true);
    expect(stageStatus(played, S('add-8'))).toBe('placed');
    // passing the start stage opens the next one
    s.best['mul-6'] = 5;
    expect(stageStatus(s, S('mul-6'))).toBe('passed');
    expect(stageOpen(s, S('mul-7'))).toBe(true);
    expect(doneCount(s)).toBe(6);
  });
  it('超频 opens after stage 3 (played or placed) and draws only from passed stages', () => {
    const s = defaults();
    expect(sprintOpen(s, 'add')).toBe(false);
    s.best['add-1'] = 6; s.best['add-2'] = 8;
    expect(sprintOpen(s, 'add')).toBe(false);
    s.best['add-3'] = 5;
    expect(sprintOpen(s, 'add')).toBe(true);
    const items = sprintQuestions(s, 'add', 'seed-1');
    expect(items).toHaveLength(10);
    for (const { stage, problem } of items) { expect(stage.op).toBe('add'); expect(stage.tier).toBeLessThanOrEqual(3); expect(inStage(stage, problem)).toBe(true); }
    expect(sprintQuestions(s, 'add', 'seed-1')).toEqual(items);
    expect(sprintOpen(s, 'mix')).toBe(false);
    const placed = defaults(); placed.placed.sub = 4;
    expect(sprintOpen(placed, 'sub')).toBe(true);
  });
  it('a first run of a stage with guided problems starts with two warm-ups that never touch the score', () => {
    const s = defaults();
    s.placed.mul = 9;
    const run = startRun(s, S('mul-9'));
    expect(run.warm).toBe(2);
    expect(currentOf(s)!.kind).toBe('warm');
    recordAnswer(s, true, 5);
    recordAnswer(s, true, 5);
    expect(run).toMatchObject({ warm: 0, warmDone: 2, index: 0, correct: 0, sec: 10 });
    expect(currentOf(s)!.kind).toBe('scored');
    for (let i = 0; i < 8; i++) recordAnswer(s, i < 6, 3);
    expect(s.best['mul-9']).toBe(6);
    expect(s.lastSec['mul-9']).toBe(34);
    // after passing there are no warm-ups; stages without guided problems never have them
    expect(startRun(s, S('mul-9')).warm).toBe(0);
    s.placed.add = 7;
    expect(startRun(s, S('add-1')).warm).toBe(0);
    expect(startRun(s, S('mul-1')).warm).toBe(0);
  });
  it('a missed problem returns as a different problem after two more questions, and review answers never score', () => {
    const s = defaults();
    const run = startRun(s, S('add-1'));
    run.reviews.push({ due: 3, problem: variationFor(S('add-1'), run.round, 0) });
    for (let i = 0; i < 3; i++) recordAnswer(s, i !== 0);
    expect(currentOf(s)!.kind).toBe('review');
    recordAnswer(s, true);
    expect(run).toMatchObject({ index: 3, correct: 2, reviewed: 1 });
    for (let i = 0; i < 5; i++) recordAnswer(s, true);
    expect(s.best['add-1']).toBe(7);
    expect(PASS_SCORE).toBe(5);
  });
});

describe('QA-12: a saved run can only be on a stage that is open', () => {
  const run = (stageId: string) => ({ stageId, round: 1, index: 2, correct: 1, retrying: false, attempts: 0, reviews: [], reviewed: 0, warm: 0, warmDone: 0, sec: 10 });
  const read = (data: unknown) => { const storage = new MemoryStorage(); storage.setItem(MATH_SAVE_KEY, JSON.stringify({ v: 2, updatedAt: 1, data })); return readMathSave(openMathStore(storage)); };
  it('a run on a locked stage is dropped, on an open stage (played, placed, or the first) it is kept', () => {
    expect(read({ run: run('div-9') }).run).toBeNull();                                                   // div-8 was never passed
    expect(read({ run: run('add-7'), best: { 'add-5': 8 } }).run).toBeNull();
    expect(read({ run: run('div-1') }).run).not.toBeNull();
    expect(read({ run: run('div-9'), best: { 'div-8': 6 } }).run).not.toBeNull();
    expect(read({ run: run('div-9'), placed: { div: 9 } }).run).not.toBeNull();
    expect(read({ run: run('mix-2') }).run).toBeNull();
    expect(read({ run: run('mix-2'), best: { 'mix-1': 5 } }).run).not.toBeNull();
  });
});
