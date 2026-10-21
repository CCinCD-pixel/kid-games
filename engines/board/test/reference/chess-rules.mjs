// rules.mjs — prototype of engines/board/chess/rules.ts
// Move generation is a faithful port of the perft-verified engine in main:chess/index.html
// (getPseudoMoves / isSquareAttacked / applyMoveOnBoard / getLegalMoves, lines 709-943).
// Additions: immutable State, FEN in/out, castling-rights update in ONE place (the old minimax
// forgot rook captures), halfmove clock, repetition key, draw rules, SAN, perft.
// Board: 8x8, row 0 = rank 8, col 0 = file a. Piece = {color:'w'|'b', type:'K'|'Q'|'R'|'B'|'N'|'P'}.

export const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
const KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KG = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ORTH = [[-1,0],[1,0],[0,-1],[0,1]];
export const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const other = (c) => (c === 'w' ? 'b' : 'w');
export const sqName = (r, c) => 'abcdefgh'[c] + (8 - r);
export const parseSq = (s) => ({ r: 8 - Number(s[1]), c: s.charCodeAt(0) - 97 });

export function pseudoMoves(b, color, castl, ep) {
  const moves = [];
  const dir = color === 'w' ? -1 : 1, startRow = color === 'w' ? 6 : 1;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (!p || p.color !== color) continue;
    const add = (tr, tc, f) => {
      if (!inB(tr, tc)) return;
      const t = b[tr][tc];
      if (!t || t.color !== color) moves.push({ from: { r, c }, to: { r: tr, c: tc }, piece: p, captured: t, ...f });
    };
    const slide = (dirs) => { for (const [dr, dc] of dirs) for (let i = 1; i < 8; i++) {
      const tr = r + dr * i, tc = c + dc * i; if (!inB(tr, tc)) break;
      const t = b[tr][tc]; if (t) { if (t.color !== color) add(tr, tc); break; } add(tr, tc); } };
    switch (p.type) {
      case 'P': {
        if (inB(r + dir, c) && !b[r + dir][c]) {
          if (r + dir === 0 || r + dir === 7) for (const pt of 'QRBN') moves.push({ from: { r, c }, to: { r: r + dir, c }, piece: p, captured: null, promotion: pt });
          else moves.push({ from: { r, c }, to: { r: r + dir, c }, piece: p, captured: null });
          if (r === startRow && !b[r + 2 * dir][c]) moves.push({ from: { r, c }, to: { r: r + 2 * dir, c }, piece: p, captured: null, doublePush: true });
        }
        for (const dc of [-1, 1]) {
          const tr = r + dir, tc = c + dc; if (!inB(tr, tc)) continue;
          const t = b[tr][tc];
          if (t && t.color !== color) {
            if (tr === 0 || tr === 7) for (const pt of 'QRBN') moves.push({ from: { r, c }, to: { r: tr, c: tc }, piece: p, captured: t, promotion: pt });
            else moves.push({ from: { r, c }, to: { r: tr, c: tc }, piece: p, captured: t });
          }
          if (ep && tr === ep.r && tc === ep.c) moves.push({ from: { r, c }, to: { r: tr, c: tc }, piece: p, captured: b[r][tc], enPassant: true });
        }
        break;
      }
      case 'N': for (const [dr, dc] of KN) add(r + dr, c + dc); break;
      case 'B': slide(DIAG); break;
      case 'R': slide(ORTH); break;
      case 'Q': slide(DIAG); slide(ORTH); break;
      case 'K': {
        for (const [dr, dc] of KG) add(r + dr, c + dc);
        const row = color === 'w' ? 7 : 0;
        if (r === row && c === 4) {
          if (castl[color + 'K'] && !b[row][5] && !b[row][6] && b[row][7] && b[row][7].type === 'R' && b[row][7].color === color)
            moves.push({ from: { r, c }, to: { r: row, c: 6 }, piece: p, captured: null, castling: 'K' });
          if (castl[color + 'Q'] && !b[row][3] && !b[row][2] && !b[row][1] && b[row][0] && b[row][0].type === 'R' && b[row][0].color === color)
            moves.push({ from: { r, c }, to: { r: row, c: 2 }, piece: p, captured: null, castling: 'Q' });
        }
      }
    }
  }
  return moves;
}

