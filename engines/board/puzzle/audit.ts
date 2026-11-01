// puzzle/audit.ts — 偷懒策略审计（v1.1）：先把候选限制为将军着法，再套 价值最高 / 离将最近 / 同类唯一 / 同线 / 吃子 五种排序；只统计"策略唯一选中正解"。
// 每种命中 ≤15 %；档 2–3 要求 ≥2 个诱饵将军（validate.ts）。顺序回退组合 = 按顺序第一个给出唯一选择的策略是否选中正解。
import type { GameRules } from '../core/types';

export const STRATS = ['maxValueCheck', 'nearestCheck', 'uniqueTypeCheck', 'kingLineCheck', 'captureCheck'] as const;
export type Strat = (typeof STRATS)[number];
export interface LazyHit { hits: Strat[]; seq: boolean; picks: Record<Strat, string | null> }

export function lazyHits<M, S>(rules: GameRules<M, S>, fen: string, solution: string): LazyHit {
  const s = rules.fromFen(fen); const g = rules.geometry; const kt = rules.meta.kingType; const me = rules.turn(s);
  const checks = rules.legalMoves(s).filter((m) => !!rules.check(rules.apply(s, m)));
  let ksq = -1; for (let q = 0; q < g.squares; q++) { const p = rules.pieceAt(s, q); if (p && p.type === kt && p.side !== me) ksq = q; }
  const kc = ksq >= 0 ? g.center(ksq, 'first-bottom') : { x: 0, y: 0 }; const U = g.unit; const info = (m: M) => rules.moveInfo(s, m);
  const val = (m: M): number => rules.value(s, info(m).from); const typ = (m: M): number => info(m).piece.type;
  const dist = (m: M): number => { const c = g.center(info(m).to, 'first-bottom'); return Math.abs(c.x - kc.x) / U + Math.abs(c.y - kc.y) / U; };
  const uniq = (arr: M[]): string | null => (arr.length === 1 ? rules.encode(arr[0]) : null);
  const picks = {} as Record<Strat, string | null>;
  if (checks.length) {
    const mx = Math.max(...checks.map(val)); picks.maxValueCheck = uniq(checks.filter((m) => val(m) === mx));
    const mn = Math.min(...checks.map(dist)); picks.nearestCheck = uniq(checks.filter((m) => Math.abs(dist(m) - mn) < 1e-9));
    const cnt = new Map<number, number>(); for (const m of checks) cnt.set(typ(m), (cnt.get(typ(m)) ?? 0) + 1); picks.uniqueTypeCheck = uniq(checks.filter((m) => cnt.get(typ(m)) === 1));
    picks.kingLineCheck = uniq(checks.filter((m) => { const c = g.center(info(m).to, 'first-bottom'); return Math.abs(c.x - kc.x) < 1 || Math.abs(c.y - kc.y) < 1; }));
    picks.captureCheck = uniq(checks.filter((m) => !!info(m).capture));
  } else for (const k of STRATS) picks[k] = null;
  const hits = STRATS.filter((k) => picks[k] === solution); let first: string | null = null; for (const k of STRATS) if (picks[k] !== null && picks[k] !== undefined) { first = picks[k]; break; }
  return { hits: [...hits], seq: first === solution, picks };
}
export interface AuditReport { n: number; perStrat: Record<Strat, number>; any: number; seq: number; worst: number; ok: boolean; offenders: string[] }
/** 审计一组谜题：每种策略命中率（0–1）、任一命中率、顺序组合命中率；limit 默认 0.15（单种）。 */
export function shortcutAudit<M, S>(rules: GameRules<M, S>, puzzles: readonly { id: string; fen: string; answer: string }[], limit = 0.15): AuditReport {
  const per = Object.fromEntries(STRATS.map((k) => [k, 0])) as Record<Strat, number>; let any = 0, seq = 0; const offenders: string[] = [];
  for (const p of puzzles) { const r = lazyHits(rules, p.fen, p.answer); for (const h of r.hits) per[h]++; if (r.hits.length) { any++; offenders.push(p.id); } if (r.seq) seq++; }
  const n = Math.max(1, puzzles.length); const rate = Object.fromEntries(STRATS.map((k) => [k, per[k] / n])) as Record<Strat, number>; const worst = Math.max(...Object.values(rate), seq / n);
  return { n: puzzles.length, perStrat: rate, any: any / n, seq: seq / n, worst, ok: worst <= limit, offenders };
}
