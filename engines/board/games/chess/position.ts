// engines/board/games/chess/position.ts — 国际象棋纯规则：原型 rules.mjs 的 1:1 TypeScript 移植（FIDE；8×8；r 自上 0..7 = 第 8..1 横线，c = a..h）。
// 状态不可变；着法 = 对象（from / to / piece / captured + 标记）；易位权只在 applyMove 一处更新；不 import DOM / kit（Worker 可用）。
// 与原型唯一的行为差异：陨石 OBSTACLE（FEN 字母 X）原生处理——挡路、不能被吃、不能被走上、不攻击（原型靠适配器事后过滤，结果相同）。
export type Color = 'w' | 'b';
export type PType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'X';
export type Promo = 'Q' | 'R' | 'B' | 'N';
export interface CPiece { readonly color: Color; readonly type: PType }
export interface RC { readonly r: number; readonly c: number }
export interface CastleRights { readonly wK: boolean; readonly wQ: boolean; readonly bK: boolean; readonly bQ: boolean }
export type Board = readonly (readonly (CPiece | null)[])[];
export interface ChessState { readonly board: Board; readonly turn: Color; readonly castling: CastleRights; readonly ep: RC | null; readonly halfmove: number; readonly fullmove: number }
export interface ChessMove {
  readonly from: RC; readonly to: RC; readonly piece: CPiece; readonly captured: CPiece | null;
  readonly promotion?: Promo; readonly doublePush?: boolean; readonly enPassant?: boolean; readonly castling?: 'K' | 'Q';
}
export type Verdict = { status: 'ongoing' } | { status: 'checkmate'; winner: Color } | { status: 'stalemate' } | { status: 'draw'; reason: 'insufficient' | 'threefold' | 'fifty' };

type Dirs = readonly (readonly [number, number])[];
const KN: Dirs = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG: Dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG: Dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH: Dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const PROMOS: readonly Promo[] = ['Q', 'R', 'B', 'N'];

export const VAL: Readonly<Record<PType, number>> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0, X: 0 };
export const inB = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8;
export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
export const sqName = (r: number, c: number): string => 'abcdefgh'[c] + (8 - r);
export const parseSq = (s: string): RC => ({ r: 8 - Number(s[1]), c: s.charCodeAt(0) - 97 });
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PIECE: Readonly<Record<string, CPiece>> = (() => {
  const t: Record<string, CPiece> = {};
  for (const col of ['w', 'b'] as const) for (const ty of 'KQRBNPX') t[col + ty] = Object.freeze({ color: col, type: ty as PType });
  return t;
})();
/** 陨石（OBSTACLE）：FEN 字母 X（大小写都收），内部固定 color 'w'；不属于任何一方 */
export const OBSTACLE_PIECE = PIECE.wX;

// ───────────────────────── 走法生成 ─────────────────────────
const foe = (t: CPiece | null, color: Color): boolean => t !== null && t.type !== 'X' && t.color !== color;
function step(out: ChessMove[], b: Board, r: number, c: number, tr: number, tc: number, p: CPiece, color: Color): void {
  if (tr < 0 || tr > 7 || tc < 0 || tc > 7) return;
  const t = b[tr][tc];
  if (!t || foe(t, color)) out.push({ from: { r, c }, to: { r: tr, c: tc }, piece: p, captured: t });
}
function slide(out: ChessMove[], b: Board, r: number, c: number, dirs: Dirs, p: CPiece, color: Color): void {
  for (const [dr, dc] of dirs) for (let i = 1; i < 8; i++) {
    const tr = r + dr * i, tc = c + dc * i; if (!inB(tr, tc)) break;
    const t = b[tr][tc]; if (t) { if (foe(t, color)) step(out, b, r, c, tr, tc, p, color); break; }
    step(out, b, r, c, tr, tc, p, color);
  }
}

