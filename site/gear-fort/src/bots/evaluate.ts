// V8 evaluation (validators only) — port of the batch / chain parts of proto/v1/worker2.mjs + report-v1d.mjs.
// Same seeds (1..N), same options, same bots → the same numbers as the prototype's out/v1/report.json (V4b).
import { ASSIST, ASSIST2 } from '../lane/rules';
import { createSim, step } from '../lane/sim';
import { starsOf } from '../lane/stars';
import { failCause, checkFacts } from '../lane/failcause';
import { levelFor, makeBot } from './run';
import type { Level, SimState } from '../lane/types';

const MAXT = 20 * 60 * 12;
const tierOf = (bot: string): number => (bot === 'Kb' ? 2 : bot === 'Ka' || bot === 'Kr' ? 1 : 0);

export function play(base: Level, bot: string, seed: number, coachLifetime?: Record<string, number>): { S: SimState; coach?: Record<string, number> } {
  const lv = levelFor(base, bot, seed); const tier = tierOf(bot);
  const S = createSim(lv, seed, { extraStart: tier === 2 ? ASSIST2.startGrain : tier ? ASSIST.startGrain : 0, assist: tier, events: true, logCap: tier === 2 ? ASSIST2.logs : 1 });
  const b = makeBot(bot, lv, seed, { coachLifetime });
  while (!S.result && S.tick < MAXT) step(S, b(S));
  if (!S.result) S.result = 'timeout';
  const mem = b.coachMem as { lifetime: Record<string, number> } | undefined;
  return { S, coach: mem ? { ...mem.lifetime } : undefined };
}

export interface Tally { n: number; wins: number; steady: number; two: number; stars: number[]; factsN: number; factsOk: number; timeouts: number; logs: number }
export const blank = (): Tally => ({ n: 0, wins: 0, steady: 0, two: 0, stars: [0, 0, 0, 0], factsN: 0, factsOk: 0, timeouts: 0, logs: 0 });
export function addRun(o: Tally, S: SimState): void {
  const win = S.result === 'win'; o.n++; if (win) o.wins++;
  if (S.result === 'timeout') o.timeouts++;
  const lg = S.stats.logsUsed; o.logs += lg; if (win && lg <= 1) o.steady++; if (win && lg <= 2) o.two++;
  o.stars[starsOf(S)]++;
  if (!win || lg > 0) { const c = failCause(S); o.factsN++; if (checkFacts(S, c)) o.factsOk++; }
}
export const pct = (o: Tally, k: 'wins' | 'steady' | 'two' = 'wins'): number => Math.round((100 * o[k]) / Math.max(1, o.n));
export const star3 = (o: Tally): number => Math.round((100 * o.stars[3]) / Math.max(1, o.n));
export const facts = (o: Tally): number => (o.factsN ? Math.round((100 * o.factsOk) / o.factsN) : 100);

export function batch(base: Level, bot: string, n: number): Tally { const o = blank(); for (let s = 1; s <= n; s++) addRun(o, play(base, bot, s).S); return o; }

/** K+ through the campaign in order, one first attempt per level, the coach's lifetime memory carried (review B7) */
export function chain(levels: Level[], n: number): Record<string, Tally> {
  const per: Record<string, Tally> = {};
  for (let s = 1; s <= n; s++) {
    let lifetime: Record<string, number> = {};
    for (const lv of levels) { const { S, coach } = play(lv, 'K+', s, lifetime); (per[lv.id] ||= blank()); addRun(per[lv.id], S); lifetime = coach ? coach : lifetime; }
  }
  return per;
}
