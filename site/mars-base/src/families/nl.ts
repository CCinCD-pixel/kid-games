/** 轨道站 number-line families + target sampler + calibration scoring (spec §3.8.1). The control itself lives in engines/manip. */
import type { Rng } from '@kit/rng';
import type { FamilyImpl, GenCtx } from '../app/types';
import { CALIB_RULE, NL_TOL, type AnchorMode } from '../app/tuning';
import planets from '../../../../content/mars-base/planets.json';

export const CALIBRATION_TARGETS = {
  100: [[3, 7, 12, 18, 25, 33, 42, 51, 64, 71, 86, 93], [5, 9, 15, 22, 28, 38, 47, 57, 67, 74, 83, 96]],
  1000: [[6, 18, 34, 78, 122, 163, 246, 366, 486, 606, 754, 938]],
} as const;
export const PLANETS = planets.planets as unknown as { id: string; name: string; dist: number; verified: boolean | string; signed?: boolean }[];

/** 'every100' labels every L/10 exactly like 'every10' (10 equal parts). */
export const anchorModeOf = (a: string | undefined): AnchorMode => (a === 'half' ? 'half' : a === 'ends' ? 'ends' : 'every10');
export const anchorLabels = (L: number, a: string | undefined): number[] => {
  const m = anchorModeOf(a);
  return m === 'every10' ? Array.from({ length: 11 }, (_, i) => (i * L) / 10) : m === 'half' ? [0, L / 2, L] : [0, L];
};
/** Tolerance in % of L at a ladder level (1..6). */
export const tolPct = (mode: AnchorMode, level: number): number => NL_TOL[mode][Math.max(1, Math.min(6, level)) - 1];
export const tolUnits = (mode: AnchorMode, level: number, L: number): number => (tolPct(mode, level) / 100) * L;
/** Distance (units) from t to the nearest labelled anchor. */
export const nearestAnchorDist = (t: number, L: number, a: string | undefined): number => Math.min(...anchorLabels(L, a).map((x) => Math.abs(t - x)));

interface NlP { L: number; target: number; anchors: string; mode: AnchorMode; tol: number; planet?: string; tolPct: number }
function drawTarget(rng: Rng, c: GenCtx, L: number, anchors: string): number {
  if (c.force?.target !== undefined) return c.force.target;
  const near = c.knobs.near;
  const blk = L / 10;
  if (near) { const k = rng.int(0, 9); const d = rng.int(near.min, near.max); return Math.round(k * blk + (rng.chance(0.5) ? d : blk - d)); }
  for (let i = 0; i < 80; i++) {
    const t = rng.int(Math.round(0.04 * L), Math.round(0.96 * L));
    if (nearestAnchorDist(t, L, anchors) >= 0.04 * L) return t;
  }
  return Math.round(0.3 * L);
}
const mkPlace = (kind: 'place' | 'read'): FamilyImpl<NlP> => ({
  asks: ['planet'],
  gen(rng, c) {
    const L = c.knobs.L ?? (c.band === 1 ? 100 : 1000);
    const anchors = c.knobs.anchors ?? 'every10';
    const mode = anchorModeOf(anchors);
    let target = drawTarget(rng, c, L, anchors);
    let planet: string | undefined;
    if (kind === 'place' && c.ask === 'planet') {
      const pl = c.force?.planet ? PLANETS.find((x) => x.id === c.force!.planet)! : rng.pick(PLANETS.filter((x) => x.dist <= 1000));
      target = pl.dist; planet = pl.id;
    }
    const pct = tolPct(mode, c.level);
    const tol = c.knobs.tol ?? (pct / 100) * L;
    return { params: { L, target, anchors, mode, tol, tolPct: pct, ...(planet ? { planet } : {}) }, answer: target };
  },
  features: (p) => ({ size: p.target, carry: false, cross: false, zero: false }),
  bug: (p, cls) => {
    const b = cls === 'offByTen' ? p.target + (p.target > p.L / 2 ? -p.L / 10 : p.L / 10) : cls === 'logCompress' ? Math.round(p.L * Math.log(p.target + 1) / Math.log(p.L + 1)) : null;
    return b !== null && Math.abs(b - p.target) >= p.tol + 0.5 ? b : null;   // a "bug" inside the tolerance is not an error
  },
  prompt: (p) => (p.planet ? { big: planetName(p.planet) } : { big: kind === 'read' ? '旗在哪？' : `${p.target}` }),
});
export const planetName = (id: string): string => PLANETS.find((x) => x.id === id)?.name ?? id;

