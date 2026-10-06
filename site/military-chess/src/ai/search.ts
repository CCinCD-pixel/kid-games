/**
 * Search (spec §8.5): negamax α-β on a perfect-information world, captures-only quiescence (`qdepth`),
 * move ordering (flag > winning captures by MVV-LVA > trades > quiet > losing captures), iterative
 * deepening up to the level's depth within a node budget (the last completed iteration wins), and a
 * small transposition table (Zobrist) for the deeper 翻翻棋 endgame searches.
 */
import type { Side } from '../core/board';
import { resolve } from '../core/combat';
import { isFlip, isMove, isPass, legalMoves, type Action, type Move } from '../core/movegen';
import { apply } from '../core/rules';
import type { GameState } from '../core/state';
import { zobrist } from '../core/zobrist';
import { evaluate, VAL } from './eval';
import type { Weights } from './levels';

export interface SearchCtx {
  w: Weights;
  /** the side the AI plays (contempt counts against it at every depth) */
  root: Side;
  nodes: number;
  limit: number;
  deadline: number;
  aborted: boolean;
  tt: Map<number, { depth: number; v: number; flag: 0 | 1 | 2 }> | null;
  now: () => number;
}
export function newCtx(w: Weights, limit: number, ms: number, now: () => number, root: Side = 0): SearchCtx {
  return { w, root, nodes: 0, limit, deadline: now() + ms, aborted: false, tt: null, now };
}

function moveKey(s: GameState, m: Action): number {
  if (!isMove(m) || m.kind !== 'attack') return 0;
  const a = s.ptype[m.pid], d = s.ptype[s.board[m.to]];
  const r = resolve(a, d);
  return r === 'F' ? 1e6 : r === 'A' ? 1000 + VAL[d] - VAL[a] / 10 : r === 'B' ? 500 + VAL[d] - VAL[a] : -100;
}
export function orderMoves(s: GameState, ms: Action[]): Action[] {
  return ms.map((m) => [moveKey(s, m), m] as const).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
}

const searchable = (m: Action): boolean => !isFlip(m) && !isPass(m);

function tick(ctx: SearchCtx): void {
  ctx.nodes++;
  if (ctx.nodes > ctx.limit || ((ctx.nodes & 255) === 0 && ctx.now() > ctx.deadline)) ctx.aborted = true;
}

export function negamax(ctx: SearchCtx, s: GameState, depth: number, alpha: number, beta: number, qdepth: number): number {
  tick(ctx);
  const side = s.turn as Side;
  if (s.result || depth <= 0 || ctx.aborted) {
    const stand = evaluate(s, side, ctx.w, ctx.root);
    if (s.result || qdepth <= 0 || ctx.aborted) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const atk = legalMoves(s).filter((m) => isMove(m) && m.kind === 'attack');
    for (const m of orderMoves(s, atk)) {
      const v = -negamax(ctx, apply(s, m).state, 0, -beta, -alpha, qdepth - 1);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
  let key = 0;
  if (ctx.tt && depth >= 2) {
    key = zobrist(s);
    const e = ctx.tt.get(key);
    if (e && e.depth >= depth) {
      if (e.flag === 0) return e.v;
      if (e.flag === 1 && e.v >= beta) return e.v;
      if (e.flag === 2 && e.v <= alpha) return e.v;
    }
  }
  const a0 = alpha;
  const ms = orderMoves(s, legalMoves(s).filter(searchable));
  if (!ms.length) return evaluate(s, side, ctx.w, ctx.root);
  let best = -Infinity;
  for (const m of ms) {
    const v = -negamax(ctx, apply(s, m).state, depth - 1, -beta, -alpha, qdepth);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  if (ctx.tt && depth >= 2 && !ctx.aborted) {
    if (ctx.tt.size > 65536) ctx.tt.clear();
    ctx.tt.set(key, { depth, v: best, flag: best <= a0 ? 2 : best >= beta ? 1 : 0 });
  }
  return best;
}

export interface Scored {
  a: Action;
  v: number;
}

/** exact score of every root move (full window, so the novice model can sample among them) */
export function scoreRoot(ctx: SearchCtx, s: GameState, depth: number, qdepth: number, moves?: Action[]): Scored[] {
  const ms = moves ?? legalMoves(s).filter(searchable);
  let out: Scored[] = ms.map((a) => ({ a, v: 0 }));
  for (let d = 1; d <= depth; d++) {
    if (d > 1) ctx.tt = ctx.tt ?? new Map();
    const iter: Scored[] = [];
    for (const a of ms) {
      const v = -negamax(ctx, apply(s, a).state, d - 1, -Infinity, Infinity, qdepth);
      iter.push({ a, v });
      if (ctx.aborted && d > 1) break;
    }
    if (ctx.aborted && d > 1) break; // keep the last complete iteration
    out = iter;
    if (ctx.aborted) break;
  }
  return out;
}

/** the "didn't see the threat" score: the position right after the move, no replies looked at */
export function scoreShallow(ctx: SearchCtx, s: GameState, moves?: Action[]): Scored[] {
  const me = s.turn as Side;
  const ms = moves ?? legalMoves(s).filter(searchable);
  return ms.map((a) => {
    tick(ctx);
    return { a, v: evaluate(apply(s, a).state, me, ctx.w, ctx.root) };
  });
}

export type { Move };
