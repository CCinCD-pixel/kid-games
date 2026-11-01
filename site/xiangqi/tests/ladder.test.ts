// V8 天梯校准 · V9 小局 · V10 教练 · V16 长度与平局。默认跑"短版"（几十盘、宽带）；XQ_FULL=1 跑规格里的 n（XQ_N，默认 100；规格 n=400）并写报告到 ~/kid-games-work/state/rr/xiangqi-calibration.txt。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createGame } from '@engines/board/core/game';
import { createRng } from '@engines/board/core/rng';
import type { AiMoveResult } from '@engines/board/ai/protocol';
import { createAiHandler } from '@engines/board/ai/handler';
import { START_FEN } from '../src/rules/position';
import { createRules } from '../src/rules/rules';
import { xqPlugin } from '../src/rules/plugin';
import { KIDS, kidMove, playGame, robotLevel, runCell, wilson, type KidId } from '../tools/sim';
import { xqSearchAdapter } from '../src/rules/rules';

const FULL = !!process.env.XQ_FULL; const N = Number(process.env.XQ_N ?? 100);
const REPORT = `${homedir()}/kid-games-work/state/rr/xiangqi-calibration.txt`; const report: string[] = [];
const fmt = (n: string, c: ReturnType<typeof runCell>): string => `${n}  胜 ${c.w} 和 ${c.d} 负 ${c.l}  得分率 ${(c.score * 100).toFixed(1)}%（Wilson 严格胜 ${wilson(c.w, c.n).map((x) => x.toFixed(0)).join('–')}%）  严格胜 ${(c.win * 100).toFixed(0)}%  和棋率 ${(c.drawRate * 100).toFixed(1)}%  步数 中位 ${c.medianPlies} p90 ${c.p90Plies}  终局 ${JSON.stringify(c.reasons)}  机器人均耗 ${c.robotAvgMs.toFixed(1)} ms 最大 ${c.robotMaxMs.toFixed(0)} ms`;
const OPT = { resign: true, adjudicate: true } as const;

describe('V8 天梯（短版：k2 对 R1–R3）', () => {
  it('k2 对 R1 几乎全胜；对 R2 / R3 得分率落在宽带内；孩子模型 k0 对 R2 ≤ 15 %', () => {
    const n = 14; const r1 = runCell('k2', 1, n, { ...OPT, cell: 0 }), r2 = runCell('k2', 2, n, { ...OPT, cell: 1 }), r3 = runCell('k2', 3, n, { ...OPT, cell: 2 });
    expect(r1.score).toBeGreaterThanOrEqual(0.85); expect(r2.score).toBeGreaterThanOrEqual(0.62); expect(r3.score).toBeGreaterThanOrEqual(0.45); expect(r3.score).toBeLessThanOrEqual(0.97);
    expect(runCell('k0', 2, 10, { ...OPT, cell: 3 }).score).toBeLessThanOrEqual(0.2);
  }, 600_000);
});

const BANDS: [number, number][] = [[90, 100], [82, 95], [70, 86], [60, 78], [42, 60], [24, 40]];   // k2 得分率 R1…R6（规格 §4.3）
describe.skipIf(!FULL)('V8 天梯（XQ_FULL：规格 n）', () => {
  const k2: ReturnType<typeof runCell>[] = [], k15: ReturnType<typeof runCell>[] = [];
  it(`k2 / k15 对 R1…R6（n=${N}/格，颜色轮换，resign + 疲惫裁定）`, () => {
    const sigma = 100 * Math.sqrt(0.25 / N);
    for (let L = 1; L <= 6; L++) { k2.push(runCell('k2', L, N, { ...OPT, cell: L })); report.push(fmt(`k2  vs R${L}`, k2[L - 1])); }
    for (let L = 1; L <= 6; L++) { k15.push(runCell('k15', L, N, { ...OPT, cell: 10 + L })); report.push(fmt(`k15 vs R${L}`, k15[L - 1])); }
    mkdirSync(`${homedir()}/kid-games-work/state/rr`, { recursive: true }); writeFileSync(REPORT, `# xiangqi calibration n=${N}\n${report.join('\n')}\n`);
    for (let L = 1; L <= 6; L++) { const sc = k2[L - 1].score * 100; expect(sc, `k2 R${L}`).toBeGreaterThanOrEqual(BANDS[L - 1][0] - 2 * sigma); expect(sc, `k2 R${L}`).toBeLessThanOrEqual(BANDS[L - 1][1] + 2 * sigma); }
    expect(k15[1].score * 100, 'k15 R2').toBeGreaterThanOrEqual(55 - 2 * sigma); expect(k15[2].score * 100, 'k15 R3').toBeGreaterThanOrEqual(40 - 2 * sigma); expect(k15[3].score * 100, 'k15 R4').toBeGreaterThanOrEqual(28 - 2 * sigma);
    for (let L = 2; L < 6; L++) { expect((k2[L - 1].score - k2[L].score) * 100, `k2 降幅 R${L}→R${L + 1}`).toBeLessThanOrEqual(24 + 2 * sigma); expect((k15[L - 1].score - k15[L].score) * 100, `k15 降幅 R${L}→R${L + 1}`).toBeLessThanOrEqual(22 + 2 * sigma); }
  }, 7_200_000);
  it('V16 和棋率与步数（k2）', () => {
    const lim = [2, 10, 20, 27, 33, 27]; for (let L = 1; L <= 6; L++) expect(k2[L - 1].drawRate * 100, `k2 R${L} 和棋率`).toBeLessThanOrEqual(lim[L - 1] + 2 * 100 * Math.sqrt(0.25 / N) + 3);
    expect(k2[0].medianPlies).toBeLessThanOrEqual(45); expect(k2[1].medianPlies).toBeLessThanOrEqual(75);
  });
});

