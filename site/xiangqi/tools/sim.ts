// site/xiangqi/tools/sim.ts — 校验用的"孩子模型" + 对局驱动 + 教练模拟（只在 tests / tools 里 import，禁止进页面包）。
// 来源：xiangqi-tools/{bots,tour,coach-sim}.mjs。机器人走的是与 Worker 完全相同的 createAiHandler(xqPlugin())（种子 = hash32(gameSeed, ply, fenHash)）。
import { createAiHandler } from '@engines/board/ai/handler';
import type { AiMoveResult } from '@engines/board/ai/protocol';
import { createGame, type GameImpl } from '@engines/board/core/game';
import { createRng, hash32 } from '@engines/board/core/rng';
import { softmaxPick } from '@engines/board/core/errormodel';
import { Searcher } from '@engines/board/core/search';
import { mateIn1Moves, netCapture as seNet, threatAfter as seThreat, hasMateIn1 } from '@engines/board/core/see';
import type { Rng, RobotLevel } from '@engines/board/core/types';
import { BLACK, C, K, N, P, R, RED, START_FEN, colOf, handicapFen, pieceVal, rowOf, type HandicapKind } from '../src/rules/position';
import { xqPlugin } from '../src/rules/plugin';
import { createRules, evaluate, xqSearchAdapter, type XqCfg, type XqSearchPos } from '../src/rules/rules';
import { ROBOTS } from '../src/rules/robots';
import { easyOf } from '@engines/board/core/errormodel';

export type KidId = 'k0' | 'k1' | 'k2' | 'k3' | 'k15' | 'k4' | 'adult3';
interface KidSpec { /** 成年人对照：每步固定 N 层 + 静态搜索选最佳，从不白送一手回吃（审计「最强机关人像不像真对手」用，不是孩子模型） */ adult?: { depth: number; nodes: number }; random?: boolean; greedy?: boolean; mix?: KidId[]; mate1?: number; takeFree?: number; safe?: number; save?: number; defMate?: number; look2?: number }
export const KIDS: Record<KidId, KidSpec> = {
  k0: { random: true }, k1: { greedy: true },
  k2: { mate1: 0.8, takeFree: 0.8, safe: 0.7, save: 0.3, defMate: 0.3, look2: 0 },
  k3: { mate1: 0.95, takeFree: 0.9, safe: 0.85, save: 0.7, defMate: 0.7, look2: 0.35 },
  adult3: { adult: { depth: 3, nodes: 20000 } }, k15: { mix: ['k1', 'k2'] }, k4: { mate1: 1, takeFree: 0.95, safe: 0.9, save: 0.85, defMate: 0.85, look2: 0.7 },
};
const adapter = xqSearchAdapter();
const kidSearcher = new Searcher<number>(adapter);
const pick = <T,>(R_: Rng, xs: readonly T[]): T => xs[Math.floor(R_.next() * xs.length)];
const dist = (a: number, b: number): number => Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b));
const net = (sp: XqSearchPos, m: number): number => seNet(sp, m, adapter.valueAt);
const threatAfter = (sp: XqSearchPos, m: number): number => seThreat(sp, m, adapter.valueAt);
const allowsMate = (sp: XqSearchPos, m: number): boolean => { sp.make(m); const r = hasMateIn1(sp, { stalemate: false }); sp.unmake(); return r; };

