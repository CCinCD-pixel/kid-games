// adapters/chess.mjs — 国际象棋原型（chess-tools/rules.mjs）→ GameRules 契约。M = 原型着法对象；S = 原型状态（不可变）。
import * as X from './chess-rules.mjs';
X.PIECE.wX = Object.freeze({ color: 'w', type: 'X' }); // 陨石 OBSTACLE（type 99）：原型 PIECE 表是可扩展的
const TYPE = { K: 1, Q: 2, R: 3, B: 4, N: 5, P: 6, X: 99 }, LET = { 1: 'K', 2: 'Q', 3: 'R', 4: 'B', 5: 'N', 6: 'P', 99: 'X' };
const sq = (rc) => rc.r * 8 + rc.c, rc = (s) => ({ r: (s / 8) | 0, c: s % 8 });
const pc = (p) => ({ type: TYPE[p.type], side: p.color === 'w' ? 0 : 1 });
const valMap = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0, X: 0 };
const hashStr = (str) => { let a = 0x811c9dc5, b = 0x9747b28c; for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); a = Math.imul(a ^ ch, 0x01000193); b = Math.imul(b ^ ch, 0x85ebca6b); b ^= b >>> 13; } return [a | 0, b | 0]; };
const legalNoX = (s) => X.legalMoves(s).filter((m) => !(m.captured && m.captured.type === 'X') && !(s.board[m.to.r][m.to.c] && s.board[m.to.r][m.to.c].type === 'X'));
export function chessRules() {
  const geometry = { kind: 'squares', cols: 8, rows: 8, squares: 64, unit: 100, margin: 0.5, viewBox: { w: 900, h: 900 },
    center: (s, o) => { let { r, c } = rc(s); if (o === 'second-bottom') { r = 7 - r; c = 7 - c; } return { x: 100 * (0.5 + c) + 50, y: 100 * (0.5 + r) + 50 }; },
    hit: (x, y, o) => { let c = Math.floor(x / 100 - 0.5), r = Math.floor(y / 100 - 0.5); if (c < 0 || c > 7 || r < 0 || r > 7) return null; if (o === 'second-bottom') { r = 7 - r; c = 7 - c; } return r * 8 + c; },
    name: (s) => X.sqName(rc(s).r, rc(s).c), flip: (s) => 63 - s };
  const kingSq = (s, color) => { const k = X.findKing(s.board, color); return k ? sq(k) : -1; };
  const rules = {
    id: 'chess', geometry, meta: { kingType: 1, repeatN: 3, clockPlies: 100, clockReason: 'fifty-move' },
    initial: () => X.fromFEN(X.START_FEN), fromFen: (f) => X.fromFEN(f), toFen: (s) => X.toFEN(s), turn: (s) => (s.turn === 'w' ? 0 : 1),
    pieceAt: (s, q) => { const p = s.board[rc(q).r][rc(q).c]; return p ? pc(p) : null; },
    legalMoves: (s) => legalNoX(s), legalFrom: (s, from) => legalNoX(s).filter((m) => sq(m.from) === from), apply: (s, m) => X.applyMove(s, m),
    moveInfo: (s, m) => ({ from: sq(m.from), to: sq(m.to), piece: pc(m.piece), capture: m.captured ? { sq: m.enPassant ? m.from.r * 8 + m.to.c : sq(m.to), piece: pc(m.captured) } : null, promotion: m.promotion ? TYPE[m.promotion] : null, resetsClock: m.piece.type === 'P' || !!m.captured }),
    effects: (s, m) => { const e = [{ k: 'move', phase: 0, from: sq(m.from), to: sq(m.to), piece: pc(m.piece), arc: m.piece.type === 'N' }];
      if (m.castling) { const row = m.from.r; const [rf, rt] = m.castling === 'K' ? [7, 5] : [0, 3]; e.push({ k: 'move', phase: 0, from: row * 8 + rf, to: row * 8 + rt, piece: { type: 3, side: m.piece.color === 'w' ? 0 : 1 } }); }
      if (m.captured) e.push({ k: 'capture', phase: 1, sq: m.enPassant ? m.from.r * 8 + m.to.c : sq(m.to), piece: pc(m.captured) });
      if (m.promotion) e.push({ k: 'promote', phase: 1, sq: sq(m.to), from: pc(m.piece), to: { type: TYPE[m.promotion], side: m.piece.color === 'w' ? 0 : 1 } }); return e; },
    check: (s, side) => { const col = (side === undefined ? s.turn : side === 0 ? 'w' : 'b'); const k = X.findKing(s.board, col); if (!k || !X.attacked(s.board, k.r, k.c, X.other(col))) return null;
      const by = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = s.board[r][c]; if (!p || p.color === col) continue; if (X.pseudoMoves(s.board, p.color, { wK: false, wQ: false, bK: false, bQ: false }, null).some((m) => m.from.r === r && m.from.c === c && m.to.r === k.r && m.to.c === k.c)) by.push(r * 8 + c); } return { king: sq(k), by }; },
    status: (s) => { const ms = X.legalMoves(s); if (ms.length === 0) return X.inCheck(s.board, s.turn) ? { over: true, winner: s.turn === 'w' ? 1 : 0, reason: 'checkmate' } : { over: true, winner: null, reason: 'stalemate' }; if (X.insufficient(s.board)) return { over: true, winner: null, reason: 'insufficient' }; return { over: false }; },
    hash: (s) => hashStr(X.repKey(s)), encode: (m) => X.uci(m), decode: (s, t) => X.findUci(s, t),
    notation: (s, m, style) => (style === 'san' ? X.san(s, m) : X.uci(m)),
    clock: (s) => s.halfmove,
    whyIllegal: (s, from, to) => { const ms = X.legalMoves(s).filter((m) => sq(m.from) === from && sq(m.to) === to); if (ms.length) return null; const p = s.board[rc(from).r][rc(from).c]; if (!p || p.color !== s.turn) return 'turn'; const t = s.board[rc(to).r][rc(to).c]; if (t && t.color === p.color) return 'own'; return 'illegal'; },
    value: (s, q) => { const p = s.board[rc(q).r][rc(q).c]; return p ? valMap[p.type] : 0; },
    mirror: (s) => { const f = X.toFEN(s).split(' '); const rows = f[0].split('/').map((row) => [...row].reduce((a, ch) => (/\d/.test(ch) ? a.concat(Array(+ch).fill('.')) : a.concat(ch)), []).reverse().join('').replace(/\.+/g, (d) => d.length)); const ep = f[3] === '-' ? '-' : 'abcdefgh'[7 - 'abcdefgh'.indexOf(f[3][0])] + f[3][1]; return X.fromFEN([rows.join('/'), f[1], '-', ep, f[4], f[5]].join(' ')); },
  };
  return rules;
}
export const chessFixtures = { fens: [X.START_FEN, 'r3k2r/ppp2ppp/b1np1n2/4p3/4P3/2N2N2/PPPP1PPP/R3K2R w KQkq - 0 1', '8/P6k/8/8/8/8/8/K7 w - - 0 1', 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', '7k/8/6K1/8/8/8/8/R7 w - - 99 80', 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1'],
  noKing: ['8/8/8/R3p3/8/8/8/8 w - - 0 1', '8/8/8/8/1N6/8/8/8 w - - 0 1'], obstacle: ['8/8/8/R2X4/8/8/8/4K2k w - - 0 1', '4k3/8/8/8/3X4/8/3P4/4K3 w - - 0 1'], fenKey: (f) => f.split(' ').slice(0, 3).join(' '),
  perft: [{ fen: X.START_FEN, counts: [20, 400, 8902] }, { fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', counts: [48, 2039] }], randomGames: 120, maxPly: 90 };
