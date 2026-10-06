/**
 * 翻翻棋 (spec §8.5): a flip is a chance node over the PUBLIC face-down multiset — for every identity
 * still hidden, the position after the flip is valued and weighted by how many such pieces are
 * hidden. From level 2 the opponent's best capture reply is looked at; once everything is face up
 * the 明棋 search takes over (levels 3–4 go to depth 3 with ≤ 10 mobile pieces).
 */
import { isFlip, isMove, legalMoves, type Action } from '../core/movegen';
import { apply } from '../core/rules';
import type { GameState } from '../core/state';
import type { Side } from '../core/board';
import { evaluate } from './eval';
import { scoreRoot, type Scored, type SearchCtx } from './search';

/** value of a position for `me` after my action; with replyDepth the opponent's best capture is assumed */
function valueAfter(ctx: SearchCtx, st: GameState, me: Side, replyDepth: number): number {
  ctx.nodes++;
  if (st.result || replyDepth === 0) return evaluate(st, me, ctx.w, ctx.root);
  let worst = evaluate(st, me, ctx.w, ctx.root);
  for (const m of legalMoves(st)) {
    if (!isMove(m) || m.kind !== 'attack') continue;
    ctx.nodes++;
    const v = evaluate(apply(st, m).state, me, ctx.w, ctx.root);
    if (v < worst) worst = v;
  }
  return worst;
}

/** set face-down piece p to identity (side, type) by swapping with another face-down piece that has it */
function withIdentity(world: GameState, p: number, side: number, type: number): GameState | null {
  if (world.pside[p] === side && world.ptype[p] === type) return world;
  for (let q = 0; q < world.np; q++) {
    if (q === p || !world.palive[q] || world.pup[q]) continue;
    if (world.pside[q] === side && world.ptype[q] === type) {
      const d: GameState = { ...world, ptype: world.ptype.slice(), pside: world.pside.slice() };
      d.ptype[q] = world.ptype[p];
      d.pside[q] = world.pside[p];
      d.ptype[p] = type;
      d.pside[p] = side;
      return d;
    }
  }
  return null;
}

export function fanScores(ctx: SearchCtx, world: GameState, hidden: number[], replyDepth: number, shallow: boolean, depth: number, qdepth: number): Scored[] {
  const me = world.turn as Side;
  const legal = legalMoves(world);
  let anyDown = false;
  for (let p = 0; p < world.np; p++) if (world.palive[p] && !world.pup[p]) anyDown = true;
  if (!anyDown) return scoreRoot(ctx, world, depth, shallow ? 0 : qdepth, legal);
  const rd = shallow ? 0 : replyDepth;
  const total = hidden.reduce((a, b) => a + b, 0);
  const out: Scored[] = [];
  for (const a of legal) {
    if (isFlip(a)) {
      const p = world.board[a.flip];
      let ev = 0;
      hidden.forEach((n, k) => {
        if (!n) return;
        const d = withIdentity(world, p, k >= 12 ? 1 : 0, k % 12);
        if (!d) return;
        ev += (n / total) * valueAfter(ctx, apply(d, a).state, me, rd);
      });
      out.push({ a, v: ev });
    } else out.push({ a, v: valueAfter(ctx, apply(world, a).state, me, rd) });
    if (ctx.aborted) break;
  }
  return out;
}

export type { Action };
