// V8 evaluation (validators only) — port of the batch / chain parts of proto/v1/worker2.mjs + report-v1d.mjs.
// Same seeds (1..N), same options, same bots → the same numbers as the prototype's out/v1/report.json (V4b).
import { ASSIST, ASSIST2, TPS, T } from '../lane/rules';
import { createSim, step, snapshot, restore, type Snapshot } from '../lane/sim';
import { starsOf } from '../lane/stars';
import { failCause, checkFacts, LESSON_CAUSES } from '../lane/failcause';
import { pairEvents } from '../lane/learn';
import { levelFor, makeBot, type LevelForOptions, type MakeBotOptions } from './run';
import type { Level, SimState } from '../lane/types';

const MAXT = 20 * 60 * 12;
const tierOf = (bot: string): number => (bot === 'Kb' ? 2 : bot === 'Ka' || bot === 'Kr' ? 1 : 0);
/** batch options = the prototype's `m.opt` (goes to levelFor AND makeBot) */
export type EvalOpt = LevelForOptions & MakeBotOptions;
// the level's 怕什么 pair the child should learn there (review B4: ≥ 90 % of K2 wins) — proto worker2 LEARN_PAIR
export const LEARN_PAIR: Record<string, [string, string[]]> = { '1-1': ['walker', ['shooter']], '1-4': ['shielder', ['lobber']], '1-5': ['ram', ['spikes']], '1-7': ['ant', ['burner']], '1-9': ['brute', ['beam']],
  '2-2': ['flyer', ['radial']], '2-3': ['flyer', ['gust']], '2-4': ['smoker', ['gust', 'lobber']], '2-6': ['ladder', ['hook']], '2-8': ['drummer', ['strike', 'lobber']], '2-10': ['shielder_m', ['lobber', 'burner', 'beam']] };

export function play(base: Level, bot: string, seed: number, coachLifetime?: Record<string, number>, opt: EvalOpt = {}, incomePct?: number): { S: SimState; coach?: Record<string, number> } {
  const lv = levelFor(base, bot, seed, opt); const tier = tierOf(bot);
  const S = createSim(lv, seed, { incomePct, extraStart: tier === 2 ? ASSIST2.startGrain : tier ? ASSIST.startGrain : 0, assist: tier, events: true, logCap: tier === 2 ? ASSIST2.logs : 1 });
  const b = makeBot(bot, lv, seed, { ...opt, coachLifetime });
  while (!S.result && S.tick < MAXT) step(S, b(S));
  if (!S.result) S.result = 'timeout';
  const mem = b.coachMem as { lifetime: Record<string, number> } | undefined;
  return { S, coach: mem ? { ...mem.lifetime } : undefined };
}

