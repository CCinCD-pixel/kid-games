/**
 * 星晶消消乐 difficulty model (spec §4.3, §9.2 V4/V4f; port of the prototype tune.mjs `bandOf`,
 * `pickMoves`, `analyse` — same numbers, same flags). Pure: no DOM, no Node APIs, so the vitest
 * validators (site/emoji-match/validate/*.test.ts) and the headless simulator (tools/emoji-match/sim)
 * share one definition of "in band".
 *
 * Bands are win rates of the kid-proxy bot K (35 % random legal move, 65 % greedy) at the level's
 * move limit. The other bots are guard rails: L (2-ply lookahead) ≥ 0.70 = never near-impossible;
 * on H/B levels R (random) stays low, L − K stays large (thinking ahead pays) and KH (hint follower)
 * stays ≤ band hi + 0.10 (waiting for hints does not make the level easy).
 */
import type { LevelData } from '../../../site/emoji-match/src/content';

export type Role = LevelData['role'];
export type Band = readonly [lo: number, hi: number, target: number];

export const BANDS: Record<'T' | 'E' | 'N' | 'H' | 'B' | 'R' | 'B1', Band> = {
  T: [0.95, 1.0, 0.97],
  E: [0.80, 0.95, 0.88],
  N: [0.62, 0.80, 0.72],
  H: [0.42, 0.60, 0.52],
  B: [0.35, 0.55, 0.45],
  R: [0.88, 1.0, 0.93],
  // v1.1 (review D7): the episode-1 boss is the child's first real challenge — its own, gentler band
  B1: [0.50, 0.66, 0.58],
};
export const bandOf = (def: Pick<LevelData, 'role' | 'ep'>): Band => BANDS[def.role === 'B' && def.ep === 1 ? 'B1' : def.role];

/** full tier (V4): games per bot; seeds 1000 + k. Held-out K: seeds 5000 + k (never used to pick moves). */
export const BOTS = { K: 400, G: 200, R: 200, L: 100, KH: 200 } as const;
export const HELD_OUT = 400;
export const SEED_BASE = 1000;
export const HELD_OUT_BASE = 5000;
/** a playout gives up after this many moves (≥ every v1 move limit) */
export const PLAYOUT_CAP = 60;
export const MIN_M = 8, MAX_M = 40;

/** moves-to-win per game (Infinity = never won within the cap), per bot name */
export type Needs = Record<string, number[]>;

export const rate = (arr: number[], M: number): number => (arr.length ? arr.filter((x) => x <= M).length / arr.length : 0);
export const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/** the move limit whose K win rate is closest to the band target (inside the band if possible) */
export function pickMoves(def: Pick<LevelData, 'role' | 'ep'>, need: Needs): { M: number; d: number; inBand: boolean } {
  const [lo, hi, target] = bandOf(def);
  let best: { M: number; d: number; inBand: boolean } | null = null;
  for (let M = MIN_M; M <= MAX_M; M += 1) {
    const k = rate(need.K, M);
    const inBand = k >= lo && k <= hi;
    const d = Math.abs(k - target) + (inBand ? 0 : 1);
    if (!best || d < best.d - 1e-9) best = { M, d, inBand };
  }
  return best!;
}

export interface Analysis {
  M: number;
  /** win rate per bot at M */
  r: Record<string, number>;
  /** star lines: 2★ / 3★ = moves left ≥ s2 / s3 */
  s2: number; s3: number;
  /** K's wins split into 1★/2★/3★ */
  kStars: { 1: number; 2: number; 3: number };
  medK: number;
  flags: string[];
  nK: number;
  fKey: string | null;
  /** the move limit the same procedure would pick from scratch (V4: within ±1 of `moves`) */
  retune: number;
}

export interface LessonCheck { ok: boolean; made: string[] }

/**
 * Evaluate a level at a move limit: rates, star lines (v1.1 D3: T levels and all of episode 1 use
 * K's leftover p20/p50, 1-01 = every win is 3★, elsewhere p50/p85) and every V4 flag.
 * `useMoves` = keep the level's current move limit (validation); otherwise pick it (tuning).
 */
