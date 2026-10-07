// Level generator (spec §4.6) — TS port of proto/levels/dsl.mjs + buildLevel (defs.mjs). Compact authored plans expand
// deterministically (each segment its own seeded stream: p never re-rolls another segment) into [tick, lane, kind,
// fixed] spawns. VALIDATORS ONLY (V6: re-expanding with the frozen p must give the shipped levels/*.json byte for
// byte); the game never runs the generator and the page bundle never imports this file.
import { TPS } from './rules';
import { KIND_THREAT } from './tables';
import type { Level } from './types';

export const sec = (s: number): number => Math.round(s * TPS);
function hashStr(s: string): number { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number): () => number { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function laneCycle(r: () => number, lanes: number[]): () => number {
  let order: number[] = [], last = -1;
  return () => {
    if (!order.length) { order = lanes.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } if (order.length > 1 && order[0] === last) order.push(order.shift()!); }
    last = order.shift()!; return last;
  };
}
/** which lanes a kind may use: boats only on water, ground / underground machines only on land */
export function lanesFor(k: string, lanes: number[], water: number[]): number[] {
  if (!water || !water.length) return lanes;
  if (k === 'boat') return lanes.filter((l) => water.includes(l));
  if (k === 'flyer' || k === 'flyer_m' || k.startsWith('boss:')) return lanes;
  return lanes.filter((l) => !water.includes(l));
}
export const GAP_MAX = 16;
/** smooth weighted round-robin: exactly proportional to the mix for any count, same prefix for every p */
export function quota(mix: Record<string, number>): () => string {
  const ks = Object.keys(mix); const cur: Record<string, number> = Object.fromEntries(ks.map((k) => [k, 0])); const tot = ks.reduce((a, k) => a + mix[k], 0);
  return () => { let best = ks[0]; for (const k of ks) { cur[k] += mix[k]; if (cur[k] > cur[best]) best = k; } cur[best] -= tot; return best; };
}
export type Spawn = [number, number, string, number];
export interface Plan {
  lanes?: number[]; water?: number[]; rocks?: unknown; high?: unknown; env?: Record<string, unknown>; sky?: boolean; start?: number;
  intro?: [number, number, string][]; extra?: [number, number, string][];
  trickle?: [number, number, number, Record<string, number>, number[] | undefined][];
  flags?: [number, number, Record<string, number>, number, number[] | undefined, [string, number][] | undefined][];
  flagTimes?: number[]; flagFloor?: number[] | null; spawns?: Spawn[]; warn?: unknown; preplace?: unknown; belt?: unknown; boss?: unknown;
  endTick?: number; maxTicks?: number; skyAfterKill?: boolean; drumOk?: boolean; jitter?: unknown; family?: unknown;
}
export function expand(id: string, plan: Plan, p = 1): Spawn[] {
  const lanes = plan.lanes || [0, 1, 2, 3, 4]; const water = plan.water || []; const out: Spawn[] = [];
  const seg = (tag: string): (() => number) => rng(hashStr(id + ':' + tag));
  const fix = (k: string, ln: number, cyc: () => number, r: () => number): number => { const ok = lanesFor(k, lanes, water); if (ok.includes(ln)) return ln; for (let i = 0; i < 8; i++) { const x = cyc(); if (ok.includes(x)) return x; } return ok[Math.floor(r() * ok.length)]; };
  for (const [t, lane, k] of plan.intro || []) out.push([sec(t), lane, k, 1]);
  for (const [t, lane, k] of plan.extra || []) out.push([sec(t), lane, k, 0]);
  (plan.trickle || []).forEach((tr, i) => {
    const [from, to, every, mix, ls] = tr; const r = seg('tr' + i); const next = laneCycle(seg('trl' + i), ls || lanes); const kind = quota(mix);
    let t = from;
    while (t < to) { const k = kind(); out.push([sec(t), fix(k, next(), next, r), k, 0]); t += (every / p) * (0.85 + 0.3 * r()); }
  });
  (plan.flags || []).forEach((f, j) => {
    const [t, n0, mix, spread = 10, ls, lead] = f; const r = seg('fl' + j); const next = laneCycle(seg('fll' + j), ls || lanes); const kind = quota(mix);
    for (const [k, ln] of lead || []) out.push([sec(t), ln, k, 0]);
    const floor = plan.flagFloor ? plan.flagFloor[j === plan.flags!.length - 1 ? 1 : 0] : 0;
    const ks = Object.keys(mix); const wsum = ks.reduce((a, k) => a + mix[k], 0);
    const meanT = ks.reduce((a, k) => a + mix[k] * KIND_THREAT(k), 0) / wsum;
    const leadT = (lead || []).reduce((a, [k]) => a + KIND_THREAT(k), 0);
    const nMin = floor > leadT ? Math.ceil((floor - leadT) / meanT) : 0;
    const n = Math.max(1, nMin, Math.round(n0 * Math.min(p, 1.25)));
    for (let i = 0; i < n; i++) { const k = kind(); out.push([sec(t + (spread * i) / Math.max(1, n - 1)), fix(k, next(), next, r), k, 0]); }
  });
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const fillLane = laneCycle(seg('gap'), lanes.filter((l) => !water.includes(l)));
  for (let guard = 0; guard < 40; guard++) {
    let gi = -1; for (let i = 1; i < out.length; i++) if (out[i][0] - out[i - 1][0] > sec(GAP_MAX)) { gi = i; break; }
    if (gi < 0) break;
    out.splice(gi, 0, [Math.round((out[gi - 1][0] + out[gi][0]) / 2), fillLane(), 'walker', 0]);
  }
  return out;
}

