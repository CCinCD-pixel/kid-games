import { bookLabel } from './book';
import { displayPinyin } from './pinyin';
import { blendRivals, distinctSeries, readsAsOne } from './sound';
import type { Bank, Save, Word } from './types';

/**
 * What the parent sees (按课本页) and what the spaced review needs (B5, B7). Everything is derived from the save and the bank:
 * no new book content, no recordings, no ranking.
 *
 * A skill id looks like `word:ditu:decode`; its ROOT is the first two parts (`word:ditu`), which is what a column of a page counts.
 */
export const rootOf = (skill: string): string => skill.split(':').slice(0, 2).join(':');
/** An item counts as steady once its atom reached box 3 (three good sessions in a row, the spacing is then 4 sessions). */
export const STABLE_BOX = 3;
export type ColumnKind = 'letter' | 'tone' | 'blend' | 'word' | 'pair';
export const COLUMN_NAMES: Record<ColumnKind, string> = { letter: '字母', tone: '四声', blend: '拼一拼', word: '词语', pair: '区分' };
const DAY = 86400000;

/** The roots whose spaced-review time has come (same rule as the programme: due session <= the current session). */
export function dueRoots(s: Save, session = s.sessions): Set<string> {
  const out = new Set<string>();
  for (const [skill, atom] of Object.entries(s.atoms)) if (atom.due <= session && (atom.box > 0 || atom.needsReview || atom.successes.length)) out.add(rootOf(skill));
  return out;
}
/** What the week's small quiz is made of: everything practised in the last 7 days, what went wrong, and what is due. */
export function weekRoots(s: Save, now = Date.now()): Set<string> {
  const since = now - 7 * DAY;
  const recent = s.history.filter((a) => (a.at ?? 0) >= since);
  const out = new Set<string>();
  for (const a of recent) out.add(rootOf(a.skill));
  for (const [skill, atom] of Object.entries(s.atoms)) if (atom.needsReview) out.add(rootOf(skill));
  for (const r of dueRoots(s)) out.add(r);
  return out;
}

export function pagesOfStation(b: Bank, station: number): number[] {
  return b.lessons.find((l) => l.id === station)?.book?.pages ?? [];
}
export const pageText = (pages: number[]): string => (pages.length ? `第 ${pages.join('、')} 页` : '');
/** The station a root belongs to. A tone-pair root (pair:2|3) belongs to no letter: it is filed under `fallback` (the child's station). */
export function skillStation(b: Bank, root: string, fallback = 1): number | undefined {
  const [type, id] = root.split(':');
  if (type === 'letter' || type === 'glyph') return b.letters.find((x) => x.id === id)?.lesson;
  if (type === 'syl') return b.syllables.find((x) => x.id === id)?.lesson;
  if (type === 'word') return b.words.find((x) => x.id === id)?.lesson;
  if (type === 'tone4') return b.tone4?.find((t) => t.series === id)?.lesson;
  if (type === 'pair') {
    const letters = id.split('|').map((x) => b.letters.find((l) => l.id === x));
    return letters.every(Boolean) ? Math.max(...letters.map((l) => l!.lesson)) : fallback;
  }
  return undefined;
}
const shown = (id: string) => id.replace(/v/g, 'ü');
export function skillLabel(b: Bank, root: string): string {
  const [type, id] = root.split(':');
  if (type === 'letter') return `字母 ${shown(id)}`;
  if (type === 'glyph') return `字形 ${id}`;
  if (type === 'syl') return `拼读 ${displayPinyin(id)}`;
  if (type === 'word') {
    const w = b.words.find((x) => x.id === id);
    return w ? `词语 ${w.hanzi}（${w.display}）` : `词语 ${id}`;
  }
  if (type === 'tone4') {
    const t = b.tone4?.find((x) => x.series === id);
    return t ? `四声 ${t.ids.filter((_, n) => !(t.skip ?? []).includes(n + 1)).map(displayPinyin).join(' ')}` : `四声 ${id}`;
  }
  if (type === 'pair') {
    const parts = id.split('|');
    if (parts.every((x) => /^[1-4]$/.test(x))) return `声调 ${parts.map((x) => ['', '一', '二', '三', '四'][Number(x)] + '声').join('和')}`;
    return `区分 ${parts.map(shown).join(' 和 ')}`;
  }
  return root;
}

