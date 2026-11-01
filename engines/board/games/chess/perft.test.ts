// perft（V1）：6 个标准局面（chessprogramming.org/Perft_Results）精确相等；独立 0x88 oracle 同样要吻合。
// 默认只跑 ≤ 50 万叶的层（≈1 s）；CHESS_FULL=1 跑全部 26 项（16.5M 叶，≈10 s）；CHESS_DEEP=1 另跑 6 个更深层（≈6–10 分钟，单线程）。
import { describe, expect, it } from 'vitest';
import { createRules } from './rules';
import { START_FEN, fromFEN, perft } from './position';
import { parse, perft88 } from './oracle-0x88';

const FULL = !!(process.env.CHESS_FULL || process.env.CH_FULL), DEEP = !!process.env.CHESS_DEEP;
const CASES: [name: string, fen: string, counts: number[]][] = [
  ['start', START_FEN, [20, 400, 8902, 197281, 4865609]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  ['pos3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['pos4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
  ['pos6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594]],
];
const DEEPER: [string, string, number, number][] = [
  ['start d6', START_FEN, 6, 119060324], ['kiwipete d5', CASES[1][1], 5, 193690690], ['pos3 d6', CASES[2][1], 6, 11030083],
  ['pos4 d5', CASES[3][1], 5, 15833292], ['pos5 d5', CASES[4][1], 5, 89941194], ['pos6 d5', CASES[5][1], 5, 164075551],
];
const LIMIT = 500_000;

describe('perft（rules.ts / position.ts）', () => {
  for (const [name, fen, counts] of CASES) {
    counts.forEach((n, i) => {
      const d = i + 1, run = FULL || n <= LIMIT;
      (run ? it : it.skip)(`${name} d${d} = ${n}`, { timeout: 120_000 }, () => { expect(perft(fromFEN(fen), d)).toBe(n); });
    });
  }
  for (const [name, fen, d, n] of DEEPER) (DEEP ? it : it.skip)(`更深层 ${name} = ${n}`, { timeout: 3_600_000 }, () => { expect(perft(fromFEN(fen), d)).toBe(n); });
});

describe('perft（独立 0x88 oracle 自身）', () => {
  for (const [name, fen, counts] of CASES) {
    counts.forEach((n, i) => {
      const d = i + 1, run = (FULL ? n <= 5_000_000 : n <= 100_000);
      (run ? it : it.skip)(`${name} d${d} = ${n}`, { timeout: 120_000 }, () => { expect(perft88(parse(fen), d)).toBe(n); });
    });
  }
});

describe('perft 经 GameRules 契约（含按状态缓存的 legalMoves）', () => {
  it('start d1–d3 与 Kiwipete d1–d2 走 rules.legalMoves / apply', () => {
    const rules = createRules();
    const pf = (s: unknown, d: number): number => { const L = rules.legalMoves(s as never); if (d === 1) return L.length; let n = 0; for (const m of L) n += pf(rules.apply(s as never, m), d - 1); return n; };
    expect([1, 2, 3].map((d) => pf(rules.initial(), d))).toEqual([20, 400, 8902]);
    expect([1, 2].map((d) => pf(rules.fromFen(CASES[1][1]), d))).toEqual([48, 2039]);
  });
});
