import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bank } from './content';
import { initialSave, recordAttempt, schedule } from './learning';
import { DRILL_DAYS, STABLE_BOX, dueRoots, dueSummary, drillDue, nextDrillDue, pageProgress, rootOf, skillLabel, skillStation, stationColumns, weakItems, weekRoots, weekVolume } from './progress';
import { MAX_GROUPS, QUIZ_LENGTH, buildWeeklyQuiz, buildWorksheet } from './worksheet';
import { bookPages, readsText } from '../views/readbook';
import { BOOK } from '../views/lines';
import type { Attempt, Save } from './types';
// @ts-expect-error plain .mjs module shared with the CLI
import { spokenText, violations } from '../../tools/spoken-text.mjs';

/** 课本对齐 stage 4: 朗读册, 按课本页 report, review queue, printable practice page and weekly review. */
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const yaml = JSON.parse(fs.readFileSync(path.join(root, 'content/narration/pinyin-station.yaml'), 'utf8')) as { lines: { id: string; role: string; text: string }[] };
const NOW = Date.parse('2026-11-08T10:00:00+08:00'); // a Sunday
let n = 0;
const attempt = (s: Save, skill: string, correct: boolean, session: number, at = NOW - 3600_000): void => {
  const a: Attempt = { id: `a${++n}`, skill, kind: 'E', correct, judge: 'deterministic', session, at };
  recordAttempt(s, a);
};
const fresh = (lesson = 12): Save => {
  const s = initialSave();
  s.settings.lesson = lesson;
  return s;
};

describe('skills and roots', () => {
  it('a skill root is its first two parts, and every root of a bank item maps back to a station', () => {
    expect(rootOf('tone4:ai:hear')).toBe('tone4:ai');
    expect(rootOf('syl:guai1:blend')).toBe('syl:guai1');
    expect(rootOf('word:ditu:decode')).toBe('word:ditu');
    expect(skillStation(bank, 'tone4:ai')).toBe(9);
    expect(skillStation(bank, 'tone4:zhi')).toBe(8);
    expect(skillStation(bank, 'syl:guai1')).toBeDefined();
    expect(skillStation(bank, 'pair:b|p')).toBeDefined();
    expect(skillStation(bank, 'glyph:d')).toBeDefined();
    expect(skillLabel(bank, 'tone4:ai')).toBe('四声 āi ái ǎi ài');
    expect(skillLabel(bank, 'letter:v')).toBe('字母 ü');
    expect(skillLabel(bank, 'word:ditu')).toMatch(/^词语 地图（/);
  });
});

