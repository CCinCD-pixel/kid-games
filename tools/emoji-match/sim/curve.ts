/**
 * V5 curve shape + endurance model + constellation gates (spec §0A.4, §4.3, §9.2 V5; port of the
 * prototype report.mjs). Reads the tuned `sim` evidence in levels.json — pure, shared by the vitest
 * validator (validate/curve.test.ts) and the simulator report (tools/emoji-match/sim/tune.ts).
 */
import type { Episode, LevelData } from '../../../site/emoji-match/src/content';
import { bandOf } from './difficulty';

export interface Sim { K: number; G: number; R: number; L: number; KH: number; Kho: number; medK: number; kStars: [number, number, number] }
const simOf = (d: LevelData): Sim => d.sim as unknown as Sim;

/** endurance model (v1.1, D25): 8 s per move, +40 s per attempt, sessions of 12 min × 3 per week */
export const SEC_PER_MOVE = 8, SEC_PER_ATTEMPT = 40, SESSION_MIN = 12, PER_WEEK = 3;
/** v1 constellation gates (spec §4.7) */
export const GATES = [15, 30, 45, 60, 75];

/** expected attempts until the first win with the visible assist ladder (+15 pp after 2 fails, +10 more after 4) */
export function expectedAttempts(K: number): number {
  let att = 0, alive = 1;
  for (let k = 0; k < 12; k += 1) { const pk = Math.min(0.98, K + (k >= 2 ? 0.15 : 0) + (k >= 4 ? 0.10 : 0)); att += alive; alive *= 1 - pk; }
  return att;
}

export interface CurveReport {
  errs: string[];
  curve: string[];
  perEp: Record<number, { min: number; att: number; stars: number; avgK: number }>;
  totalMin: number; totalAttempts: number; expectedStars: number; maxDrop: number; maxDropAt: string;
  puzzleMin: number;
}

