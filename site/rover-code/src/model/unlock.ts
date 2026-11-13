import { LEVELS, chapterLevels } from './levels';

/** what unlocking reads from the save: the stars of each level done */
export interface Done { levels: Record<string, { stars: number } | undefined> }
const starsOf = (s: Done, id: string): number => s.levels[id]?.stars ?? 0;
/** the big level of a chapter (its 7th, role 合): it can be tried any time, and getting through it opens the next chapter (round 1, R7) */
export const isBoss = (l: { role: string }): boolean => l.role === '合';

/** a chapter opens once six levels of the one before it are done, or that chapter's big level; `all`: the parent's 全部解锁 */
export function chapterOpen(s: Done, ch: number, all = false): boolean {
  if (all || ch <= 1) return true;
  const prev = chapterLevels(ch - 1);
  return prev.filter((l) => starsOf(s, l.id) > 0).length >= 6 || prev.some((l) => isBoss(l) && starsOf(s, l.id) > 0);
}

/** a level opens when the one before it is done; in an open chapter its first level and its big level are open any time */
export function levelOpen(s: Done, id: string, all = false): boolean {
  const i = LEVELS.findIndex((l) => l.id === id);
  if (i < 0) return false;
  const l = LEVELS[i];
  return all || i === 0 || starsOf(s, id) > 0 || starsOf(s, LEVELS[i - 1].id) > 0 || ((l.n === 1 || isBoss(l)) && chapterOpen(s, l.ch, all));
}

/**
 * 月面巡逻 uses the turning cards (前进、左转、右转) only once chapter 3 is behind him, which means chapter 4 is open (six levels of
 * chapter 3 done, or its big level C3-7); before that a patrol is laid with the arrow cards he already knows (round 1, R5).
 */
export const patrolTurns = (s: Done, all = false): boolean => chapterOpen(s, 4, all);
