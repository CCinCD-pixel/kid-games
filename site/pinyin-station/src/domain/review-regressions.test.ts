import { describe, expect, it } from 'vitest';
import { bank } from './content';
import * as learning from './learning';
import {
  aliasWordIds,
  initialSave,
  insertContrasts,
  mastery,
  rebuildAtoms,
  recordAttempt,
  schedule,
} from './learning';
import type { Attempt, Bank, Save, Word } from './types';

const word = (id: string, semanticGroup?: string): Word & { semanticGroup?: string } => ({
  id,
  hanzi: id,
  syllables: ['ba1'],
  display: 'bā',
  picture: id,
  kind: 'noun',
  lesson: 4,
  source: 'scheduler test fixture',
  semanticGroup,
});

describe('mastery requires independent practice', () => {
  it('requires each of two kinds in two distinct sessions, even after decode reaches box five', () => {
    const save = initialSave();
    for (let session = 1; session <= 5; session++) {
      recordAttempt(save, {
        id: `decode-${session}`,
        skill: 'word:sample:decode',
        kind: 'E',
        correct: true,
        judge: 'deterministic',
        session,
      });
    }
    const spelling: Attempt = {
      id: 'spell-first',
      skill: 'word:sample:spell',
      kind: 'F',
      correct: true,
      judge: 'deterministic',
      session: 6,
    };
    recordAttempt(save, spelling);
    expect(mastery(save, 'word:sample')).toBe(false);

    recordAttempt(save, { ...spelling, id: 'spell-repeat-same-session' });
    expect(mastery(save, 'word:sample')).toBe(false);

    recordAttempt(save, { ...spelling, id: 'spell-next-session', session: 7 });
    expect(mastery(save, 'word:sample')).toBe(true);
  });

  it('does not advance mastery after a revealed answer, even when the final choice is correct', () => {
    const save = initialSave();
    const attempt: Attempt & { assisted: boolean } = {
      id: 'after-answer-reveal',
      skill: 'word:sample:spell',
      kind: 'F',
      correct: true,
      judge: 'deterministic',
      session: 1,
      assisted: true,
    };
    recordAttempt(save, attempt);

    expect(save.atoms[attempt.skill]?.successes ?? []).toEqual([]);
    expect(save.atoms[attempt.skill]?.box ?? 0).toBe(0);
  });
});

describe('parent corrections replay in learning order', () => {
  it('replays session two before session five regardless of the order they were reviewed', () => {
    const save = initialSave();
    const later: Attempt = {
      id: 'session-five',
      skill: 'word:sample:say',
      kind: 'D',
      correct: true,
      judge: 'ai',
      session: 5,
      at: 500,
    };
    const earlier: Attempt = { ...later, id: 'session-two', session: 2, at: 200 };
    recordAttempt(save, later);
    recordAttempt(save, earlier);
    recordAttempt(save, { ...later, judge: 'parent', correct: true });
    recordAttempt(save, { ...earlier, judge: 'parent', correct: false });

    expect(save.atoms[later.skill].box).toBe(1);
    expect(save.atoms[later.skill].successes).toEqual([5]);
  });

  it('uses attempt time to replay corrections within one session', () => {
    const save = initialSave();
    save.history = [
      {
        id: 'later-success',
        skill: 'word:sample:decode',
        kind: 'E',
        correct: true,
        judge: 'parent',
        session: 4,
        at: 200,
      },
      {
        id: 'earlier-retry',
        skill: 'word:sample:decode',
        kind: 'E',
        correct: false,
        judge: 'parent',
        session: 4,
        at: 100,
      },
    ];
    rebuildAtoms(save);

    expect(save.atoms['word:sample:decode'].box).toBe(1);
    expect(save.atoms['word:sample:decode'].successes).toEqual([4]);
  });
});

describe('session boundaries follow actual practice', () => {
  // Namespace lookup keeps this reproduction runnable before beginSession exists.
  const beginSession = (
    learning as typeof learning & {
      beginSession?: (save: Save, now?: number) => number;
    }
  ).beginSession;

  it('opens the first session on the first answer rather than while previewing routes', () => {
    const save = initialSave();
    for (const mode of ['today', 'read', 'spell', 'listen']) schedule(save, bank, mode);
    expect(save.sessions).toBe(0);
    expect(save.dates).toEqual([]);
    expect(beginSession).toBeTypeOf('function');

    const now = Date.UTC(2026, 0, 1, 10);
    expect(beginSession!(save, now)).toBe(1);
    expect(save.sessions).toBe(1);
    expect(save.dates).toEqual([now]);
  });

  it('reuses a session within thirty minutes of the last answer and starts another after a longer gap', () => {
    expect(beginSession).toBeTypeOf('function');
    const save = initialSave();
    const minute = 60_000;
    const now = Date.UTC(2026, 0, 1, 10);

    expect(beginSession!(save, now)).toBe(1);
    expect(beginSession!(save, now + 29 * minute)).toBe(1);
    expect(beginSession!(save, now + 58 * minute)).toBe(1);
    expect(save.sessions).toBe(1);
    expect(beginSession!(save, now + 89 * minute)).toBe(2);
    expect(save.sessions).toBe(2);
    expect(save.dates).toHaveLength(2);
  });
});

