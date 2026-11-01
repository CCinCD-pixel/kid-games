// site/xiangqi/src/rules/position.ts — 中国象棋局面与走法生成（原型 xiangqi-tools/rules.mjs 的 1:1 TS 移植；零依赖、无 DOM，页面 / Worker / vitest 共用同一份）。
// 棋盘：90 格数组 sq = r*9 + c；r=0 是最上（黑方底线），r=9 是最下（红方底线）；c=0 是屏幕最左。红方在下。
// 棋子：type 1..7 = 将/帅 仕 相 马 车 炮 兵，| 8 为黑。0 = 空。着法 = from | (to << 7)。
export const RED = 0, BLACK = 8;
export const K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;
export const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
const CH: Record<string, number> = { K: 1, A: 2, B: 3, N: 4, R: 5, C: 6, P: 7 };
const LETTER = ' KABNRCP';
export const NAME_RED = ' 帅仕相马车炮兵', NAME_BLACK = ' 将士象马车炮卒';
export const rowOf = (s: number): number => (s / 9) | 0;
export const colOf = (s: number): number => s % 9;
export const SQ = (r: number, c: number): number => r * 9 + c;

// ---------- 预计算表 ----------
const inB = (r: number, c: number): boolean => r >= 0 && r < 10 && c >= 0 && c < 9;
const inPalace = (col: number, r: number, c: number): boolean => c >= 3 && c <= 5 && (col === RED ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
const ownHalf = (col: number, r: number): boolean => (col === RED ? r >= 5 : r <= 4);
export const T = {
  king: [[], []] as number[][][], adv: [[], []] as number[][][], bishop: [[], []] as number[][][][], knight: [] as number[][][], rays: [] as number[][][],
  pawn: [[], []] as number[][][], knightFrom: [] as number[][][], pawnFrom: [[], []] as number[][][],
};
for (let s = 0; s < 90; s++) {
  const r = rowOf(s), c = colOf(s);
  for (const ci of [0, 1]) {
    const col = ci * 8;
    T.king[ci][s] = []; T.adv[ci][s] = []; T.bishop[ci][s] = []; T.pawn[ci][s] = []; T.pawnFrom[ci][s] = [];
    if (inPalace(col, r, c)) {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inPalace(col, r + dr, c + dc)) T.king[ci][s].push(SQ(r + dr, c + dc));
      for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (inPalace(col, r + dr, c + dc)) T.adv[ci][s].push(SQ(r + dr, c + dc));
    }
    if (ownHalf(col, r)) {
      for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
        const rr = r + dr, cc = c + dc;
        if (inB(rr, cc) && ownHalf(col, rr)) T.bishop[ci][s].push([SQ(rr, cc), SQ(r + dr / 2, c + dc / 2)]);
      }
    }
    const fwd = col === RED ? -1 : 1, crossed = col === RED ? r <= 4 : r >= 5;
    if (inB(r + fwd, c)) T.pawn[ci][s].push(SQ(r + fwd, c));
    if (crossed) { if (c > 0) T.pawn[ci][s].push(SQ(r, c - 1)); if (c < 8) T.pawn[ci][s].push(SQ(r, c + 1)); }
  }
  T.knight[s] = [];
  for (const [dr, dc] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
    const rr = r + dr, cc = c + dc; if (!inB(rr, cc)) continue;
    const leg = Math.abs(dr) === 2 ? SQ(r + Math.sign(dr), c) : SQ(r, c + Math.sign(dc));
    T.knight[s].push([SQ(rr, cc), leg]);
  }
  T.rays[s] = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dr, dc]) => { const a: number[] = []; let rr = r + dr, cc = c + dc; while (inB(rr, cc)) { a.push(SQ(rr, cc)); rr += dr; cc += dc; } return a; });
  T.knightFrom[s] = []; T.pawnFrom[0][s] = []; T.pawnFrom[1][s] = [];
}
for (let s = 0; s < 90; s++) {
  for (const [d, leg] of T.knight[s]) T.knightFrom[d].push([s, leg]);
  for (const ci of [0, 1]) for (const d of T.pawn[ci][s]) T.pawnFrom[ci][d].push(s);
}

