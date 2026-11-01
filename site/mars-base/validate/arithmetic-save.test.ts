import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../../tests/helpers/memory-storage';
import { STAGES, variationFor } from '../src/math/problems';
import { MATH_SAVE_KEY, defaults, dueReview, openMathStore, readMathSave, recordAnswer, stageOpen, startRun } from '../src/math/save';

describe('arithmetic progress', () => {
  it('keeps the previous base save untouched and resumes an eight-question run', () => {
    const storage = new MemoryStorage();
    const old = JSON.stringify({ v: 6, data: { pet: 'dragon', baseLevel: 4 } });
    storage.setItem('kg:v1:mars-base', old);
    const store = openMathStore(storage);
    const s = readMathSave(store);
    expect(stageOpen(s, STAGES[0])).toBe(true);
    expect(stageOpen(s, STAGES[1])).toBe(false);
    startRun(s, STAGES[0]);
    recordAnswer(s, true);
    store.save(s);
    expect(readMathSave(openMathStore(storage)).run).toMatchObject({ stageId: 'add-1', index: 1, correct: 1 });
    expect(storage.getItem('kg:v1:mars-base')).toBe(old);
    expect(storage.getItem(MATH_SAVE_KEY)).toContain('add-1');
  });

  it('unlocks only the next stage after five correct answers and keeps the best result', () => {
    const s = defaults();
    startRun(s, STAGES[0]);
    for (const right of [true, true, false, true, true, false, true, false]) recordAnswer(s, right);
    expect(s.run).toBeNull();
    expect(s.best['add-1']).toBe(5);
    expect(stageOpen(s, STAGES[1])).toBe(true);
    expect(stageOpen(s, STAGES[2])).toBe(false);
    expect(stageOpen(s, STAGES[6])).toBe(true);
    startRun(s, STAGES[0]);
    for (let i = 0; i < 8; i++) recordAnswer(s, i < 2);
    expect(s.best['add-1']).toBe(5);
  });

  it('keeps variation review separate from the first-answer score', () => {
    const s = defaults();
    const run = startRun(s, STAGES[0]);
    run.reviews.push({ due: 3, problem: variationFor(STAGES[0], run.round, 0) });
    for (let i = 0; i < 3; i++) recordAnswer(s, i !== 0);
    expect(dueReview(run)).not.toBeNull();
    recordAnswer(s, true);
    expect(run.index).toBe(3);
    expect(run.correct).toBe(2);
    expect(run.reviewed).toBe(1);
  });

  it('finishes only after a review due after question eight', () => {
    const storage = new MemoryStorage();
    const s = defaults();
    const run = startRun(s, STAGES[0]);
    run.reviews.push({ due: 8, problem: variationFor(STAGES[0], run.round, 7) });
    for (let i = 0; i < 8; i++) recordAnswer(s, i < 5);
    expect(s.run?.index).toBe(8);
    openMathStore(storage).save(s);
    const restored = readMathSave(openMathStore(storage));
    expect(dueReview(restored.run!)).not.toBeNull();
    const result = recordAnswer(restored, false);
    expect(result).toMatchObject({ finished: true, score: 5 });
    expect(restored.best['add-1']).toBe(5);
  });
});