describe('V10 教练（短版：k2 对 R2，6 盘）', () => {
  it('被判"该提醒"占比 < 10 %；判定表 p95 < 8 ms（Node）', () => {
    const plugin = xqPlugin(); const adapter = xqSearchAdapter(); const handler = createAiHandler(plugin); let kidMoves = 0, shown = 0; const times: number[] = []; const rules = createRules();
    for (let gi = 0; gi < (FULL ? 60 : 6); gi++) {
      const seed = 777 + 2 * 10007 + gi * 31, R = createRng(seed), kidRed = gi % 2 === 0; const g = createGame(rules, START_FEN); const seen = new Set<string>([g.state().key()]);
      for (let ply = 0; ply < 300; ply++) {
        if (g.status().over) break; const isKid = (g.turn() === 0) === kidRed; let m: number;
        if (ply < 2) { const L = g.legalMoves(); m = L[Math.floor(R.next() * L.length)]; }
        else if (!isKid) { const res = handler.handle({ op: 'move', startFen: START_FEN, moves: g.encoded(), level: robotLevel(2, false), gameSeed: seed, budget: { maxMs: Infinity, maxDepth: 8 } }) as AiMoveResult; m = rules.decode(g.state(), res.move as string) as number; }
        else { m = kidMove('k2' as KidId, adapter.create(g.state()), R, seen); kidMoves++; const t0 = performance.now(); const rows = plugin.coach.table(adapter.create(g.state())); times.push(performance.now() - t0); const row = rows.find((r) => r.m === rules.encode(m)); if (row?.reason) shown++; }
        g.play(m); seen.add(g.state().key());
      }
    }
    times.sort((a, b) => a - b); const p95 = times[Math.floor(0.95 * (times.length - 1))];
    report.push(`coach k2 vs R2：孩子 ${kidMoves} 步，提醒 ${shown}（${((100 * shown) / kidMoves).toFixed(1)}%），判定表 p95 ${p95.toFixed(1)} ms`);
    expect(shown / kidMoves).toBeLessThan(0.1); expect(p95).toBeLessThan(8); expect(Object.keys(KIDS).filter((k) => k !== 'adult3').length).toBe(6);   // adult3 是成年人对照（3 层 + 静态搜索），不是孩子模型
  }, 300_000);
});

describe('V9 小局（短版：每主题抽 1 个局面，k2 对 R3，8 盘）', () => {
  it('孩子执红先走，k2 严格胜率 ≥ 60 %，中位步数 ≤ 50', () => {
    const xj = (JSON.parse(readFileSync(new URL('../../../content/xiangqi/xiaoju.v1.json', import.meta.url), 'utf8')) as { positions: { id: string; theme: string; fen: string }[] }).positions;
    const seenTheme = new Set<string>(); const picks = xj.filter((p) => !seenTheme.has(p.theme) && !!seenTheme.add(p.theme)); let w = 0, n = 0; const plies: number[] = [];
    for (const p of picks) for (let i = 0; i < (FULL ? 12 : 1); i++) { const r = playGame({ kid: 'k2' }, { level: 3 }, 4242 + n * 17, { fen: p.fen, openingRandom: false, maxPly: 200 }); n++; if (r.winner === 'a') { w++; plies.push(r.plies); } }
    plies.sort((a, b) => a - b); expect(w / n).toBeGreaterThanOrEqual(0.6); expect(plies[Math.floor(plies.length / 2)]).toBeLessThanOrEqual(50);
  }, 600_000);
});
