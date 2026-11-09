import { editCount, type Card, type Level, type RunResult } from './sim';

/**
 * Stars, by the spec's §4.2. A normal level: 1 star for getting there, 2 with at most one card more than the fewest, 3 with the
 * fewest (on a level with a crystal: with the crystal picked up and no more cards than the shortest way through it). A fix-the-bug
 * level counts EDITS, not cards: 3 stars for exactly as many edits as there are bugs, 2 for one more. A pulsing hint caps at 1.
 */
export function starsFor(lv: Level, prog: readonly Card[], r: RunResult, hinted: boolean): 1 | 2 | 3 {
  if (r.res !== 'win') return 1;
  let stars: 1 | 2 | 3 = 1;
  if (lv.buggy && lv.bugs) {
    const edits = editCount(lv.buggy.split('') as Card[], prog);
    stars = edits <= lv.bugs ? 3 : edits <= lv.bugs + 1 ? 2 : 1;
  } else {
    const n = prog.length;
    if (lv.hasCrystal && lv.minCrystal) stars = r.crystal && n <= lv.minCrystal ? 3 : n <= lv.expectMin + 1 ? 2 : 1;
    else stars = n <= lv.expectMin ? 3 : n <= lv.expectMin + 1 ? 2 : 1;
  }
  return hinted ? 1 : stars;
}
