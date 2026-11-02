import { describe, expect, it } from 'vitest';
import { PASS_SCORE, QUESTIONS_PER_STAGE, STAGES, TRACKS, problemKey, questionsFor, variationFor } from '../src/math/problems';

// Updated for 算术站 2.0 (44 stages, five lines). The exhaustive generator/stage-definition checks live in ../tests/generators.test.ts.
describe('arithmetic training', () => {
  it('has four ten-stage lines plus a four-stage mixed line with a reachable pass score', () => {
    expect(TRACKS.map((t) => t.op)).toEqual(['add', 'sub', 'mul', 'div', 'mix']);
    expect(STAGES).toHaveLength(44);
    expect(PASS_SCORE).toBeLessThan(QUESTIONS_PER_STAGE);
  });

  it('generates reproducible, unique, valid questions at every stage', () => {
    for (const stage of STAGES) for (const round of [1, 2, 25]) {
      const questions = questionsFor(stage, round);
      expect(questions).toHaveLength(QUESTIONS_PER_STAGE);
      expect(questionsFor(stage, round)).toEqual(questions);
      expect(new Set(questions.map(problemKey)).size, stage.id).toBe(QUESTIONS_PER_STAGE);
      for (const q of questions) {
        expect(Number.isInteger(q.answer), stage.id).toBe(true);
        if (q.kind === 'calc') {
          expect(q.answer).toBeGreaterThanOrEqual(0);
          expect(q.answer).toBeLessThanOrEqual(999);
          if (stage.tier <= 6) expect(q.answer).toBeLessThanOrEqual(100);
          if (stage.op === 'add' && stage.tier === 1) expect(q.answer).toBeLessThanOrEqual(10);
          if (stage.op === 'sub' && stage.tier === 1) expect(q.a).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it('can revisit any missed question with a distinct problem in the same stage', () => {
    for (const stage of STAGES) for (const round of [1, 2, 25]) {
      const used = new Set(questionsFor(stage, round).map(problemKey));
      for (let index = 0; index < QUESTIONS_PER_STAGE; index++) expect(used.has(problemKey(variationFor(stage, round, index))), `${stage.id}:${round}:${index}`).toBe(false);
    }
  });
});