describe('B5 复习队列: every kind of skill atom joins the spaced review', () => {
  it('tone4, blend, letter, pair and glyph atoms come due the next session, like words do', () => {
    const s = fresh();
    s.sessions = 1;
    for (const skill of ['tone4:ai:hear', 'syl:guai1:blend', 'letter:b:hear', 'pair:b|p:hear', 'glyph:d:see', 'word:ditu:decode']) attempt(s, skill, true, 1);
    s.sessions = 2;
    const due = dueRoots(s);
    for (const r of ['tone4:ai', 'syl:guai1', 'letter:b', 'pair:b|p', 'glyph:d', 'word:ditu']) expect(due.has(r), r).toBe(true);
    // ... and spread out later (box 5 = 16 sessions)
    expect(dueRoots(s, 1).size).toBe(0);
  });
  it('a due letter is met first in a programme, once, before the others', () => {
    for (let session = 3; session <= 20; session++) {
      const s = fresh(12);
      s.sessions = session;
      s.atoms['letter:q:hear'] = { box: 1, due: session, successes: [1], kinds: ['A'], needsReview: false };
      s.atoms['letter:x:hear'] = { box: 1, due: session + 5, successes: [1], kinds: ['A'], needsReview: false };
      const first = schedule(s, bank, 'listen').find((q) => q.kind === 'A')!;
      expect(first.target, `session ${session}`).toBe('q');
    }
  });
  it('the home note counts what the next programme brings back, by book page, and is silent for a fresh save', () => {
    const s = fresh(12);
    expect(dueSummary(s, bank, NOW).total).toBe(0);
    s.sessions = 3;
    s.lastAttemptAt = NOW - 5 * 3600_000; // a new session starts at the next programme
    attempt(s, 'tone4:ai:hear', false, 3);
    attempt(s, 'word:ditu:decode', true, 3);
    s.lastAttemptAt = NOW - 5 * 3600_000;
    const d = dueSummary(s, bank, NOW);
    expect(d.atoms).toBe(2);
    expect(d.pages.length).toBeGreaterThan(0);
    expect(d.pages.every((p) => p.page > 0)).toBe(true);
    // the same session (a programme is still going): nothing new is due yet
    s.lastAttemptAt = NOW - 60_000;
    expect(dueSummary(s, bank, NOW).atoms).toBe(0);
    // items of a station the teacher has not reached are not mentioned
    const low = fresh(2);
    low.sessions = 3;
    low.lastAttemptAt = NOW - 5 * 3600_000;
    attempt(low, 'tone4:ai:hear', false, 3);
    low.lastAttemptAt = NOW - 5 * 3600_000;
    expect(dueSummary(low, bank, NOW).atoms).toBe(0);
  });
  it('a 练读表 comes back after 1, 2, 4, 7 and 14 days, never earlier', () => {
    expect([0, 1, 2, 3, 4, 9].map((box) => (nextDrillDue(box, 0) / 86400000))).toEqual([1, 2, 4, 7, 14, 14]);
    expect(DRILL_DAYS).toHaveLength(5);
    const s = fresh(12);
    s.drillBest = { 'final:12': { best: 30, last: 30, at: NOW - 2 * 86400000, box: 0, due: NOW - 1000 }, 'final:9': { best: 30, last: 30, at: NOW, box: 1, due: NOW + 86400000 }, 'blend:12': { best: 40, last: 40, at: 1 } };
    expect(drillDue(s, NOW)).toEqual(['final:12']);
    expect(dueSummary(s, bank, NOW).drills).toBe(1);
    // only up to the station the teacher has reached
    s.settings.lesson = 8;
    expect(drillDue(s, NOW)).toEqual([]);
  });
});

