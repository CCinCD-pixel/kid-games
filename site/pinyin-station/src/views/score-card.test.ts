import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bank } from '../domain/content';
import { initialSave, recordAttempt, mastery } from '../domain/learning';
import { LOCAL_NARRATION, chartSvg, scoreCopy, scoreTarget } from './score-card';
import { unsureResult } from '../score/scorer';
import type { ScoreResult } from '../score/types';

const narration = JSON.parse(fs.readFileSync(new URL('../../../../content/narration/pinyin-station.yaml', import.meta.url), 'utf8')) as { lines: { id: string; text: string }[] };

describe('local-scoring feedback copy', () => {
  it('every card line exists in the narration yaml with identical text (clips are generated later)', () => {
    const byId = new Map(narration.lines.map((l) => [l.id, l.text]));
    for (const c of LOCAL_NARRATION) expect(byId.get(c.id), c.id).toBe(c.text);
  });
  it('is gentle: no wrong/failed/score words, and each subtitle line is at most 15 characters', () => {
    for (const c of LOCAL_NARRATION) {
      expect(c.text).not.toMatch(/错|失败|不对|分数|得分|不行|差/);
      for (const part of c.text.split(/[，。！？]/)) expect(part.length, c.id).toBeLessThanOrEqual(15);
      expect(c.text.length, c.id).toBeLessThanOrEqual(15);
    }
  });
  it('an unsure result always asks for another try instead of saying anything about right or wrong', () => {
    const copy = scoreCopy({ ...unsureResult('low_confidence'), verdict: 'unsure' } satisfies ScoreResult, 2);
    expect(copy.text).toBe('再试一次，我听得更清楚');
    expect(copy.mood).toBe('unsure');
    expect(scoreCopy({ ...unsureResult('too_quiet') }, 2).id).toBe('py.local.quiet');
    expect(scoreCopy({ ...unsureResult('warming_up') }, 2).id).toBe('py.local.warmup');
  });
  it('a differing tone-2 reading gets the "rising" hint', () => {
    expect(scoreCopy({ ...unsureResult('low_confidence'), verdict: 'differs' }, 2).text).toBe('听，再看：你的声音上扬了吗？');
  });
  it('builds a target with the curriculum tone confusions, and refuses neutral-tone/unknown syllables', () => {
    const t = scoreTarget('ma3', bank)!;
    expect(t.target).toMatchObject({ syllable: 'ma3', initial: 'm', final: 'a', tone: 3 });
    expect(t.confusions.tones!.sort()).toEqual([2, 4]);
    expect(scoreTarget('ma0', bank)).toBeNull();
    expect(scoreTarget('zzz9', bank)).toBeNull();
  });
  it('charts two curves and tolerates a missing one', () => {
    const c = Array.from({ length: 24 }, (_, i) => i - 8);
    expect(chartSvg(c, c, false)).toContain('score-mine');
    expect(chartSvg(null, c, true)).not.toContain('score-mine');
    expect(chartSvg(c, null, false)).not.toContain('score-model');
  });
});

describe('local scoring never counts toward mastery', () => {
  it('is off by default', () => {
    expect(initialSave().settings.localScore).toBe(false);
  });
  it('an attempt judged "local" changes no skill atom, however many are recorded', () => {
    const save = initialSave();
    save.sessions = 1;
    for (let i = 0; i < 6; i++) recordAttempt(save, { id: `a${i}`, skill: 'syllable:ma3:say', kind: 'D', correct: true, judge: 'local', session: 1 + i, at: i });
    expect(save.atoms['syllable:ma3:say']).toBeUndefined();
    expect(mastery(save, 'syllable:ma3:say')).toBeFalsy();
    recordAttempt(save, { id: 'p', skill: 'syllable:ma3:say', kind: 'D', correct: true, judge: 'parent', session: 9, at: 9 });
    expect(save.atoms['syllable:ma3:say']).toBeDefined();
  });
});
