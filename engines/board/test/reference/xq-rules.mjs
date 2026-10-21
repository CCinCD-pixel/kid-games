// rules.mjs — 中国象棋规则引擎原型（零依赖；规格 §3 的参考实现）
// 棋盘：90 格数组 sq = r*9 + c；r=0 是最上（黑方底线），r=9 是最下（红方底线）；c=0 是屏幕最左。红方在下。
// 棋子：type 1..7 = 将/帅 仕 相 马 车 炮 兵，| 8 为黑。0 = 空。
export const RED = 0, BLACK = 8;
export const K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;
export const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
const CH = { K: 1, A: 2, B: 3, N: 4, R: 5, C: 6, P: 7 };
const LETTER = ' KABNRCP';
export const NAME_RED = ' 帅仕相马车炮兵', NAME_BLACK = ' 将士象马车炮卒';
export const rowOf = (s) => (s / 9) | 0, colOf = (s) => s % 9, SQ = (r, c) => r * 9 + c;
export const colorOf = (p) => (p & 8);
export const typeOf = (p) => (p & 7);

// ---------- 预计算表 ----------
const inB = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 9;
const inPalace = (col, r, c) => c >= 3 && c <= 5 && (col === RED ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2));
const ownHalf = (col, r) => (col === RED ? r >= 5 : r <= 4);
export const T = { king: [[], []], adv: [[], []], bishop: [[], []], knight: [], rays: [], pawn: [[], []], knightFrom: [], pawnFrom: [[], []] };
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
  T.rays[s] = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dr, dc]) => { const a = []; let rr = r + dr, cc = c + dc; while (inB(rr, cc)) { a.push(SQ(rr, cc)); rr += dr; cc += dc; } return a; });
  T.knightFrom[s] = []; T.pawnFrom[0][s] = []; T.pawnFrom[1][s] = [];
}
for (let s = 0; s < 90; s++) {
  for (const [d, leg] of T.knight[s]) T.knightFrom[d].push([s, leg]);
  for (const ci of [0, 1]) for (const d of T.pawn[ci][s]) T.pawnFrom[ci][d].push(s);
}
/** 这个子能不能站在这格（用于生成/校验局面；兵未过河只能在原点列） */
export function canStand(p, s) {
  const r = rowOf(s), c = colOf(s), col = colOf_(p), t = p & 7;
  if (t === K) return inPalace(col, r, c);
  if (t === A) return advOk(col, r, c);
  if (t === B) return bishopSpots(col).has(s);
  if (t === P) { if (col === RED) return r <= 4 || (r <= 6 && c % 2 === 0); return r >= 5 || (r >= 3 && c % 2 === 0); }
  return true;
}
const colOf_ = (p) => p & 8;
const advOk = (col, r, c) => inPalace(col, r, c) && ((col === RED ? [[7, 3], [7, 5], [8, 4], [9, 3], [9, 5]] : [[0, 3], [0, 5], [1, 4], [2, 3], [2, 5]]).some(([a, b]) => a === r && b === c));
const _bsp = {};
function bishopSpots(col) {
  if (_bsp[col]) return _bsp[col];
  const pts = col === RED ? [[9, 2], [9, 6], [7, 0], [7, 4], [7, 8], [5, 2], [5, 6]] : [[0, 2], [0, 6], [2, 0], [2, 4], [2, 8], [4, 2], [4, 6]];
  return (_bsp[col] = new Set(pts.map(([r, c]) => SQ(r, c))));
}
export const advSpots = (col) => (col === RED ? [[7, 3], [7, 5], [8, 4], [9, 3], [9, 5]] : [[0, 3], [0, 5], [1, 4], [2, 3], [2, 5]]).map(([r, c]) => SQ(r, c));
export const bishopSpotList = (col) => [...bishopSpots(col)];

// ---------- Zobrist ----------
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0); }; }
const zr = mulberry32(0x5eed1234);
const ZLO = [], ZHI = [];
for (let p = 0; p < 16; p++) { ZLO[p] = new Int32Array(90); ZHI[p] = new Int32Array(90); for (let s = 0; s < 90; s++) { ZLO[p][s] = zr() | 0; ZHI[p][s] = zr() | 0; } }
const SIDE_LO = zr() | 0, SIDE_HI = zr() | 0;