describe('B7 按课本页 report', () => {
  it('has a row per station with book pages, up to the station the teacher has reached, with its columns', () => {
    const s = fresh(12);
    const rows = pageProgress(s, bank);
    expect(rows.map((r) => r.station)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(rows.find((r) => r.station === 12)!.pages).toEqual([16]);
    expect(rows.find((r) => r.station === 11)!.pages).toEqual([14, 15]);
    for (const r of rows) for (const c of r.columns) expect(c.total, `${r.station} ${c.name}`).toBeGreaterThan(0);
    expect(pageProgress(fresh(5), bank).map((r) => r.station)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.flatMap((r) => r.columns).every((c) => c.done === 0)).toBe(true);
  });
  it('counts only items that are steady (box ' + STABLE_BOX + ' or more) and shows "拼一拼 k/total"', () => {
    const s = fresh(12);
    const blends = stationColumns(bank, 12).find((c) => c.col === 'blend')!;
    // a blend counts once for all four of its tones (63 syllables are about 20 blends, not 63 items)
    expect(blends.groups.length).toBeGreaterThan(5);
    expect(blends.groups.length).toBeLessThan(blends.roots.length);
    s.atoms[`${blends.groups[0][0]}:blend`] = { box: STABLE_BOX, due: 9, successes: [1, 2, 3], kinds: ['C'], needsReview: false };
    s.atoms[`${blends.groups[1][0]}:blend`] = { box: STABLE_BOX - 1, due: 9, successes: [1, 2], kinds: ['C'], needsReview: false };
    const col = pageProgress(s, bank).find((r) => r.station === 12)!.columns.find((c) => c.col === 'blend')!;
    expect(col.done).toBe(1);
    expect(col.total).toBe(blends.groups.length);
  });
  it('lists the ten shakiest items with their book page, the worst first, and never a recording', () => {
    const s = fresh(12);
    s.sessions = 4;
    for (let i = 0; i < 3; i++) attempt(s, 'word:ditu:decode', false, 2);
    attempt(s, 'tone4:ai:hear', false, 3);
    attempt(s, 'letter:b:hear', true, 3);
    for (const w of bank.words.filter((x) => x.lesson === 12).slice(0, 12)) attempt(s, `word:${w.id}:decode`, false, 4);
    const weak = weakItems(s, bank, 10);
    expect(weak).toHaveLength(10);
    expect(weak[0].root).toBe('word:ditu');
    expect(weak[0].misses).toBe(3);
    expect(weak.every((w, i) => i === 0 || weak[i - 1].score >= w.score)).toBe(true);
    for (const w of weak) {
      expect(w.pages.length, w.root).toBeGreaterThan(0);
      expect(w.label).not.toMatch(/\d{4}/);
    }
    expect(weakItems(s, bank).some((w) => w.root === 'letter:b')).toBe(false);
  });
  it('counts the last seven days of practice (today included) from the detailed history', () => {
    const s = fresh(12);
    const DAY = 86400000;
    attempt(s, 'letter:a:hear', true, 1, NOW - 1000);
    attempt(s, 'letter:a:hear', true, 1, NOW - 2000);
    attempt(s, 'letter:o:hear', true, 1, NOW - 2 * DAY);
    attempt(s, 'letter:e:hear', true, 1, NOW - 9 * DAY);
    const v = weekVolume(s, NOW);
    expect(v.days).toHaveLength(7);
    expect(v.days[6]).toEqual({ label: '今天', count: 2 });
    expect(v.total).toBe(3);
    expect(v.activeDays).toBe(2);
    expect(weekVolume(fresh(), NOW).total).toBe(0);
  });
});

describe('A11 朗读册', () => {
  it('lists every book page once, in order, each with its station, and the save field is optional', () => {
    const pages = bookPages(bank);
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16]);
    for (const p of pages) expect(bank.lessons.some((l) => l.id === p.station && l.book?.pages.includes(p.page))).toBe(true);
    expect(pages.find((p) => p.page === 10)!.station).toBe(2);
    const s = initialSave();
    expect(s.book).toBeUndefined(); // optional: nothing is migrated, settings.lesson is untouched
    expect(s.settings.lesson).toBe(4);
    expect(readsText(0)).toBe('还没开始读');
    expect(readsText(3)).toBe('已读 3 遍');
    expect(JSON.stringify(pages)).not.toMatch(/练习册|workbook/);
  });
  it('has a quiet companion line for the tap, plain Chinese', () => {
    const line = yaml.lines.find((l) => l.id === BOOK.plus.id)!;
    expect(line.role).toBe('companion');
    expect(line.text).toBe(BOOK.plus.text);
    expect(violations(spokenText(line))).toEqual([]);
  });
});

describe('B8 printable practice page', () => {
  const weakSave = (): Save => {
    const s = fresh(12);
    s.sessions = 5;
    for (const st of [12, 11, 9, 8]) {
      const words = bank.words.filter((w) => w.lesson === st && !w.hold).slice(0, 4);
      for (const w of words) attempt(s, `word:${w.id}:decode`, false, 4);
      for (const x of bank.syllables.filter((y) => y.lesson === st && y.initial && y.tone > 0 && !y.wordOnly).slice(0, 4)) attempt(s, `syl:${x.id}:blend`, false, 4);
    }
    attempt(s, 'tone4:ai:hear', false, 4);
    return s;
  };
  it('groups the weak spots by book page, at most 3 pages, each within its budget, only playable content', () => {
    const sheet = buildWorksheet(weakSave(), bank, 'weak', NOW);
    expect(sheet.kind).toBe('weak');
    expect(sheet.groups.length).toBeGreaterThan(0);
    expect(sheet.groups.length).toBeLessThanOrEqual(MAX_GROUPS);
    for (const g of sheet.groups) {
      expect(g.label).toMatch(/^第 [\d、]+ 页$/);
      expect(g.cells.length).toBeLessThanOrEqual(8);
      expect(g.blends.length).toBeLessThanOrEqual(4);
      expect(g.words.length).toBeLessThanOrEqual(4);
      for (const c of [...g.cells, ...(g.tone ?? [])]) expect(c).not.toMatch(/\d/);
      for (const w of g.words) expect(bank.words.find((x) => x.id === w.id)!.hold).toBeFalsy();
      for (const b of g.blends) expect(b.initial + b.final).not.toMatch(/\d/);
    }
    // the weak ones come first: the shakiest station is among the pages
    expect(JSON.stringify(sheet)).not.toMatch(/练习册|课本照片/);
    expect(buildWorksheet(weakSave(), bank, 'weak', NOW)).toEqual(sheet); // deterministic
  });
  it('with nothing shaky it is about the station the teacher reached; a chosen station is one group', () => {
    const s = fresh(9);
    const sheet = buildWorksheet(s, bank, 'weak', NOW);
    expect(sheet.groups.map((g) => g.station)).toEqual([9]);
    const lesson = buildWorksheet(s, bank, 5, NOW);
    expect(lesson.kind).toBe('lesson');
    expect(lesson.groups.map((g) => g.station)).toEqual([5]);
    expect(lesson.title).toContain('第 5 页');
    for (let st = 1; st <= 12; st++) expect(buildWorksheet(fresh(12), bank, st, NOW).groups.length, `station ${st}`).toBeLessThanOrEqual(1);
  });
});

