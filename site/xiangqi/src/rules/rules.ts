// site/xiangqi/src/rules/rules.ts — 象棋的 GameRules 适配器（board-engine 契约）+ 快速搜索适配器 + AI 插件。
// 纯逻辑：页面、Worker、vitest 共用同一份；不 import DOM / kit。M = int（from | to<<7），S = Position（外部不可变使用：apply 先 clone）。
import type { CheckInfo, Geometry, GameRules, MoveInfo, Outcome, Piece, RepWindow, SearchAdapter, SearchPos, Side, Sq } from '@engines/board/core/types';
import { BLACK, K, N, Position, RED, SQ, START_FEN, colOf, handicapFen, moveStr, notation, parseMove, pieceVal, rowOf, whyIllegal, type HandicapKind } from './position';

/** 家规（面对面可改；对机器人固定用默认）：stalemate 'loss'|'draw'；perpetual 'loss'|'warn'|'off'（warn / off = 判和）；limit = 无吃子半回合数（120 = 60 回合，0 = 不限） */
export interface XqCfg { stalemate: 'loss' | 'draw'; perpetual: 'loss' | 'warn' | 'off'; limit: number }
export const DEFAULT_CFG: XqCfg = { stalemate: 'loss', perpetual: 'loss', limit: 120 };
export type XqRules = GameRules<number, Position>;

const pc = (p: number): Piece => ({ type: p & 7, side: (p >> 3) as Side });

export const geometry: Geometry = {
  kind: 'points', cols: 9, rows: 10, squares: 90, unit: 100, margin: 0.55, viewBox: { w: 910, h: 1010 },
  center: (sq, o) => { let r = rowOf(sq), c = colOf(sq); if (o === 'second-bottom') { r = 9 - r; c = 8 - c; } return { x: 100 * (0.55 + c), y: 100 * (0.55 + r) }; },
  hit: (x, y, o) => { let c = Math.round(x / 100 - 0.55), r = Math.round(y / 100 - 0.55); if (c < 0 || c > 8 || r < 0 || r > 9) return null; if (o === 'second-bottom') { r = 9 - r; c = 8 - c; } return SQ(r, c); },
  name: (sq) => 'abcdefghi'[colOf(sq)] + (10 - rowOf(sq)),
  flip: (sq) => SQ(9 - rowOf(sq), 8 - colOf(sq)),
};

/** variant：FEN（含 '/'）或让子写法 `knight@black`（让子方 = black 的左马）；缺省 = 标准开局 */
export function initialFor(variant?: string): string {
  if (!variant) return START_FEN;
  if (variant.includes('/')) return variant;
  const [kind, who] = variant.split('@'); return handicapFen(kind as HandicapKind, who === 'red' ? RED : BLACK);
}

export function createRules(cfgIn: Partial<XqCfg> = {}): XqRules {
  const c: XqCfg = { ...DEFAULT_CFG, ...cfgIn };
  const checkOf = (s: Position, side?: Side): CheckInfo | null => {
    const col = (side === undefined ? s.side >> 3 : side) ? BLACK : RED; const by = s.checkersOf(col);
    return by.length ? { king: s.ksq[col >> 3], by } : null;
  };
  const rules: XqRules = {
    id: 'xiangqi', geometry, meta: { kingType: K, repeatN: 3, clockPlies: c.limit || null, clockReason: 'no-capture-limit' },
    initial: (variant) => Position.fromFen(initialFor(variant)), fromFen: (f) => Position.fromFen(f), toFen: (s) => s.fen(),
    turn: (s) => (s.side >> 3) as Side, pieceAt: (s, sq) => (s.b[sq] ? pc(s.b[sq]) : null),
    legalMoves: (s) => s.legal(), legalFrom: (s, from) => s.legal().filter((m) => (m & 127) === from),
    apply: (s, m) => { const q = s.clone(); q.make(m); return q; },
    moveInfo: (s, m): MoveInfo => { const from = m & 127, to = m >> 7, p = s.b[from], cp = s.b[to]; return { from, to, piece: pc(p), capture: cp ? { sq: to, piece: pc(cp) } : null, promotion: null, resetsClock: !!cp }; },
    effects: (s, m) => { const from = m & 127, to = m >> 7, p = s.b[from], cp = s.b[to]; const e: ReturnType<XqRules['effects']> = [{ k: 'move', phase: 0, from, to, piece: pc(p), arc: (p & 7) === N }]; if (cp) e.push({ k: 'capture', phase: 1, sq: to, piece: pc(cp) }); return e; },
    check: checkOf,
    status: (s): Outcome => {
      if (s.legal().length === 0) {
        if (s.inCheck()) return { over: true, winner: ((s.side ^ 8) >> 3) as Side, reason: 'checkmate' };
        return c.stalemate === 'draw' ? { over: true, winner: null, reason: 'stalemate-draw' } : { over: true, winner: ((s.side ^ 8) >> 3) as Side, reason: 'stalemate-loss' };
      }
      if (!s.hasAttackers(RED) && !s.hasAttackers(BLACK)) return { over: true, winner: null, reason: 'no-attackers' };
      return { over: false };
    },
    repetitionVerdict: (w: RepWindow): Outcome | null => {
      if (c.perpetual !== 'loss') return null;
      let a = true, b = true; w.plies.forEach((p, i) => { if (i % 2 === 0) { if (!p.check) a = false; } else if (!p.check) b = false; });
      if (a && !b) return { over: true, winner: (1 - w.mover) as Side, reason: 'perpetual-check' };
      if (b && !a) return { over: true, winner: w.mover, reason: 'perpetual-check' };
      return null;
    },
    hash: (s) => [s.lo, s.hi], encode: (m) => moveStr(m),
    decode: (s, t) => { try { const m = parseMove(t); return s.legal().includes(m) ? m : null; } catch { return null; } },
    notation: (s, m, style) => (style === 'zh' ? notation(s, m) : moveStr(m)),
    whyIllegal: (s, from, to) => whyIllegal(s, from, to), value: (s, sq) => (s.b[sq] ? pieceVal(s.b[sq], sq) : 0),
    mirror: (s) => { const q = new Position(); for (let sq = 0; sq < 90; sq++) if (s.b[sq]) q.b[SQ(rowOf(sq), 8 - colOf(sq))] = s.b[sq]; q.side = s.side; q.rehash(); return q; },
    attackersOf: (s, sq, by) => s.attackers(sq, by ? BLACK : RED),
  };
  return rules;
}