export function pseudoMoves(b: Board, color: Color, castl: CastleRights, ep: RC | null): ChessMove[] {
  const out: ChessMove[] = [];
  const dir = color === 'w' ? -1 : 1, startRow = color === 'w' ? 6 : 1;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (!p || p.type === 'X' || p.color !== color) continue;
    switch (p.type) {
      case 'P': {
        if (inB(r + dir, c) && !b[r + dir][c]) {
          if (r + dir === 0 || r + dir === 7) for (const pt of PROMOS) out.push({ from: { r, c }, to: { r: r + dir, c }, piece: p, captured: null, promotion: pt });
          else out.push({ from: { r, c }, to: { r: r + dir, c }, piece: p, captured: null });
          if (r === startRow && !b[r + 2 * dir][c]) out.push({ from: { r, c }, to: { r: r + 2 * dir, c }, piece: p, captured: null, doublePush: true });
        }
        for (const dc of [-1, 1]) {
          const tr = r + dir, tc = c + dc; if (!inB(tr, tc)) continue;
          const t = b[tr][tc];
          if (foe(t, color)) {
            if (tr === 0 || tr === 7) for (const pt of PROMOS) out.push({ from: { r, c }, to: { r: tr, c: tc }, piece: p, captured: t, promotion: pt });
            else out.push({ from: { r, c }, to: { r: tr, c: tc }, piece: p, captured: t });
          }
          const side = b[r][tc]; // 过路兵：被吃的是同一横线上的对方兵（手写的非法 ep 格不会产生幽灵着法）
          if (ep && tr === ep.r && tc === ep.c && !t && side && side.type === 'P' && side.color !== color) out.push({ from: { r, c }, to: { r: tr, c: tc }, piece: p, captured: side, enPassant: true });
        }
        break;
      }
      case 'N': for (const [dr, dc] of KN) step(out, b, r, c, r + dr, c + dc, p, color); break;
      case 'B': slide(out, b, r, c, DIAG, p, color); break;
      case 'R': slide(out, b, r, c, ORTH, p, color); break;
      case 'Q': slide(out, b, r, c, DIAG, p, color); slide(out, b, r, c, ORTH, p, color); break;
      case 'K': {
        for (const [dr, dc] of KG) step(out, b, r, c, r + dr, c + dc, p, color);
        const row = color === 'w' ? 7 : 0;
        if (r === row && c === 4) {
          const rk = b[row][7], rq = b[row][0];
          if (castl[color === 'w' ? 'wK' : 'bK'] && !b[row][5] && !b[row][6] && rk && rk.type === 'R' && rk.color === color)
            out.push({ from: { r, c }, to: { r: row, c: 6 }, piece: p, captured: null, castling: 'K' });
          if (castl[color === 'w' ? 'wQ' : 'bQ'] && !b[row][3] && !b[row][2] && !b[row][1] && rq && rq.type === 'R' && rq.color === color)
            out.push({ from: { r, c }, to: { r: row, c: 2 }, piece: p, captured: null, castling: 'Q' });
        }
        break;
      }
    }
  }
  return out;
}

/** 格 (r,c) 是否被 by 方攻击（布尔，热路径） */
export function attacked(b: Board, r: number, c: number, by: Color): boolean {
  for (const [dr, dc] of KN) { const tr = r + dr, tc = c + dc; if (inB(tr, tc)) { const p = b[tr][tc]; if (p && p.color === by && p.type === 'N') return true; } }
  for (const [dr, dc] of KG) { const tr = r + dr, tc = c + dc; if (inB(tr, tc)) { const p = b[tr][tc]; if (p && p.color === by && p.type === 'K') return true; } }
  const pd = by === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) { const tr = r + pd, tc = c + dc; if (inB(tr, tc)) { const p = b[tr][tc]; if (p && p.color === by && p.type === 'P') return true; } }
  for (const [dr, dc] of ORTH) for (let i = 1; i < 8; i++) { const tr = r + dr * i, tc = c + dc * i; if (!inB(tr, tc)) break; const p = b[tr][tc]; if (p) { if (p.color === by && (p.type === 'R' || p.type === 'Q')) return true; break; } }
  for (const [dr, dc] of DIAG) for (let i = 1; i < 8; i++) { const tr = r + dr * i, tc = c + dc * i; if (!inB(tr, tc)) break; const p = b[tr][tc]; if (p) { if (p.color === by && (p.type === 'B' || p.type === 'Q')) return true; break; } }
  return false;
}

