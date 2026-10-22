import { describe, expect, it } from 'vitest';
import { bank } from './content';
import { initialSave, recordAttempt, schedule } from './learning';
import { parseSyllable } from './pinyin';
import type { Bank, Question, Word } from './types';

interface Scene {
  id: string;
  title: string;
  prompt: string;
  lesson: number;
  targets: string[];
}
type CurriculumBank = Bank & { scenes?: Scene[] };
type SceneQuestion = Question & { scene?: string };
const curriculum = bank as CurriculumBank;
const scenes = curriculum.scenes ?? [];
const stageWords = bank.words.filter(
  (word) => word.lesson <= 8 && !word.beyond && !['sentence', 'cloze'].includes(word.kind),
);

// This map is independent of each syllable's declared lesson, so a mistakenly
// early lesson tag cannot hide untaught initials or finals in a word.
const initialLesson: Record<string, number> = {
  '': 1,
  y: 2,
  w: 2,
  b: 3,
  p: 3,
  m: 3,
  f: 3,
  d: 4,
  t: 4,
  n: 4,
  l: 4,
  g: 5,
  k: 5,
  h: 5,
  j: 6,
  q: 6,
  x: 6,
  z: 7,
  c: 7,
  s: 7,
  zh: 8,
  ch: 8,
  sh: 8,
  r: 8,
};
const finalLesson: Record<string, number> = {
  a: 1,
  o: 1,
  e: 1,
  i: 2,
  u: 2,
  v: 2,
  ia: 2,
  ua: 2,
  uo: 2,
  ai: 9,
  ei: 9,
  ui: 9,
  uai: 9,
  ao: 10,
  ou: 10,
  iu: 10,
  iao: 10,
  ie: 11,
  ve: 11,
  ue: 11,
  er: 11,
  an: 12,
  en: 12,
  in: 12,
  un: 12,
  vn: 12,
  ian: 12,
  uan: 12,
  ang: 13,
  eng: 13,
  ing: 13,
  ong: 13,
  iang: 13,
  uang: 13,
  iong: 13,
};

describe('current and next-stage curriculum', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'makes lesson %i playable with material introduced in that lesson',
    (lesson) => {
      expect(bank.lessons.some((item) => item.id === lesson)).toBe(true);
      expect(bank.syllables.some((item) => item.lesson === lesson)).toBe(true);
      const save = initialSave();
      save.settings.lesson = lesson;
      const newMaterial = new Set<string>();
      for (let session = 1; session <= 8; session++) {
        save.sessions = session;
        const questions = schedule(save, bank, 'today');
        expect(questions.length).toBeGreaterThan(0);
        expect(questions.every((question) => question.lesson <= lesson)).toBe(true);
        for (const question of questions) if (question.lesson === lesson) newMaterial.add(question.target);
      }

      expect(newMaterial.size).toBeGreaterThan(0);
    },
  );

  it('provides at least eighty usable words including thirty-five from lessons five to eight', () => {
    expect(stageWords.length).toBeGreaterThanOrEqual(80);
    expect(stageWords.filter((word) => word.lesson >= 5).length).toBeGreaterThanOrEqual(35);
  });

  it('does not introduce a word before its own initials and finals have been taught', () => {
    const problems: string[] = [];
    for (const word of bank.words.filter((item) => item.lesson <= 8 && !item.beyond)) {
      for (const id of word.syllables) {
        const parsed = parseSyllable(id);
        if (!parsed) {
          problems.push(`${word.id}: invalid syllable ${id}`);
          continue;
        }
        const required = Math.max(initialLesson[parsed.initial] ?? 99, finalLesson[parsed.final] ?? 99);
        const entry = bank.syllables.find((syllable) => syllable.id === id);
        if (!entry || entry.lesson > word.lesson || required > word.lesson) {
          problems.push(
            `${word.id}: ${id} needs lesson ${Math.max(required, entry?.lesson ?? 99)}, tagged ${word.lesson}`,
          );
        }
      }
    }

    expect(problems).toEqual([]);
  });
});

