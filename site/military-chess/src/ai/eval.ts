/**
 * Evaluation (spec §8.5) of a perfect-information "world" from side `me`. Worlds come from the public
 * view only (core/redact): 明棋 = the game; 暗棋 = one PIMC sample of the enemy's identities; 翻翻棋 =
 * the public face-down multiset dealt onto the face-down pieces. In 翻翻棋 nothing here reads the
 * identity of a single face-down piece: their material is summed (invariant under any re-dealing),
 * and every positional term only looks at face-up pieces — so the score is a function of public
 * information (ai-nopeek test).
 */
import { RED, half, isHQ, isRail, adj, indexToSlot, roadDist, type Side } from '../core/board';
import { BOMB, ENG, FLAG, MINE, isMobileType } from '../core/pieces';
import { resolve } from '../core/combat';
import type { GameState } from '../core/state';
import type { Weights } from './levels';

/** §8.5 values: 旗 0, 雷 10, 炸 30, 工兵 14, 排 6, 连 9, 营 13, 团 18, 旅 25, 师 35, 军 50, 司令 70 */
export const VAL: readonly number[] = [0, 10, 30, 14, 6, 9, 13, 18, 25, 35, 50, 70];
export const WIN = 10000;

/** can this piece move at all (alive, mobile type, not frozen in a 大本营, face up in 翻翻棋)? */
const canMove = (s: GameState, p: number): boolean =>
  !!s.palive[p] && isMobileType(s.ptype[p]) && !(s.rules.hqFreeze && isHQ(s.ppos[p])) && !(s.mode === 'fan' && !s.pup[p]);

/**
 * `root` = the side the AI plays (the search root). 求和厌恶 is the AI's own dislike of quiet play, so
 * it always counts against `root`, whichever side the (negamax) evaluation is taken from — otherwise
 * the negation in the search would turn it into a liking for quiet positions.
 */
export function evaluate(s: GameState, me: Side, w: Weights, root: Side = me): number {
  if (s.result) return s.result.winner === me ? WIN - s.ply : s.result.winner === -1 ? 0 : -WIN + s.ply;
  const fan = s.mode === 'fan';
  const n = s.np;
  const flagPos = [-1, -1], mines = [0, 0], engs = [0, 0];
  for (let p = 0; p < n; p++) {
    if (!s.palive[p]) continue;
    const t = s.ptype[p], side = s.pside[p];
    // no-peek: a face-down flag's square is not public in 翻翻棋
    if (t === FLAG && (!fan || s.pup[p])) flagPos[side] = s.ppos[p];
    if (t === MINE) mines[side]++;
    if (t === ENG) engs[side]++;
  }
  let score = 0;
  const kEng = fan ? 8 : 3;
  for (let p = 0; p < n; p++) {
    if (!s.palive[p]) continue;
    const t = s.ptype[p], side = s.pside[p], sgn = side === me ? 1 : -1;
    let v = VAL[t];
    if (t === ENG) v += (kEng * mines[1 - side]) / Math.max(1, engs[side]);
    if (fan && !s.pup[p]) {
      score += sgn * v * 0.8; // summed over all face-down pieces: depends only on the public multiset
      continue;
    }
    score += sgn * v;
    if (!canMove(s, p)) continue;
    const at = s.ppos[p];
    if (half(at) !== side) {
      score += sgn * w.advance;
      if (w.railAdvance && isRail(at)) score += sgn * w.railAdvance;
    }
    const ef = flagPos[1 - side];
    const locked = fan && s.rules.fanFlagLock && mines[1 - side] > 0;
    if (ef >= 0 && !locked) score += (sgn * w.flagPull) / (1 + roadDist(ef, at));
    if (w.probe && t === ENG) {
      for (const nb of adj[at]) {
        const q = s.board[nb];
        if (q < 0 || s.pside[q] === side) continue;
        if (fan) {
          if (s.pup[q] && s.ptype[q] === MINE) {
            score += sgn * w.probe;
            break;
          }
        } else if (s.mode === 'an' && !s.pmoved[q] && indexToSlot(s.pinit[q]).r >= 5) {
          score += sgn * w.probe;
          break;
        }
      }
    }
  }
  // hunting (明棋 / 翻翻棋): visible pieces are pulled toward visible enemies they surely beat
  if (w.hunt && s.mode !== 'an') {
    let mat = 0;
    for (let p = 0; p < n; p++) if (s.palive[p] && isMobileType(s.ptype[p]) && (!fan || s.pup[p])) mat += (s.pside[p] === me ? 1 : -1) * VAL[s.ptype[p]];
    for (let p = 0; p < n; p++) {
      if (!canMove(s, p)) continue;
      const side = s.pside[p];
      const boost = 1 + Math.max(0, side === me ? mat : -mat) / 40;
      let best = 99;
      const at = s.ppos[p];
      for (let q = 0; q < n; q++) {
        if (!s.palive[q] || s.pside[q] === side || (fan && !s.pup[q])) continue;
        const tq = s.ptype[q];
        if (tq === FLAG) continue;
        if (resolve(s.ptype[p], tq) === 'A') {
          const d = roadDist(at, s.ppos[q]);
          if (d < best) best = d;
        }
      }
      if (best < 99) score += ((side === me ? 1 : -1) * w.hunt * boost) / (1 + best);
    }
  }
  if (fan) {
    const dugEnemy = 3 - mines[1 - me], dugMine = 3 - mines[me];
    score += w.minesFan * (dugEnemy + (mines[1 - me] === 0 ? 3 : 0));
    score -= w.minesFan * (dugMine + (mines[me] === 0 ? 3 : 0));
  }
  if (w.contempt) score += (me === root ? -1 : 1) * w.contempt * (s.quiet / s.rules.quietLimit) ** 2;
  // own flag danger: enemy mobile pieces close to a (known) flag
  if (w.flagGuard) {
    for (const side of [0, 1] as Side[]) {
      const f = flagPos[side];
      if (f < 0) continue;
      let danger = 0;
      for (let p = 0; p < n; p++) if (s.pside[p] !== side && canMove(s, p)) danger += 1 / (roadDist(f, s.ppos[p]) + 1) ** 2;
      score += (side === me ? -1 : 1) * w.flagGuard * danger;
    }
  }
  return score;
}

/** 清点兵力 margin helper for reports (not used by the search) */
export const isBomb = (t: number): boolean => t === BOMB;
export { RED };
