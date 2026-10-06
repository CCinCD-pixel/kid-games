/**
 * One AI decision from a PUBLIC view (spec §8.5): the Worker, the hint level and every Node tool
 * (self-play, calibration, no-peek test) call this same function. Deterministic for a given view,
 * level and seed (`mc:ai:<matchId>:<ply>` / `mc:hint:<matchId>:<ply>`).
 */
import { createRng } from '@kit/rng';
import { isFlip, isMove, isPass, legalMoves, type Action } from '../core/movegen';
import { toNote } from '../core/notation';
import { dealHidden, worldFrom, type PublicView } from '../core/redact';
import type { GameState } from '../core/state';
import { fanScores } from './fan';
import { hintCfg, LEVELS, type Level, type LevelCfg } from './levels';
import { pimcScores } from './pimc';
import { newCtx, scoreRoot, scoreShallow, type Scored } from './search';
import { choose, hardFilter, rank } from './select';
import { applyStyle } from './style';

export interface ThinkRequest {
  view: PublicView;
  level: Level | 'hint';
  seed: string;
  budget?: { nodes?: number; ms?: number };
}
export interface ThinkStats {
  nodes: number;
  ms: number;
  samples: number;
  depth: number;
  overlooked: boolean;
  /** this move was an aimless novice move (`wander`) */
  wandered: boolean;
  beliefResets: number;
  aborted: boolean;
}
export interface ThinkResult {
  note: string;
  stats: ThinkStats;
  /** the ranked candidates (hint quality tests) */
  ranked?: Array<{ note: string; v: number }>;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function mobileCount(s: GameState): number {
  let n = 0;
  for (let p = 0; p < s.np; p++) if (s.palive[p] && s.ptype[p] !== 0 && s.ptype[p] !== 1) n++;
  return n;
}

export function think(req: ThinkRequest, o: { withRanked?: boolean } = {}): ThinkResult {
  const t0 = now();
  const v = req.view;
  const cfg: LevelCfg = req.level === 'hint' ? hintCfg(v.mode) : LEVELS[v.mode][req.level];
  const rng = createRng(req.seed);
  const r = (): number => rng.next();
  const root = (v.turn === 0 || v.turn === 1 ? v.turn : v.me) as 0 | 1;
  const ctx = newCtx(cfg.w, req.budget?.nodes ?? cfg.nodes, req.budget?.ms ?? 600, now, root);
  const stats: ThinkStats = { nodes: 0, ms: 0, samples: 1, depth: cfg.depth, overlooked: false, wandered: false, beliefResets: 0, aborted: false };
  const done = (a: Action, scored: Scored[] | null): ThinkResult => {
    stats.nodes = ctx.nodes;
    stats.ms = now() - t0;
    stats.aborted = ctx.aborted;
    const res: ThinkResult = { note: toNote(a), stats };
    if (o.withRanked && scored) res.ranked = rank(scored).map((x) => ({ note: toNote(x.a), v: x.v }));
    return res;
  };

  // 翻翻棋 opening: the first flip decides the colours; any tile is as good as any other
  if (v.mode === 'fan' && v.turn === -1) {
    const world = worldFrom(v, dealHidden(v, r));
    const flips = legalMoves(world).filter(isFlip);
    return done(flips[Math.floor(r() * flips.length)], null);
  }

  // the aimless novice move (levels 1–3): any move the novice filter allows, seeded
  if (cfg.wander > 0 && r() < cfg.wander) {
    // own moves and flips do not depend on hidden identities — except the 翻翻棋 flag lock, which
    // counts the flag side's mines face down too: deal the public multiset so the counts are right
    const world = worldFrom(v, v.mode === 'fan' ? dealHidden(v, r) : null);
    let ms = hardFilter(v, legalMoves(world).filter((a) => !isPass(a)));
    if (cfg.wanderQuiet > 0 && r() < cfg.wanderQuiet) {
      const quiet = ms.filter((a) => isMove(a) && a.kind === 'move');
      if (quiet.length) ms = quiet;
    } else if (cfg.wanderCharge > 0 && r() < cfg.wanderCharge) {
      const charge = ms.filter((a) => isMove(a) && a.kind === 'attack');
      if (charge.length) ms = charge;
    }
    if (ms.length) {
      stats.wandered = true;
      return done(ms[Math.floor(r() * ms.length)], null);
    }
  }
  const overlook = cfg.overlook > 0 && r() < cfg.overlook;
  stats.overlooked = overlook;
  let scored: Scored[];
  if (v.mode === 'an') {
    const res = pimcScores(v, cfg.samples, cfg.depth, cfg.qdepth, overlook, ctx, r, (w) => hardFilter(v, legalMoves(w).filter((a) => !isPass(a))));
    scored = res.scored;
    stats.samples = cfg.samples;
    stats.beliefResets = res.resets;
  } else if (v.mode === 'fan') {
    const world = worldFrom(v, dealHidden(v, r));
    let depth = cfg.depth;
    let allUp = true;
    for (let p = 0; p < world.np; p++) if (world.palive[p] && !world.pup[p]) allUp = false;
    if (allUp && mobileCount(world) <= cfg.endgameN) depth = cfg.endgameDepth;
    stats.depth = depth;
    scored = fanScores(ctx, world, v.hidden!, cfg.replyDepth, overlook, depth, cfg.qdepth);
    // the novice filter applies to piece moves only (flips are never "certain losses")
    const keep = new Set(hardFilter(v, scored.map((x) => x.a)).map(toNote));
    scored = scored.filter((x) => keep.has(toNote(x.a)));
  } else {
    const world = worldFrom(v, null);
    const ms = hardFilter(v, legalMoves(world).filter((a) => !isPass(a)));
    scored = overlook ? scoreShallow(ctx, world, ms) : scoreRoot(ctx, world, cfg.depth, cfg.qdepth, ms);
  }
  if (!scored.length) {
    // nothing scored (budget hit before the first move): any legal action, seeded
    const world = worldFrom(v, v.mode === 'fan' ? dealHidden(v, r) : null);
    const legal = legalMoves(world).filter((a) => !isPass(a));
    return done(legal[Math.floor(r() * legal.length)], null);
  }
  scored = applyStyle(v, scored, cfg.w);
  return done(choose(scored, cfg.topK, cfg.temp, r), scored);
}
