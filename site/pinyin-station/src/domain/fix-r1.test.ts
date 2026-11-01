import { describe, expect, it } from 'vitest';
import { bank } from './content';
import { aliasWordIds, eligibleWords, heardLetters, initialSave, insertContrasts, schedule } from './learning';

/** Player-QA round 1 regressions that can be proved on the content and the scheduler alone. */
describe('one picture, one word', () => {
  it('declares every shared picture and names real words for it', () => {
    const groups = new Map<string, string[]>();
    for (const w of bank.words)
      if (!['sentence', 'cloze'].includes(w.kind)) groups.set(w.picture, [...(groups.get(w.picture) ?? []), w.id]);
    const shared = [...groups].filter(([, ids]) => ids.length > 1).map(([picture]) => picture);
    for (const picture of shared) expect(Object.keys(bank.pictureOwners ?? {}), `undeclared shared picture ${picture}`).toContain(picture);
    for (const [picture, order] of Object.entries(bank.pictureOwners ?? {}))
      for (const id of order) expect(bank.words.find((w) => w.id === id)?.picture, `${picture}:${id}`).toBe(picture);
  });
  it.each(Array.from({ length: 13 }, (_, i) => i + 1))(
    'lesson %i: no two askable words share a picture or a spelling',
    (lesson) => {
      const save = initialSave();
      save.settings.lesson = lesson;
      const words = eligibleWords(save, bank);
      for (const key of ['picture', 'hanzi'] as const) {
        const seen = new Map<string, string>();
        for (const w of words) {
          expect(seen.get(w[key]), `${key} ${w[key]}: ${seen.get(w[key])} / ${w.id}`).toBeUndefined();
          seen.set(w[key], w.id);
        }
      }
    },
  );
  it('keeps exactly one word for every shared picture once its lesson is open', () => {
    for (const [picture, order] of Object.entries(bank.pictureOwners ?? {})) {
      const first = Math.min(...order.map((id) => bank.words.find((w) => w.id === id)!.lesson));
      // A held-out picture (see the 'held-out pictures' tests) has no askable word at all, until it is redrawn.
      const expected = order.every((id) => bank.words.find((w) => w.id === id)?.hold) ? 0 : 1;
      const late = initialSave();
      late.settings.lesson = 13;
      expect(eligibleWords(late, bank).filter((w) => w.picture === picture), picture).toHaveLength(expected);
      const early = initialSave();
      early.settings.lesson = first;
      expect(eligibleWords(early, bank).filter((w) => w.picture === picture), picture).toHaveLength(expected);
    }
  });
  it('never asks an alias, and never offers one picture twice in a picture question', () => {
    const save = initialSave();
    for (let session = 1; session <= 30; session++) {
      save.sessions = session;
      for (const lesson of [4, 8, 13]) {
        save.settings.lesson = lesson;
        const aliases = aliasWordIds(bank, lesson);
        for (const mode of ['today', 'scene', 'spell']) {
          for (const q of schedule(save, bank, mode)) {
            if (!['E', 'F', 'D'].includes(q.kind)) continue;
            expect(aliases.has(q.target), q.id).toBe(false);
            if (q.kind !== 'E') continue;
            const pictures = q.choices.map((id) => bank.words.find((w) => w.id === id)!.picture);
            expect(new Set(pictures).size, q.id).toBe(pictures.length);
          }
        }
      }
    }
  });
});

