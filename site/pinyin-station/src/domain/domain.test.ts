import { describe, expect, it } from 'vitest';
import { parseSyllable, displayPinyin, validateBank } from './pinyin';
import { bank } from './content';
import { initialSave, recordAttempt, mastery, schedule, nextQuestion, rebuildAtoms } from './learning';

describe('pinyin content', () => {
  it('preserves umlauts, neutral tones and places tones on the right vowel', () => {
    expect(['lv2', 'liu2', 'gui4', 'di0'].map(displayPinyin)).toEqual(['lǘ', 'liú', 'guì', 'di']);
    expect(parseSyllable('bv2')).toBeNull();
    expect(parseSyllable('lve4')).toMatchObject({ initial: 'l', final: 've', tone: 4 });
  });
  it('validates the exact content consumed by the page', () => expect(validateBank(bank)).toEqual([]));
  it('includes the newly deciphered exam words and both sentences', () => {
    for (const id of ['pubu', 'lv', 'futi', 'didi-milu', 'baba-pati'])
      expect(bank.words.some((w) => w.id === id)).toBe(true);
  });
});

describe('supportive practice and session-based review', () => {
  it('keeps trial AI and self assessment out of mastery', () => {
    const s = initialSave();
    recordAttempt(s, { skill: 'syl:ba2:say', kind: 'D', correct: false, judge: 'ai', session: 1, id: 'a' });
    recordAttempt(s, { skill: 'syl:ba2:say', kind: 'D', correct: true, judge: 'self', session: 1, id: 'b' });
    expect(s.atoms).toEqual({});
  });
  it('requires two modalities on separate sessions before mastery', () => {
    const s = initialSave();
    for (let i = 0; i < 8; i++)
      recordAttempt(s, {
        skill: 'word:ditu:decode',
        kind: 'E',
        correct: true,
        judge: 'deterministic',
        session: i + 1,
        id: `e${i}`,
      });
    expect(mastery(s, 'word:ditu')).toBe(false);
    recordAttempt(s, {
      skill: 'word:ditu:spell',
      kind: 'F',
      correct: true,
      judge: 'deterministic',
      session: 9,
      id: 'f',
    });
    expect(mastery(s, 'word:ditu')).toBe(false);
    recordAttempt(s, {
      skill: 'word:ditu:spell',
      kind: 'F',
      correct: true,
      judge: 'deterministic',
      session: 10,
      id: 'f2',
    });
    expect(mastery(s, 'word:ditu')).toBe(true);
    expect(s.atoms['word:ditu:decode'].due).toBeGreaterThan(1);
  });
  it('rebuilds parent corrections without double counting', () => {
    const s = initialSave();
    recordAttempt(s, {
      skill: 'syl:ba2:say',
      kind: 'D',
      correct: false,
      judge: 'parent',
      session: 1,
      id: 'r',
    });
    recordAttempt(s, {
      skill: 'syl:ba2:say',
      kind: 'D',
      correct: true,
      judge: 'parent',
      session: 1,
      id: 'r',
    });
    rebuildAtoms(s);
    expect(s.atoms['syl:ba2:say'].box).toBe(1);
  });
  it('reserves most main-program slots for meaning and spelling, within the selected lesson', () => {
    const s = initialSave();
    s.settings.lesson = 3;
    const qs = schedule(s, bank, 'today', 13);
    const main = qs.filter((q) => q.phase === 'main');
    expect(main.filter((q) => q.kind === 'E' || q.kind === 'F').length / main.length).toBeGreaterThanOrEqual(
      0.5,
    );
    expect(qs.every((q) => q.lesson <= 3)).toBe(true);
    expect(qs.every((q, i) => i < 2 || q.id !== qs[i - 1].id || q.id !== qs[i - 2].id)).toBe(true);
  });
  it('keeps foundational lessons playable in every practice mode without future words', () => {
    for (const lesson of [1, 2])
      for (const mode of ['today', 'read', 'spell', 'repair', 'listen']) {
        const s = initialSave();
        s.settings.lesson = lesson;
        const qs = schedule(s, bank, mode);
        expect(qs).toHaveLength(15);
        expect(qs.every((q) => q.lesson <= lesson && ['A', 'B', 'C'].includes(q.kind))).toBe(true);
      }
  });
  it('warms up with a familiar word and promptly returns to due work', () => {
    const s = initialSave();
    s.sessions = 4;
    recordAttempt(s, {
      id: 'known',
      session: 1,
      kind: 'E',
      judge: 'deterministic',
      skill: 'word:nitu:decode',
      correct: true,
    });
    recordAttempt(s, {
      id: 'review',
      session: 2,
      kind: 'F',
      judge: 'deterministic',
      skill: 'word:muma:spell',
      correct: false,
    });
    const qs = schedule(s, bank, 'today');
    expect(qs[1].target).toBe('nitu');
    expect(qs.slice(3, 5).some((q) => q.target === 'muma')).toBe(true);
  });
  it('keeps picture choices distinct when a family word reuses a library picture', () => {
    const s = initialSave();
    s.customWords = [{ ...bank.words.find((w) => w.id === 'muma')!, id: 'family-muma', custom: true }];
    const words = [...bank.words, ...s.customWords];
    for (let session = 1; session <= 20; session++) {
      s.sessions = session;
      for (const q of schedule(s, bank, 'today').filter((q) => q.kind === 'E')) {
        const pictures = q.choices.map((id) => words.find((w) => w.id === id)!.picture);
        expect(new Set(pictures).size).toBe(pictures.length);
      }
    }
  });
  it('demonstrates after three tries and schedules a spaced twin', () => {
    const s = initialSave();
    const qs = schedule(s, bank, 'today', 4);
    expect(nextQuestion(qs, 0, 2, false).action).toBe('hint');
    const result = nextQuestion(qs, 0, 3, false, schedule(s, bank, 'listen', 60));
    expect(result.action).toBe('demonstrate');
    expect(result.queue[1].id).not.toBe(qs[0].id);
    expect(result.queue.slice(3).some((q) => q.kind === qs[0].kind && q.target !== qs[0].target)).toBe(true);
  });
});