// ───────────────────────── 评估 + 快速搜索适配器（页面 Worker / 校验共用）─────────────────────────
const VAL = [0, 0, 200, 200, 400, 900, 450, 100];   // 将帅 0（不会被吃）；仕相 200，马 400，炮 450，车 900，兵 100
const PST = [0, 1].map(() => Array.from({ length: 8 }, () => new Int16Array(90)));
(function buildPst(): void {
  for (let s = 0; s < 90; s++) {
    const r = rowOf(s), c = colOf(s); const cen = 4 - Math.abs(c - 4); const rowsFromBack = 9 - r;
    PST[0][7][s] = r <= 4 ? 40 + (4 - r) * 14 + cen * 4 : r === 5 ? 6 : 0;                                  // 兵：过河 +，越深越值钱，靠中路更好
    PST[0][4][s] = Math.round(-Math.abs(r - 4.5) * 7 - Math.abs(c - 4) * 6 + 24);                            // 马：中心化
    PST[0][5][s] = cen * 3 + (rowsFromBack >= 3 ? 8 : 0);                                                    // 车：中路与前进
    PST[0][6][s] = cen * 4 + (r >= 3 && r <= 7 ? 8 : 0);                                                     // 炮：中路
    PST[0][2][s] = s === 76 ? 12 : 0; PST[0][3][s] = r === 7 && c === 4 ? 10 : 0; PST[0][1][s] = r === 9 ? 0 : -12;
  }
  for (let t = 1; t < 8; t++) for (let s = 0; s < 90; s++) { const r = rowOf(s), c = colOf(s); PST[1][t][s] = PST[0][t][(9 - r) * 9 + (8 - c)]; }
})();
/** 走子方视角（厘兵）：材料 + 位置表 + 先手权 12 */
export function evaluate(pos: Position): number {
  const b = pos.b; let score = 0;
  for (let s = 0; s < 90; s++) { const p = b[s]; if (!p) continue; const t = p & 7, ci = p >> 3; const v = VAL[t] + PST[ci][t][s]; score += ci === 0 ? v : -v; }
  return (pos.side === RED ? score : -score) + 12;
}

export interface XqSearchPos extends SearchPos<number> { readonly p: Position }
function createSearchPos(s: Position): XqSearchPos {
  const p = s.clone();
  return {
    p, make: (m) => p.make(m), unmake: () => p.unmake(), legal: (caps) => p.legal(!!caps), inCheck: () => p.inCheck(), side: () => (p.side >> 3) as Side,
    get hashLo() { return p.lo; }, get hashHi() { return p.hi; },
    pieceAt: (sq: Sq) => { const x = p.b[sq]; return x ? pc(x) : null; },
    from: (m) => m & 127, to: (m) => m >> 7, isCapture: (m) => p.b[m >> 7] !== 0,
    capturedBy: (m) => { const x = p.b[m >> 7]; return x ? pieceVal(x, m >> 7) : 0; },
    evaluate: () => evaluate(p),
  };
}
export interface XqAdapter extends SearchAdapter<number, Position> { create(s: Position): XqSearchPos; valueAt(pos: SearchPos<number>, sq: Sq): number }
export function xqSearchAdapter(): XqAdapter {
  return {
    create: createSearchPos,
    mvvLva: (pos, m) => { const p = (pos as XqSearchPos).p; const cap = p.b[m >> 7]; return cap ? 10 * VAL[cap & 7] + 50 - ((VAL[p.b[m & 127] & 7] / 20) | 0) : 0; },
    valueAt: (pos, sq) => { const x = (pos as XqSearchPos).p.b[sq]; return x ? pieceVal(x, sq) : 0; },
  };
}