/** 攻击格 (r,c) 的 by 方子的格号（r*8+c，升序；含闪击的暗子——暗子本来就在直线上；王 / 兵 / 马 / 滑动子） */
export function attackersOn(b: Board, r: number, c: number, by: Color): number[] {
  const out: number[] = [];
  const hit = (tr: number, tc: number, types: string): boolean => { if (!inB(tr, tc)) return false; const p = b[tr][tc]; if (p && p.color === by && types.includes(p.type)) { out.push(tr * 8 + tc); return true; } return false; };
  for (const [dr, dc] of KN) hit(r + dr, c + dc, 'N');
  for (const [dr, dc] of KG) hit(r + dr, c + dc, 'K');
  const pd = by === 'w' ? 1 : -1;
  hit(r + pd, c - 1, 'P'); hit(r + pd, c + 1, 'P');
  for (const [dr, dc] of ORTH) for (let i = 1; i < 8; i++) { const tr = r + dr * i, tc = c + dc * i; if (!inB(tr, tc)) break; if (b[tr][tc]) { hit(tr, tc, 'RQ'); break; } }
  for (const [dr, dc] of DIAG) for (let i = 1; i < 8; i++) { const tr = r + dr * i, tc = c + dc * i; if (!inB(tr, tc)) break; if (b[tr][tc]) { hit(tr, tc, 'BQ'); break; } }
  return out.sort((x, y) => x - y);
}

export function findKing(b: Board, color: Color): RC | null {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = b[r][c]; if (p && p.color === color && p.type === 'K') return { r, c }; }
  return null;
}
export function inCheck(b: Board, color: Color): boolean { const k = findKing(b, color); return !!k && attacked(b, k.r, k.c, other(color)); }

export function applyOnBoard(b: Board, m: { from: RC; to: RC; piece: CPiece; promotion?: Promo; enPassant?: boolean; castling?: 'K' | 'Q' }): (CPiece | null)[][] {
  const nb = b.map((row) => row.slice()); // 棋子是不可变对象 → 浅拷贝行即可
  nb[m.to.r][m.to.c] = nb[m.from.r][m.from.c];
  nb[m.from.r][m.from.c] = null;
  if (m.enPassant) nb[m.from.r][m.to.c] = null;
  if (m.promotion) nb[m.to.r][m.to.c] = PIECE[m.piece.color + m.promotion];
  if (m.castling) { const row = m.to.r; if (m.castling === 'K') { nb[row][5] = nb[row][7]; nb[row][7] = null; } else { nb[row][3] = nb[row][0]; nb[row][0] = null; } }
  return nb;
}