export type Meta = Record<string, unknown> & { type: string; newCard?: string; newEnemy?: string; choose?: boolean; loadout?: string[]; slots?: number; seal?: unknown; prefill?: string[] };
export function levelFrom(id: string, meta: Meta, plan: Plan, p = 1): Record<string, unknown> {
  const spawns = plan.spawns || expand(id, plan, p);
  const lanes = [0, 1, 2, 3, 4].map((l) => ((plan.lanes || [0, 1, 2, 3, 4]).includes(l) ? 1 : 0));
  const night = !!plan.env?.night;
  return {
    id, vol: +id.split('-')[0], idx: +id.split('-')[1], ...meta,
    lanes, water: plan.water ? [0, 1, 2, 3, 4].map((l) => (plan.water!.includes(l) ? 1 : 0)) : undefined,
    rocks: plan.rocks, high: plan.high, env: plan.env || {},
    sky: plan.sky ?? !(night && plan.env?.dawnAt == null),
    start: plan.start ?? (night ? 250 : 60),
    loadout: meta.loadout, pool: meta.pool, slots: meta.slots, seal: meta.seal, noHints: meta.noHints,
    spawns, flags: (plan.flags || []).map((f) => sec(f[0])).concat((plan.flagTimes || []).map(sec)).sort((a, b) => a - b),
    warn: plan.warn, preplace: plan.preplace, belt: plan.belt, boss: plan.boss, endTick: plan.endTick, maxTicks: plan.maxTicks,
    skyAfterKill: plan.skyAfterKill, prefill: meta.prefill, infer: meta.infer,
    drumOk: plan.drumOk ?? +id[0] >= 3, jitter: plan.jitter, family: plan.family, p,
  };
}

// ── campaign tables used by buildLevel (proto defs.mjs) ──
export const SHARE: Record<string, number> = { default: 0.3, ant: 0.45, shielder: 0.4, ladder: 0.35 };
export const CARD_UNLOCK: Record<string, string> = { shooter: '1-1', farm: '1-2', wall: '1-3', lobber: '1-4', spikes: '1-5', pit: '1-6', burner: '1-7', strike: '1-8', beam: '1-9',
  bank: '2-1', radial: '2-2', gust: '2-3', hook: '2-6', raft: '3-1', repair: '3-4', salvage: '3-7', listener: '4-2' };