export function analyse(def: LevelData, need: Needs, lesson: LessonCheck | null, useMoves = true): Analysis {
  const picked = pickMoves(def, need);
  const M = useMoves && def.moves ? def.moves : picked.M;
  const r: Record<string, number> = Object.fromEntries(Object.entries(need).map(([b, a]) => [b, rate(a, M)]));
  const left = need.K.filter((x) => x <= M).map((x) => M - x).sort((a, b) => a - b);
  const gentle = def.role === 'T' || def.ep === 1;
  let s2: number, s3: number;
  if (def.id === '1-01') { s2 = 0; s3 = 0; }
  else if (gentle) { s3 = Math.max(1, left.length ? pct(left, 0.5) : 1); s2 = Math.min(s3, Math.max(1, left.length ? pct(left, 0.2) : 1)); }
  else { s2 = Math.max(1, left.length ? pct(left, 0.5) : 1); s3 = Math.max(s2 + 1, left.length ? pct(left, 0.85) : 2); }
  const kStars = { 1: 0, 2: 0, 3: 0 };
  for (const x of left) kStars[x >= s3 ? 3 : x >= s2 ? 2 : 1] += 1;
  const medK = pct(need.K.slice().sort((a, b) => a - b), 0.5);
  const flags: string[] = [];
  const [lo, hi] = bandOf(def);
  const hb = def.role === 'H' || def.role === 'B';
  if (r.K < lo - 1e-9 || r.K > hi + 1e-9) flags.push(`K ${r.K.toFixed(2)} outside [${lo},${hi}]`);
  if (r.L !== undefined && r.L < 0.70) flags.push(`L ${r.L.toFixed(2)} < 0.70 (too close to impossible)`);
  if (r.G !== undefined && r.G + 0.05 < r.K && !def.objectives.some((o) => 'energy' in o)) flags.push('G < K (heuristic broken?)');
  if (M <= MIN_M && def.role !== 'T') flags.push('moves at floor');
  if (M >= MAX_M) flags.push('moves at ceiling');
  if (lesson && !lesson.ok) flags.push(`lesson FAILED (${lesson.made.join(',')})`);
  if (hb && r.KH !== undefined && r.KH > hi + 0.10 + 1e-9) flags.push(`KH ${r.KH.toFixed(2)} > band hi + 0.10`);
  if (r.Kho !== undefined && (r.Kho < lo - 0.05 - 1e-9 || r.Kho > hi + 0.05 + 1e-9)) flags.push(`held-out K ${r.Kho.toFixed(2)} outside band ±0.05`);
  if (hb && r.R !== undefined && r.R > (def.ep === 1 ? 0.10 : 0.05) + 1e-9) flags.push(`R ${r.R.toFixed(2)} too high for ${def.role}`);
  const lk = def.role === 'B' && def.ep === 1 ? 0.15 : 0.25; // the ep-1 boss band is deliberately gentler (D7)
  if (hb && r.L !== undefined && r.L - r.K < lk - 1e-9) flags.push(`L-K ${(r.L - r.K).toFixed(2)} < ${lk}`);
  if (def.role === 'T' && left.length && kStars[3] / left.length < 0.5 - 1e-9) flags.push(`T 3★ share ${(kStars[3] / left.length).toFixed(2)} < 0.5`);
  const fKey = def.feature ? `K:${def.feature}` : null;
  if (fKey && r[fKey] !== undefined && r[fKey] < r.K + 0.05 - 1e-9) flags.push(`V14 feature ${def.feature}: ${r[fKey].toFixed(2)} < K+0.05 (teach claim not supported)`);
  if (useMoves && def.moves && Math.abs(picked.M - def.moves) > 1) flags.push(`retune picks ${picked.M} moves (≠ ${def.moves} ± 1)`);
  return { M, r, s2, s3, kStars, medK, flags, nK: left.length, fKey, retune: picked.M };
}

/** the `sim` evidence block in levels.json (2-decimal rates, like the prototype; not used at runtime) */
export interface SimBlock { K: number; G: number; R: number; L: number; KH: number; Kho: number; medK: number; kStars: [number, number, number]; KF?: number }
export function simBlock(a: Analysis): SimBlock {
  const f = (x: number) => +x.toFixed(2);
  const out: SimBlock = { K: f(a.r.K), G: f(a.r.G), R: f(a.r.R), L: f(a.r.L), KH: f(a.r.KH), Kho: f(a.r.Kho), medK: a.medK, kStars: [a.kStars[1], a.kStars[2], a.kStars[3]] };
  if (a.fKey && a.r[a.fKey] !== undefined) out.KF = f(a.r[a.fKey]);
  return out;
}

/** fast tier (V4f, `npm run check`): K within band ± 0.12, L ≥ 0.60 on H/B levels */
export const FAST = { K: 60, L: 20, tolK: 0.12, minL: 0.60 } as const;