export interface Column {
  col: ColumnKind;
  name: string;
  roots: string[];
  /** What "k/total" counts: one group per item (a blend counts once for all four of its tones). */
  groups: string[][];
}
/** Words that only share a picture with a preferred word, at the given station (the programme looks at the child's station). */
export const aliasIds = (b: Bank, lesson: number): Set<string> => {
  const out = new Set<string>();
  for (const [picture, order] of Object.entries(b.pictureOwners ?? {})) {
    const open = order.find((id) => (b.words.find((w) => w.id === id)?.lesson ?? 99) <= lesson);
    for (const w of b.words) if (w.picture === picture && !['sentence', 'cloze'].includes(w.kind) && w.id !== open) out.add(w.id);
  }
  return out;
};
/** The words a child can be asked at a station (the same filter as the programme). */
export const stationWords = (b: Bank, station: number, atLesson = station): Word[] => {
  const aliases = aliasIds(b, atLesson);
  return b.words.filter((w) => w.lesson === station && !w.hold && !w.beyond && !['sentence', 'cloze'].includes(w.kind) && !aliases.has(w.id));
};
export const stationBlends = (b: Bank, station: number) =>
  b.syllables.filter((x) => x.lesson === station && x.tone > 0 && !x.wordOnly && x.initial && !['y', 'w'].includes(x.initial) && !readsAsOne(x));
export const stationTones = (b: Bank, station: number) =>
  distinctSeries(b.tone4 ?? []).filter((t) => t.lesson === station && t.ids.filter((_, m) => !(t.skip ?? []).includes(m + 1)).length >= 3);
/** The columns ("栏目") a station has in this game: 字母, 四声, 拼一拼, 词语, 区分. Empty ones are left out. */
export function stationColumns(b: Bank, station: number, atLesson = station): Column[] {
  const letters = b.letters.filter((l) => l.lesson === station);
  const pairs = b.confusions.filter((c) => c.pair.every((id) => b.letters.some((l) => l.id === id)) && Math.max(...c.pair.map((id) => b.letters.find((l) => l.id === id)!.lesson)) === station);
  const bases = new Map<string, string[]>();
  const askable = b.syllables.filter((x) => x.tone > 0 && !x.wordOnly);
  // only blends the game can really ask (they have a rival to tell them from)
  for (const x of stationBlends(b, station).filter((y) => blendRivals(y, askable).length)) bases.set(x.initial + x.final, [...(bases.get(x.initial + x.final) ?? []), `syl:${x.id}`]);
  const single = (roots: string[]) => roots.map((r) => [r]);
  const defs: [ColumnKind, string[][]][] = [
    ['letter', single(letters.map((l) => `letter:${l.id}`))],
    ['tone', single(stationTones(b, station).map((t) => `tone4:${t.series}`))],
    ['blend', [...bases.values()]],
    ['word', single(stationWords(b, station, atLesson).map((w) => `word:${w.id}`))],
    ['pair', single(pairs.map((c) => `pair:${c.pair.join('|')}`))],
  ];
  return defs.filter(([, groups]) => groups.length).map(([col, groups]) => ({ col, name: COLUMN_NAMES[col], roots: groups.flat(), groups }));
}
const steady = (s: Save, root: string): boolean => Object.entries(s.atoms).some(([k, a]) => rootOf(k) === root && a.box >= STABLE_BOX);

export interface PageRow {
  station: number;
  pages: number[];
  label: string;
  columns: { col: ColumnKind; name: string; done: number; total: number }[];
}
/** One row per station that has book pages, up to the station the teacher has reached. */
/** One row per station that has book pages, up to the station the teacher has reached. A group of four tones counts as steady only when all of them are. */
export function pageProgress(s: Save, b: Bank): PageRow[] {
  return b.lessons
    .filter((l) => (l.book?.pages.length ?? 0) > 0 && l.id <= s.settings.lesson)
    .map((l) => ({
      station: l.id,
      pages: l.book!.pages,
      label: bookLabel(b, l.id),
      columns: stationColumns(b, l.id, s.settings.lesson).map((c) => ({ col: c.col, name: c.name, total: c.groups.length, done: c.groups.filter((g) => g.every((r) => steady(s, r))).length })),
    }));
}