// ---------- Zobrist（两个 Int32，同原型种子）----------
function mulberry32(seed: number): () => number { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t ^ (t >>> 14)) >>> 0; }; }
const zr = mulberry32(0x5eed1234);
const ZLO: Int32Array[] = [], ZHI: Int32Array[] = [];
for (let p = 0; p < 16; p++) { ZLO[p] = new Int32Array(90); ZHI[p] = new Int32Array(90); for (let s = 0; s < 90; s++) { ZLO[p][s] = zr() | 0; ZHI[p][s] = zr() | 0; } }
const SIDE_LO = zr() | 0, SIDE_HI = zr() | 0;

// ---------- 局面 ----------
export class Position {
  b = new Int8Array(90); side = RED; ksq: [number, number] = [-1, -1]; lo = 0; hi = 0;
  private sp = 0; private stM = new Int32Array(1024); private stCap = new Int8Array(1024); private stLo = new Int32Array(1024); private stHi = new Int32Array(1024);
  static fromFen(fen: string): Position {
    const pos = new Position(); const [bd, side] = fen.trim().split(/\s+/);
    const rows = bd.split('/'); if (rows.length !== 10) throw new Error('fen rows');
    rows.forEach((row, r) => { let c = 0; for (const ch of row) { if (/\d/.test(ch)) c += +ch; else { const t = CH[ch.toUpperCase()]; if (!t) throw new Error('fen char ' + ch); pos.b[SQ(r, c)] = t | (ch === ch.toUpperCase() ? RED : BLACK); c++; } } if (c !== 9) throw new Error('fen cols row ' + r); });
    pos.side = side === 'b' ? BLACK : RED; pos.rehash(); return pos;
  }
  static start(): Position { return Position.fromFen(START_FEN); }
  clone(): Position { const p = new Position(); p.b.set(this.b); p.side = this.side; p.ksq = [this.ksq[0], this.ksq[1]]; p.lo = this.lo; p.hi = this.hi; return p; }
  rehash(): void {
    this.ksq = [-1, -1]; this.lo = 0; this.hi = 0;
    for (let s = 0; s < 90; s++) { const p = this.b[s]; if (!p) continue; if ((p & 7) === K) this.ksq[p >> 3] = s; this.lo ^= ZLO[p][s]; this.hi ^= ZHI[p][s]; }
    if (this.side === BLACK) { this.lo ^= SIDE_LO; this.hi ^= SIDE_HI; }
  }
  fen(): string {
    const out: string[] = [];
    for (let r = 0; r < 10; r++) { let row = '', e = 0; for (let c = 0; c < 9; c++) { const p = this.b[SQ(r, c)]; if (!p) e++; else { if (e) { row += e; e = 0; } const ch = LETTER[p & 7]; row += p & 8 ? ch.toLowerCase() : ch; } } if (e) row += e; out.push(row); }
    return out.join('/') + ' ' + (this.side === RED ? 'w' : 'b');
  }
  key(): string { return this.lo + ':' + this.hi; }
  // ----- 走子 -----
  make(m: number): void {
    const from = m & 127, to = m >> 7, b = this.b, p = b[from], cap = b[to], i = this.sp++;
    this.stM[i] = m; this.stCap[i] = cap; this.stLo[i] = this.lo; this.stHi[i] = this.hi;
    b[to] = p; b[from] = 0;
    if ((p & 7) === K) this.ksq[p >> 3] = to;
    let lo = this.lo ^ ZLO[p][from] ^ ZLO[p][to] ^ SIDE_LO, hi = this.hi ^ ZHI[p][from] ^ ZHI[p][to] ^ SIDE_HI;
    if (cap) { lo ^= ZLO[cap][to]; hi ^= ZHI[cap][to]; }
    this.lo = lo; this.hi = hi; this.side ^= 8;
  }
  unmake(): void {
    const i = --this.sp, m = this.stM[i], from = m & 127, to = m >> 7, b = this.b, p = b[to];
    b[from] = p; b[to] = this.stCap[i]; this.lo = this.stLo[i]; this.hi = this.stHi[i]; this.side ^= 8;
    if ((p & 7) === K) this.ksq[p >> 3] = from;
  }
  // ----- 攻击判断 -----
  /** 格 s 是否被 by 方（0/8）攻击（车炮马兵；将帅对面另算） */
  attacked(s: number, by: number): boolean {
    const b = this.b, rays = T.rays[s];
    for (let d = 0; d < 4; d++) {
      const ray = rays[d]; let screen = false;
      for (let i = 0; i < ray.length; i++) {
        const p = b[ray[i]]; if (!p) continue;
        if (!screen) { if ((p & 8) === by && (p & 7) === R) return true; screen = true; }
        else { if ((p & 8) === by && (p & 7) === C) return true; break; }
      }
    }
    const kn = T.knightFrom[s]; for (let i = 0; i < kn.length; i++) if (b[kn[i][0]] === (by | N) && !b[kn[i][1]]) return true;
    const pf = T.pawnFrom[by >> 3][s]; for (let i = 0; i < pf.length; i++) if (b[pf[i]] === (by | P)) return true;
    return false;
  }
  /** 攻击格 s 的 by 方棋子（车炮马兵；不含将帅对面） */
  attackers(s: number, by: number): number[] {
    const out: number[] = [], b = this.b, rays = T.rays[s];
    for (let d = 0; d < 4; d++) {
      const ray = rays[d]; let screen = false;
      for (let i = 0; i < ray.length; i++) {
        const q = ray[i], p = b[q]; if (!p) continue;
        if (!screen) { if ((p & 8) === by && (p & 7) === R) out.push(q); screen = true; }
        else { if ((p & 8) === by && (p & 7) === C) out.push(q); break; }
      }
    }
    for (const [from, leg] of T.knightFrom[s]) if (b[from] === (by | N) && !b[leg]) out.push(from);
    for (const f of T.pawnFrom[by >> 3][s]) if (b[f] === (by | P)) out.push(f);
    return out;
  }
  facing(): boolean {
    const a = this.ksq[0], c = this.ksq[1]; if (a < 0 || c < 0 || a % 9 !== c % 9) return false;
    for (let i = c + 9; i < a; i += 9) if (this.b[i]) return false;
    return true;
  }
  /** color 方是否被将军（含将帅对面） */
  inCheck(color: number = this.side): boolean {
    const k = this.ksq[color >> 3]; if (k < 0) return false;
    return this.attacked(k, color ^ 8) || this.facing();
  }
  /** 将军 color 方的所有子（含对面的将） */
  checkersOf(color: number): number[] {
    const k = this.ksq[color >> 3]; if (k < 0) return [];
    const by = this.attackers(k, color ^ 8); if (this.facing()) by.push(this.ksq[(color ^ 8) >> 3]); return by;
  }
  // ----- 走法生成 -----
  pseudo(capsOnly = false): number[] {
    const out: number[] = [], b = this.b, side = this.side, si = side >> 3;
    const ok = (q: number): boolean => (capsOnly ? q !== 0 && (q & 8) !== side : q === 0 || (q & 8) !== side);
    for (let s = 0; s < 90; s++) {
      const p = b[s]; if (!p || (p & 8) !== side) continue;
      switch (p & 7) {
        case K: for (const d of T.king[si][s]) if (ok(b[d])) out.push(s | (d << 7)); break;
        case A: for (const d of T.adv[si][s]) if (ok(b[d])) out.push(s | (d << 7)); break;
        case B: for (const [d, eye] of T.bishop[si][s] as unknown as number[][]) { if (b[eye]) continue; if (ok(b[d])) out.push(s | (d << 7)); } break;
        case N: for (const [d, leg] of T.knight[s]) { if (b[leg]) continue; if (ok(b[d])) out.push(s | (d << 7)); } break;
        case P: for (const d of T.pawn[si][s]) if (ok(b[d])) out.push(s | (d << 7)); break;
        case R: for (const ray of T.rays[s]) for (let i = 0; i < ray.length; i++) { const d = ray[i], q = b[d]; if (!q) { if (!capsOnly) out.push(s | (d << 7)); } else { if ((q & 8) !== side) out.push(s | (d << 7)); break; } } break;
        case C: for (const ray of T.rays[s]) {
          let i = 0; for (; i < ray.length; i++) { const d = ray[i]; if (!b[d]) { if (!capsOnly) out.push(s | (d << 7)); } else break; }
          for (i++; i < ray.length; i++) { const d = ray[i], q = b[d]; if (q) { if ((q & 8) !== side) out.push(s | (d << 7)); break; } }
        } break;
      }
    }
    return out;
  }
  /** 合法着法（不能自己被将军、不能将帅对面）。没有将/帅的教学局面不做将军过滤。 */
  legal(capsOnly = false): number[] {
    const ps = this.pseudo(capsOnly), out: number[] = [], side = this.side, ki = side >> 3;
    if (this.ksq[ki] < 0) return ps;
    for (let i = 0; i < ps.length; i++) { this.make(ps[i]); const bad = this.attacked(this.ksq[ki], side ^ 8) || this.facing(); this.unmake(); if (!bad) out.push(ps[i]); }
    return out;
  }
  hasAttackers(col: number): boolean { for (let s = 0; s < 90; s++) { const p = this.b[s]; if (p && (p & 8) === col) { const t = p & 7; if (t === R || t === N || t === C || t === P) return true; } } return false; }
  ascii(): string { let out = ''; for (let r = 0; r < 10; r++) { for (let c = 0; c < 9; c++) { const p = this.b[SQ(r, c)]; out += p ? (p & 8 ? LETTER[p & 7].toLowerCase() : LETTER[p & 7]) : '.'; } out += '\n'; } return out; }
}

