/**
 * Unlocking (spec §5.5, §3.8): pure functions over the save and the content.
 *  - Chapter 0 opens at once and is strictly in order (0-3 is the only undo lesson).
 *  - Chapters 1–4: in order, but two unpassed levels are always open at the same time.
 *  - Next chapter: ≥ ceil(0.7 × levels) passed (quizzes count), or its boss passed; the 跳级考试
 *    (cert) counts as all of chapter 1 passed.
 *  - 经典仓库: open from the start with the same two-open rule; an imported old save opens it up to
 *    the old `unlocked` level.
 * Unlocking only ever needs ★ — never ★★ or ★★★.
 */
import { CHAPTERS, CLASSIC_LEVELS, certLevels, chapterLevels, levelById, type LevelDef } from '../data';
import { levelBroken } from './broken';
import type { DeadKind, SaveV1 } from './save';

/** v1 main track size (34 = 32 push levels + 2 quizzes) — the hub card's progress denominator. */
export const V1_MAIN_TOTAL = 34;

/** The lesson that teaches each deadlock type (naming rule, spec §3.6). */
export const LESSON_LEVEL: Record<DeadKind, string> = { corner: '0-3', wall: '3-2', pair: '3-4', square: '4-2' };

export function levelPassed(save: SaveV1, id: string): boolean {
  return (save.levels[id]?.stars ?? 0) > 0 || (save.quiz[id]?.stars ?? 0) > 0;
}

/** Passed for unlock purposes (cert covers chapter 1). */
function passedForUnlock(save: SaveV1, l: LevelDef): boolean {
  if (levelPassed(save, l.id)) return true;
  return save.cert.passed && l.track === 'main' && l.ch === 1;
}

export interface ChapterInfo {
  ch: number;
  open: boolean;
  /** 70 % / boss / cert → the next chapter is open */
  cleared: boolean;
  /** every level passed (or cert for chapter 1) → chapter-complete rewards */
  complete: boolean;
  passed: number;
  total: number;
  stars: number;
  maxStars: number;
  levels: LevelDef[];
}

export function chapterInfo(save: SaveV1, ch: number): ChapterInfo {
  const levels = chapterLevels(ch);
  const total = levels.length;
  const passedN = levels.filter((l) => passedForUnlock(save, l)).length;
  const boss = levels.find((l) => l.role === 'boss');
  const certCh1 = ch === 1 && save.cert.passed;
  const cleared = total > 0 && (passedN >= Math.ceil(0.7 * total) || (!!boss && levelPassed(save, boss.id)) || certCh1);
  const stars = levels.reduce((a, l) => a + (save.levels[l.id]?.stars ?? save.quiz[l.id]?.stars ?? 0), 0);
  return {
    ch,
    // the 跳级考试 vouches for chapter 1 as well (its levels stay playable, with ribbons)
    open: ch === 0 || certCh1 || (ch > 0 && chapterInfo(save, ch - 1).cleared),
    cleared,
    complete: total > 0 && (passedN === total || certCh1),
    passed: passedN,
    total,
    stars,
    maxStars: total * 3,
    levels,
  };
}

/** Open levels of an ordered list with the "two unpassed open" rule. */
function frontierOpen(list: LevelDef[], isPassed: (l: LevelDef) => boolean): Set<string> {
  const open = new Set<string>();
  let unpassedOpen = 0;
  for (const l of list) {
    if (isPassed(l)) open.add(l.id);
    else if (unpassedOpen < 2) {
      open.add(l.id);
      unpassedOpen += 1;
    }
  }
  return open;
}

export function openLevels(save: SaveV1, ch: number | 'classic'): Set<string> {
  if (ch === 'classic') {
    // an imported old save opens everything before its `unlocked` level; then two unpassed are open
    const cap = save.classicUnlocked ?? 0;
    const open = new Set<string>();
    let unpassedOpen = 0;
    CLASSIC_LEVELS.forEach((l, i) => {
      if (i < cap || levelPassed(save, l.id) || levelBroken(l)) open.add(l.id);
      else if (unpassedOpen < 2) {
        open.add(l.id);
        unpassedOpen += 1;
      }
    });
    return open;
  }
  const info = chapterInfo(save, ch);
  if (!info.open) return new Set();
  const chapter = CHAPTERS.find((c) => c.ch === ch);
  if (ch === 1 && save.cert.passed) return new Set(info.levels.map((l) => l.id));
  if (chapter?.order === 'strict') {
    const open = new Set<string>();
    for (const l of info.levels) {
      open.add(l.id);
      if (!levelPassed(save, l.id) && !levelBroken(l)) break;
    }
    return open;
  }
  // a 维修中 level is skipped: it does not hold back the levels after it (spec §3.10)
  return frontierOpen(info.levels, (l) => passedForUnlock(save, l) || levelBroken(l));
}

export function isLevelOpen(save: SaveV1, level: LevelDef): boolean {
  if (levelBroken(level)) return false;
  if (level.track === 'classic') return openLevels(save, 'classic').has(level.id);
  if (level.track === 'cert') return certOpen(save);
  if (level.track === 'main') return openLevels(save, Number(level.ch)).has(level.id);
  if (level.track === 'twin') return !!level.twinOf && levelPassed(save, level.twinOf);
  return true;
}

