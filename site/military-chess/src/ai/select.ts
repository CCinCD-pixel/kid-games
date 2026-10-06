/**
 * The novice-mistake model (spec §8.5 "选着"): instead of v1.0's uniform random move, an opponent
 *  1. never walks a mobile piece into a 大本营 and never attacks a piece that certainly beats it
 *     (unless nothing else is left) — so a beginner looks like a beginner, not broken;
 *  2. sometimes overlooks the opponent's answers (decided by the caller: `overlook`);
 *  3. samples among its top-K root moves with a softmax of temperature `temp` (seeded).
 */
import { half, isHQ } from '../core/board';
import { resolve } from '../core/combat';
import { isMove, type Action } from '../core/movegen';
import { toNote } from '../core/notation';
import type { PublicView } from '../core/redact';
import type { Scored } from './search';

/** the identities an enemy piece may have, from the view (known type, or 暗棋 mask) */
export function possibleTypes(v: PublicView, q: number): number[] {
  if (v.ptype[q] >= 0) return [v.ptype[q]];
  const m = v.masks ? v.masks[q] : 0xfff;
  const out: number[] = [];
  for (let t = 0; t < 12; t++) if (m & (1 << t)) out.push(t);
  return out;
}

/** attacking q with my type t is a certain loss (every possible identity of q beats t) */
export function certainLoss(v: PublicView, t: number, q: number): boolean {
  const ts = possibleTypes(v, q);
  return ts.length > 0 && ts.every((d) => resolve(t, d) === 'D');
}

export function hardFilter(v: PublicView, moves: Action[]): Action[] {
  const me = v.turn;
  const ok = moves.filter((a) => {
    if (!isMove(a)) return true;
    if (a.kind === 'move' && isHQ(a.to)) return false;
    if (a.kind === 'attack') {
      const q = v.board[a.to];
      if (q >= 0 && v.pside[q] !== me && certainLoss(v, v.ptype[a.pid], q)) return false;
    }
    return true;
  });
  return ok.length ? ok : moves;
}

/** stable order: score desc, then notation (so equal scores never depend on generation order) */
export function rank(scored: Scored[]): Scored[] {
  return scored.slice().sort((x, y) => y.v - x.v || (toNote(x.a) < toNote(y.a) ? -1 : 1));
}

export function choose(scored: Scored[], topK: number, temp: number, rng: () => number): Action {
  const top = rank(scored).slice(0, Math.max(1, topK));
  if (temp <= 0.01 || top.length === 1) return top[0].a;
  const mx = top[0].v;
  const ws = top.map((x) => Math.exp((x.v - mx) / temp));
  let r = rng() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ws.length; i++) {
    r -= ws[i];
    if (r <= 0) return top[i].a;
  }
  return top[top.length - 1].a;
}

/** own-half helper for style terms */
export const ownHalf = (at: number, side: number): boolean => half(at) === side;
