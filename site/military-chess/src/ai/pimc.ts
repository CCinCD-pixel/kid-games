/**
 * 暗棋 (spec §8.5 PIMC): sample `samples` worlds from the view's belief (masks + counts + deployment
 * prior), search each as perfect information, average the root scores per move. The view never
 * contains the enemy's real identities, so neither can the worlds.
 */
import { toNote } from '../core/notation';
import { sampleEnemy, worldFrom, type PublicView } from '../core/redact';
import type { Action } from '../core/movegen';
import { scoreRoot, scoreShallow, type Scored, type SearchCtx } from './search';

export function pimcScores(v: PublicView, samples: number, depth: number, qdepth: number, shallow: boolean, ctx: SearchCtx, rng: () => number, moves: (s: ReturnType<typeof worldFrom>) => Action[]): { scored: Scored[]; resets: number } {
  const agg = new Map<string, Scored>();
  let resets = 0;
  for (let i = 0; i < samples; i++) {
    const { assign, reset } = sampleEnemy(v, rng);
    if (reset) resets++;
    const world = worldFrom(v, assign);
    const ms = moves(world);
    const sc = shallow ? scoreShallow(ctx, world, ms) : scoreRoot(ctx, world, depth, qdepth, ms);
    for (const { a, v: val } of sc) {
      const k = toNote(a);
      const cur = agg.get(k);
      if (cur) cur.v += val / samples;
      else agg.set(k, { a, v: val / samples });
    }
    if (ctx.aborted && i > 0) {
      // budget gone: rescale what we have to an average over the worlds seen
      for (const x of agg.values()) x.v *= samples / (i + 1);
      break;
    }
  }
  return { scored: [...agg.values()], resets };
}
