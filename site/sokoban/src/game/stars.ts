/**
 * Stars by pushes (spec §3.5): ★★★ ≤ opt and no H3 this time; ★★ ≤ star2; ★ solved.
 * Stars are an optional self-challenge — nothing ever needs ★★ or ★★★.
 */
export function starsFor(pushes: number, opt: number, star2: number, usedH3: boolean): 1 | 2 | 3 {
  if (pushes <= opt && !usedH3) return 3;
  if (pushes <= star2) return 2;
  return 1;
}

/** Detective quiz: all three boards right first time ★★★, two ★★, otherwise ★. */
export function quizStars(firstTry: number): 1 | 2 | 3 {
  return firstTry >= 3 ? 3 : firstTry === 2 ? 2 : 1;
}

export const star2For = (opt: number): number => opt + Math.max(2, Math.ceil(0.25 * opt));