describe('scheduler coverage and review intervals', () => {
  it('offers every eligible seed word and both eligible sentences within twenty-four sessions', () => {
    const save = initialSave();
    const aliases = aliasWordIds(bank, save.settings.lesson);
    const required = bank.words.filter(
      (item) => item.lesson <= save.settings.lesson && !item.beyond && !item.hold && !aliases.has(item.id),
    );
    expect(required.filter((item) => item.kind === 'sentence').length).toBeGreaterThanOrEqual(2);
    const seen = new Set<string>();
    for (let session = 1; session <= 24; session++) {
      save.sessions = session;
      const questions = schedule(save, bank, 'today');
      questions.forEach((question, index) => {
        if (['D', 'E', 'F', 'G'].includes(question.kind)) seen.add(question.target);
        recordAttempt(save, {
          id: `${session}:${index}`,
          skill: question.skill,
          kind: question.kind,
          correct: true,
          judge: question.kind === 'D' ? 'parent' : 'deterministic',
          session,
        });
      });
    }

    expect(required.filter((item) => !seen.has(item.id)).map((item) => item.id)).toEqual([]);
  });

  it('uses both sides of a minimal pair as the B target', () => {
    const pairBank: Bank = {
      ...bank,
      confusions: [{ pair: ['b', 'p'], type: 'initial', minimalPairs: [['ba1', 'pa1']], tip: '' }],
    };
    const targets = new Set<string>();
    const save = initialSave();
    for (let session = 1; session <= 24; session++) {
      save.sessions = session;
      for (const question of schedule(save, pairBank, 'today')) {
        if (question.kind === 'B') targets.add(question.target);
      }
    }

    expect([...targets].sort()).toEqual(['ba1', 'pa1']);
  });

  it('builds every C question from a syllable and a real rival (same first sound and tone)', () => {
    const save = initialSave();
    const targets = new Set<string>();
    for (let session = 1; session <= 24; session++) {
      save.sessions = session;
      for (const question of schedule(save, bank, 'read')) {
        if (question.kind !== 'C') continue;
        targets.add(question.target);
        expect(question.choices).toHaveLength(2);
        expect(question.choices).toContain(question.target);
        const [a, b] = question.choices.map((id) => bank.syllables.find((sy) => sy.id === id)!);
        expect(a.initial).toBe(b.initial);
        expect(a.tone).toBe(b.tone);
        expect(a.final).not.toBe(b.final);
      }
    }
    expect(targets.size).toBeGreaterThanOrEqual(12);
  });

  it.each([6, 99])('keeps a known word due in session %i out of the current main fresh pool', (due) => {
    const save = initialSave();
    save.sessions = 5;
    save.atoms['word:later:decode'] = {
      box: 3,
      due,
      successes: [1, 2, 3],
      kinds: ['E'],
      needsReview: false,
    };
    const fixture: Bank = { ...bank, words: [word('fresh'), word('later')] };
    const mainWords = schedule(save, fixture, 'today').filter(
      (question) => question.phase === 'main' && ['D', 'E', 'F'].includes(question.kind),
    );

    expect(mainWords.length).toBeGreaterThan(0);
    expect(mainWords.every((question) => question.target === 'fresh')).toBe(true);
  });
});

describe('choices have one clear interpretation', () => {
  it('keeps different pictures in the same semantic group out of each other’s distractors', () => {
    const words = [word('cloth', 'cloth'), word('cleaning-cloth', 'cloth'), word('unrelated', 'other')];
    const fixture: Bank = { ...bank, words };
    const save = initialSave();
    for (let session = 1; session <= 8; session++) {
      save.sessions = session;
      for (const question of schedule(save, fixture, 'today').filter((item) => item.kind === 'E')) {
        const target = words.find((item) => item.id === question.target)!;
        const distractors = question.choices.filter((id) => id !== target.id);
        expect(
          distractors.every(
            (id) => words.find((item) => item.id === id)!.semanticGroup !== target.semanticGroup,
          ),
        ).toBe(true);
      }
    }
  });

  it('keeps i/y and u/w out of each other’s listening choices', () => {
    const fixture: Bank = {
      ...bank,
      letters: bank.letters.filter((letter) => ['i', 'y', 'u', 'w', 'a', 'o'].includes(letter.id)),
    };
    const counterpart: Record<string, string> = { i: 'y', y: 'i', u: 'w', w: 'u' };
    const save = initialSave();
    const tested = new Set<string>();
    for (let session = 1; session <= 8; session++) {
      save.sessions = session;
      for (const question of schedule(save, fixture, 'listen', 60).filter((item) => item.kind === 'A')) {
        if (!counterpart[question.target]) continue;
        tested.add(question.target);
        expect(question.choices).not.toContain(counterpart[question.target]);
      }
    }

    expect([...tested].sort()).toEqual(['i', 'u', 'w', 'y']);
  });
});

describe('immediate contrast practice', () => {
  it('inserts four two-way contrasts and decays the confusion after independent success', () => {
    const save = initialSave();
    const q = schedule(save, bank, 'today');
    const result = insertContrasts(q, 0, bank, 'b|p');
    const block = result.slice(1, 5);
    expect(block).toHaveLength(4);
    expect(new Set(block.map((x) => x.target)).size).toBe(2);
    expect(block.every((x) => x.skill === 'pair:b|p:hear')).toBe(true);
    for (let i = 0; i < 2; i++)
      recordAttempt(save, {
        id: `wrong${i}`,
        skill: 'pair:b|p:hear',
        kind: 'B',
        correct: false,
        judge: 'deterministic',
        session: 1,
        confusion: 'b|p',
      });
    expect(save.confusions['b|p']).toBe(2);
    recordAttempt(save, {
      id: 'clear',
      skill: 'pair:b|p:hear',
      kind: 'B',
      correct: true,
      judge: 'deterministic',
      session: 1,
    });
    expect(save.confusions['b|p']).toBe(1);
  });
});
