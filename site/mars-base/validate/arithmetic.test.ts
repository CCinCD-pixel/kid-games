import { describe, expect, it } from 'vitest';
import { PASS_SCORE, QUESTIONS_PER_STAGE, STAGES, TRACKS, questionsFor } from '../src/math/problems';

describe('new arithmetic training', () => {
  it('has four independent six-stage tracks with reachable pass score', () => {
    expect(TRACKS.map((t) => t.op)).toEqual(['add', 'sub', 'mul', 'div']);
    expect(STAGES).toHaveLength(24);
    expect(PASS_SCORE).toBeLessThan(QUESTIONS_PER_STAGE);
  });

  it('generates reproducible, unique, valid questions at every stage', () => {
    for (const stage of STAGES) for (const round of [1, 2, 25]) {
      const questions = questionsFor(stage, round);
      expect(questions).toHaveLength(QUESTIONS_PER_STAGE);
      expect(questionsFor(stage, round)).toEqual(questions);
      expect(new Set(questions.map((q) => `${q.a}:${q.b}`)).size, stage.id).toBe(QUESTIONS_PER_STAGE);
      for (const q of questions) {
        expect(Number.isInteger(q.answer), stage.id).toBe(true);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThanOrEqual(100);
        if (q.op === 'add') expect(q.a + q.b).toBe(q.answer);
        if (q.op === 'sub') expect(q.a - q.b).toBe(q.answer);
        if (q.op === 'mul') expect(q.a * q.b).toBe(q.answer);
        if (q.op === 'div') expect(q.a / q.b).toBe(q.answer);
        if (stage.op === 'add' && stage.tier === 1) expect(q.answer).toBeLessThanOrEqual(10);
        if (stage.op === 'sub' && stage.tier === 1) expect(q.a).toBeLessThanOrEqual(10);
      }
    }
  });
});