/** 合法着法 = 伪合法 + 走完后己方王不被攻击；易位另检查"不在将军中、经过的格不被攻击" */
export function legalMovesB(b: Board, color: Color, castl: CastleRights, ep: RC | null): ChessMove[] {
  const out: ChessMove[] = [], en = other(color);
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

// ───────────────────────── 局面 / FEN ─────────────────────────
export function fromFEN(fen: string): ChessState {
  const [pl, turn = 'w', cast = '-', eps = '-', hm = '0', fm = '1'] = fen.trim().split(/\s+/);
  const rows = (pl ?? '').split('/');
  if (rows.length !== 8) throw new Error(`FEN 需要 8 行：${fen}`);
  if (turn !== 'w' && turn !== 'b') throw new Error(`FEN 走子方不对：${fen}`);
  const board: (CPiece | null)[][] = Array.from({ length: 8 }, () => Array<CPiece | null>(8).fill(null));
  rows.forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') { c += +ch; continue; }
      const up = ch.toUpperCase();
      if (!'KQRBNPX'.includes(up) || c > 7) throw new Error(`FEN 第 ${r + 1} 行不对：${fen}`);
      board[r][c++] = up === 'X' ? OBSTACLE_PIECE : PIECE[(ch === up ? 'w' : 'b') + up];
    }
    if (c !== 8) throw new Error(`FEN 第 ${r + 1} 行不是 8 格：${fen}`);
  });
  const ep = eps === '-' ? null : parseSq(eps);
  if (ep && !inB(ep.r, ep.c)) throw new Error(`FEN 过路兵格不对：${fen}`);
  return { board, turn, castling: { wK: cast.includes('K'), wQ: cast.includes('Q'), bK: cast.includes('k'), bQ: cast.includes('q') }, ep, halfmove: Number.isFinite(+hm) ? +hm : 0, fullmove: Number.isFinite(+fm) ? +fm : 1 };
}
export function placement(b: Board): string {
  return b.map((row) => { let s = '', e = 0; for (const p of row) { if (!p) { e++; continue; } if (e) { s += e; e = 0; } s += p.color === 'w' ? p.type : p.type.toLowerCase(); } return s + (e || ''); }).join('/');
}
const rightsStr = (c: CastleRights): string => (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '');
export function toFEN(s: ChessState): string {
  return `${placement(s.board)} ${s.turn} ${rightsStr(s.castling) || '-'} ${s.ep ? sqName(s.ep.r, s.ep.c) : '-'} ${s.halfmove} ${s.fullmove}`;
}
export const legalMoves = (s: ChessState): ChessMove[] => legalMovesB(s.board, s.turn, s.castling, s.ep);

export function applyMove(s: ChessState, m: ChessMove): ChessState {
  const board = applyOnBoard(s.board, m);
  let { wK, wQ, bK, bQ } = s.castling;
  if (m.piece.type === 'K') { if (m.piece.color === 'w') { wK = false; wQ = false; } else { bK = false; bQ = false; } }
  for (const sq of [m.from, m.to]) { // 任何着法的起点或终点是四个角 → 对应一侧没了（含车被吃）
    if (sq.r === 7 && sq.c === 0) wQ = false; if (sq.r === 7 && sq.c === 7) wK = false;
    if (sq.r === 0 && sq.c === 0) bQ = false; if (sq.r === 0 && sq.c === 7) bK = false;
  }
  const ep = m.doublePush ? { r: m.from.r + (m.piece.color === 'w' ? -1 : 1), c: m.from.c } : null;
  const halfmove = m.piece.type === 'P' || m.captured ? 0 : s.halfmove + 1;
  return { board, turn: other(s.turn), castling: { wK, wQ, bK, bQ }, ep, halfmove, fullmove: s.fullmove + (s.turn === 'b' ? 1 : 0) };
}

/** 重复键（FIDE 9.2）：布局 + 走子方 + 易位权 + 仅当过路兵吃法真合法时的 ep 格 */
export function repKey(s: ChessState): string {
  let ep = '-';
  if (s.ep) { const ms = legalMoves(s); if (ms.some((m) => m.enPassant)) ep = sqName(s.ep.r, s.ep.c); }
  return `${placement(s.board)} ${s.turn} ${rightsStr(s.castling)} ${ep}`;
}

/** 子力不足（裁判与 lichess 自动判和的子集）：K 对 K、K+单个轻子 对 K、只剩王和同色格的象 */
export function insufficient(b: Board): boolean {
  const minors: { type: PType; sqc: number }[] = []; let others = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c]; if (!p || p.type === 'K') continue;
    if (p.type === 'B' || p.type === 'N') minors.push({ type: p.type, sqc: (r + c) & 1 }); else others++;
  }
  if (others) return false;
  if (minors.length <= 1) return true;
  return minors.every((m) => m.type === 'B') && minors.every((m) => m.sqc === minors[0].sqc);
}

/** 原型的 result()：一次性判定（将死 / 逼和 / 子力不足 / 三次重复 / 五十回合）。引擎里重复与限着归 Game，这个只给工具与对拍用 */
export function result(s: ChessState, repCounts?: ReadonlyMap<string, number>): Verdict {
  const ms = legalMoves(s);
  if (ms.length === 0) return inCheck(s.board, s.turn) ? { status: 'checkmate', winner: other(s.turn) } : { status: 'stalemate' };
  if (insufficient(s.board)) return { status: 'draw', reason: 'insufficient' };
  if (repCounts && (repCounts.get(repKey(s)) || 0) >= 3) return { status: 'draw', reason: 'threefold' };
  if (s.halfmove >= 100) return { status: 'draw', reason: 'fifty' };
  return { status: 'ongoing' };
}