export const mv = (from: number, to: number): number => from | (to << 7);
export const sqName = (s: number): string => 'abcdefghi'[colOf(s)] + (10 - rowOf(s));   // 红方视角：a..i 左→右，1..10 下→上（红帅 e1，黑将 e10）
export const parseSq = (str: string): number => SQ(10 - +str.slice(1), 'abcdefghi'.indexOf(str[0]));
/** 由 {e1:'K', e10:'k'} 之类的映射造局面（大写红、小写黑） */
export function fenOf(map: Record<string, string>, side: 'w' | 'b' = 'w'): string {
  const g: string[][] = Array.from({ length: 10 }, () => Array<string>(9).fill(''));
  for (const [k, v] of Object.entries(map)) { const s = parseSq(k); g[rowOf(s)][colOf(s)] = v; }
  return g.map((row) => { let o = '', e = 0; for (const x of row) { if (!x) e++; else { if (e) { o += e; e = 0; } o += x; } } if (e) o += e; return o; }).join('/') + ' ' + side;
}
export const moveStr = (m: number): string => sqName(m & 127) + sqName(m >> 7);
export const parseMove = (str: string): number => { const m = /^([a-i]\d+)([a-i]\d+)$/.exec(str); if (!m) throw new Error('bad move ' + str); return mv(parseSq(m[1]), parseSq(m[2])); };

