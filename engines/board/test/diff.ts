// test/diff.ts — 差分测试：把本引擎的 GameRules 与一份**独立实现**（oracle）逐局面比较合法着法集合与将军状态。
// 随机对局（偏向吃子，让局面拥挤 / 残局化）+ 额外局面列表（谜题 / 课程局面）；任何不一致都记录首例。
// 象棋用 @weshell/xiangqi.js（BSD-2）当 oracle（见 diff.test.ts）；国象没有独立库，改用旧原型对拍 + perft（见 conformance C11）。
import { createRng, hash32 } from '../core/rng';
import type { GameRules } from '../core/types';

/** 独立实现的一局：与被测规则同步走子。着法串用被测规则的 encode 格式（oracle 负责自己的坐标转换）。 */
export interface OracleGame { legalMoves(): string[]; inCheck(): boolean; play(enc: string): void }
export interface DiffOptions { /** 随机对局起点（缺省 = rules.initial 的 FEN） */ starts?: readonly string[]; games: number; maxPly: number; seed?: number; /** 有吃子时偏向吃子的概率（缺省 .35） */ captureBias?: number; /** 额外只比较一次的局面 */ extra?: readonly string[] }
export interface DiffReport { positions: number; mismatches: number; checks: number; terminals: number; first: { fen: string; what: 'moves' | 'check'; onlyMine?: string[]; onlyOracle?: string[]; mine?: boolean; oracle?: boolean } | null }

export function diffAgainst<M, S>(rules: GameRules<M, S>, make: (fen: string) => OracleGame, o: DiffOptions): DiffReport {
  const rep: DiffReport = { positions: 0, mismatches: 0, checks: 0, terminals: 0, first: null }; const rng = createRng(hash32(o.seed ?? 20261013, 7)); const starts = o.starts?.length ? o.starts : [rules.toFen(rules.initial())];
  const compare = (s: S, ora: OracleGame): boolean => {
    rep.positions++; const mine = rules.legalMoves(s).map((m) => rules.encode(m)).sort(); const theirs = [...ora.legalMoves()].sort();
    if (JSON.stringify(mine) !== JSON.stringify(theirs)) { rep.mismatches++; rep.first ??= { fen: rules.toFen(s), what: 'moves', onlyMine: mine.filter((x) => !theirs.includes(x)), onlyOracle: theirs.filter((x) => !mine.includes(x)) }; return false; }
    const c = !!rules.check(s); if (c !== ora.inCheck()) { rep.mismatches++; rep.first ??= { fen: rules.toFen(s), what: 'check', mine: c, oracle: ora.inCheck() }; return false; } if (c) rep.checks++; return true;
  };
  for (let g = 0; g < o.games; g++) {
    const fen = starts[g % starts.length]; let s = rules.fromFen(fen); const ora = make(fen);
    for (let ply = 0; ply < o.maxPly; ply++) {
      if (!compare(s, ora)) break; const L = rules.legalMoves(s); if (!L.length) { rep.terminals++; break; }
      const caps = L.filter((m) => rules.moveInfo(s, m).capture); const m = caps.length && rng.next() < (o.captureBias ?? 0.35) ? caps[Math.floor(rng.next() * caps.length)] : L[Math.floor(rng.next() * L.length)];
      ora.play(rules.encode(m)); s = rules.apply(s, m);
    }
  }
  for (const fen of o.extra ?? []) compare(rules.fromFen(fen), make(fen));
  return rep;
}
