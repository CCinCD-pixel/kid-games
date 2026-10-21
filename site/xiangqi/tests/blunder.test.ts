// 机关人"白送子"审计（2026-10-19，玩家 QA：R6 被成年人 3 步策略打到 +16，像在送子）。
// 判官 = 2 层 + 静态搜索（"我这步之后，对方一手回吃能拿多少"）；regret = 本层最佳分 − 机器人所选着的分。
// 强制"瞥一眼"（slip = 1、mateSight = 0）单测护栏：R6（有 glanceGuard）的瞥一眼着法 regret ≤ 300（一个马）；R4（没有，规格口径）会白送整车。
import { describe, expect, it } from 'vitest';
import { createGame } from '@engines/board/core/game';
import { createRng } from '@engines/board/core/rng';
import { createAiHandler } from '@engines/board/ai/handler';
import type { AiMoveResult } from '@engines/board/ai/protocol';
import { Searcher } from '@engines/board/core/search';
import type { RobotLevel } from '@engines/board/core/types';
import { START_FEN } from '../src/rules/position';
import { createRules, xqSearchAdapter } from '../src/rules/rules';
import { xqPlugin } from '../src/rules/plugin';
import { ROBOTS } from '../src/rules/robots';
import { kidMove } from '../tools/sim';

const adapter = xqSearchAdapter(); const judge = new Searcher<number>(adapter); const handler = createAiHandler(xqPlugin()); const rules = createRules();
const FULL = !!process.env.XQ_FULL;
/** 机器人用 `level` 对 k2 下 games 盘；返回每个机器人着法的 regret */
function audit(level: RobotLevel, games: number, seed0: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < games; i++) {
    const seed = seed0 + 7919 * i; const robotRed = i % 2 === 1; const g = createGame(rules, START_FEN); const R_ = createRng(seed); const seen = new Set<string>([g.state().key()]);
    for (let plies = 0; plies < 90; plies++) {
      if (g.status().over) break; const robotTurn = (g.turn() === 0) === robotRed; let m: number;
      if (plies < 2) { const L = g.legalMoves(); m = L[Math.floor(R_.next() * L.length)]; }
      else if (!robotTurn) m = kidMove('k2', adapter.create(g.state()), R_, seen);
      else {
        const res = handler.handle({ op: 'move', startFen: START_FEN, moves: g.encoded(), cfg: {}, level, gameSeed: seed, budget: { maxMs: Infinity, maxDepth: 8 } }) as AiMoveResult; const dec = res.move ? rules.decode(g.state(), res.move) : null; if (dec === null) throw new Error('no move'); m = dec;
        const r = judge.search(adapter.create(g.state()), { depth: 2, nodes: 80000, margin: 1_000_000, qs: true }); const top = Math.max(...r.root.map((x) => x.score)); const mine = r.root.find((x) => x.m === m); out.push(mine ? top - mine.score : 0);
      }
      g.play(m); seen.add(g.state().key());
    }
  }
  return out;
}
const forced = (lv: number): RobotLevel => ({ ...ROBOTS[lv - 1].level, slip: 1, mateSight: 0 });

describe('机关人白送子审计', () => {
  it('R6 的"瞥一眼"有护栏：不把马以上的子白送给一手回吃（regret ≤ 300 的占 ≥ 95 %，没有整车）；R4（规格口径，无护栏）会', () => {
    const n = FULL ? 24 : 8; const r6 = audit(forced(6), n, 424243), r4 = audit(forced(4), n, 424243);
    const frac = (xs: number[], cut: number): number => xs.filter((x) => x <= cut).length / xs.length;
    expect(r6.length).toBeGreaterThan(150); expect(frac(r6, 300)).toBeGreaterThanOrEqual(0.95); expect(Math.max(...r6)).toBeLessThan(800);
    expect(r4.filter((x) => x >= 600).length, 'R4 瞥一眼本该会白送车 / 炮（规格 §4.3 的失误模型）').toBeGreaterThanOrEqual(2); expect(frac(r4, 300)).toBeLessThan(frac(r6, 300));
  }, 600_000);
  it('R6 的 robots.v1.json 带 glanceGuard；R1–R5 没有（保持规格口径）', () => {
    const guard = ROBOTS.map((r) => (r.level.look as { glanceGuard?: number }).glanceGuard); expect(guard).toEqual([undefined, undefined, undefined, undefined, undefined, 300]);
  });
});