describe('listening questions have exactly one right answer', () => {
  it('never offers a letter that is also inside the call sound that is played', () => {
    const save = initialSave();
    let seen = 0;
    for (let session = 1; session <= 60; session++) {
      save.sessions = session;
      for (const lesson of [2, 3, 4, 6, 8]) {
        save.settings.lesson = lesson;
        for (const mode of ['listen', 'today']) {
          for (const q of schedule(save, bank, mode)) {
            if (q.kind !== 'A') continue;
            seen++;
            const target = bank.letters.find((l) => l.id === q.target)!;
            const heard = heardLetters(target.callSound);
            const rivals = q.choices.filter((id) => id !== q.target);
            expect(rivals.filter((id) => heard.has(id)), `${q.id} ${target.callSound} -> ${q.choices}`).toEqual([]);
            expect(new Set(q.choices).size).toBe(q.choices.length);
            expect(q.choices).toContain(q.target);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(300);
  });
  it('reads the fō case right: f and o together are never both on offer', () => {
    expect([...heardLetters('fo1')].sort()).toEqual(['f', 'o']);
    expect([...heardLetters('yu1')].sort()).toEqual(['u', 'v', 'y']);
    expect([...heardLetters('zhi1')].sort()).toEqual(['i', 'zh']);
  });
  it('does not repeat the same pair or letter before the others have had a turn', () => {
    const save = initialSave();
    for (let session = 1; session <= 20; session++) {
      save.sessions = session;
      const qs = schedule(save, bank, 'listen');
      const letters = qs.filter((q) => q.kind === 'A').map((q) => q.target);
      expect(new Set(letters).size, `session ${session}`).toBe(letters.length);
      const pairs = qs.filter((q) => q.kind === 'B').map((q) => q.skill);
      for (let i = 1; i < pairs.length; i++) expect(pairs[i], `session ${session} #${i}`).not.toBe(pairs[i - 1]);
    }
  });
});

/** Round 2 (R04): three pictures are too hard to read; their words are held out of the question pool until redrawn. */
describe('held-out pictures', () => {
  const HELD = ['mali', 'dabo', 'eight-pears'];
  const MODES = ['today', 'scene', 'listen', 'spell', 'repair', 'read'];
  it('marks exactly the three unreadable pictures, each with a reason', () => {
    const held = bank.words.filter((w) => w.hold);
    expect(held.map((w) => w.id).sort()).toEqual([...HELD].sort());
    for (const w of held) expect(w.hold, w.id).toMatch(/重画/);
  });
  it.each(Array.from({ length: 13 }, (_, i) => i + 1))('lesson %i keeps a usable pool without them', (lesson) => {
    const save = initialSave();
    save.settings.lesson = lesson;
    const pool = eligibleWords(save, bank);
    expect(pool.some((w) => w.hold)).toBe(false);
    const aliases = aliasWordIds(bank, lesson);
    const before = bank.words.filter(
      (w) => w.lesson <= lesson && !['sentence', 'cloze'].includes(w.kind) && !w.beyond && !aliases.has(w.id),
    );
    // Taking three words away never empties a lesson that had words, and a lesson with 3+ words still has 3+.
    expect(pool.length).toBeGreaterThanOrEqual(Math.min(before.length, 3));
    expect(pool.length).toBeGreaterThanOrEqual(before.filter((w) => !w.hold).length);
  });
  it('never asks a held word or offers one as a choice, and every mode still fills a programme', () => {
    const save = initialSave();
    const heldIds = new Set(HELD);
    for (let session = 1; session <= 30; session++) {
      save.sessions = session;
      for (const lesson of [1, 2, 3, 4, 5, 8, 13]) {
        save.settings.lesson = lesson;
        for (const mode of MODES) {
          const qs = schedule(save, bank, mode);
          expect(qs, `${mode} L${lesson}`).toHaveLength(15);
          for (const q of qs) {
            expect(q.target, q.id).toBeTruthy();
            if (['E', 'F', 'D', 'G'].includes(q.kind)) expect(bank.words.some((w) => w.id === q.target), q.id).toBe(true);
            expect(heldIds.has(q.target), q.id).toBe(false);
            if (q.kind === 'E') {
              for (const c of q.choices) expect(heldIds.has(c), q.id).toBe(false);
              if (lesson >= 3) expect(q.choices.length, `${q.id} L${lesson}`).toBeGreaterThanOrEqual(3);
            }
          }
        }
      }
    }
  });
});

/** Round 2 (R08): an inserted contrast block never plays the same sound twice in a row. */
describe('contrast blocks', () => {
  it('alternate, and do not repeat the sound just answered or the one that follows', () => {
    const save = initialSave();
    let blocks = 0;
    for (let session = 1; session <= 40; session++) {
      save.sessions = session;
      for (const mode of ['listen', 'today']) {
        const queue = schedule(save, bank, mode);
        for (const pair of bank.confusions) {
          for (const index of [0, 1, 2, 4, 7]) {
            const result = insertContrasts(queue, index, bank, pair.pair.join('|'));
            if (result.length === queue.length) continue;
            blocks++;
            const added = result.length - queue.length;
            const run = result.slice(index, index + added + 2); // answered question, block, next question
            for (let i = 1; i < run.length; i++)
              expect(run[i].target, `${pair.pair} @${index}: ${run.map((q) => q.target)}`).not.toBe(run[i - 1].target);
            expect(added).toBeGreaterThanOrEqual(3);
            expect(result.length).toBeLessThanOrEqual(24);
          }
        }
      }
    }
    expect(blocks).toBeGreaterThan(100);
  });
  it('stays inside the 24 question limit even when the queue is nearly full', () => {
    const queue = Array.from({ length: 23 }, (_, i) => ({
      ...schedule(initialSave(), bank, 'listen')[0],
      id: `B:x${i}`,
      target: i % 2 ? 'ba1' : 'pa1',
    }));
    expect(insertContrasts(queue, 3, bank, 'b|p').length).toBeLessThanOrEqual(24);
  });
});
