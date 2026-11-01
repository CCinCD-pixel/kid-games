// test/calibrate.ts — 机器人天梯校准（只在 tools / tests 里 import，永远不进游戏包 / Worker 包）。
// 机器人对机器人：每步走真的 AiHandler（与 Worker 同一份代码路径：重建 Game → 失误模型 → 搜索），颜色轮换、开局前两步随机、认输 / 限着都走。
// 并行 = 分片：playMatch(…, shard) 只玩 i % count === ix 的局，各片结果用 mergeMatches 合并——要多核就开多个进程，
// 各跑一片（`XQ_SHARD=0/4 XQ_FULL=1 npx vitest run engines/board/test/calibrate`，≤6 片），而不是在测试里开 worker_threads（vitest 不能把 TS 交给原生 Worker）。
import { createAiHandler } from '../ai/handler';
import type { AiMoveResult, AiPluginExt } from '../ai/protocol';
import { createGame } from '../core/game';
import { createRng, hash32 } from '../core/rng';
import type { RobotLevel } from '../core/types';

export interface CalibrateOptions<M, S> { plugin: AiPluginExt<M, S>; startFen?: string; maxPly?: number; openingRandomPlies?: number; /** 缺省 maxMs = Infinity（节点预算决定强度，结果可复现） */ maxDepth?: number; resign?: boolean }
export interface GameResult { winner: 'a' | 'b' | null; reason: string; plies: number; aWasFirst: boolean; maxMs: number; ms: number }
/** 机器人 JSON（robots.v1.json 的一项）→ RobotLevel；easy = 套用"轻松档"覆盖 */
export function levelOf(r: Record<string, unknown>, easy = false): RobotLevel {
  const base = { ...r, ...(easy ? (r.easy as object | undefined) : {}) } as Record<string, number | string | object | undefined>;
  return { id: String(base.id), depth: Number(base.depth ?? 0), nodes: Number(base.nodes ?? 0), slip: Number(base.slip ?? 0), glanceMargin: base.glanceMargin as number | undefined, glanceTemp: Number(base.glanceTemp ?? 0), temp: Number(base.temp ?? 0), margin: Number(base.margin ?? 0), mateSight: Number(base.mateSight ?? 0), pcap: base.pcap as number | undefined, resign: base.resign as RobotLevel['resign'], coachCap: Number(base.coachCap ?? 0), look: {} };
}
export function playGame<M, S>(o: CalibrateOptions<M, S>, a: RobotLevel, b: RobotLevel, seed: number, aFirst: boolean): GameResult {
  const handler = createAiHandler(o.plugin); const rules = o.plugin.createRules(undefined); const startFen = o.startFen ?? rules.toFen(rules.initial()); const game = createGame(rules, startFen); const rng = createRng(hash32(seed, 11));
  const maxPly = o.maxPly ?? 300; let maxMs = 0, ms = 0;
  for (let ply = 0; ply < maxPly; ply++) {
    const st = game.status(); const mover = game.turn(); const isA = (mover === 0) === aFirst;
    if (st.over) return { winner: st.winner === null ? null : (st.winner === 0) === aFirst ? 'a' : 'b', reason: st.reason, plies: ply, aWasFirst: aFirst, maxMs, ms };
    const L = game.legalMoves(); if (!L.length) return { winner: null, reason: 'no-moves', plies: ply, aWasFirst: aFirst, maxMs, ms };
    let m;
    if (ply < (o.openingRandomPlies ?? 2)) m = L[Math.floor(rng.next() * L.length)];
    else {
      const t0 = performance.now(); const r = handler.handle({ op: 'move', startFen, moves: game.encoded(), level: isA ? a : b, gameSeed: seed, budget: { maxMs: Infinity, maxDepth: o.maxDepth ?? 8 } }) as AiMoveResult; const dt = performance.now() - t0; ms += dt; maxMs = Math.max(maxMs, dt);
      if (r.resign && o.resign !== false) return { winner: isA ? 'b' : 'a', reason: 'resign', plies: ply, aWasFirst: aFirst, maxMs, ms };
      m = r.move === null ? null : rules.decode(game.state(), r.move); if (m === null) return { winner: null, reason: 'no-move', plies: ply, aWasFirst: aFirst, maxMs, ms };
    }
    game.play(m);
  }
  return { winner: null, reason: 'maxply', plies: maxPly, aWasFirst: aFirst, maxMs, ms };
}
export interface MatchResult { n: number; aWins: number; bWins: number; draws: number; /** a 的得分率（胜 1、和 .5） */ score: number; strictWin: number; elo: number; maxMs: number; medianPlies: number; reasons: Record<string, number>; plies: number[] }
/** 玩 n 盘（颜色轮换）；shard = 只玩第 ix 片（i % count === ix） */
export function playMatch<M, S>(o: CalibrateOptions<M, S>, a: RobotLevel, b: RobotLevel, n: number, seed0 = 1, shard?: { ix: number; count: number }): MatchResult {
  const rs: GameResult[] = []; for (let i = 0; i < n; i++) { if (shard && i % shard.count !== shard.ix) continue; rs.push(playGame(o, a, b, hash32(seed0, i), i % 2 === 0)); } return summarize(rs);
}
export const eloOf = (score: number): number => { const p = Math.min(0.999, Math.max(0.001, score)); return Math.round(-400 * Math.log10(1 / p - 1)) + 0; };
function summarize(rs: readonly GameResult[]): MatchResult {
  const aWins = rs.filter((r) => r.winner === 'a').length, bWins = rs.filter((r) => r.winner === 'b').length, draws = rs.length - aWins - bWins; const n = Math.max(1, rs.length); const plies = rs.map((r) => r.plies).sort((x, y) => x - y); const reasons: Record<string, number> = {}; for (const r of rs) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const score = (aWins + draws / 2) / n; return { n: rs.length, aWins, bWins, draws, score, strictWin: aWins / n, elo: eloOf(score), maxMs: Math.max(0, ...rs.map((r) => r.maxMs)), medianPlies: plies[Math.floor(plies.length / 2)] ?? 0, reasons, plies };
}
export function mergeMatches(parts: readonly MatchResult[]): MatchResult {
  const reasons: Record<string, number> = {}; for (const p of parts) for (const [k, v] of Object.entries(p.reasons)) reasons[k] = (reasons[k] ?? 0) + v; const plies = parts.flatMap((p) => p.plies).sort((x, y) => x - y);
  const n = parts.reduce((s, p) => s + p.n, 0), aWins = parts.reduce((s, p) => s + p.aWins, 0), bWins = parts.reduce((s, p) => s + p.bWins, 0), draws = parts.reduce((s, p) => s + p.draws, 0); const score = (aWins + draws / 2) / Math.max(1, n);
  return { n, aWins, bWins, draws, score, strictWin: aWins / Math.max(1, n), elo: eloOf(score), maxMs: Math.max(0, ...parts.map((p) => p.maxMs)), medianPlies: plies[Math.floor(plies.length / 2)] ?? 0, reasons, plies };
}
/** 天梯门槛：R_k 对 R_{k-1} 的得分率落在区间内（xiangqi.md §4.3：[55,75] %）；返回每一级的判定 */
export function checkLadder(rows: readonly { k: number; score: number }[], range: readonly [number, number] = [0.55, 0.75]): { ok: boolean; rows: { k: number; score: number; inRange: boolean }[] } {
  const out = rows.map((r) => ({ ...r, inRange: r.score >= range[0] && r.score <= range[1] })); return { ok: out.every((r) => r.inRange), rows: out };
}
