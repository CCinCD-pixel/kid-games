// lesson/solo.ts — "只有红方动"的课局面：黑子静止，红方连续走（走子方每步被拨回红方）。stars / capture / sweep 共用。
// 含 BFS 求解器：par = 最少着数（与 lessons.mjs 的 bfs 同语义：movers 里的红子可走；stars = hero 依次落到全部星；targets = 黑子全被吃；avoid = hero 落点不被黑方攻击）。
// 运行时还拿它现算提示（从当前局面出发的最短路径第一步）。
import type { GameRules, Side, Sq } from '../core/types';
import { withSide } from './fen';

export const forceSide = <M, S>(rules: GameRules<M, S>, s: S, side: Side): S => (rules.turn(s) === side ? s : rules.fromFen(withSide(rules.toFen(s), side === 0 ? 'w' : 'b')));
/** by 方是否攻击 sq（有 attackersOf 用它；否则把走子方拨给 by 看是否有吃 sq 的合法着法——被将军时可能少算，游戏想要精确就实现 attackersOf） */
export function attackedBy<M, S>(rules: GameRules<M, S>, s: S, sq: Sq, by: Side): boolean {
  if (rules.attackersOf) return rules.attackersOf(s, sq, by).length > 0;
  const t = forceSide(rules, s, by); return rules.legalMoves(t).some((m) => rules.moveInfo(t, m).capture?.sq === sq);
}
/** by 方吃 sq 的着法里"最便宜的攻击者"那一条（幽灵回吃用）；没有 → null */
export function cheapestCapture<M, S>(rules: GameRules<M, S>, s: S, sq: Sq, by: Side): { m: M; before: S } | null {
  const t = forceSide(rules, s, by); let best: { m: M; v: number } | null = null;
  for (const m of rules.legalMoves(t)) { const i = rules.moveInfo(t, m); if (i.capture?.sq !== sq) continue; const v = rules.value(t, i.from); if (!best || v < best.v) best = { m, v }; }
  return best ? { m: best.m, before: t } : null;
}

export interface SoloGoal { readonly hero: Sq; readonly movers: readonly Sq[]; readonly stars: readonly Sq[]; readonly targets: readonly Sq[]; readonly avoid: boolean }
export interface SoloNode<S> { readonly s: S; readonly hero: Sq; readonly got: number; readonly movers: readonly Sq[] }
export const soloStart = <M, S>(rules: GameRules<M, S>, s: S, goal: SoloGoal): SoloNode<S> => ({ s: forceSide(rules, s, 0), hero: goal.hero, got: 0, movers: [...goal.movers] });
export const soloMoves = <M, S>(rules: GameRules<M, S>, n: SoloNode<S>): M[] => rules.legalMoves(n.s).filter((m) => n.movers.includes(rules.moveInfo(n.s, m).from));
export function soloDone<M, S>(rules: GameRules<M, S>, goal: SoloGoal, n: SoloNode<S>): boolean {
  if (goal.stars.length && n.got === (1 << goal.stars.length) - 1) return true;
  return goal.targets.length > 0 && goal.targets.every((t) => { const p = rules.pieceAt(n.s, t); return !p || p.side === 0; });
}
export interface SoloStep<S> extends SoloNode<S> { /** hero 刚落在黑方攻击得到的格子上 */ unsafe: boolean; /** 这一手让 hero 落在了新的星上 */ gotStar: Sq | null }
export function soloNext<M, S>(rules: GameRules<M, S>, goal: SoloGoal, n: SoloNode<S>, m: M): SoloStep<S> {
  const info = rules.moveInfo(n.s, m); const s2 = forceSide(rules, rules.apply(n.s, m), 0); const isHero = info.from === n.hero; let got = n.got; let gotStar: Sq | null = null;
  if (isHero) { const si = goal.stars.indexOf(info.to); if (si >= 0 && !(got & (1 << si))) { got |= 1 << si; gotStar = info.to; } }
  return { s: s2, hero: isHero ? info.to : n.hero, got, movers: n.movers.map((x) => (x === info.from ? info.to : x)), unsafe: isHero && goal.avoid && attackedBy(rules, s2, info.to, 1), gotStar };
}
const keyOf = <M, S>(rules: GameRules<M, S>, n: SoloNode<S>): string => `${rules.toFen(n.s)}|${n.hero}|${n.got}|${[...n.movers].sort((a, b) => a - b).join(',')}`;
/** 广度优先：从 n 出发的最少着数与一条最短路径；avoid 目标下 hero 不走危险格。找不到（深度 / 状态数用尽）→ null。 */
export function solve<M, S>(rules: GameRules<M, S>, goal: SoloGoal, from: SoloNode<S>, o: { maxDepth?: number; maxStates?: number; /** 状态数撞上限时置 capped（此时 null 不代表无解） */ stats?: { capped: boolean } } = {}): { par: number; path: M[] } | null {
  const maxDepth = o.maxDepth ?? 8, cap = o.maxStates ?? 150000;
  if (soloDone(rules, goal, from)) return { par: 0, path: [] };
  let frontier: { n: SoloNode<S>; path: M[] }[] = [{ n: from, path: [] }]; const seen = new Set<string>([keyOf(rules, from)]);
  for (let d = 1; d <= maxDepth; d++) {
    const next: { n: SoloNode<S>; path: M[] }[] = [];
    for (const f of frontier) for (const m of soloMoves(rules, f.n)) {
      const nx = soloNext(rules, goal, f.n, m); if (nx.unsafe) continue; const path = [...f.path, m];
      if (soloDone(rules, goal, nx)) return { par: d, path };
      const k = keyOf(rules, nx); if (seen.has(k)) continue; seen.add(k); if (seen.size > cap) { if (o.stats) o.stats.capped = true; return null; } next.push({ n: nx, path });
    }
    frontier = next; if (!frontier.length) return null;
  }
  return null;
}