/** The 跳级考试 node: after 0-4 is passed (or the offer was made), until it is passed. */
export function certOpen(save: SaveV1): boolean {
  return certLevels().length === 2 && (levelPassed(save, '0-4') || save.cert.offered);
}

/** The level the map marker sits on: the first open unpassed level (or the last one). */
export function currentLevel(save: SaveV1, ch: number | 'classic'): string | null {
  const list = ch === 'classic' ? CLASSIC_LEVELS : chapterLevels(ch);
  const open = openLevels(save, ch);
  const first = list.find((l) => open.has(l.id) && !levelPassed(save, l.id) && !levelBroken(l));
  return first?.id ?? (list.length && open.size ? list[list.length - 1].id : null);
}

/** Highest open chapter (the hub card's "第 N 章"). */
export function frontierChapter(save: SaveV1): number {
  let best = 0;
  for (const c of CHAPTERS) if (chapterLevels(c.ch).length && chapterInfo(save, c.ch).open) best = c.ch;
  return best;
}

export interface NextStep {
  kind: 'level' | 'cert-offer' | 'map';
  id?: string;
  /** first level of a newly entered chapter (play its intro line) */
  newChapter?: number;
  /** a chapter tab that just opened (glow on the map) */
  opened?: number;
}

/**
 * Result card "下一关" (spec §3.5): the next open level in the same track; the first pass of 0-4
 * opens the cert offer (only when the cert levels exist); after a chapter's last level the next
 * chapter's first level when open, else the map.
 */
export function nextAfter(save: SaveV1, id: string, firstPass: boolean): NextStep {
  if (id === '0-4' && firstPass && !save.cert.offered && certLevels().length === 2) return { kind: 'cert-offer' };
  // a 镜子仓库 twin continues where its original would
  const twin = levelById(id);
  if (twin?.twinOf) return nextAfter(save, twin.twinOf, false);
  const classicIdx = CLASSIC_LEVELS.findIndex((l) => l.id === id);
  if (classicIdx >= 0) {
    const open = openLevels(save, 'classic');
    const nxt = CLASSIC_LEVELS.slice(classicIdx + 1).find((l) => open.has(l.id));
    return nxt ? { kind: 'level', id: nxt.id } : { kind: 'map' };
  }
  const cert = certLevels();
  const ci = cert.findIndex((l) => l.id === id);
  if (ci >= 0) return ci + 1 < cert.length ? { kind: 'level', id: cert[ci + 1].id } : { kind: 'map' };
  for (const c of CHAPTERS) {
    const list = chapterLevels(c.ch);
    const i = list.findIndex((l) => l.id === id);
    if (i < 0) continue;
    const open = openLevels(save, c.ch);
    const later = list.slice(i + 1).find((l) => open.has(l.id) && !levelPassed(save, l.id)) ?? list.slice(i + 1).find((l) => open.has(l.id));
    if (later) return { kind: 'level', id: later.id };
    const nextCh = CHAPTERS.find((x) => x.ch === c.ch + 1);
    if (nextCh && chapterLevels(nextCh.ch).length && chapterInfo(save, nextCh.ch).open) {
      const first = chapterLevels(nextCh.ch)[0];
      return { kind: 'level', id: first.id, newChapter: nextCh.ch };
    }
    return { kind: 'map' };
  }
  return { kind: 'map' };
}

/** Arrows (auto-route) become available when chapter 2 opens (70 % of ch1, its boss, or the cert). */
export function arrowsAvailable(save: SaveV1): boolean {
  return chapterLevels(2).length > 0 && chapterInfo(save, 2).open;
}

/** Deadlock naming: a type can be named once its lesson is passed, or in the lesson itself. */
export function canName(save: SaveV1, type: DeadKind, levelId: string): boolean {
  return LESSON_LEVEL[type] === levelId || levelPassed(save, LESSON_LEVEL[type]) || save.taught.includes(type);
}

/** Chapter 4 open → classic/random deadlock marks become delayed (spec §3.6). */
export function ch4Open(save: SaveV1): boolean {
  return chapterLevels(4).length > 0 && chapterInfo(save, 4).open;
}

export function mainPassedCount(save: SaveV1): number {
  let n = 0;
  for (const c of CHAPTERS) for (const l of chapterLevels(c.ch)) if (levelPassed(save, l.id)) n += 1;
  return n;
}

// ------------------------------------------------------------------ 随机新仓库 (spec §3.9)

/** The chapter whose ≥ 70 % opens each tier: T1 ← chapter 2, T2 ← chapter 3, T3 ← chapter 4. */
export const TIER_CHAPTER: Record<1 | 2 | 3, number> = { 1: 2, 2: 3, 3: 4 };

export function randomTierOpen(save: SaveV1, tier: 1 | 2 | 3): boolean {
  const info = chapterInfo(save, TIER_CHAPTER[tier]);
  return info.total > 0 && (info.passed >= Math.ceil(0.7 * info.total) || info.complete);
}

/** Any tier open → the 随机新仓库 button shows on the map. */
export function randomOpen(save: SaveV1): boolean {
  return randomTierOpen(save, 1);
}