export function perft(s: ChessState, d: number): number {
  if (d === 0) return 1;
  const ms = legalMoves(s);
  if (d === 1) return ms.length;
  let n = 0; for (const m of ms) n += perft(applyMove(s, m), d - 1); return n;
}

// ───────────────────────── 记谱 ─────────────────────────
export function uci(m: ChessMove): string { return sqName(m.from.r, m.from.c) + sqName(m.to.r, m.to.c) + (m.promotion ? m.promotion.toLowerCase() : ''); }
export function findUci(s: ChessState, u: string): ChessMove | null { return legalMoves(s).find((m) => uci(m) === u) ?? null; }
export function san(s: ChessState, m: ChessMove): string {
  if (m.castling) return m.castling === 'K' ? 'O-O' : 'O-O-O';
  let out = '';
  if (m.piece.type === 'P') { if (m.captured) out = 'abcdefgh'[m.from.c] + 'x'; }
  else {
    out = m.piece.type;
    const amb = legalMoves(s).filter((o) => o.piece.type === m.piece.type && o.to.r === m.to.r && o.to.c === m.to.c && (o.from.r !== m.from.r || o.from.c !== m.from.c));
    if (amb.length) {
      const sameF = amb.some((o) => o.from.c === m.from.c), sameR = amb.some((o) => o.from.r === m.from.r);
      out += !sameF ? 'abcdefgh'[m.from.c] : !sameR ? String(8 - m.from.r) : sqName(m.from.r, m.from.c);
    }
    if (m.captured) out += 'x';
  }
  out += sqName(m.to.r, m.to.c);
  if (m.promotion) out += '=' + m.promotion;
  const ns = applyMove(s, m);
  if (inCheck(ns.board, ns.turn)) out += legalMoves(ns).length ? '+' : '#';
  return out;
}

/** 镜像 FEN（课孪生）：mode 'h' = 左右翻转（丢易位权）；mode 'c' = 黑白互换（上下翻转 + 换颜色 + 换走子方） */
export function mirrorFEN(fen: string, mode: 'h' | 'c'): string {
  const s = fromFEN(fen);
  if (mode === 'h') {
    const board = s.board.map((row) => row.slice().reverse());
    return toFEN({ ...s, board, ep: s.ep ? { r: s.ep.r, c: 7 - s.ep.c } : null, castling: { wK: false, wQ: false, bK: false, bQ: false } });
  }
  const board = Array.from({ length: 8 }, (_, r) => s.board[7 - r].map((p) => (p && p.type !== 'X' ? PIECE[other(p.color) + p.type] : p)));
  const c = s.castling;
  return toFEN({ board, turn: other(s.turn), castling: { wK: c.bK, wQ: c.bQ, bK: c.wK, bQ: c.wQ }, ep: s.ep ? { r: 7 - s.ep.r, c: s.ep.c } : null, halfmove: s.halfmove, fullmove: s.fullmove });
}