// ---------- 中文棋谱（红：一二三…；黑：全角数字） ----------
const ZH = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'], FW = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
export function notation(pos: Position, m: number): string {
  const from = m & 127, to = m >> 7, p = pos.b[from], t = p & 7, red = !(p & 8);
  const fileNo = (s: number): number => (red ? 9 - colOf(s) : colOf(s) + 1), num = (n: number): string => (red ? ZH[n] : FW[n]);
  const name = (red ? NAME_RED : NAME_BLACK)[t];
  const same: number[] = []; for (let r = 0; r < 10; r++) { const s = SQ(r, colOf(from)); if (pos.b[s] === p) same.push(s); }
  let head: string;
  if (same.length >= 2 && t !== K) {
    same.sort((x, y) => (red ? rowOf(x) - rowOf(y) : rowOf(y) - rowOf(x)));
    const idx = same.indexOf(from);
    head = same.length === 2 ? (idx === 0 ? '前' : '后') + name : same.length === 3 ? ['前', '中', '后'][idx] + name : num(idx + 1) + name;
  } else head = name + num(fileNo(from));
  const dr = rowOf(to) - rowOf(from), fwd = red ? -dr : dr;
  let act: string, tail: string;
  if (dr === 0) { act = '平'; tail = num(fileNo(to)); }
  else { act = fwd > 0 ? '进' : '退'; tail = t === N || t === B || t === A ? num(fileNo(to)) : num(Math.abs(dr)); }
  return head + act + tail;
}

export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const L = pos.legal(); if (depth === 1) return L.length;
  let n = 0; for (const m of L) { pos.make(m); n += perft(pos, depth - 1); pos.unmake(); } return n;
}

// ---------- 子力价值（孩子口径：车 9、炮 = 马 = 4、仕相 2、兵 1，过河兵 2；将帅 0） ----------
const SEE_VAL = [0, 0, 2, 2, 4, 9, 4, 1];
export function pieceVal(p: number, s: number): number {
  const t = p & 7; if (t === K) return 0;
  if (t === P) { const crossed = p & 8 ? rowOf(s) >= 5 : rowOf(s) <= 4; return crossed ? 2 : 1; }
  return SEE_VAL[t];
}