export function attacked(b, r, c, by) {
  for (const [dr, dc] of KN) { const tr = r + dr, tc = c + dc; if (inB(tr, tc)) { const p = b[tr][tc]; if (p && p.color === by && p.type === 'N') return true; } }
  for (const [dr, dc] of KG) { const tr = r + dr, tc = c + dc; if (inB(tr, tc)) { const p = b[tr][tc]; if (p && p.color === by && p.type === 'K') return true; } }
  const pd = by === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) { const tr = r + pd, tc = c + dc; if (inB(tr, tc)) { const p = b[tr][tc]; if (p && p.color === by && p.type === 'P') return true; } }
  for (const [dr, dc] of ORTH) for (let i = 1; i < 8; i++) { const tr = r + dr * i, tc = c + dc * i; if (!inB(tr, tc)) break; const p = b[tr][tc]; if (p) { if (p.color === by && (p.type === 'R' || p.type === 'Q')) return true; break; } }
  for (const [dr, dc] of DIAG) for (let i = 1; i < 8; i++) { const tr = r + dr * i, tc = c + dc * i; if (!inB(tr, tc)) break; const p = b[tr][tc]; if (p) { if (p.color === by && (p.type === 'B' || p.type === 'Q')) return true; break; } }
  return false;
}

export function findKing(b, color) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = b[r][c]; if (p && p.color === color && p.type === 'K') return { r, c }; }
  return null;
}
export function inCheck(b, color) { const k = findKing(b, color); return !!k && attacked(b, k.r, k.c, other(color)); }

export function applyOnBoard(b, m) {
  const nb = b.map((row) => row.slice()); // pieces are immutable objects → shallow row copy is enough
  nb[m.to.r][m.to.c] = nb[m.from.r][m.from.c];
  nb[m.from.r][m.from.c] = null;
  if (m.enPassant) nb[m.from.r][m.to.c] = null;
  if (m.promotion) nb[m.to.r][m.to.c] = PIECE[m.piece.color + m.promotion];
  if (m.castling) { const row = m.to.r; if (m.castling === 'K') { nb[row][5] = nb[row][7]; nb[row][7] = null; } else { nb[row][3] = nb[row][0]; nb[row][0] = null; } }
  return nb;
}

export const PIECE = {};
for (const col of 'wb') for (const t of 'KQRBNP') PIECE[col + t] = Object.freeze({ color: col, type: t });

export function legalMovesB(b, color, castl, ep) {
  const out = [], en = other(color);
  for (const m of pseudoMoves(b, color, castl, ep)) {
    if (m.castling) {
      if (inCheck(b, color)) continue;
      const row = m.from.r;
      if (m.castling === 'K') { if (attacked(b, row, 5, en) || attacked(b, row, 6, en)) continue; }
      else if (attacked(b, row, 3, en) || attacked(b, row, 2, en)) continue;
    }
    if (!inCheck(applyOnBoard(b, m), color)) out.push(m);
  }
  return out;
}

// ---------- State ----------
export function fromFEN(fen) {
  const [pl, turn, cast = '-', eps = '-', hm = '0', fm = '1'] = fen.trim().split(/\s+/);
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  pl.split('/').forEach((row, r) => { let c = 0; for (const ch of row) { if (/\d/.test(ch)) c += +ch; else { const col = ch === ch.toUpperCase() ? 'w' : 'b'; board[r][c++] = PIECE[col + ch.toUpperCase()]; } } });
  return { board, turn, castling: { wK: cast.includes('K'), wQ: cast.includes('Q'), bK: cast.includes('k'), bQ: cast.includes('q') }, ep: eps === '-' ? null : parseSq(eps), halfmove: +hm, fullmove: +fm };
}
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export function placement(b) {
  return b.map((row) => { let s = '', e = 0; for (const p of row) { if (!p) { e++; continue; } if (e) { s += e; e = 0; } s += p.color === 'w' ? p.type : p.type.toLowerCase(); } return s + (e || ''); }).join('/');
}
export function toFEN(s) {
  const c = s.castling, cs = (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '');
  return `${placement(s.board)} ${s.turn} ${cs || '-'} ${s.ep ? sqName(s.ep.r, s.ep.c) : '-'} ${s.halfmove} ${s.fullmove}`;
}
export const legalMoves = (s) => legalMovesB(s.board, s.turn, s.castling, s.ep);

export function applyMove(s, m) {
  const board = applyOnBoard(s.board, m);
  const castling = { ...s.castling };
  if (m.piece.type === 'K') { castling[m.piece.color + 'K'] = false; castling[m.piece.color + 'Q'] = false; }
  for (const sq of [m.from, m.to]) {
    if (sq.r === 7 && sq.c === 0) castling.wQ = false; if (sq.r === 7 && sq.c === 7) castling.wK = false;
    if (sq.r === 0 && sq.c === 0) castling.bQ = false; if (sq.r === 0 && sq.c === 7) castling.bK = false;
  }
  const ep = m.doublePush ? { r: m.from.r + (m.piece.color === 'w' ? -1 : 1), c: m.from.c } : null;
  const halfmove = m.piece.type === 'P' || m.captured ? 0 : s.halfmove + 1;
  return { board, turn: other(s.turn), castling, ep, halfmove, fullmove: s.fullmove + (s.turn === 'b' ? 1 : 0) };
}