export interface Tally {
  n: number; wins: number; steady: number; two: number; stars: number[]; factsN: number; factsOk: number; timeouts: number; logs: number;
  dur: number; float: number; peak: number; idles: number[]; causes: Record<string, number>; lessonHit: number; lessonN: number;
  learnWins: number; learned: number; newLeak: number; refunds: number; out: Record<string, number>;
}
export const blank = (): Tally => ({ n: 0, wins: 0, steady: 0, two: 0, stars: [0, 0, 0, 0], factsN: 0, factsOk: 0, timeouts: 0, logs: 0, dur: 0, float: 0, peak: 0, idles: [], causes: {}, lessonHit: 0, lessonN: 0, learnWins: 0, learned: 0, newLeak: 0, refunds: 0, out: {} });
function idleOf(S: SimState): number {
  const marks: number[] = [];
  for (const e of S.ev || []) if (['place', 'spawn', 'strike', 'drop', 'movePreview', 'swoopTele', 'chargeTele'].includes(e.type)) marks.push(e.tick);
  marks.push(S.tick); marks.sort((a, b) => a - b);
  let idle = 0; for (let i = 1; i < marks.length; i++) idle = Math.max(idle, marks[i] - marks[i - 1]);
  return idle / TPS;
}
const ATT = new Set(['shooter', 'lobber', 'burner', 'beam', 'radial']);
/** one finished game into the tally (port of worker2 addRun; `id`/`newEnemy` switch on the lesson/leak/learn counters) */
export function addRun(o: Tally, S: SimState, id?: string, newEnemy?: string): void {
  const win = S.result === 'win'; o.n++; if (win) o.wins++;
  if (S.result === 'timeout') o.timeouts++;
  const st = S.stats; const lg = st.logsUsed; o.logs += lg; if (win && lg <= 1) o.steady++; if (win && lg <= 2) o.two++;
  o.dur += S.tick / TPS; o.float += st.floatN ? st.floatSum / st.floatN : 0; o.peak = Math.max(o.peak, st.peak); o.refunds += st.refunds || 0;
  o.stars[starsOf(S)]++;
  if (!win || lg > 0) {
    const c = failCause(S); const key = c.id + (c.kind && ['counterMissing', 'counterUnused'].includes(c.id) ? ':' + c.kind : '');
    o.causes[key] = (o.causes[key] || 0) + 1; o.factsN++; if (checkFacts(S, c)) o.factsOk++;
    const lc = id ? LESSON_CAUSES[id] : undefined; if (lc) { o.lessonN++; if (lc.includes(c.id) || lc.includes(key)) o.lessonHit++; }
  }
  o.idles.push(idleOf(S));
  if (newEnemy) { const k = newEnemy === 'swarm' ? 'ant' : newEnemy; if ((S.ev || []).some((e) => (e.type === 'log' || e.type === 'lose') && e.by === k)) o.newLeak++; }
  const lp = id ? LEARN_PAIR[id] : undefined; if (lp && win) { o.learnWins++; const pe = pairEvents(S)[lp[0]] || {}; if (lp[1].some((c) => (pe[c] || 0) >= 2)) o.learned++; }
  const gone = (S.ev || []).filter((e) => e.type === 'unitGone' && e.why !== 'shovel' && e.why !== 'spent');
  const add = (k: string, v: number): void => { o.out[k] = (o.out[k] || 0) + v; };
  add('attackersLost', gone.filter((g) => ATT.has(g.k as string)).length); add('wallsLost', gone.filter((g) => g.k === 'wall').length);
  add('econLost', st.econLost); add('unitsLost', st.unitsLost); add('pins', st.pins || 0); add('pinnedLadders', (st as unknown as { ladders?: number }).ladders || 0);
  add('blindSec', st.blindTicks / TPS); add('auraSec', ((st as unknown as { auraTicks?: number }).auraTicks || 0) / TPS); add('logs', lg); add('minX', Math.min(...st.minX) / T);
  add('captured', st.captured); add('lostByRam', st.unitsLostBy.ram || 0); add('grounded', (S.ev || []).filter((e) => e.type === 'grounded').length); add('star3', starsOf(S) === 3 ? 1 : 0);
}
export const pct = (o: Tally, k: 'wins' | 'steady' | 'two' = 'wins'): number => Math.round((100 * o[k]) / Math.max(1, o.n));
export const star3 = (o: Tally): number => Math.round((100 * o.stars[3]) / Math.max(1, o.n));
export const facts = (o: Tally): number => (o.factsN ? Math.round((100 * o.factsOk) / o.factsN) : 100);
/** per-run average of an `out` metric, rounded like the prototype (toFixed(2)) */
export const outAvg = (o: Tally, k: string): number => +((o.out[k] || 0) / Math.max(1, o.n)).toFixed(2);

export function batch(base: Level, bot: string, n: number, opt: EvalOpt = {}, track = false, life?: Record<number, Record<string, number>>): Tally {
  const o = blank(); for (let s = 1; s <= n; s++) addRun(o, play(base, bot, s, life ? life[s] || {} : undefined, opt).S, track ? base.id : undefined, track && bot === 'C' ? base.newEnemy ?? undefined : undefined); return o;
}