function greedyScore(sp: XqSearchPos, m: number, seen: ReadonlySet<string>): number {
  const p = sp.p, me = p.side, to = m >> 7, piece = p.b[m & 127], cap = p.b[to]; let sc = 0;
  if (cap) sc += pieceVal(cap, to) * 100;
  sp.make(m); sc += -evaluate(p) * 0.5;
  const t = piece & 7; if (t === R || t === C || t === N) { const ek = p.ksq[(me ^ 8) >> 3]; if (ek >= 0) sc += (12 - dist(to, ek)) * 10; if (p.inCheck(me ^ 8)) sc += 60; }
  sc += Math.max(0, 14 - p.legal().length) * 12;        // 追着王跑：对方可走的着法越少越好
  if (seen.has(p.key())) sc -= 150;                       // 孩子不爱原地来回
  sp.unmake(); return sc;
}
export function kidMove(kidId: KidId, sp: XqSearchPos, R_: Rng, seen: ReadonlySet<string>, exclude?: ReadonlySet<number>): number {
  const k = KIDS[kidId]; let legal = sp.legal(); if (exclude && exclude.size) { const f = legal.filter((m) => !exclude.has(m)); if (f.length) legal = f; }
  if (legal.length === 1) return legal[0];
  if (k.mix) return kidMove(pick(R_, k.mix), sp, R_, seen, exclude);
  if (k.adult) { const r = kidSearcher.search(sp, { depth: k.adult.depth, nodes: k.adult.nodes, margin: 0, qs: true, ...(exclude && exclude.size ? { exclude } : {}) }); return r.best; }
  if (k.random) return pick(R_, legal);
  if (k.greedy) { const caps = legal.filter((m) => sp.p.b[m >> 7]); if (!caps.length) return pick(R_, legal); caps.sort((x, y) => pieceVal(sp.p.b[y >> 7], y >> 7) - pieceVal(sp.p.b[x >> 7], x >> 7)); return caps[0]; }
  if (R_.next() < (k.mate1 ?? 0)) { const mm = mateIn1Moves(sp, { stalemate: false }); if (mm.length) return pick(R_, mm); }
  if (k.look2 && R_.next() < k.look2) { const r = kidSearcher.search(sp, { depth: 2, nodes: 4000, margin: 60, qs: true }); return softmaxPick(R_, r.root, 40); }
  const nets = new Map<number, number>(); const netOf = (m: number): number => { let v = nets.get(m); if (v === undefined) { v = net(sp, m); nets.set(m, v); } return v; };
  if (R_.next() < (k.takeFree ?? 0)) { const free = legal.filter((m) => netOf(m) > 0).sort((x, y) => netOf(y) - netOf(x)); if (free.length) return free[0]; }
  let cand = legal; const wantSafe = R_.next() < (k.safe ?? 0), wantSave = R_.next() < (k.save ?? 0), wantDef = R_.next() < (k.defMate ?? 0);
  if (wantSafe || wantSave || wantDef) {
    const info = legal.map((m) => ({ m, t: wantSafe || wantSave ? threatAfter(sp, m) : 0, mt: wantDef ? allowsMate(sp, m) : false }));
    const minT = Math.min(...info.map((x) => x.t));
    cand = info.filter((x) => (!wantDef || !x.mt) && (!(wantSafe || wantSave) || x.t <= Math.max(0, minT) + (wantSave ? 0 : 1))).map((x) => x.m);
    if (!cand.length) cand = legal;
  }
  const scored = cand.map((m) => ({ m, score: greedyScore(sp, m, seen) })).sort((a, b) => b.score - a.score);
  return softmaxPick(R_, scored.slice(0, 8), 60);
}

// ───────────────────────── 对局驱动 ─────────────────────────
export interface PlayOpts { maxPly?: number; openingRandom?: boolean; handicap?: HandicapKind; fen?: string | null; easy?: boolean; resign?: boolean; adjudicate?: boolean; rules?: Partial<XqCfg> }
export interface PlayResult { winner: 'a' | 'b' | null; reason: string; plies: number; robotMs: number; robotMoves: number; robotMaxMs: number }
export interface Spec { kid?: KidId; level?: number }
const handler = createAiHandler(xqPlugin());
export const robotLevel = (level: number, easy: boolean): RobotLevel => { const r = ROBOTS[level - 1].level; return easy ? easyOf(r) : r; };
const matDiffKid = (g: GameImpl<number, import('../src/rules/position').Position>, side: 0 | 1): number => g.materialDiff(side);

