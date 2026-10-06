/**
 * Opponent style terms that are about a MOVE rather than a position (spec §8.5, review D13).
 * Positional styles (铁蛋 railAdvance, 雷达 probe) live in eval.ts; 老将's bombTrade is a root bonus:
 * a bomb trading with a known or masked ≥ 师长 enemy piece.
 */
import { isMove, type Action } from '../core/movegen';
import { BOMB } from '../core/pieces';
import type { PublicView } from '../core/redact';
import type { Weights } from './levels';
import { possibleTypes } from './select';
import type { Scored } from './search';

export function styleBonus(v: PublicView, a: Action, w: Weights): number {
  if (!w.bombTrade || !isMove(a) || a.kind !== 'attack') return 0;
  if (v.ptype[a.pid] !== BOMB) return 0;
  const q = v.board[a.to];
  if (q < 0) return 0;
  const ts = possibleTypes(v, q);
  return ts.length && ts.every((t) => t >= 9) ? w.bombTrade : 0;
}

export function applyStyle(v: PublicView, scored: Scored[], w: Weights): Scored[] {
  if (!w.bombTrade) return scored;
  return scored.map((x) => ({ a: x.a, v: x.v + styleBonus(v, x.a, w) }));
}