/** K+ through the campaign in order, one first attempt per level, the coach's lifetime memory carried (review B7) */
export function chain(levels: Level[], n: number): Record<string, Tally> { return chainLife(levels, n).per; }
export function chainLife(levels: Level[], n: number): { per: Record<string, Tally>; life: Record<number, Record<string, Record<string, number>>> } {
  const per: Record<string, Tally> = {}; const life: Record<number, Record<string, Record<string, number>>> = {};
  for (let s = 1; s <= n; s++) {
    let lifetime: Record<string, number> = {}; life[s] = {};
    for (const lv of levels) { life[s][lv.id] = { ...lifetime }; const { S, coach } = play(lv, 'K+', s, lifetime); (per[lv.id] ||= blank()); addRun(per[lv.id], S); lifetime = coach ? coach : lifetime; }
  }
  return { per, life };
}

// attempts: 1 = K+ (lifetime coach) · 2 = Kl from the last checkpoint · 3 = Kr whole level, assist tier 1 · 4 = Kb, tier 2
const CP_EVENTS = new Set(['shellOn', 'shellOff', 'hullOpen', 'movePreview', 'owlDown']);
export function retry(base: Level, n: number, life: Record<number, Record<string, number>>): { n: number; p: number[]; att: number } {
  const res = { n: 0, p: [0, 0, 0, 0], att: 0 };
  for (let s = 1; s <= n; s++) {
    const lifetime = life[s] || {}; const lv = levelFor(base, 'K+', s);
    let S = createSim(lv, s, { events: true }); let bot = makeBot('K+', lv, s, { coachLifetime: lifetime }); let snap: Snapshot | null = null; let attempt = 1; let won = 0;
    for (;;) {
      while (!S.result && S.tick < MAXT) {
        if ((S.flags || []).includes(S.tick)) snap = snapshot(S);
        const n0 = S.ev!.length; step(S, bot(S));
        for (let i = n0; i < S.ev!.length; i++) if (CP_EVENTS.has(S.ev![i].type)) { snap = snapshot(S); break; }
      }
      if (S.result === 'win') { won = attempt; break; }
      if (attempt >= 4) break;
      attempt++;
      if (attempt === 2 && snap) { const R = restore(snap, lv, { events: true }); if (!R) throw new Error('restore hash mismatch ' + base.id); S = R; S.result = null; bot = makeBot('Kl', lv, s * 1000 + attempt, { coachLifetime: lifetime }); }
      else {
        const b2 = attempt >= 4 ? 'Kb' : 'Kr'; const tier = tierOf(b2); const lv2 = levelFor(base, b2, s);
        S = createSim(lv2, s * 1000 + attempt, { events: true, extraStart: tier === 2 ? ASSIST2.startGrain : ASSIST.startGrain, assist: tier, logCap: tier === 2 ? ASSIST2.logs : 1 });
        bot = makeBot(b2, lv2, s * 1000 + attempt, { coachLifetime: lifetime });
      }
    }
    res.n++; res.att += attempt; for (let a = 1; a <= 4; a++) if (won && won <= a) res.p[a - 1]++;
  }
  return res;
}
/** m*: the smallest income % (40..160) where the bot wins ≥ 90 % of seeds [s0, s1] (D = m*(C), G = m*(K)/m*(C)) */
export function mstar(base: Level, bot: string, seeds: [number, number], opt: EvalOpt = {}): number | '>160' {
  const win = (p: number): number => { let w = 0, n = 0; for (let s = seeds[0]; s <= seeds[1]; s++) { n++; if (play(base, bot, s, undefined, opt, p).S.result === 'win') w++; } return (100 * w) / n; };
  let lo = 40, hi = 160;
  if (win(hi) < 90) return '>160';
  if (win(lo) >= 90) return 40;
  for (let i = 0; i < 6; i++) { const mid = Math.round((lo + hi) / 2); if (win(mid) >= 90) hi = mid; else lo = mid; }
  return hi;
}
