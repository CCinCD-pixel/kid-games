import { describe, expect, it } from 'vitest';
import { bank } from './content';
import { initialSave, schedule } from './learning';
import { parseSyllable } from './pinyin';
import type { Bank, Question, Word } from './types';

/**
 * 课本对齐 stage 2b: text cards (汉字卡) in E / F / D, the "never two in a row, at most 40%" rule, and 阶段复习.
 * The school words are held until their recordings exist; these tests open them on a copy of the bank, exactly as the generator
 * will once the audio lands.
 */
const SCHOOL = '学校拼音练习';
const open: Bank = { ...bank, words: bank.words.map((w) => (w.source === SCHOOL ? (({ hold: _hold, ...rest }) => rest)(w) as Word : w)) };
const isText = (id: string) => open.words.find((w) => w.id === id)?.picture.startsWith('text:') ?? false;
const MODES = ['today', 'spell', 'repair', 'listen', 'read'];
const wordKinds = ['E', 'F', 'D'];

describe('text cards in a programme', () => {
  it('are never two in a row and at most 40% (6 of 15), in every mode and station', () => {
    let total = 0;
    for (const L of [8, 9, 10, 11, 12]) {
      const save = initialSave();
      save.settings.lesson = L;
      for (let session = 1; session <= 40; session++) {
        save.sessions = session;
        for (const mode of MODES) {
          const qs = schedule(save, open, mode);
          const flags = qs.map((q) => wordKinds.includes(q.kind) && isText(q.target));
          total += flags.filter(Boolean).length;
          expect(flags.filter(Boolean).length, `${mode} L${L} #${session}`).toBeLessThanOrEqual(6);
          flags.forEach((f, i) => expect(f && flags[i - 1], `${mode} L${L} #${session} @${i}`).toBeFalsy());
        }
      }
    }
    expect(total).toBeGreaterThan(300); // the rule is exercised, not vacuous
  });
  it('make E a reading task: every choice is a text card, three similar-sounding real words, target among them', () => {
    let seen = 0,
      alike = 0;
    const sameSound = (a: string, b: string) => {
      const pa = open.words.find((w) => w.id === a)!.syllables.map((s) => parseSyllable(s)),
        pb = open.words.find((w) => w.id === b)!.syllables.map((s) => parseSyllable(s));
      return pa.some((x) => pb.some((y) => x && y && ((x.initial && x.initial === y.initial) || x.final === y.final)));
    };
    for (const L of [9, 10, 11, 12]) {
      const save = initialSave();
      save.settings.lesson = L;
      for (let session = 1; session <= 50; session++) {
        save.sessions = session;
        for (const q of schedule(save, open, 'today').filter((x) => x.kind === 'E')) {
          expect(q.choices, q.id).toContain(q.target);
          const kinds = new Set(q.choices.map(isText));
          expect(kinds.size, `${q.id}: a text card is never mixed with drawings`).toBe(1);
          if (!isText(q.target)) continue;
          seen++;
          expect(q.choices).toHaveLength(4);
          expect(new Set(q.choices.map((c) => open.words.find((w) => w.id === c)!.hanzi)).size).toBe(4);
          if (q.choices.filter((c) => c !== q.target).some((c) => sameSound(q.target, c))) alike++;
        }
      }
    }
    expect(seen).toBeGreaterThan(40);
    expect(alike / seen).toBeGreaterThanOrEqual(0.85); // the distractors really sound alike
  });
  it('keep the new station at least 60% of a programme even when its words are text cards', () => {
    for (const L of [9, 10, 11, 12]) {
      const save = initialSave();
      save.settings.lesson = L;
      for (let session = 1; session <= 40; session++) {
        save.sessions = session;
        const qs = schedule(save, open, 'today');
        expect(qs.filter((q) => q.lesson >= L - 1).length / qs.length, `L${L} #${session}`).toBeGreaterThanOrEqual(0.6);
      }
    }
  });
  it('are not asked at all while the word is held (the real bank)', () => {
    const save = initialSave();
    for (const L of [9, 12]) {
      save.settings.lesson = L;
      for (let session = 1; session <= 20; session++) {
        save.sessions = session;
        for (const mode of MODES) for (const q of schedule(save, bank, mode)) expect(bank.words.find((w) => w.id === q.target)?.hold, q.id).toBeFalsy();
      }
    }
  });
});

describe('阶段复习 (review programme)', () => {
  const programme = (L: number, session: number, b: Bank = open): Question[] => {
    const save = initialSave();
    save.settings.lesson = L;
    save.sessions = session;
    return schedule(save, b, 'review');
  };
  it('is a fixed arrangement of 20: 14 blends and 6 read-aloud words, from the first eight stations', () => {
    for (const L of [8, 9, 10, 11, 12, 13])
      for (let session = 1; session <= 30; session++) {
        const qs = programme(L, session);
        expect(qs).toHaveLength(20);
        expect(qs.map((q) => q.kind).join('')).toBe('CCDCCDCCDCCDCCDCCDCC');
        expect(qs.filter((q) => q.kind === 'D').map((q) => q.target)).toHaveLength(6);
        expect(new Set(qs.filter((q) => q.kind === 'D').map((q) => q.target)).size).toBe(6);
        for (const q of qs.filter((x) => x.kind === 'D')) expect(open.words.find((w) => w.id === q.target)!.lesson).toBeLessThanOrEqual(8);
      }
  });
  it('spreads the blends over many first sounds with real rivals, never a neutral or recording-less syllable', () => {
    for (const L of [8, 12]) {
      for (let session = 1; session <= 30; session++) {
        const cs = programme(L, session).filter((q) => q.kind === 'C');
        expect(cs).toHaveLength(14);
        expect(new Set(cs.map((q) => q.target)).size).toBe(14);
        expect(new Set(cs.map((q) => parseSyllable(q.target)!.initial)).size).toBeGreaterThanOrEqual(9);
        for (const q of cs) {
          expect(q.choices).toHaveLength(2);
          const [a, b] = q.choices.map((id) => open.syllables.find((s) => s.id === id)!);
          expect([a.initial, a.tone]).toEqual([b.initial, b.tone]);
          expect(a.lesson).toBeLessThanOrEqual(8);
          for (const s of [a, b]) {
            expect(s.tone).toBeGreaterThan(0);
            expect(s.wordOnly).toBeFalsy();
          }
        }
      }
    }
  });
  it('is the same for the same save (data-generated, no randomness outside the seed)', () => {
    expect(programme(9, 5)).toEqual(programme(9, 5));
    expect(programme(9, 5).map((q) => q.id)).not.toEqual(programme(9, 6).map((q) => q.id));
  });
  it('works on the real bank too (words held), and respects the text-card rule', () => {
    for (let session = 1; session <= 20; session++) {
      const qs = programme(12, session, bank);
      expect(qs).toHaveLength(20);
      for (const q of qs.filter((x) => x.kind === 'D')) expect(bank.words.find((w) => w.id === q.target)?.hold).toBeFalsy();
    }
    for (let session = 1; session <= 20; session++) {
      const flags = programme(12, session).map((q) => q.kind === 'D' && isText(q.target));
      expect(flags.filter(Boolean).length).toBeLessThanOrEqual(8);
      flags.forEach((f, i) => expect(f && flags[i - 1]).toBeFalsy());
    }
  });
});
