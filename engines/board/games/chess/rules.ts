// engines/board/games/chess/rules.ts — 国际象棋的 GameRules 适配器（board-engine 契约；FIDE）。纯逻辑：页面、Worker、vitest 共用；不 import DOM / kit。
// M = ChessMove（对象），S = ChessState（不可变，apply 返回新对象）。原型 = chess-tools-r/adapter.mjs；独立第二实现 = oracle-0x88.ts（仅测试）。
import { OBSTACLE, type CheckInfo, type Effect, type GameRules, type HashKey, type MoveInfo, type Outcome, type Piece, type Side, type Sq } from '../../core/types';
import { geometry } from './geometry';
import { notationZh } from './notation';
import {
  START_FEN, VAL, applyMove, attackersOn, findKing, fromFEN, inCheck, insufficient, legalMoves, repKey, san, toFEN, uci, whyIllegal,
  type CPiece, type ChessMove, type ChessState, type Color, type PType,
} from './position';

/** 家规（面对面可改；对机器人固定默认）：repetition 'draw' 第 3 次判和 | 'warn' 第 2 次预警（HUD 读 repCount）、第 3 次判和 | 'off' 不判；fifty 'draw' | 'off'；undo 'free' | 次数 */
export interface ChessCfg { repetition: 'draw' | 'warn' | 'off'; fifty: 'draw' | 'off'; undo: 'free' | 3 }
export const DEFAULT_CFG: ChessCfg = { repetition: 'draw', fifty: 'draw', undo: 'free' };
export type ChessRules = GameRules<ChessMove, ChessState>;
export { geometry, START_FEN };

const TYPE: Readonly<Record<PType, number>> = { K: 1, Q: 2, R: 3, B: 4, N: 5, P: 6, X: OBSTACLE };
const PC: Readonly<Record<string, Piece>> = (() => {
  const t: Record<string, Piece> = {};
  for (const col of ['w', 'b'] as const) for (const ty of Object.keys(TYPE) as PType[]) t[col + ty] = Object.freeze({ type: TYPE[ty], side: (col === 'w' ? 0 : 1) as Side });
  return t;
})();
const pc = (p: CPiece): Piece => PC[p.color + p.type];
const promoPiece = (m: ChessMove): Piece => PC[m.piece.color + (m.promotion as string)];
const sqOf = (rc: { r: number; c: number }): Sq => rc.r * 8 + rc.c;
const capSq = (m: ChessMove): Sq => (m.enPassant ? m.from.r * 8 + m.to.c : sqOf(m.to));
const colorOf = (side: Side): Color => (side === 0 ? 'w' : 'b');

/** FNV 风格的双 32 位串哈希（键串 = 布局 + 走子方 + 易位权 + 合法的过路兵格） */
const hashStr = (str: string): HashKey => {
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); a = Math.imul(a ^ ch, 0x01000193); b = Math.imul(b ^ ch, 0x85ebca6b); b ^= b >>> 13; }
  return [a | 0, b | 0];
};

// 状态不可变 → 合法着法按状态缓存（Game / 输入层 / whyIllegal 会对同一状态反复询问）；对外一律返回副本，调用方可随意 sort / splice
const LEGAL = new WeakMap<ChessState, ChessMove[]>();
const legalOf = (s: ChessState): ChessMove[] => { let l = LEGAL.get(s); if (!l) { l = legalMoves(s); LEGAL.set(s, l); } return l; };

export function createRules(cfgIn: Partial<ChessCfg> = {}): ChessRules {
  const cfg: ChessCfg = { ...DEFAULT_CFG, ...cfgIn };
  const rules: ChessRules = {
    id: 'chess', geometry,
    meta: { kingType: TYPE.K, repeatN: cfg.repetition === 'off' ? Number.MAX_SAFE_INTEGER : 3, clockPlies: cfg.fifty === 'off' ? null : 100, clockReason: 'fifty-move' },
    initial: (variant) => fromFEN(variant && variant.includes('/') ? variant : START_FEN),
    fromFen: fromFEN, toFen: toFEN, turn: (s) => (s.turn === 'w' ? 0 : 1),
    pieceAt: (s, q) => { const p = s.board[(q / 8) | 0][q % 8]; return p ? pc(p) : null; },
    legalMoves: (s) => legalOf(s).slice(),
    legalFrom: (s, from) => legalOf(s).filter((m) => sqOf(m.from) === from),
    apply: applyMove,
    moveInfo: (_s, m): MoveInfo => ({
      from: sqOf(m.from), to: sqOf(m.to), piece: pc(m.piece), capture: m.captured ? { sq: capSq(m), piece: pc(m.captured) } : null,
      promotion: m.promotion ? TYPE[m.promotion] : null, resetsClock: m.piece.type === 'P' || !!m.captured,
    }),
    effects: (_s, m): Effect[] => {
      const e: Effect[] = [{ k: 'move', phase: 0, from: sqOf(m.from), to: sqOf(m.to), piece: pc(m.piece), arc: m.piece.type === 'N' }];
      if (m.castling) { const row = m.from.r, [rf, rt] = m.castling === 'K' ? [7, 5] : [0, 3]; e.push({ k: 'move', phase: 0, from: row * 8 + rf, to: row * 8 + rt, piece: PC[m.piece.color + 'R'], arc: true }); }
      if (m.captured) e.push({ k: 'capture', phase: 1, sq: capSq(m), piece: pc(m.captured) });
      if (m.promotion) e.push({ k: 'promote', phase: 1, sq: sqOf(m.to), from: pc(m.piece), to: promoPiece(m) });
      return e;
    },
    check: (s, side): CheckInfo | null => {
      const col = side === undefined ? s.turn : colorOf(side); const k = findKing(s.board, col); if (!k) return null;
      const by = attackersOn(s.board, k.r, k.c, col === 'w' ? 'b' : 'w'); return by.length ? { king: sqOf(k), by } : null;
    },
    status: (s): Outcome => {
      if (legalOf(s).length === 0) return inCheck(s.board, s.turn) ? { over: true, winner: s.turn === 'w' ? 1 : 0, reason: 'checkmate' } : { over: true, winner: null, reason: 'stalemate' };
      if (insufficient(s.board)) return { over: true, winner: null, reason: 'insufficient' };
      return { over: false };
    },
    hash: (s) => hashStr(repKey(s)),
    encode: uci,
    decode: (s, t) => { const u = t.trim(); return legalOf(s).find((m) => uci(m) === u) ?? null; },
    notation: (s, m, style) => (style === 'san' ? san(s, m) : style === 'zh' ? notationZh(s, m) : uci(m)),
    clock: (s) => s.halfmove,
    whyIllegal: (s, from, to) => whyIllegal(s, { r: (from / 8) | 0, c: from % 8 }, { r: (to / 8) | 0, c: to % 8 }, legalOf(s)),
    value: (s, q) => { const p = s.board[(q / 8) | 0][q % 8]; return p ? VAL[p.type] : 0; },
    // 左右镜像（课孪生）：丢易位权（含易位权的课题用手工孪生）
    mirror: (s) => ({ ...s, board: s.board.map((row) => row.slice().reverse()), castling: { wK: false, wQ: false, bK: false, bQ: false }, ep: s.ep ? { r: s.ep.r, c: 7 - s.ep.c } : null }),
    attackersOf: (s, q, by) => attackersOn(s.board, (q / 8) | 0, q % 8, colorOf(by)),
  };
  return rules;
}
