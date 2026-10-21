/**
 * Shared child-noise model for the number line (spec §3.8.1; V4 and V6(g) use THIS one). An ASSUMED model, not evidence:
 * a child has a blank-line precision σ (SD of the estimate error as a fraction of L, PAE ≈ 0.8σ), better near labelled anchors:
 *   sd(target) = σ·L·g(dAnchor/L),   g(x) = clamp(G0 + GS·x, G0, 1).
 * Targets come from the REAL production sampler (families/nl.ts planTargets); tolerances from the real tuning table.
 */
import { createRng, type Rng } from '@kit/rng';
import { NOISE } from '../../src/app/tuning';
import { anchorModeOf, nearestAnchorDist, planTargets, tolPct } from '../../src/families/nl';
import { NODE_BY_ID } from '../../src/app/content';

export const g = (x: number): number => Math.min(1, Math.max(NOISE.G0, NOISE.G0 + NOISE.GS * x));
export const sdOf = (sigma: number, target: number, L: number, anchors: string | undefined): number => sigma * L * g(nearestAnchorDist(target, L, anchors) / L);
const erf = (x: number): number => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; };
/** P(|round(error)| ≤ the exact band) for a Gaussian error of SD `sd`; the judge accepts |e| < tol + 0.5. */
export const pWithin = (sd: number, tol: number): number => (sd <= 0 ? 1 : erf((tol + 0.5) / (sd * Math.SQRT2)));
/** Learner ability → σ (θ .82 → 3 %, .72 → 4.6 %, .58 → 6.8 %, .45 → 8.9 %; floor 2 %). */
export const sigmaOf = (theta: number): number => Math.max(0.02, 0.03 + (0.82 - theta) * 0.16);

export interface NlNodeCfg { id: string; L: number; anchors: string; near?: { min: number; max: number }; n: number; strat: boolean; read: boolean; zoom: boolean }
/** The number-line nodes of the orbit zone, read from the real node data (first nl.place / nl.read / nl.zoom entry decides the config). */
export function nlNodes(): NlNodeCfg[] {
  const out: NlNodeCfg[] = [];
  for (const id of ['orbit.O1.1', 'orbit.O1.2', 'orbit.O1.3', 'orbit.O2.1', 'orbit.O2.2', 'orbit.O2.3', 'orbit.O2.4', 'orbit.O2.5']) {
    const n = NODE_BY_ID[id]; const e = n.items[0];
    out.push({ id, L: e.fam === 'nl.zoom' ? 100 : (e.L ?? 100), anchors: e.fam === 'nl.zoom' ? 'every10' : (e.anchors ?? 'every10'), near: e.fam === 'nl.zoom' ? { min: 3, max: 5 } : e.near, n: 6, strat: !!n.strat100_300, read: e.fam === 'nl.read', zoom: e.fam === 'nl.zoom' });
  }
  return out;
}
/** First-try probability of one node at ladder level `level` for a child of precision σ (Monte Carlo over the real target sampler). */
export function nodeFirstTry(sigma: number, cfg: NlNodeCfg, level: number, N = 400, seed = 77): number {
  const r: Rng = createRng(`nlft:${seed}:${cfg.id}`); let s = 0;
  const mode = anchorModeOf(cfg.anchors);
  for (let k = 0; k < N; k++) {
    const targets = planTargets(r, { L: cfg.L, anchors: cfg.anchors, n: cfg.n, near: cfg.near, strat100_300: cfg.strat });
    const tol = (tolPct(mode, level) / 100) * cfg.L; const zf = cfg.zoom ? 0.97 * 0.97 : 1;
    s += zf * targets.reduce((a, t) => a + pWithin(sdOf(sigma, t, cfg.L, cfg.anchors), tol), 0) / targets.length;
  }
  return s / N;
}
export const GATE = {
  entry: { level: 3, s6: [0.7, 0.9] as const, s9min: 0.5 },
  top: { level: 6, s3max: 0.95, s6min: 0.5, s9min: 0.3 },
  floor: { level: 1, s12min: 0.6 },
};