interface CalibP { L: number; target: number }
const calib: FamilyImpl<CalibP> = {
  gen(rng, c) {
    const L = c.knobs.L ?? 100;
    const set = (CALIBRATION_TARGETS as Record<number, readonly (readonly number[])[]>)[L];
    const target = c.force?.target ?? rng.pick(rng.pick(set));
    return { params: { L, target }, answer: target };
  },
  features: (p) => ({ size: p.target, carry: false, cross: false, zero: false }),
  prompt: (p) => ({ big: `${p.target}` }),
};

interface ZoomP { target: number; L: number }
const zoom: FamilyImpl<ZoomP> = {
  gen(rng, c) {
    const target = c.force?.target ?? rng.int(11, 989);
    return { params: { target, L: 1000 }, answer: target };
  },
  features: (p) => ({ size: p.target, carry: false, cross: false, zero: false }),
  prompt: (p) => ({ big: `${p.target}` }),
};

export const NL: Record<string, FamilyImpl<any>> = { 'nl.calib': calib, 'nl.place': mkPlace('place'), 'nl.read': mkPlace('read'), 'nl.zoom': zoom };

/**
 * Mission-level target planning for a number-line node (spec §3.8.1 靶点): ≥4 of 6 targets at distance `near` from the nearest
 * label when the node asks for it, the rest 1–2 units away, pairwise ≥ 8 %L apart; O2.1–O2.3: ≥ 2 of 6 in [100, 300]; planets by table.
 */
export function planTargets(rng: Rng, o: { L: number; anchors: string; n: number; near?: { min: number; max: number }; strat100_300?: boolean }): number[] {
  const { L, anchors, n, near, strat100_300 } = o;
  const blk = L / 10;
  const draw = (i: number): number => {
    if (near) {
      const k = rng.int(0, 9);
      const d = i < Math.ceil((n * 2) / 3) ? rng.int(near.min, near.max) : rng.int(1, Math.max(1, Math.round(near.min / 3)));
      return Math.round(k * blk + (rng.chance(0.5) ? d : blk - d));
    }
    for (let a = 0; a < 80; a++) {
      const t = rng.int(Math.round(0.04 * L), Math.round(0.96 * L));
      if (nearestAnchorDist(t, L, anchors) >= 0.04 * L) return t;
    }
    return Math.round(0.3 * L);
  };
  for (let attempt = 0; attempt < 600; attempt++) {
    const out = Array.from({ length: n }, (_, i) => draw(i));
    if (strat100_300 && n >= 4) {
      const inBand = out.filter((t) => t >= 100 && t <= 300).length;
      if (inBand < Math.ceil(n / 3)) { out[n - 1] = rng.int(100, 300); out[n - 2] = rng.int(100, 300); }
    }
    if (out.every((t, i) => out.every((u, j) => i === j || Math.abs(t - u) >= 0.08 * L))) return rng.shuffle(out);
  }
  return Array.from({ length: n }, () => rng.int(Math.round(0.05 * L), Math.round(0.95 * L)));
}

export interface CalibrationScore { r2: number; slope: number; pae: number; pass: boolean; degenerate: boolean }
/** Linear-fit scoring of a 12-flag calibration (spec §3.8.1). `degenerate` = the 12 estimates barely vary (SD < 10 %L): not a valid test. */
export function scoreCalibration(L: number, targets: readonly number[], estimates: readonly number[]): CalibrationScore {
  const n = targets.length;
  if (n !== 12 || estimates.length !== n) throw new Error('A calibration needs twelve flags');
  const mx = targets.reduce((a, b) => a + b, 0) / n; const my = estimates.reduce((a, b) => a + b, 0) / n;
  let xx = 0; let xy = 0; let yy = 0;
  for (let i = 0; i < n; i++) { const dx = targets[i] - mx; const dy = estimates[i] - my; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
  const slope = xy / xx; const r2 = yy === 0 ? 0 : (xy * xy) / (xx * yy);
  const pae = targets.reduce((s, t, i) => s + Math.abs(t - estimates[i]), 0) / n / L;
  const sd = Math.sqrt(yy / n) / L;
  const degenerate = sd < CALIB_RULE.DEGENERATE_SD;
  const paeCap = L === 100 ? CALIB_RULE.PAE_100 : CALIB_RULE.PAE_1000;
  return { r2, slope, pae, degenerate, pass: !degenerate && r2 >= CALIB_RULE.R2 && slope >= CALIB_RULE.SLOPE_LO && slope <= CALIB_RULE.SLOPE_HI && pae <= paeCap };
}
