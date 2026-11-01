// engines/board/games/chess/test-util.ts — 国象测试共用（不是测试文件；tsc 会检查）：格名转换、内容文件读取、一致性夹具、确定性随机。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ConformanceFixtures } from '../../test/conformance';
import { createRng, hash32 } from '../../core/rng';
import { START_FEN } from './position';

/** 'e4' → sq 下标（r*8+c，r 自上） */
export const sq = (name: string): number => (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97);
export const rc = (name: string): { r: number; c: number } => ({ r: 8 - Number(name[1]), c: name.charCodeAt(0) - 97 });
export const FULL = !!(process.env.CHESS_FULL || process.env.CH_FULL);
export const rngOf = (seed: number): (() => number) => { const r = createRng(hash32(seed, 11)); return () => r.next(); };

export const contentPath = (f: string): string => fileURLToPath(new URL(`../../../../content/chess/${f}`, import.meta.url));
export const readContent = <T = unknown>(f: string): T => JSON.parse(readFileSync(contentPath(f), 'utf8')) as T;
export const readContentText = (f: string): string => readFileSync(contentPath(f), 'utf8');

const looksFen = (s: string): boolean => /^[1-8KQRBNPXkqrbnpx/]+ [wb]( |$)/.test(s) && s.split('/').length === 8;
/** 递归收集 JSON 里所有 FEN 串（课程步 pos / 谜题 fen / 池行 / 小局 fen …） */
export function collectFens(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof node === 'string') { if (looksFen(node)) out.add(node); }
  else if (Array.isArray(node)) for (const x of node) collectFens(x, out);
  else if (node && typeof node === 'object') for (const x of Object.values(node)) collectFens(x, out);
  return out;
}
export const contentFens = (): string[] => {
  const all = new Set<string>();
  for (const f of ['lessons.v1.json', 'puzzles.v1.json', 'pool-v1.json', 'xiaoju.v1.json', 'cards.v1.json']) collectFens(readContent(f), all);
  return [...all];
};

export const chessFixtures: ConformanceFixtures = {
  fens: [
    START_FEN, 'r3k2r/ppp2ppp/b1np1n2/4p3/4P3/2N2N2/PPPP1PPP/R3K2R w KQkq - 0 1', '8/P6k/8/8/8/8/8/K7 w - - 0 1', 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3',
    '7k/8/6K1/8/8/8/8/R7 w - - 99 80', 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', '4k3/1P6/8/8/8/8/6p1/4K3 b - - 0 1', '8/8/8/KPp4r/8/8/8/7k w - c6 0 1',
  ],
  noKing: ['8/8/8/R3p3/8/8/8/8 w - - 0 1', '8/8/8/8/1N6/8/8/8 w - - 0 1', '8/2p5/8/8/8/8/5P2/8 b - - 0 1'],
  obstacle: ['8/8/8/R2X4/8/8/8/4K2k w - - 0 1', '4k3/8/8/8/3X4/8/3P4/4K3 w - - 0 1', '4k3/8/8/2X5/3q4/8/8/4K3 b - - 0 1', '4k3/3X4/3P4/8/8/8/8/4K3 w - - 0 1'],
  fenKey: (f) => f.split(' ').slice(0, 3).join(' '),
  perft: [{ fen: START_FEN, counts: [20, 400, 8902, 197281] }, { fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', counts: [48, 2039, 97862] },
    { fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', counts: [14, 191, 2812, 43238] }, { fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', counts: [6, 264, 9467] },
    { fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', counts: [44, 1486, 62379] }, { fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', counts: [46, 2079, 89890] }],
  randomGames: 120, maxPly: 90,
};