describe('daily-life scenes progress with the course', () => {
  it('includes twenty-four distinct scenes with instructions and targets across lessons three to eight', () => {
    expect(scenes.length).toBeGreaterThanOrEqual(24);
    expect(new Set(scenes.map((scene) => scene.id)).size).toBe(scenes.length);
    for (const lesson of [3, 4, 5, 6, 7, 8]) {
      expect(scenes.some((scene) => scene.lesson === lesson)).toBe(true);
    }
    for (const scene of scenes) {
      expect(scene.title.trim().length).toBeGreaterThan(0);
      expect(scene.prompt.trim().length).toBeGreaterThan(0);
      expect(scene.targets.length).toBeGreaterThan(0);
      const targetLessons: number[] = [];
      for (const id of scene.targets) {
        const target = bank.words.find((word) => word.id === id);
        expect(target, `scene ${scene.id} refers to a missing target ${id}`).toBeDefined();
        expect(target!.beyond).not.toBe(true);
        targetLessons.push(target!.lesson);
      }
      // A familiar setting can gain harder vocabulary as the child progresses.
      expect(scene.lesson).toBe(Math.min(...targetLessons));
    }
  });

  it.each([3, 4, 5, 6, 7, 8])(
    'covers all scenes available at lesson %i within twenty-four practice sessions',
    (lesson) => {
      const available = scenes.filter(
        (scene) =>
          scene.lesson <= lesson &&
          scene.targets.some((id) =>
            bank.words.some((word) => word.id === id && word.lesson <= lesson && !word.beyond),
          ),
      );
      expect(available.length).toBeGreaterThan(0);
      const save = initialSave();
      save.settings.lesson = lesson;
      const seen = new Set<string>();
      for (let session = 1; session <= 24; session++) {
        save.sessions = session;
        const questions = schedule(save, bank, 'scene') as SceneQuestion[];
        expect(questions.length).toBeGreaterThan(0);
        questions.forEach((question, index) => {
          expect(['E', 'F', 'G']).toContain(question.kind);
          const scene = available.find((item) => item.id === question.scene);
          expect(scene, `question ${question.id} needs an eligible scene`).toBeDefined();
          expect(scene!.targets).toContain(question.target);
          const target = bank.words.find((word) => word.id === question.target);
          expect(target).toBeDefined();
          expect(target!.lesson).toBeLessThanOrEqual(lesson);
          expect(question.lesson).toBeLessThanOrEqual(lesson);
          expect(target!.beyond).not.toBe(true);
          seen.add(scene!.id);
          recordAttempt(save, {
            id: `scene:${lesson}:${session}:${index}`,
            skill: question.skill,
            kind: question.kind,
            correct: true,
            judge: 'deterministic',
            session,
          });
        });
      }

      expect(available.filter((scene) => !seen.has(scene.id)).map((scene) => scene.id)).toEqual([]);
    },
  );
});

describe('a spoken word has a unique picture answer', () => {
  it('keeps homophones such as 旗 and 棋 out of each other’s E distractors', () => {
    const sample = (id: string, hanzi: string, syllables: string[], lesson: number): Word => ({
      id,
      hanzi,
      syllables,
      display: id,
      picture: id,
      kind: 'noun',
      lesson,
      source: 'homophone test fixture',
      semanticGroup: id,
    });
    const words = [
      sample('flag', '旗', ['qi2'], 6),
      sample('chess', '棋', ['qi2'], 6),
      sample('flower', '花', ['hua1'], 5),
    ];
    const fixture: Bank = { ...bank, words };
    const save = initialSave();
    save.settings.lesson = 8;
    const tested = new Set<string>();
    for (let session = 1; session <= 8; session++) {
      save.sessions = session;
      for (const question of schedule(save, fixture, 'today').filter((item) => item.kind === 'E')) {
        const target = words.find((word) => word.id === question.target)!;
        tested.add(target.id);
        const homophones = words.filter(
          (word) => word.id !== target.id && word.syllables.join(' ') === target.syllables.join(' '),
        );
        for (const other of homophones) expect(question.choices).not.toContain(other.id);
      }
    }

    expect(tested.has('flag')).toBe(true);
    expect(tested.has('chess')).toBe(true);
  });
});