// ---------- 为什么不能走（点到非法点时的 xq.w.<reason>）----------
// 返回 null = 合法；否则 reason ∈ WHY（与旁白 w 行逐一对应）。顺序：轮次 → 己子 → 几何/限制（宫、河、象眼、马腿、挡路、炮架、兵向）→ 走完的后果（见面、被将军）
export const WHY = ['turn', 'own', 'shape', 'palace', 'river', 'eye', 'horse', 'block', 'screen', 'two', 'back', 'side', 'face', 'self', 'escape'] as const;
export type Why = (typeof WHY)[number];
export function whyIllegal(pos: Position, from: number, to: number): Why | null {
  const p = pos.b[from]; if (!p || (p & 8) !== pos.side) return 'turn';
  const q = pos.b[to]; if (q && (q & 8) === (p & 8)) return 'own';
  const m = from | (to << 7); const t = p & 7, red = !(p & 8), fr = rowOf(from), fc = colOf(from), tr = rowOf(to), tc = colOf(to), dr = tr - fr, dc = tc - fc, ad = Math.abs(dr), ac = Math.abs(dc);
  const pseudo = pos.pseudo().includes(m);
  if (!pseudo) {
    const between = (): number => { let n = 0; if (fr === tr) { for (let c = Math.min(fc, tc) + 1; c < Math.max(fc, tc); c++) if (pos.b[SQ(fr, c)]) n++; } else if (fc === tc) { for (let r = Math.min(fr, tr) + 1; r < Math.max(fr, tr); r++) if (pos.b[SQ(r, fc)]) n++; } return n; };
    switch (t) {
      case K: case A: { const ok = t === K ? ad + ac === 1 : ad === 1 && ac === 1; if (!ok) return 'shape'; return 'palace'; }
      case B: { if (!(ad === 2 && ac === 2)) return 'shape'; if (!(red ? tr >= 5 : tr <= 4)) return 'river'; return 'eye'; }
      case N: { if (!((ad === 2 && ac === 1) || (ad === 1 && ac === 2))) return 'shape'; return 'horse'; }
      case R: { if (fr !== tr && fc !== tc) return 'shape'; return 'block'; }
      case C: { if (fr !== tr && fc !== tc) return 'shape'; const n = between(); if (q) return n === 0 ? 'screen' : 'two'; return 'block'; }
      case P: { const fwd = red ? -dr : dr; if (fwd < 0 && ac === 0) return 'back'; if (ad === 0 && ac === 1) return 'side'; return 'shape'; }
    }
    return 'shape';
  }
  // 几何合法、走完自陷：见面 / 被将军（正被将军且没解 = escape）
  if (pos.ksq[p >> 3] < 0) return null;   // 教学局面没有帅：不做自陷判断
  const wasCheck = pos.inCheck(pos.side); pos.make(m); const face = pos.facing(), att = pos.attacked(pos.ksq[p >> 3], pos.side); pos.unmake();
  if (face) return 'face'; if (att) return wasCheck ? 'escape' : 'self'; return null;
}

// ---------- 让子（让子方 = giverColor 的子被拿掉）----------
// kind: none | first(让先：棋子不动，只换先后手，由界面分配颜色) | knight(让左马) | knights(让双马) | rook(让左车) | cannon(让左炮)
// "左" = 让子方自己的左手边：红方 = 屏幕左（列 0..），黑方 = 屏幕右（列 8..）
export type HandicapKind = 'none' | 'first' | 'knight' | 'knights' | 'rook' | 'cannon';
export function handicapFen(kind: HandicapKind, giverColor: number): string {
  const p = Position.start(); const red = giverColor === RED; const col = (c: number): number => (red ? c : 8 - c); const row = red ? 9 : 0, crow = red ? 7 : 2;
  const rm = (r: number, c: number): void => { p.b[SQ(r, c)] = 0; };
  if (kind === 'knight') rm(row, col(1)); else if (kind === 'knights') { rm(row, 1); rm(row, 7); } else if (kind === 'rook') rm(row, col(0)); else if (kind === 'cannon') rm(crow, col(1));
  p.rehash(); return p.fen();
}
export const HANDICAPS: readonly [HandicapKind, string][] = [['none', '平下'], ['first', '让先'], ['knight', '让左马'], ['knights', '让双马'], ['rook', '让一车'], ['cannon', '让一炮']];