// Repetition key (FIDE 9.2): placement + side + castling + ep ONLY if an ep capture is legal.
export function repKey(s) {
  let ep = '-';
  if (s.ep) { const ms = legalMoves(s); if (ms.some((m) => m.enPassant)) ep = sqName(s.ep.r, s.ep.c); }
  const c = s.castling;
  return `${placement(s.board)} ${s.turn} ${(c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '')} ${ep}`;
}

// Dead position subset that FIDE arbiters & lichess auto-claim: K v K, K+minor v K, K+B v K+B same colour bishops.
export function insufficient(b) {
  const minors = []; let other_ = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = b[r][c]; if (!p || p.type === 'K') continue;
    if (p.type === 'B' || p.type === 'N') minors.push({ ...p, sqc: (r + c) & 1 }); else other_++; }
  if (other_) return false;
  if (minors.length <= 1) return true;
  if (minors.every((m) => m.type === 'B') && minors.every((m) => m.sqc === minors[0].sqc)) return true; // all bishops on one colour
  return false;
}

// result(state, history repKeys) → {status:'ongoing'|'checkmate'|'stalemate'|'draw', reason?, winner?}
// Kid-app policy: threefold and 50-move are AUTOMATIC (no claim UI): threefold = 3rd occurrence; 50-move = halfmove>=100
// (unless the move that reaches 100 delivers mate — mate wins, checked first).
export function result(s, repCounts) {
  const ms = legalMoves(s);
  if (ms.length === 0) return inCheck(s.board, s.turn) ? { status: 'checkmate', winner: other(s.turn) } : { status: 'stalemate' };
  if (insufficient(s.board)) return { status: 'draw', reason: 'insufficient' };
  if (repCounts && (repCounts.get(repKey(s)) || 0) >= 3) return { status: 'draw', reason: 'threefold' };
  if (s.halfmove >= 100) return { status: 'draw', reason: 'fifty' };
  return { status: 'ongoing' };
}

export function perft(s, d) {
  if (d === 0) return 1;
  const ms = legalMoves(s);
  if (d === 1) return ms.length;
  let n = 0; for (const m of ms) n += perft(applyMove(s, m), d - 1); return n;
}

// SAN for logs / parent page / puzzle data
export function san(s, m) {
  if (m.castling) return m.castling === 'K' ? 'O-O' : 'O-O-O';
  let out = '';
  if (m.piece.type === 'P') { if (m.captured) out = 'abcdefgh'[m.from.c] + 'x'; }
  else {
    out = m.piece.type;
    const amb = legalMoves(s).filter((o) => o.piece.type === m.piece.type && o.to.r === m.to.r && o.to.c === m.to.c && (o.from.r !== m.from.r || o.from.c !== m.from.c));
    if (amb.length) { const sameF = amb.some((o) => o.from.c === m.from.c), sameR = amb.some((o) => o.from.r === m.from.r);
      out += !sameF ? 'abcdefgh'[m.from.c] : !sameR ? String(8 - m.from.r) : sqName(m.from.r, m.from.c); }
    if (m.captured) out += 'x';
  }
  out += sqName(m.to.r, m.to.c);
  if (m.promotion) out += '=' + m.promotion;
  const ns = applyMove(s, m);
  if (inCheck(ns.board, ns.turn)) out += legalMoves(ns).length ? '+' : '#';
  return out;
}
export function uci(m) { return sqName(m.from.r, m.from.c) + sqName(m.to.r, m.to.c) + (m.promotion ? m.promotion.toLowerCase() : ''); }
export function findUci(s, u) { return legalMoves(s).find((m) => uci(m) === u) || null; }
export function mirrorFEN(fen, mode) {
  // mode 'h': flip files a<->h (only valid without castling rights). Used for twin puzzles.
  const s = fromFEN(fen);
  if (mode === 'h') {
    const b = s.board.map((row) => row.slice().reverse());
    const ep = s.ep ? { r: s.ep.r, c: 7 - s.ep.c } : null;
    return toFEN({ ...s, board: b, ep, castling: { wK: false, wQ: false, bK: false, bQ: false } });
  }
  // mode 'c': swap colours (flip ranks + invert colour + side to move)
  const b = Array.from({ length: 8 }, (_, r) => s.board[7 - r].map((p) => (p ? PIECE[other(p.color) + p.type] : null)));
  const c = s.castling;
  return toFEN({ board: b, turn: other(s.turn), castling: { wK: c.bK, wQ: c.bQ, bK: c.wK, bQ: c.wQ }, ep: s.ep ? { r: 7 - s.ep.r, c: s.ep.c } : null, halfmove: s.halfmove, fullmove: s.fullmove });
}
