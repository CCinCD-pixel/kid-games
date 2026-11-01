import { describe, expect, it } from 'vitest';
import { checkLadder, eloOf, levelOf, mergeMatches, playGame, playMatch } from './calibrate';
import { xqTestPlugin } from './xq-plugin';
import robots from './fixtures/xq-robots.v1.json';

const plugin = xqTestPlugin(); const R = (robots as unknown as { robots: Record<string, unknown>[] }).robots.map((r) => levelOf(r)); const full = !!process.env.XQ_FULL;
const shard = process.env.XQ_SHARD ? { ix: Number(process.env.XQ_SHARD.split('/')[0]), count: Number(process.env.XQ_SHARD.split('/')[1]) } : undefined;

describe('校准工具', () => {
  it('eloOf / mergeMatches / checkLadder 的算术', () => {
    expect(eloOf(0.5)).toBe(0); expect(eloOf(0.76)).toBeGreaterThan(100); expect(eloOf(0.24)).toBe(-eloOf(0.76));
    const a = { n: 2, aWins: 1, bWins: 0, draws: 1, score: 0.75, strictWin: 0.5, elo: 0, maxMs: 5, medianPlies: 10, reasons: { checkmate: 1, repetition: 1 }, plies: [8, 12] }; const m = mergeMatches([a, a]); expect(m).toMatchObject({ n: 4, aWins: 2, draws: 2, score: 0.75 }); expect(m.reasons.checkmate).toBe(2);
    expect(checkLadder([{ k: 3, score: 0.6 }, { k: 4, score: 0.8 }]).rows.map((r) => r.inRange)).toEqual([true, false]);
  });
  it('robots.v1.json 的 6 位都能映射成 RobotLevel（R1 depth 0；R6 depth 4）', () => { expect(R).toHaveLength(6); expect(R[0]).toMatchObject({ id: 'R1', depth: 0, pcap: 0.3 }); expect(R[5].depth).toBe(4); expect(levelOf((robots as unknown as { robots: Record<string, unknown>[] }).robots[1], true).slip).toBeCloseTo(0.7, 5); });
  it('冒烟：一盘机器人对机器人能走完并给出结局（R1 对 R1，限 60 步，确定性：同种子同结果）', () => {
    const o = { plugin, maxPly: 60 }; const a = playGame(o, R[0], R[0], 77, true); const b = playGame(o, R[0], R[0], 77, true); expect(a.plies).toBeGreaterThan(2); expect(b).toMatchObject({ winner: a.winner, reason: a.reason, plies: a.plies });
    expect(playMatch(o, R[0], R[0], 2, 5).n).toBe(2); expect(playMatch(o, R[0], R[0], 4, 5, { ix: 1, count: 2 }).n).toBe(2);
  }, 120000);
});
describe.skipIf(!full)('XQ_FULL：天梯校准（慢；分片并行见 test/calibrate.ts 顶部）', () => {
  it('R2 对 R1 ≥ 85 %；R3 对 R2 在 [50,92] %（参考适配器只有子力评估，比真插件的 [55,75] 宽；游戏用自己的插件另校）', () => {
    const o = { plugin, maxPly: 300 }; const n = Number(process.env.XQ_N ?? 60);
    const r21 = playMatch(o, R[1], R[0], n, 11, shard); const r32 = playMatch(o, R[2], R[1], n, 12, shard); console.info(`R2/R1 ${(r21.score * 100).toFixed(1)}%  R3/R2 ${(r32.score * 100).toFixed(1)}%  (n=${r21.n}, 分片 ${process.env.XQ_SHARD ?? '全部'})`);
    expect(r21.score).toBeGreaterThan(0.85); if (!shard) expect(checkLadder([{ k: 3, score: r32.score }], [0.5, 0.92]).ok).toBe(true);
  }, 3600000);
});