// ───────────────────────── whyIllegal ─────────────────────────
// 全函数分类（board-engine C10：null ⇔ 存在 from→to 的合法着法；否则非空原因键）。键 = 旁白 `w.*` 的 id（别名见 reasons.ts）。
export const WHY_KEYS = ['noPiece', 'turn', 'own', 'block', 'shapeR', 'shapeB', 'shapeN', 'shapeQ', 'shapeK', 'shapeP', 'bishopColor', 'pawnBack', 'pawnStraight', 'pawnDouble', 'pawnDiag', 'kingDanger', 'kingsTouch', 'pinned', 'stillCheck', 'castleMoved', 'castleBetween', 'castleCheck', 'castleThrough'] as const;
export type WhyKey = (typeof WHY_KEYS)[number];
export function whyIllegal(s: ChessState, from: RC, to: RC, legal: readonly ChessMove[] = legalMoves(s)): WhyKey | null {
  if (legal.some((m) => m.from.r === from.r && m.from.c === from.c && m.to.r === to.r && m.to.c === to.c)) return null;
  const b = s.board, p = b[from.r][from.c];
  if (!p || p.type === 'X') return 'noPiece';
  if (p.color !== s.turn) return 'turn';
  const t = b[to.r][to.c], col = p.color, en = other(col);
  const dr = to.r - from.r, dc = to.c - from.c, adr = Math.abs(dr), adc = Math.abs(dc);
  if (t && t.type === 'X') return 'block';
  const castleGeo = p.type === 'K' && dr === 0 && adc === 2 && from.r === (col === 'w' ? 7 : 0) && from.c === 4;
  if (t && t.color === col && !castleGeo) return 'own';
  const between = (): boolean => { const sr = Math.sign(dr), sc = Math.sign(dc); for (let r = from.r + sr, c = from.c + sc; r !== to.r || c !== to.c; r += sr, c += sc) if (b[r][c]) return true; return false; };
  const line = (dr === 0 || dc === 0) && (dr !== 0 || dc !== 0), diag = adr === adc && adr > 0;
  switch (p.type) {
    case 'R': if (!line) return 'shapeR'; if (between()) return 'block'; break;
    case 'B': if (!diag) return ((from.r + from.c) & 1) !== ((to.r + to.c) & 1) ? 'bishopColor' : 'shapeB'; if (between()) return 'block'; break;
    case 'Q': if (!line && !diag) return 'shapeQ'; if (between()) return 'block'; break;
    case 'N': if (!((adr === 1 && adc === 2) || (adr === 2 && adc === 1))) return 'shapeN'; break;
    case 'P': {
      const dir = col === 'w' ? -1 : 1, startRow = col === 'w' ? 6 : 1;
      if (dr === -dir && adc <= 1) return 'pawnBack';
      if (dr === 0 || adr > 2 || adc > 1 || (adr === 2 && adc !== 0)) return 'shapeP';
      if (dc === 0 && dr === dir) { if (t) return 'pawnStraight'; break; }
      if (dc === 0 && dr === 2 * dir) { if (from.r !== startRow) return 'pawnDouble'; if (t || b[from.r + dir][from.c]) return 'pawnStraight'; break; }
      if (adc === 1 && dr === dir) { if (t) break; if (s.ep && s.ep.r === to.r && s.ep.c === to.c) break; return 'pawnDiag'; }
      return 'shapeP';
    }
    case 'K': {
      if (adr <= 1 && adc <= 1 && (adr || adc)) {
        const nb = applyOnBoard(b, { from, to, piece: p }); const k = findKing(nb, col);
        if (k && attacked(nb, k.r, k.c, en)) { const ek = findKing(nb, en); return ek && Math.max(Math.abs(ek.r - k.r), Math.abs(ek.c - k.c)) <= 1 ? 'kingsTouch' : 'kingDanger'; }
        break;
      }
      const row = col === 'w' ? 7 : 0;
      if (dr === 0 && adc === 2 && from.r === row && from.c === 4) {
        const side = dc > 0 ? 'K' : 'Q', rookC = dc > 0 ? 7 : 0, rk = b[row][rookC];
        if (!s.castling[(col + side) as keyof CastleRights] || !rk || rk.type !== 'R' || rk.color !== col) return 'castleMoved';
        const gap = dc > 0 ? [5, 6] : [3, 2, 1]; if (gap.some((c) => b[row][c])) return 'castleBetween';
        if (inCheck(b, col)) return 'castleCheck';
        const pass = dc > 0 ? [5, 6] : [3, 2]; if (pass.some((c) => attacked(b, row, c, en))) return 'castleThrough';
        break;
      }
      return 'shapeK';
    }
  }
  // 几何与阻挡都没问题 → 只剩"走完己方王被攻击"
  return inCheck(b, col) ? 'stillCheck' : 'pinned';
}