export interface Weak {
  root: string;
  label: string;
  station?: number;
  pages: number[];
  misses: number;
  score: number;
}
/** The shakiest roots: wrong answers still in the detailed history, items waiting for review, items still in box 0 or 1. */
export function weakItems(s: Save, b: Bank, limit = 10): Weak[] {
  const miss = new Map<string, number>();
  for (const a of s.history) if (!a.correct && a.judge !== 'self') miss.set(rootOf(a.skill), (miss.get(rootOf(a.skill)) ?? 0) + 1);
  const roots = new Map<string, { review: boolean; box: number }>();
  for (const [skill, atom] of Object.entries(s.atoms)) {
    const r = rootOf(skill),
      cur = roots.get(r) ?? { review: false, box: 9 };
    roots.set(r, { review: cur.review || atom.needsReview, box: Math.min(cur.box, atom.box) });
  }
  const rows: Weak[] = [];
  for (const [root, info] of roots) {
    const station = skillStation(b, root, s.settings.lesson);
    if (station === undefined) continue;
    const misses = miss.get(root) ?? 0;
    const score = misses * 2 + (info.review ? 3 : 0) + (info.box <= 1 && misses ? 1 : 0);
    if (score > 0) rows.push({ root, label: skillLabel(b, root), station, pages: pagesOfStation(b, station), misses, score });
  }
  return rows.sort((x, y) => y.score - x.score || x.root.localeCompare(y.root)).slice(0, limit);
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
export interface WeekVolume {
  total: number;
  activeDays: number;
  days: { label: string; count: number }[];
}
/** Practice volume of the last 7 days (today included), counted from the detailed history. */
export function weekVolume(s: Save, now = Date.now()): WeekVolume {
  const day = (t: number) => new Date(t).toDateString();
  const days = Array.from({ length: 7 }, (_, i) => {
    const t = now - (6 - i) * DAY;
    return { key: day(t), label: i === 6 ? '今天' : `周${WEEKDAY[new Date(t).getDay()]}`, count: 0 };
  });
  for (const a of s.history) {
    const hit = a.at ? days.find((d) => d.key === day(a.at!)) : undefined;
    if (hit) hit.count++;
  }
  return { total: days.reduce((n, d) => n + d.count, 0), activeDays: days.filter((d) => d.count).length, days: days.map(({ label, count }) => ({ label, count })) };
}

/** 练读表 spaced review: read again after 1, 2, 4, 7, 14 days (never a test, only a nudge on the table's card). */
export const DRILL_DAYS = [1, 2, 4, 7, 14];
export const nextDrillDue = (box: number, now: number): number => now + DRILL_DAYS[Math.min(box, DRILL_DAYS.length - 1)] * DAY;
export function drillDue(s: Save, now = Date.now()): string[] {
  return Object.entries(s.drillBest ?? {})
    .filter(([id, d]) => d.due !== undefined && d.due <= now && Number(id.split(':')[1]) <= s.settings.lesson)
    .map(([id]) => id);
}
export interface DueSummary {
  total: number;
  atoms: number;
  drills: number;
  /** Book pages where the old friends live, most first. */
  pages: { page: number; count: number }[];
}
/** "今天该复习": what the next programme will bring back (a new session starts when 30 minutes have passed). */
export function dueSummary(s: Save, b: Bank, now = Date.now()): DueSummary {
  const next = !s.lastAttemptAt || now - s.lastAttemptAt >= 30 * 60000 ? s.sessions + 1 : s.sessions;
  const roots = [...dueRoots(s, next)].filter((r) => (skillStation(b, r, s.settings.lesson) ?? 99) <= s.settings.lesson);
  const pages = new Map<number, number>();
  for (const r of roots) for (const p of pagesOfStation(b, skillStation(b, r, s.settings.lesson)!).slice(0, 1)) pages.set(p, (pages.get(p) ?? 0) + 1);
  const drills = drillDue(s, now);
  for (const id of drills) for (const p of pagesOfStation(b, Number(id.split(':')[1])).slice(0, 1)) pages.set(p, (pages.get(p) ?? 0) + 1);
  return {
    total: roots.length + drills.length,
    atoms: roots.length,
    drills: drills.length,
    pages: [...pages].map(([page, count]) => ({ page, count })).sort((x, y) => y.count - x.count || x.page - y.page),
  };
}