/** a 执红、b 执黑；opts.fen = 起始局面（小局：孩子 = 红）；返回 winner 'a'|'b'|null */
export function playGame(a: Spec, b: Spec, seed: number, o: PlayOpts = {}): PlayResult {
  const { maxPly = 300, openingRandom = true, handicap = 'none', fen = null, easy = false, resign = false, adjudicate = false, rules: rc = {} } = o;
  const robotIsRed = !a.kid; const start = fen ?? (handicap === 'none' || handicap === 'first' ? START_FEN : handicapFen(handicap, robotIsRed ? RED : BLACK));
  const rules = createRules(rc); const g = createGame(rules, start, { cfg: rc }); const R_ = createRng(seed);
  const hasKid = !!(a.kid || b.kid); let robotMs = 0, robotMoves = 0, robotMaxMs = 0; const seen = new Set<string>([g.state().key()]);
  for (let plies = 0; plies < maxPly; plies++) {
    const st = g.status(); if (st.over) return { winner: st.winner === null ? null : st.winner === 0 ? 'a' : 'b', reason: st.reason, plies, robotMs, robotMoves, robotMaxMs };
    const side = g.turn(), spec = side === 0 ? a : b; let m: number;
    if (hasKid && !spec.kid) {
      const lv = robotLevel(spec.level ?? 1, easy);
      if (resign && lv.resign && plies >= lv.resign.afterPly && matDiffKid(g, side) <= -lv.resign.behind && !g.state().inCheck(g.state().side)) return { winner: side === 0 ? 'b' : 'a', reason: 'resign', plies, robotMs, robotMoves, robotMaxMs };
      if (adjudicate && lv.resign && rc.limit !== 0 && g.noProgress() >= (rc.limit ?? 120) - 1 && matDiffKid(g, (1 - side) as 0 | 1) >= 9) return { winner: side === 0 ? 'b' : 'a', reason: 'tired', plies, robotMs, robotMoves, robotMaxMs };
    }
    if (openingRandom && !fen && plies < 2) { const L = g.legalMoves(); m = L[Math.floor(R_.next() * L.length)]; }
    else if (spec.kid) {
      const sp = adapter.create(g.state()); const ex = new Set<number>(); if ((rc.perpetual ?? 'loss') === 'loss' && g.keys.length >= 8) for (const mm of g.legalMoves()) if (g.wouldEndBadly(mm)) ex.add(mm);
      m = kidMove(spec.kid, sp, R_, seen, ex);
    } else {
      const t0 = performance.now();
      const res = handler.handle({ op: 'move', startFen: start, moves: g.encoded(), cfg: rc, level: robotLevel(spec.level ?? 1, easy), gameSeed: seed, budget: { maxMs: Infinity, maxDepth: 8 } }) as AiMoveResult;
      const dt = performance.now() - t0; robotMs += dt; robotMoves++; if (dt > robotMaxMs) robotMaxMs = dt;
      const dec = res.move ? rules.decode(g.state(), res.move) : null; if (dec === null) throw new Error('robot returned no move');
      m = dec;
    }
    g.play(m); seen.add(g.state().key());
  }
  return { winner: null, reason: 'maxply', plies: maxPly, robotMs, robotMoves, robotMaxMs };
}

export interface CellStats { n: number; w: number; d: number; l: number; score: number; win: number; drawRate: number; medianPlies: number; p90Plies: number; reasons: Record<string, number>; robotAvgMs: number; robotMaxMs: number }
/** 一格校准：kid（红黑轮换，a = 孩子）对 R{level}；返回统计。seed 与原型 tour 同形：1000003*(cell+1)+7919*i+seed0 */
export function runCell(kid: KidId | { level: number }, level: number, n: number, o: PlayOpts & { cell?: number; seed0?: number } = {}): CellStats {
  const res: PlayResult[] = []; let wins = 0, draws = 0, losses = 0; const reasons: Record<string, number> = {};
  const A: Spec = typeof kid === 'string' ? { kid } : { level: kid.level }; const Bs: Spec = { level };
  for (let i = 0; i < n; i++) {
    const flip = i % 2 === 1; const seed = 1000003 * ((o.cell ?? 0) + 1) + 7919 * i + (o.seed0 ?? 0);
    const r = playGame(flip ? Bs : A, flip ? A : Bs, seed, o); res.push(r); reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    const cellA = flip ? 'b' : 'a'; if (r.winner === null) draws++; else if (r.winner === cellA) wins++; else losses++;
  }
  const pl = res.map((r) => r.plies).sort((x, y) => x - y); const q = (p: number): number => pl[Math.min(pl.length - 1, Math.floor(p * pl.length))];
  const rm = res.reduce((s, r) => s + r.robotMs, 0), rn = res.reduce((s, r) => s + r.robotMoves, 0);
  return { n, w: wins, d: draws, l: losses, score: (wins + 0.5 * draws) / n, win: wins / n, drawRate: draws / n, medianPlies: q(0.5), p90Plies: q(0.9), reasons, robotAvgMs: rn ? rm / rn : 0, robotMaxMs: Math.max(0, ...res.map((r) => r.robotMaxMs)) };
}
/** Wilson 95 % 区间（%） */
export function wilson(k: number, n: number): [number, number] { if (!n) return [0, 100]; const z = 1.96, p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n)); return [Math.max(0, ((c - s) / d) * 100), Math.min(100, ((c + s) / d) * 100)]; }
export { hash32 };
export { BLACK, K, P };