export function curveReport(episodes: Episode[], levels: LevelData[], puzzles = 4): CurveReport {
  const errs: string[] = [];
  const curve: string[] = [];
  const perEp: CurveReport['perEp'] = {};
  let totalMin = 0, totalAttempts = 0, e1 = 0;
  for (const d of levels) {
    const s = simOf(d);
    const att = expectedAttempts(s.K);
    const min = att * ((Math.min(d.moves, s.medK) * SEC_PER_MOVE + SEC_PER_ATTEMPT) / 60);
    totalAttempts += att; totalMin += min;
    const [s1, s2, s3] = s.kStars; const nW = s1 + s2 + s3;
    const es = nW ? (s1 + 2 * s2 + 3 * s3) / nW : 1;
    e1 += es;
    (perEp[d.ep] ??= { min: 0, att: 0, stars: 0, avgK: 0 });
    perEp[d.ep].min += min; perEp[d.ep].att += att; perEp[d.ep].stars += es;
  }
  let prevAvg: number | null = null;
  for (const ep of episodes) {
    const lv = levels.filter((d) => d.ep === ep.ep);
    const avg = lv.reduce((a, d) => a + simOf(d).K, 0) / lv.length;
    if (perEp[ep.ep]) perEp[ep.ep].avgK = avg;
    curve.push(`E${ep.ep} ${ep.name.padEnd(8, '　')} ${lv.map((d) => `${d.role}${Math.round(simOf(d).K * 100)}`).join(' ')}   平均K ${avg.toFixed(2)}  步数 ${lv.map((d) => d.moves).join('/')}`);
    const Hs = lv.filter((d) => d.role === 'H').map((d) => simOf(d).K);
    lv.forEach((d, k) => {
      const s = simOf(d);
      const [lo, hi] = bandOf(d);
      if (s.K < lo - 1e-9 || s.K > hi + 1e-9) errs.push(`${d.id}: K ${s.K} outside band`);
      if (d.role === 'T' && s.K < 0.95) errs.push(`${d.id}: T level K < 0.95`);
      if (d.role === 'R' && s.K < 0.88) errs.push(`${d.id}: R level K < 0.88`);
      if (d.role === 'R' && k > 0 && lv[k - 1].role === 'H' && s.K < simOf(lv[k - 1]).K + 0.30) errs.push(`${d.id}: R not >= previous H + 0.30`);
      if (d.role === 'B' && Hs.length && s.K > Math.min(...Hs) + 0.03) errs.push(`${d.id}: boss easier than the episode's H levels`);
      if (d.moves < 9 || d.moves > 29) errs.push(`${d.id}: moves ${d.moves} outside 9..29`);
      if (s.L < 0.70) errs.push(`${d.id}: L < 0.70`);
      if (d.role === 'T') { const [a, b, c] = s.kStars; if (c / (a + b + c) < 0.5) errs.push(`${d.id}: T 3★ share < 0.5`); }
      if (d.role === 'H' || d.role === 'B') {
        if (s.L - s.K < (d.role === 'B' && d.ep === 1 ? 0.15 : 0.25) - 1e-9) errs.push(`${d.id}: L-K too small`);
        if (s.R > (d.ep === 1 ? 0.10 : 0.05) + 1e-9) errs.push(`${d.id}: R too high`);
        if (s.KH > hi + 0.10 + 1e-9) errs.push(`${d.id}: KH > band hi + 0.10`);
      }
      if (s.Kho < lo - 0.05 - 1e-9 || s.Kho > hi + 0.05 + 1e-9) errs.push(`${d.id}: held-out K ${s.Kho} outside band ±0.05`);
    });
    if (ep.ep >= 2 && prevAvg !== null && avg > prevAvg + 0.03) errs.push(`ep${ep.ep}: average K rises by more than 0.03`);
    if (ep.ep >= 2) prevAvg = avg;
  }
  let maxDrop = 0, maxDropAt = '';
  for (let k = 1; k < levels.length; k += 1) {
    const drop = simOf(levels[k - 1]).K - simOf(levels[k]).K;
    if (drop > 0.30 + 1e-9) errs.push(`${levels[k - 1].id}→${levels[k].id}: K drop ${drop.toFixed(2)} > 0.30`);
    if (drop > maxDrop) { maxDrop = drop; maxDropAt = `${levels[k - 1].id}→${levels[k].id}`; }
  }
  const last = GATES[GATES.length - 1];
  if (last > 1.1 * e1) errs.push(`constellation gate ${last} > 1.1 × expected first-pass stars ${e1.toFixed(0)}`);
  return { errs, curve, perEp, totalMin, totalAttempts, expectedStars: e1, maxDrop, maxDropAt, puzzleMin: puzzles * 4 };
}

/** the §0A.4 endurance table as markdown lines */
export function enduranceTable(episodes: Episode[], rep: CurveReport, nLevels: number): string[] {
  const out = ['| 内容 | 首通尝试 | 分钟（模型） | 1.5 倍（保守） | 首通期望星 |', '|---|---|---|---|---|'];
  for (const ep of episodes) { const x = rep.perEp[ep.ep]; if (x) out.push(`| 第 ${ep.ep} 站 ${ep.name} | ${x.att.toFixed(1)} | ${x.min.toFixed(0)} | ${(x.min * 1.5).toFixed(0)} | ${x.stars.toFixed(1)} |`); }
  out.push(`| 星图谜题 ×${rep.puzzleMin / 4} | — | ${rep.puzzleMin} | ${rep.puzzleMin * 1.5} | — |`);
  const total = rep.totalMin + rep.puzzleMin, wk = SESSION_MIN * PER_WEEK;
  out.push(`| **主线 + 谜题** | **${rep.totalAttempts.toFixed(0)}** | **${total.toFixed(0)}（${(total / wk).toFixed(1)} 周）** | **${(total * 1.5).toFixed(0)}（${((total * 1.5) / wk).toFixed(1)} 周）** | **${rep.expectedStars.toFixed(0)} / ${nLevels * 3}** |`);
  return out;
}