export const ENEMY_INTRO: Record<string, string> = { walker: '1-1', shielder: '1-4', ram: '1-5', ant: '1-7', brute: '1-9', flyer: '2-2', smoker: '2-4', ladder: '2-6', drummer: '2-8',
  boat: '3-2', carrier: '3-4', tunneler: '4-2', tower: '4-3', shielder_m: '2-10', flyer_m: '4-6' };
const key = (id: string): number => { const [a, b] = id.split('-').map(Number); return a * 100 + b; };
export const poolAt = (id: string): string[] => Object.keys(CARD_UNLOCK).filter((c) => key(CARD_UNLOCK[c]) <= key(id));
export const knownAt = (id: string): string[] => Object.keys(ENEMY_INTRO).filter((k) => key(ENEMY_INTRO[k]) <= key(id));
export const FLOORS: Record<number, number[]> = { 1: [50, 80], 2: [70, 100], 3: [80, 110], 4: [90, 120] };
let FLOOR: number[] | null = null;
/** the standard plan shape (proto `std`): flags/trickle objects → tuples, 大波 floor of the level being built (G3) */
export function std(o: Omit<Plan, 'flags' | 'trickle'> & { flags: { t: number; n: number; k: Record<string, number>; sp?: number; ln?: number[]; lead?: [string, number][] }[]; tr: { a: number; z: number; e: number; k: Record<string, number>; ln?: number[] }[] }): Plan {
  const flags = o.flags.map((f) => [f.t, f.n, f.k, f.sp ?? 12, f.ln, f.lead] as NonNullable<Plan['flags']>[number]);
  const trickle = o.tr.map((x) => [x.a, x.z, x.e, x.k, x.ln] as NonNullable<Plan['trickle']>[number]);
  const { tr: _tr, ...rest } = o; void _tr;
  return { flagFloor: FLOOR, ...rest, flags, trickle };
}
export interface Def { id: string; meta: Meta; plan: (p: number) => Plan }
export function buildLevel(d: Def, p = 1): Level {
  const id = d.id;
  FLOOR = ['tutorial', 'boss', 'conveyor'].includes(d.meta.type) ? null : FLOORS[+id.split('-')[0]];
  const plan = d.plan(p); FLOOR = null;
  const meta: Meta = { ...d.meta }; if (meta.choose) meta.pool = poolAt(id);
  const lv = levelFrom(id, meta, plan, p) as unknown as Omit<Level, 'spawns'> & { spawns: Spawn[] };
  const intros = lv.spawns.filter((s) => s[3]);
  if (intros.length && !lv.boss) lv.spawns = lv.spawns.filter((s) => s[3] || intros.every((it) => Math.abs(s[0] - it[0]) > 200));
  if (d.meta.type === 'teach' && d.meta.newEnemy && !['boat', 'tunneler', 'carrier', 'tower', 'flyer'].includes(d.meta.newEnemy)) {
    const k = d.meta.newEnemy === 'ant' ? 'swarm' : d.meta.newEnemy;
    const t0 = (intros[0]?.[0] ?? 0) + 200; const th = (x: string): number => KIND_THREAT(x);
    const after = lv.spawns.filter((s) => s[0] > t0 && !s[3]);
    let tot = after.reduce((a, s) => a + th(s[2]), 0), mine = after.filter((s) => s[2] === k).reduce((a, s) => a + th(s[2]), 0);
    for (const s of after) { if (mine >= (SHARE[d.meta.newEnemy] ?? SHARE.default) * tot) break; if (s[2] !== 'walker') continue; tot += th(k) - th('walker'); mine += th(k); s[2] = k; }
  }
  (lv as unknown as { known: string[] }).known = knownAt(id);
  return lv as unknown as Level;
}
