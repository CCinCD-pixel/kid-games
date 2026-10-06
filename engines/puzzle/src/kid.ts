/**
 * Kid models of the full level validator (spec §9.2) — validator/tools only, never imported by the page.
 * A faithful port of the prototype `kid.mjs` / `eval.mjs` (v1.1): same scoring, same softmax sampling,
 * same order of RNG calls and same legal-push order, so a fixed seed gives the prototype's numbers
 * bit for bit (the full validator asserts the shipped `metrics.k1` / `metrics.L1` within ±0.005).
 *
 *   kidRates        naive kid (k1 / k3): each push is a softmax (τ = 0.45) over "the crate looks closer to a pad
 *                   of its colour" (Manhattan); hates un-locking a crate; a push the in-game detector flags (✕)
 *                   costs one push and is undone; undetected dead ends are not recognised; budget 2·opt + 8.
 *   kidColorBlind   the same kid, but every crate heads for the nearest pad of ANY colour (N2).
 *   learnerRate     L1: like the naive kid, but before each push with probability q = 0.6 it "thinks it through"
 *                   and keeps only pushes on a shortest remaining solution (exact, from the state graph).
 */
import { detectDeadlock } from './deadlock';
import { applyPush, canon, isSolved, legalPushes } from './rules';
import type { StateGraph } from './stategraph';
import type { Level, Push } from './types';

export type Rng = () => number;

/** The prototype's PRNG (spec §9.2: every kid run is seeded, results are reproducible). */
export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** colour → per-cell Manhattan distance to the nearest pad (of that colour, or of any colour when `anyColour`). */
export type KidDistances = Record<number, Int16Array>;

export function manhattanToPads(l: Level, anyColour = false): KidDistances {
  const out: KidDistances = {};
  const colours = new Set(Array.from(l.colorOf));
  for (const k of colours) {
    const pads: number[] = [];
    for (let i = 0; i < l.N; i += 1) if (anyColour ? l.goal[i] >= 0 : l.goal[i] === k) pads.push(i);
    const d = new Int16Array(l.N).fill(-1);
    for (let i = 0; i < l.N; i += 1) {
      if (!l.floor[i]) continue;
      let m = 99;
      for (const p of pads) m = Math.min(m, Math.abs(((i / l.W) | 0) - ((p / l.W) | 0)) + Math.abs((i % l.W) - (p % l.W)));
      d[i] = m;
    }
    out[k] = d;
  }
  return out;
}

/** One softmax draw over the naive heuristic (exactly the prototype's arithmetic and sampling loop). */
function sample(l: Level, pushes: Push[], md: KidDistances, rng: Rng, tau: number): Push {
  const sc = pushes.map((pu) => {
    const col = l.colorOf[pu.slot];
    const a = md[col][pu.from];
    const b = md[col][pu.to];
    let s = (b < 0 ? 6 : b) - (a < 0 ? 6 : a);
    if (l.goal[pu.from] === col) s += 2.5;
    s += 0.03 * pu.walk;
    return -s / tau;
  });
  const mx = Math.max(...sc);
  const w = sc.map((v) => Math.exp(v - mx));
  let r = rng() * w.reduce((x, y) => x + y, 0);
  let i = 0;
  while ((r -= w[i]) > 0 && i < w.length - 1) i += 1;
  return pushes[i];
}

export interface KidOptions {
  tau?: number;
  budget?: number;
}

/** One attempt of the naive kid; true = solved within the push budget. */
export function kidAttempt(l: Level, opt: number, rng: Rng, md: KidDistances, o: KidOptions = {}): boolean {
  const tau = o.tau ?? 0.45;
  const budget = o.budget ?? 2 * opt + 8;
  let player = l.start.player;
  let boxes = canon(l, l.start.boxes);
  let used = 0;
  while (used < budget) {
    if (isSolved(l, boxes)) return true;
    const { pushes } = legalPushes(l, { player, boxes });
    if (!pushes.length) return false;
    const pu = sample(l, pushes, md, rng, tau);
    const nbx = applyPush(l, boxes, pu);
    used += 1;
    if (detectDeadlock(l, nbx)) continue; // the kid sees ✕ and undoes
    boxes = nbx;
    player = pu.from;
  }
  return false;
}

/** k1 = P(first attempt solves), k3 = P(solved within 3 attempts); seed 11, 400 runs (spec §9.2). */
export function kidRates(l: Level, opt: number, o: { runs?: number; seed?: number } = {}): { kid1: number; kid3: number } {
  const runs = o.runs ?? 400;
  const rng = mulberry32(o.seed ?? 11);
  const md = manhattanToPads(l);
  let k1 = 0;
  let k3 = 0;
  for (let i = 0; i < runs; i += 1) {
    let ok = false;
    let first = false;
    for (let t = 0; t < 3 && !ok; t += 1) {
      ok = kidAttempt(l, opt, rng, md);
      if (t === 0) first = ok;
    }
    if (first) k1 += 1;
    if (ok) k3 += 1;
  }
  return { kid1: k1 / runs, kid3: k3 / runs };
}

/** cb: the colour-blind naive kid (nearest pad of any colour), first attempt only; seed 11 (N2). */
export function kidColorBlind(l: Level, opt: number, o: { runs?: number; seed?: number } = {}): number {
  const runs = o.runs ?? 400;
  const rng = mulberry32(o.seed ?? 11);
  const md = manhattanToPads(l, true);
  let k1 = 0;
  for (let i = 0; i < runs; i += 1) if (kidAttempt(l, opt, rng, md)) k1 += 1;
  return k1 / runs;
}

/** One attempt of the learner: with probability q a push on a shortest remaining solution (exact, graph `g`). */
export function learnerAttempt(l: Level, g: StateGraph, opt: number, rng: Rng, md: KidDistances, o: KidOptions & { q?: number } = {}): boolean {
  const q = o.q ?? 0.6;
  const tau = o.tau ?? 0.45;
  const budget = o.budget ?? 2 * opt + 8;
  let player = l.start.player;
  let boxes = canon(l, l.start.boxes);
  let used = 0;
  while (used < budget) {
    if (isSolved(l, boxes)) return true;
    let { pushes } = legalPushes(l, { player, boxes });
    if (rng() < q) {
      let best = Infinity;
      const tg = pushes.map((pu) => {
        const t = g.togo({ player: pu.from, boxes: applyPush(l, boxes, pu) });
        if (t >= 0 && t < best) best = t;
        return t;
      });
      const ok = pushes.filter((_, i) => tg[i] === best);
      if (ok.length) pushes = ok;
    }
    if (!pushes.length) return false;
    const pu = sample(l, pushes, md, rng, tau);
    const nbx = applyPush(l, boxes, pu);
    used += 1;
    if (detectDeadlock(l, nbx)) continue;
    boxes = nbx;
    player = pu.from;
  }
  return false;
}

/** L1 = P(the learner's first attempt solves); seed 13, 400 runs, q = 0.6 (spec §9.2, B1/B2/C6). */
export function learnerRate(l: Level, g: StateGraph, opt: number, o: { runs?: number; seed?: number; q?: number } = {}): number {
  const runs = o.runs ?? 400;
  const rng = mulberry32(o.seed ?? 13);
  const md = manhattanToPads(l);
  let k = 0;
  for (let i = 0; i < runs; i += 1) if (learnerAttempt(l, g, opt, rng, md, { q: o.q })) k += 1;
  return k / runs;
}