// ---------- 局面 ----------
export class Position {
  constructor() {
    this.b = new Int8Array(90); this.side = RED; this.ksq = [-1, -1]; this.lo = 0; this.hi = 0;
    this.sp = 0; this.stM = new Int32Array(1024); this.stCap = new Int8Array(1024); this.stLo = new Int32Array(1024); this.stHi = new Int32Array(1024);
  }
  static fromFen(fen) {
    const pos = new Position(); const [bd, side] = fen.trim().split(/\s+/);
    const rows = bd.split('/'); if (rows.length !== 10) throw new Error('fen rows');
    rows.forEach((row, r) => { let c = 0; for (const ch of row) { if (/\d/.test(ch)) c += +ch; else { const t = CH[ch.toUpperCase()]; if (!t) throw new Error('fen char ' + ch); pos.b[SQ(r, c)] = t | (ch === ch.toUpperCase() ? RED : BLACK); c++; } } if (c !== 9) throw new Error('fen cols row ' + r); });
    pos.side = side === 'b' ? BLACK : RED; pos.rehash(); return pos;
  }
  static start() { return Position.fromFen(START_FEN); }
  clone() { const p = new Position(); p.b.set(this.b); p.side = this.side; p.ksq = [...this.ksq]; p.lo = this.lo; p.hi = this.hi; return p; }
  rehash() {
    this.ksq = [-1, -1]; this.lo = 0; this.hi = 0;
    for (let s = 0; s < 90; s++) { const p = this.b[s]; if (!p) continue; if ((p & 7) === K) this.ksq[p >> 3] = s; this.lo ^= ZLO[p][s]; this.hi ^= ZHI[p][s]; }
    if (this.side === BLACK) { this.lo ^= SIDE_LO; this.hi ^= SIDE_HI; }
  }
  fen() {
    let out = [];
    for (let r = 0; r < 10; r++) { let row = '', e = 0; for (let c = 0; c < 9; c++) { const p = this.b[SQ(r, c)]; if (!p) e++; else { if (e) { row += e; e = 0; } const ch = LETTER[p & 7]; row += (p & 8) ? ch.toLowerCase() : ch; } } if (e) row += e; out.push(row); }
    return out.join('/') + ' ' + (this.side === RED ? 'w' : 'b');
  }
  key() { return this.lo + ':' + this.hi; }
  // ----- 走子 -----
  make(m) {
    const from = m & 127, to = m >> 7, b = this.b, p = b[from], cap = b[to], i = this.sp++;
    this.stM[i] = m; this.stCap[i] = cap; this.stLo[i] = this.lo; this.stHi[i] = this.hi;
    b[to] = p; b[from] = 0;
    if ((p & 7) === K) this.ksq[p >> 3] = to;
    let lo = this.lo ^ ZLO[p][from] ^ ZLO[p][to] ^ SIDE_LO, hi = this.hi ^ ZHI[p][from] ^ ZHI[p][to] ^ SIDE_HI;
    if (cap) { lo ^= ZLO[cap][to]; hi ^= ZHI[cap][to]; }
    this.lo = lo; this.hi = hi; this.side ^= 8;
  }
  unmake() {
    const i = --this.sp, m = this.stM[i], from = m & 127, to = m >> 7, b = this.b, p = b[to];
    b[from] = p; b[to] = this.stCap[i]; this.lo = this.stLo[i]; this.hi = this.stHi[i]; this.side ^= 8;
    if ((p & 7) === K) this.ksq[p >> 3] = from;
  }
  // ----- 攻击判断 -----
  /** 格 s 是否被 by 方（0/8）攻击（车炮马兵；将帅对面另算） */
  attacked(s, by) {
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
  facing() {
    const a = this.ksq[0], c = this.ksq[1]; if (a < 0 || c < 0 || a % 9 !== c % 9) return false;
    for (let i = c + 9; i < a; i += 9) if (this.b[i]) return false; return true;
  }
  /** color 方是否被将军（含将帅对面） */
  inCheck(color = this.side) {
    const k = this.ksq[color >> 3]; if (k < 0) return false;
    return this.attacked(k, color ^ 8) || this.facing();
  }
  // ----- 走法生成 -----
  pseudo(capsOnly = false) {
    const out = [], b = this.b, side = this.side, si = side >> 3;
    for (let s = 0; s < 90; s++) {
      const p = b[s]; if (!p || (p & 8) !== side) continue;
      switch (p & 7) {
        case K: for (const d of T.king[si][s]) { const q = b[d]; if (capsOnly ? (q && (q & 8) !== side) : (!q || (q & 8) !== side)) out.push(s | (d << 7)); } break;
        case A: for (const d of T.adv[si][s]) { const q = b[d]; if (capsOnly ? (q && (q & 8) !== side) : (!q || (q & 8) !== side)) out.push(s | (d << 7)); } break;
        case B: for (const [d, eye] of T.bishop[si][s]) { if (b[eye]) continue; const q = b[d]; if (capsOnly ? (q && (q & 8) !== side) : (!q || (q & 8) !== side)) out.push(s | (d << 7)); } break;
        case N: for (const [d, leg] of T.knight[s]) { if (b[leg]) continue; const q = b[d]; if (capsOnly ? (q && (q & 8) !== side) : (!q || (q & 8) !== side)) out.push(s | (d << 7)); } break;
        case P: for (const d of T.pawn[si][s]) { const q = b[d]; if (capsOnly ? (q && (q & 8) !== side) : (!q || (q & 8) !== side)) out.push(s | (d << 7)); } break;
        case R: for (const ray of T.rays[s]) for (let i = 0; i < ray.length; i++) { const d = ray[i], q = b[d]; if (!q) { if (!capsOnly) out.push(s | (d << 7)); } else { if ((q & 8) !== side) out.push(s | (d << 7)); break; } } break;
        case C: for (const ray of T.rays[s]) { let i = 0; for (; i < ray.length; i++) { const d = ray[i]; if (!b[d]) { if (!capsOnly) out.push(s | (d << 7)); } else break; }
          for (i++; i < ray.length; i++) { const d = ray[i], q = b[d]; if (q) { if ((q & 8) !== side) out.push(s | (d << 7)); break; } } } break;
      }
    }
    return out;
  }
  /** 合法着法（不能自己被将军、不能将帅对面）。没有将/帅的教学局面不做将军过滤。 */
  legal(capsOnly = false) {
    const ps = this.pseudo(capsOnly), out = [], side = this.side, ki = side >> 3;
    if (this.ksq[ki] < 0) return ps;
    for (let i = 0; i < ps.length; i++) { this.make(ps[i]); const bad = this.attacked(this.ksq[ki], side ^ 8) || this.facing(); this.unmake(); if (!bad) out.push(ps[i]); }
    return out;
  }
  legalFrom(s) { return this.legal().filter((m) => (m & 127) === s); }
  isLegal(m) { return this.legal().includes(m); }
  givesCheck(m) { this.make(m); const c = this.inCheck(this.side); this.unmake(); return c; }
  /** 局面是否合法（两王在宫、不相对、没有被将军的一方不走子……） */
  // ----- 终局 -----
  status() {
    const L = this.legal();
    if (L.length === 0) return { over: true, winner: this.side ^ 8, reason: this.inCheck() ? 'checkmate' : 'stalemate-loss' };
    return { over: false };
  }
  counts() { const n = { 0: 0, 8: 0 }; for (let s = 0; s < 90; s++) { const p = this.b[s]; if (p) n[p & 8]++; } return n; }
  hasAttackers(col) { for (let s = 0; s < 90; s++) { const p = this.b[s]; if (p && (p & 8) === col) { const t = p & 7; if (t === R || t === N || t === C || t === P) return true; } } return false; }
  ascii() { let out = ''; for (let r = 0; r < 10; r++) { for (let c = 0; c < 9; c++) { const p = this.b[SQ(r, c)]; out += p ? ((p & 8) ? LETTER[p & 7].toLowerCase() : LETTER[p & 7]) : '.'; } out += '\n'; } return out; }
}
export const mv = (from, to) => from | (to << 7);
export const fromTo = (m) => [m & 127, m >> 7];
export const sqName = (s) => 'abcdefghi'[colOf(s)] + (10 - rowOf(s)); // 红方视角：a..i 左→右，1..10 下→上（红帅 e1，黑将 e10）
export const parseSq = (str) => SQ(10 - (+str.slice(1)), 'abcdefghi'.indexOf(str[0]));
/** 由 {e1:'K', e10:'k'} 之类的映射造局面（大写红、小写黑） */
export function fenOf(map, side = 'w') { const g = Array.from({ length: 10 }, () => Array(9).fill('')); for (const [k, v] of Object.entries(map)) { const s = parseSq(k); g[rowOf(s)][colOf(s)] = v; } return g.map((row) => { let o = '', e = 0; for (const x of row) { if (!x) e++; else { if (e) { o += e; e = 0; } o += x; } } if (e) o += e; return o; }).join('/') + ' ' + side; }
export const moveStr = (m) => sqName(m & 127) + sqName(m >> 7);
export const parseMove = (str) => { const m = /^([a-i]\d+)([a-i]\d+)$/.exec(str); if (!m) throw new Error('bad move ' + str); return mv(parseSq(m[1]), parseSq(m[2])); };

// ---------- 中文棋谱（红：一二三…；黑：全角数字） ----------
const ZH = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'], FW = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
export function notation(pos, m) {
  const from = m & 127, to = m >> 7, p = pos.b[from], t = p & 7, red = !(p & 8);
  const fileNo = (s) => (red ? 9 - colOf(s) : colOf(s) + 1), num = (n) => (red ? ZH[n] : FW[n]);
  const name = (red ? NAME_RED : NAME_BLACK)[t];
  // 同一纵线上的同名子 → 前/后
  const same = []; for (let r = 0; r < 10; r++) { const s = SQ(r, colOf(from)); if (pos.b[s] === p) same.push(s); }
  let head;
  if (same.length >= 2 && t !== K) {
    same.sort((x, y) => (red ? rowOf(x) - rowOf(y) : rowOf(y) - rowOf(x))); // 红：row 小=更靠前
    const idx = same.indexOf(from);
    head = same.length === 2 ? (idx === 0 ? '前' : '后') + name : same.length === 3 ? ['前', '中', '后'][idx] + name : num(idx + 1) + name;
  } else head = name + num(fileNo(from));
  const dr = rowOf(to) - rowOf(from), fwd = red ? -dr : dr;
  let act, tail;
  if (dr === 0) { act = '平'; tail = num(fileNo(to)); }
  else { act = fwd > 0 ? '进' : '退'; tail = (t === N || t === B || t === A) ? num(fileNo(to)) : num(Math.abs(dr)); }
  return head + act + tail;
}

// ---------- perft ----------
export function perft(pos, depth) {
  if (depth === 0) return 1;
  const L = pos.legal(); if (depth === 1) return L.length;
  let n = 0; for (const m of L) { pos.make(m); n += perft(pos, depth - 1); pos.unmake(); } return n;
}

// ---------- 对局级规则：重复 / 长将 / 自然限着 / 无进攻子力（v1.1：家规可调；状态顺序与 board-engine Game 一致）----------
// 家规（面对面可改；对机器人固定用默认）：stalemate 'loss'|'draw'；perpetual 'loss'|'warn'|'off'（warn = 判和但提醒）；limit = 无吃子半回合数（120 = 60 回合，0 = 不限）
export const DEFAULT_RULES = { repeatN: 3, limit: 120, stalemate: 'loss', perpetual: 'loss' };
export const RULES = DEFAULT_RULES; // 兼容旧脚本
export class Game {
  /** hist[i] = 第 i+1 步的 { m, check（这步走完是否将军对方）, cap }；keys[i] = 第 i 步之后的局面键（keys[0] = 起始局面，含让子局面）；不变量 keys.length === hist.length + 1 */
  constructor(fen = START_FEN, rules = {}) { this.rules = { ...DEFAULT_RULES, ...rules }; this.startFen = fen; this.pos = Position.fromFen(fen); this.hist = []; this.keys = [this.pos.key()]; this.noCap = 0; this.noCapStack = []; }
  static replay(fen, moves, rules) { const g = new Game(fen, rules); for (const m of moves) g.play(m); return g; }
  clone() { const g = new Game(this.startFen, this.rules); g.pos = this.pos.clone(); g.hist = this.hist.slice(); g.keys = this.keys.slice(); g.noCap = this.noCap; g.noCapStack = this.noCapStack.slice(); return g; }
  play(m) {
    const cap = this.pos.b[m >> 7]; this.pos.make(m); const check = this.pos.inCheck(this.pos.side);
    this.hist.push({ m, check, cap }); this.keys.push(this.pos.key()); this.noCapStack.push(this.noCap); this.noCap = cap ? 0 : this.noCap + 1;
  }
  undo() { this.pos.unmake(); this.hist.pop(); this.keys.pop(); this.noCap = this.noCapStack.pop(); }
  /** 当前局面（含走子方）在历史里出现的次数（含当前，含起始局面） */
  repCount() { const k = this.keys[this.keys.length - 1]; let n = 0; for (const x of this.keys) if (x === k) n++; return n; }
  /** 当前局面最近 n 次出现的 keys 下标（升序）；不足 n 次返回 null */
  occurrences(n) { const k = this.keys[this.keys.length - 1], idx = []; for (let i = this.keys.length - 1; i >= 0 && idx.length < n; i--) if (this.keys[i] === k) idx.unshift(i); return idx.length === n ? idx : null; }
  /** 长将判定窗口 = 最近 n 次出现中最早一次到现在的全部着法；某方"每一步都将军" = 该方长将。返回 { checker: 0|8|null, both: bool }（checker = 只有它在每步将军的一方） */
  perpetualWindow(n) {
    const occ = this.occurrences(n); if (!occ) return null; const start = occ[0], end = this.keys.length - 1;
    const first = this.pos.side; // keys[start] 与当前同局面同走子方：窗口里偶数号着法（0,2,..）属于 first，奇数号属于对方
    let allA = true, allB = true;
    for (let i = start; i < end; i++) { const chk = this.hist[i].check; if ((i - start) % 2 === 0) { if (!chk) allA = false; } else if (!chk) allB = false; }
    const A = first, Bs = first ^ 8;
    if (allA && allB) return { checker: null, both: true };
    if (allA) return { checker: A, both: false }; if (allB) return { checker: Bs, both: false }; return { checker: null, both: false };
  }
  /** 局面自身的终局（将死/困毙；家规 stalemate）。无合法着法才会返回 over */
  terminal() {
    if (this.pos.legal().length) return null;
    if (this.pos.inCheck()) return { over: true, winner: this.pos.side ^ 8, reason: 'checkmate' };
    return this.rules.stalemate === 'draw' ? { over: true, winner: null, reason: 'stalemate-draw' } : { over: true, winner: this.pos.side ^ 8, reason: 'stalemate-loss' };
  }
  /** 顺序：局面终局 → 无进攻子力 → 三次重复（长将/和）→ 限着。`Game` 通用，rules.status 不含重复与限着 */
  status() {
    const t = this.terminal(); if (t) return t;
    if (!this.pos.hasAttackers(RED) && !this.pos.hasAttackers(BLACK)) return { over: true, winner: null, reason: 'no-attackers' };
    if (this.repCount() >= this.rules.repeatN) return this.repetitionVerdict();
    if (this.rules.limit > 0 && this.noCap >= this.rules.limit) return { over: true, winner: null, reason: 'no-capture-limit' };
    return { over: false };
  }
  repetitionVerdict() {
    if (this.rules.perpetual === 'loss') { const w = this.perpetualWindow(this.rules.repeatN); if (w && w.checker !== null) return { over: true, winner: w.checker ^ 8, reason: 'perpetual-check' }; }
    return { over: true, winner: null, reason: 'repetition' };
  }
  /** 预警（只在 perpetual ≠ off 时有意义）：当前局面已是第 2 次出现，且走子方在窗口里每步都将军 → 再循环一次就会判负。返回 { warn:bool, side } */
  warnRepeat() {
    if (this.rules.perpetual === 'off' || this.repCount() < 2) return { warn: false };
    const w = this.perpetualWindow(2); return w && w.checker === this.pos.side ? { warn: true, side: w.checker } : { warn: false };
  }
  /** 这一步会不会立刻让走子方因长将判负（robots 的根过滤、孩子的提交前提醒）；只在 perpetual === 'loss' 时 */
  wouldLoseByPerpetual(m) { const me = this.pos.side; this.play(m); const st = this.status(); this.undo(); return st.over && st.reason === 'perpetual-check' && st.winner !== me; }
}
export const colorName = (c) => (c === RED ? '红' : '黑');


// ---------- 为什么不能走（点到非法点时的 xq.w.<reason>；v1.1）----------
// 返回 null = 合法；否则 reason ∈ WHY（与旁白 w 行逐一对应）。顺序：轮次 → 己子 → 几何/限制（宫、河、象眼、马腿、挡路、炮架、兵向）→ 走完的后果（见面、被将军）
export const WHY = ['turn', 'own', 'shape', 'palace', 'river', 'eye', 'horse', 'block', 'screen', 'two', 'back', 'side', 'face', 'self', 'escape'];
export function whyIllegal(pos, from, to) {
  const p = pos.b[from]; if (!p || (p & 8) !== pos.side) return 'turn';
  const q = pos.b[to]; if (q && (q & 8) === (p & 8)) return 'own';
  const m = from | (to << 7); const t = p & 7, red = !(p & 8), fr = rowOf(from), fc = colOf(from), tr = rowOf(to), tc = colOf(to), dr = tr - fr, dc = tc - fc, ad = Math.abs(dr), ac = Math.abs(dc);
  const pseudo = pos.pseudo().includes(m);
  if (!pseudo) {
    const between = () => { let n = 0; if (fr === tr) { for (let c = Math.min(fc, tc) + 1; c < Math.max(fc, tc); c++) if (pos.b[SQ(fr, c)]) n++; } else if (fc === tc) { for (let r = Math.min(fr, tr) + 1; r < Math.max(fr, tr); r++) if (pos.b[SQ(r, fc)]) n++; } return n; };
    switch (t) {
      case K: case A: { const ok = t === K ? ad + ac === 1 : ad === 1 && ac === 1; if (!ok) return 'shape'; return 'palace'; }
      case B: { if (!(ad === 2 && ac === 2)) return 'shape'; if (!(red ? tr >= 5 : tr <= 4)) return 'river'; return 'eye'; }
      case N: { if (!((ad === 2 && ac === 1) || (ad === 1 && ac === 2))) return 'shape'; return 'horse'; }
      case R: { if (fr !== tr && fc !== tc) return 'shape'; return 'block'; }
      case C: { if (fr !== tr && fc !== tc) return 'shape'; const n = between(); if (q) return n === 0 ? 'screen' : 'two'; return 'block'; }
      case P: { const fwd = red ? -dr : dr; if (fwd < 0 && ac === 0) return 'back'; if (ad === 0 && ac === 1) return 'side'; if (fwd === 1 && ac === 0) return 'shape'; return 'shape'; }
    }
    return 'shape';
  }
  // 几何合法、走完自陷：见面 / 被将军（正被将军且没解 = escape）
  if (pos.ksq[p >> 3] < 0) return null; // 教学局面没有帅：不做自陷判断
  const wasCheck = pos.inCheck(pos.side); pos.make(m); const face = pos.facing(), att = pos.attacked(pos.ksq[p >> 3], pos.side); pos.unmake();
  if (face) return 'face'; if (att) return wasCheck ? 'escape' : 'self'; return null;
}

// ---------- 让子（让子方 = giverColor 的子被拿掉）----------
// kind: none | first(让先：棋子不动，只换先后手，由界面分配颜色) | knight(让左马) | knights(让双马) | rook(让左车) | cannon(让左炮)
// "左" = 让子方自己的左手边：红方 = 屏幕左（列 0..），黑方 = 屏幕右（列 8..）
export function handicapFen(kind, giverColor) {
  const p = Position.start(); const red = giverColor === RED; const col = (c) => (red ? c : 8 - c); const row = red ? 9 : 0, crow = red ? 7 : 2;
  const rm = (r, c) => { p.b[SQ(r, c)] = 0; };
  if (kind === 'knight') rm(row, col(1)); else if (kind === 'knights') { rm(row, 1); rm(row, 7); } else if (kind === 'rook') rm(row, col(0)); else if (kind === 'cannon') rm(crow, col(1));
  p.rehash(); return p.fen();
}
export const HANDICAPS = [['none', '平下'], ['first', '让先'], ['knight', '让左马'], ['knights', '让双马'], ['rook', '让一车'], ['cannon', '让一炮']];