describe('B9 weekly review', () => {
  it('is 15 to 20 numbered questions of a mix of types, from what was practised this week and what is due', () => {
    const s = fresh(12);
    s.sessions = 6;
    const words = bank.words.filter((w) => w.lesson === 12 && !w.hold).slice(0, 5);
    for (const w of words) attempt(s, `word:${w.id}:decode`, true, 5);
    const quiz = buildWeeklyQuiz(s, bank, NOW);
    expect(quiz.kind).toBe('week');
    expect(quiz.quiz.length).toBeGreaterThanOrEqual(15);
    expect(quiz.quiz.length).toBeLessThanOrEqual(QUIZ_LENGTH + 2);
    expect(quiz.quiz.map((q) => q.n)).toEqual(quiz.quiz.map((_, i) => i + 1));
    expect(new Set(quiz.quiz.map((q) => q.type)).size).toBeGreaterThanOrEqual(4);
    const heard = quiz.quiz.filter((q) => q.type === 'word') as { hanzi: string }[];
    expect(heard.some((q) => words.some((w) => w.hanzi === q.hanzi))).toBe(true); // this week's words are in it
    for (const q of quiz.quiz) for (const [k, v] of Object.entries(q)) if (k !== 'n') expect(JSON.stringify(v), `${q.n} ${k}`).not.toMatch(/\d/);
  });
  it('also works for a small bank (the first stations) and for a save that has done nothing', () => {
    for (const L of [1, 2, 3, 6, 9, 12]) {
      const q = buildWeeklyQuiz(fresh(L), bank, NOW);
      expect(q.quiz.length, `station ${L}`).toBeGreaterThanOrEqual(15);
      expect(q.quiz.length).toBeLessThanOrEqual(20);
    }
  });
  it('is also a programme in the game: 18 questions, a mix of kinds, mostly this week\'s skills, nothing on hold', () => {
    const s = fresh(12);
    s.sessions = 6;
    const recent: string[] = [];
    for (const w of bank.words.filter((x) => x.lesson >= 9 && !x.hold).slice(0, 8)) {
      attempt(s, `word:${w.id}:decode`, true, 5, Date.now() - 3600_000);
      recent.push(`word:${w.id}`);
    }
    for (const x of bank.syllables.filter((y) => y.lesson >= 9 && y.initial && y.tone > 0 && !y.wordOnly).slice(0, 8)) {
      attempt(s, `syl:${x.id}:blend`, true, 5, Date.now() - 3600_000);
      recent.push(`syl:${x.id}`);
    }
    const qs = schedule(s, bank, 'week');
    expect(qs).toHaveLength(18);
    expect(new Set(qs.map((q) => q.kind)).size).toBeGreaterThanOrEqual(4);
    const week = weekRoots(s);
    expect(qs.filter((q) => week.has(rootOf(q.skill))).length).toBeGreaterThanOrEqual(9);
    const held = new Set(bank.words.filter((w) => w.hold).map((w) => w.id));
    for (const q of qs) for (const id of [q.target, ...q.choices]) expect(held.has(id), q.id).toBe(false);
    for (let L = 1; L <= 12; L++) {
      const t = fresh(L);
      t.sessions = 3;
      expect(schedule(t, bank, 'week'), `station ${L}`).toHaveLength(18);
    }
  });
});
