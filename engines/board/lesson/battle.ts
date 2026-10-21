// lesson/battle.ts — 小战场（B1–B3）：红方有若干子，黑卒从上方出发；每回合红走一步后黑卒全部前进一格；
// 卒到红方底线红败，吃光红胜（xiangqi.md §3.8）。只用 GameRules 的合法着法 + FEN 编辑，卒走子用真着法（所以能动画、能吃子）。
import type { GameRules, Sq } from '../core/types';
import { fenAt, fenFind, parseName, type GridShape } from './fen';
import { forceSide } from './solo';

export interface BattleCfg { readonly pawn: string; readonly king: string }
export const BATTLE_DEFAULT: BattleCfg = { pawn: 'p', king: 'K' };
const shapeOf = <M, S>(rules: GameRules<M, S>): GridShape => ({ rows: rules.geometry.rows, cols: rules.geometry.cols });
export const pawnNames = <M, S>(rules: GameRules<M, S>, fen: string, cfg: BattleCfg = BATTLE_DEFAULT): string[] => fenFind(fen, shapeOf(rules), cfg.pawn).sort((a, b) => parseName(a).rank - parseName(b).rank || a.localeCompare(b));
export interface PawnStep<M, S> { m: M; before: S; from: Sq; to: Sq; reachedBottom: boolean }
/** 黑卒全部前进一格（最靠近红方底线的先走，所以前面的让出位置后后面的能跟上；被己卒或红帅挡住的原地不动；走到红子上就是吃掉它） */
export function advancePawns<M, S>(rules: GameRules<M, S>, s: S, cfg: BattleCfg = BATTLE_DEFAULT): { s: S; steps: PawnStep<M, S>[]; lost: boolean } {
  const shape = shapeOf(rules); const names = new Map<string, Sq>(); for (let q = 0; q < rules.geometry.squares; q++) names.set(rules.geometry.name(q), q);
  let cur = forceSide(rules, s, 1); const steps: PawnStep<M, S>[] = []; let lost = false;
  for (const from of pawnNames(rules, rules.toFen(cur), cfg)) {
    const { file, rank } = parseName(from); if (rank <= 1) continue; const dest = String.fromCharCode(97 + file) + (rank - 1); const fromSq = names.get(from), toSq = names.get(dest); if (fromSq === undefined || toSq === undefined) continue;
    if (fenAt(rules.toFen(cur), shape, dest) === cfg.king) continue;
    const m = rules.legalFrom(cur, fromSq).find((mm) => rules.moveInfo(cur, mm).to === toSq); if (m === undefined) continue;
    const reachedBottom = rank - 1 === 1; steps.push({ m, before: cur, from: fromSq, to: toSq, reachedBottom }); cur = forceSide(rules, rules.apply(cur, m), 1); if (reachedBottom) lost = true;
  }
  return { s: forceSide(rules, cur, 0), steps, lost };
}
export const pawnsLeft = <M, S>(rules: GameRules<M, S>, s: S, cfg: BattleCfg = BATTLE_DEFAULT): number => pawnNames(rules, rules.toFen(s), cfg).length;
/** 红方按给定着法串（红着法编码）走完，每步后卒前进；返回结局与红走了几步。测试 / 校验用。 */
export function playBattle<M, S>(rules: GameRules<M, S>, fen: string, redMoves: readonly string[], cfg: BattleCfg = BATTLE_DEFAULT): { win: boolean; lost: boolean; moves: number } {
  let s = forceSide(rules, rules.fromFen(fen), 0); let moves = 0;
  for (const enc of redMoves) { const m = rules.decode(s, enc); if (m === null) throw new Error(`illegal:${enc}`); moves++; s = forceSide(rules, rules.apply(s, m), 0); if (pawnsLeft(rules, s, cfg) === 0) return { win: true, lost: false, moves }; const a = advancePawns(rules, s, cfg); s = a.s; if (a.lost) return { win: false, lost: true, moves }; }
  return { win: pawnsLeft(rules, s, cfg) === 0, lost: false, moves };
}
/** 广度优先求红方最快取胜着数（不超过 maxMoves）；用 FEN 去重。返回 { par, path } 或 null。校验器 / 测试用（比运行时重，别在主线程大深度调用）。 */
export function solveBattle<M, S>(rules: GameRules<M, S>, fen: string, maxMoves: number, cfg: BattleCfg = BATTLE_DEFAULT, cap = 400000): { par: number; path: string[] } | null {
  let frontier: { s: S; path: string[] }[] = [{ s: forceSide(rules, rules.fromFen(fen), 0), path: [] }]; const seen = new Set<string>([rules.toFen(frontier[0].s)]);
  for (let d = 1; d <= maxMoves; d++) {
    const next: { s: S; path: string[] }[] = [];
    for (const f of frontier) {
      const ms = rules.legalMoves(f.s); // 先试吃子，早点找到解
      for (const m of ms) {
        const s2 = forceSide(rules, rules.apply(f.s, m), 0); const path = [...f.path, rules.encode(m)]; if (pawnsLeft(rules, s2, cfg) === 0) return { par: d, path };
        const a = advancePawns(rules, s2, cfg); if (a.lost) continue; if (pawnsLeft(rules, a.s, cfg) > maxMoves - d) continue;      // 红每步最多吃一个卒：剩余步数不够吃光就剪掉
        const k = rules.toFen(a.s); if (seen.has(k)) continue; seen.add(k); if (seen.size > cap) return null; next.push({ s: a.s, path });
      }
    }
    frontier = next; if (!frontier.length) return null;
  }
  return null;
}
