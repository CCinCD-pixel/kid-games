/**
 * 随机新仓库 orders (spec §3.9, §4.8): the seed counter, the "recently played" set, generation in the
 * Worker with a 1.5 s wall-clock budget, the fallback pool (lazy chunk) and the "next" slot that a
 * late generation fills. Every warehouse is new: the canonical hashes of the last 50 and of every
 * fixed v1 level are avoided (R8). No daily orders, no streaks.
 */
import type { GeneratedLevel, LessonKey } from '@engines/puzzle/src/generator';
import { LESSON_LINES, TIERS } from '@engines/puzzle/src/generator';
import { canonicalHash } from '@engines/puzzle/src/level';
import { allPushLevels, loadFallbackPool, star2Of, type Lesson, type LevelDef, type PoolLevel } from '../data';
import type { AppCtx } from './context';

export type Tier = 1 | 2 | 3;

export interface RandomSpec {
  tier: Tier;
  seed: number;
  poolIdx?: number;
  hash: number;
  map: string[];
  pushes: number;
  moves: number;
  ref: string;
  lesson: LessonKey;
  genMs?: number;
}

export const GEN_TIMEOUT_MS = 1500;

const LESSON_OF: Record<LessonKey, Lesson> = { park: 'park', order: 'order', color: 'color', pair: 'trap', corner: 'trap', wall: 'trap', plan: 'plain' };
const TEACH: Record<LessonKey, string> = {
  park: '先给一个箱子找个停车位', order: '先送对的那一个箱子', color: '每个箱子找同色的发射台', pair: '别让两个箱子并排贴墙',
  corner: '小心墙角', wall: '别把箱子推到空墙边', plan: '先想好路线再推',
};

/** The level a random order plays as (track 'random', its own id per seed). */
export function randomLevelDef(r: RandomSpec): LevelDef {
  return {
    id: r.poolIdx !== undefined ? `T${r.tier}-p${r.poolIdx}` : `T${r.tier}-${r.seed}`,
    release: 'v1',
    ch: 'random',
    track: 'random',
    role: 'random',
    review: false,
    name: TIERS[r.tier].name,
    teaches: TEACH[r.lesson],
    say: LESSON_LINES[r.lesson],
    lesson: LESSON_OF[r.lesson],
    map: r.map,
    opt: { pushes: r.pushes, moves: r.moves },
    star2: star2Of(r.pushes),
    ref: r.ref,
    twin: 'mirror',
    checks: {},
    metrics: { D: 0, k1: null, L1: null, states: 0, trapFirst: 0, firstPushes: 0, seqFirsts: null, greedy: '', switches: 0, turns: 0, first: {}, invis: null },
    random: { tier: r.tier, seed: r.seed, poolIdx: r.poolIdx, hash: r.hash, genMs: r.genMs },
  };
}

let fixedHashes: number[] | null = null;
/** Canonical hashes of every fixed v1 level (computed once). */
export function fixedLevelHashes(): number[] {
  fixedHashes ??= allPushLevels().map((l) => canonicalHash(l.map));
  return fixedHashes;
}

export function specFromGenerated(g: GeneratedLevel, genMs?: number): RandomSpec {
  return { tier: g.tier as Tier, seed: g.seed, hash: g.hash, map: g.rows, pushes: g.pushes, moves: g.moves, ref: g.lurd, lesson: g.lesson, genMs };
}

function specFromPool(p: PoolLevel, idx: number): RandomSpec {
  return { tier: p.tier as Tier, seed: p.seed, poolIdx: idx, hash: p.hash, map: p.map, pushes: p.opt.pushes, moves: p.opt.moves, ref: p.ref, lesson: p.lesson as LessonKey };
}

let pool: PoolLevel[] | null = null;
/** Start loading the pool chunk (S8 opening): never before. */
export function preloadPool(): Promise<PoolLevel[]> {
  return loadFallbackPool().then((p) => (pool = p));
}

/**
 * One order of `tier`: a waiting slot (a generation that finished late), else a fresh generation in
 * the Worker within 1.5 s, else the fallback pool (`nextSeed % 40`, skipping recently played ones).
 * The seed counter is advanced and saved first, so a reload never repeats a warehouse.
 */
export async function orderRandom(ctx: AppCtx, tier: Tier): Promise<{ spec: RandomSpec; fromPool: boolean }> {
  const slot = ctx.randomSlot[tier];
  const recent = new Set(ctx.save.data.random.recent);
  if (slot && !recent.has(slot.hash)) {
    delete ctx.randomSlot[tier];
    return { spec: slot, fromPool: false };
  }
  const seed = ctx.save.data.random.nextSeed;
  ctx.save.update((s) => {
    s.random.nextSeed = seed + 1;
  });
  const avoid = [...recent, ...fixedLevelHashes()];
  const late = (r: GeneratedLevel | { ok: false }, ms: number) => {
    if (r.ok) ctx.randomSlot[tier] = specFromGenerated(r as GeneratedLevel, ms);
  };
  const res = ctx.forcePool ? null : await ctx.client.generate(tier, seed, avoid, GEN_TIMEOUT_MS, late);
  if (res && res.result.ok) return { spec: specFromGenerated(res.result, res.ms), fromPool: false };
  // the fallback pool (40 per tier)
  const all = pool ?? (await preloadPool());
  const mine = all.filter((p) => p.tier === tier);
  if (!mine.length) throw new Error('random pool missing');
  for (let k = 0; k < mine.length; k += 1) {
    const idx = (seed + k) % mine.length;
    if (!recent.has(mine[idx].hash)) {
      ctx.save.update((s) => {
        s.random.poolIdx[tier - 1] = idx;
      });
      return { spec: specFromPool(mine[idx], idx), fromPool: true };
    }
  }
  const idx = seed % mine.length;
  return { spec: specFromPool(mine[idx], idx), fromPool: true };
}
