// adapters/xq.mjs — 象棋原型 rules.mjs → GameRules 契约（M = int，S = Position，不可变使用）
import { Position, START_FEN, RED, BLACK, K, A, B, N, R, C, P, T, rowOf, colOf, SQ, notation, moveStr, parseMove, handicapFen, whyIllegal as why, fenOf } from './xq-rules.mjs';
const SEE_VAL = [0, 0, 2, 2, 4, 9, 4, 1]; const pieceVal = (p, s) => { const t = p & 7; if (t === K) return 0; if (t === P) { const crossed = (p & 8) ? rowOf(s) >= 5 : rowOf(s) <= 4; return crossed ? 2 : 1; } return SEE_VAL[t]; };
const pc = (p) => ({ type: p & 7, side: p >> 3 });
const checkersOf = (pos, color) => { const k = pos.ksq[color >> 3]; if (k < 0) return []; const by = []; const opp = color ^ 8;
  for (let s = 0; s < 90; s++) { const p = pos.b[s]; if (!p || (p & 8) !== opp) continue; const t = p & 7; if (t === K) { if (pos.facing() && colOf(s) === colOf(k)) by.push(s); continue; }
    const q = pos.clone(); q.side = opp; q.rehash(); if (q.pseudo(true).some((m) => (m & 127) === s && (m >> 7) === k)) by.push(s); } return by; };
export function xqRules(cfg = {}) {
  const c = { stalemate: 'loss', perpetual: 'loss', limit: 120, ...cfg };
  const geometry = { kind: 'points', cols: 9, rows: 10, squares: 90, unit: 100, margin: 0.55, viewBox: { w: 910, h: 1010 },
    center: (sq, o) => { let r = rowOf(sq), cc = colOf(sq); if (o === 'second-bottom') { r = 9 - r; cc = 8 - cc; } return { x: 100 * (0.55 + cc), y: 100 * (0.55 + r) }; },
    hit: (x, y, o) => { let cc = Math.round(x / 100 - 0.55), r = Math.round(y / 100 - 0.55); if (cc < 0 || cc > 8 || r < 0 || r > 9) return null; if (o === 'second-bottom') { r = 9 - r; cc = 8 - cc; } return SQ(r, cc); },
    name: (sq) => 'abcdefghi'[colOf(sq)] + (10 - rowOf(sq)), flip: (sq) => SQ(9 - rowOf(sq), 8 - colOf(sq)) };
  const rules = {
    id: 'xiangqi', geometry, meta: { kingType: K, repeatN: 3, clockPlies: c.limit || null, clockReason: 'no-capture-limit' },
    initial: (variant) => (variant ? Position.fromFen(variant) : Position.fromFen(START_FEN)), fromFen: (f) => Position.fromFen(f), toFen: (s) => s.fen(),
    turn: (s) => (s.side >> 3), pieceAt: (s, sq) => (s.b[sq] ? pc(s.b[sq]) : null),
    legalMoves: (s) => s.legal(), legalFrom: (s, from) => s.legal().filter((m) => (m & 127) === from),
    apply: (s, m) => { const q = s.clone(); q.make(m); return q; },
    moveInfo: (s, m) => { const from = m & 127, to = m >> 7, p = s.b[from], cp = s.b[to]; return { from, to, piece: pc(p), capture: cp ? { sq: to, piece: pc(cp) } : null, promotion: null, resetsClock: !!cp }; },
    effects: (s, m) => { const from = m & 127, to = m >> 7, p = s.b[from], cp = s.b[to]; const e = [{ k: 'move', phase: 0, from, to, piece: pc(p), arc: (p & 7) === N }]; if (cp) e.push({ k: 'capture', phase: 1, sq: to, piece: pc(cp) }); return e; },
    check: (s, side) => { const col = (side === undefined ? s.side >> 3 : side) ? BLACK : RED; const by = checkersOf(s, col); return by.length ? { king: s.ksq[col >> 3], by } : null; },
    status: (s) => { if (s.legal().length === 0) { const chk = s.inCheck(); if (chk) return { over: true, winner: (s.side ^ 8) >> 3, reason: 'checkmate' }; return c.stalemate === 'draw' ? { over: true, winner: null, reason: 'stalemate-draw' } : { over: true, winner: (s.side ^ 8) >> 3, reason: 'stalemate-loss' }; } if (!s.hasAttackers(RED) && !s.hasAttackers(BLACK)) return { over: true, winner: null, reason: 'no-attackers' }; return { over: false }; },
    repetitionVerdict: (w) => { if (c.perpetual !== 'loss') return null; let a = true, b = true; w.plies.forEach((p, i) => { if (i % 2 === 0) { if (!p.check) a = false; } else if (!p.check) b = false; }); if (a && !b) return { over: true, winner: 1 - w.mover, reason: 'perpetual-check' }; if (b && !a) return { over: true, winner: w.mover, reason: 'perpetual-check' }; return null; },
    hash: (s) => [s.lo, s.hi], encode: (m) => moveStr(m), decode: (s, t) => { try { const m = parseMove(t); return s.legal().includes(m) ? m : null; } catch { return null; } },
    notation: (s, m, style) => (style === 'zh' ? notation(s, m) : moveStr(m)), whyIllegal: (s, from, to) => why(s, from, to), value: (s, sq) => (s.b[sq] ? pieceVal(s.b[sq], sq) : 0),
    mirror: (s) => { const q = new Position(); for (let sq = 0; sq < 90; sq++) if (s.b[sq]) q.b[SQ(rowOf(sq), 8 - colOf(sq))] = s.b[sq]; q.side = s.side; q.rehash(); return q; },
  };
  return rules;
}
export const xqFixtures = { fens: [START_FEN, 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR b', handicapFen('knight', BLACK), handicapFen('rook', RED), fenOf({ d1: 'K', a9: 'R', e10: 'k' }, 'w'), fenOf({ e1: 'K', e2: 'R', a9: 'R', d10: 'k' }, 'b'), '3k5/9/9/9/9/9/9/9/4R4/3K5 w'],
  noKing: [fenOf({ a1: 'R', a5: 'p' }, 'w'), fenOf({ b3: 'C', b5: 'P', b9: 'p' }, 'w')], obstacle: null, fenKey: (f) => f.split(' ').slice(0, 2).join(' '),
  perft: [{ fen: START_FEN, counts: [44, 1920, 79666] }], randomGames: 150, maxPly: 90 };
