// engines/board/games/chess/oracle-0x88.ts — 独立第二实现（仅测试用）：0x88 棋盘 + 复制式走子 + "走完看己方王是否被攻击"。
// **不 import position.ts / rules.ts 的任何代码**，也不共享表格：由原型 oracle88.mjs 自写移植而来（自有作品，~100 行）。
// 用途：① diff.test.ts 对 rules.ts 逐局面差分（合法着法集合 / 将军 / 终局 / 走完布局与易位权）；② 复核课程与题库的一步杀 / 两步杀。
// 不支持陨石 X（课程特例由 rules.test 单独测）。着法串 = UCI（e2e4、e7e8q）。
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const CH: Readonly<Record<string, number>> = { P, N, B, R, Q, K };
const KN = [-33, -31, -18, -14, 14, 18, 31, 33], KG = [-17, -16, -15, -1, 1, 15, 16, 17], DG = [-17, -15, 15, 17], OR = [-16, -1, 1, 16];
const on = (s: number): boolean => (s & 0x88) === 0;
const sqStr = (s: number): string => 'abcdefgh'[s & 7] + ((s >> 4) + 1);
const strSq = (t: string): number => (t.charCodeAt(0) - 97) + 16 * (Number(t[1]) - 1);

export interface OPos { readonly b: Int8Array; readonly side: 1 | -1; readonly cr: number; readonly ep: number }
export interface OMove { readonly from: number; readonly to: number; readonly promo?: number; readonly dbl?: boolean; readonly epCap?: boolean; readonly castle?: 'K' | 'Q' }

export function parse(fen: string): OPos {
  const [pl, side, cas, ep] = fen.split(' ');
  const b = new Int8Array(128); let r = 7, c = 0;
  for (const ch of pl) {
    if (ch === '/') { r--; c = 0; } else if (ch >= '1' && ch <= '8') c += +ch;
    else { const t = CH[ch.toUpperCase()]; b[r * 16 + c] = ch === ch.toUpperCase() ? t : -t; c++; }
  }
  let cr = 0; if (cas.includes('K')) cr |= 1; if (cas.includes('Q')) cr |= 2; if (cas.includes('k')) cr |= 4; if (cas.includes('q')) cr |= 8;
  return { b, side: side === 'w' ? 1 : -1, cr, ep: ep && ep !== '-' ? strSq(ep) : -1 };
}
/** `sq` 是否被 `by`（1 白 / -1 黑）攻击 */
export function attackedBy(b: Int8Array, sq: number, by: 1 | -1): boolean {
  for (const d of [by === 1 ? -15 : 15, by === 1 ? -17 : 17]) { const f = sq + d; if (on(f) && b[f] === by * P) return true; }
  for (const d of KN) { const f = sq + d; if (on(f) && b[f] === by * N) return true; }
  for (const d of KG) { const f = sq + d; if (on(f) && b[f] === by * K) return true; }
  for (const d of DG) { let f = sq + d; while (on(f)) { const v = b[f]; if (v) { if (v === by * B || v === by * Q) return true; break; } f += d; } }
  for (const d of OR) { let f = sq + d; while (on(f)) { const v = b[f]; if (v) { if (v === by * R || v === by * Q) return true; break; } f += d; } }
  return false;
}
const kingSq = (b: Int8Array, side: number): number => { for (let s = 0; s < 128; s++) if (!(s & 0x88) && b[s] === side * K) return s; return -1; };
export const inCheck = (pos: OPos, side: 1 | -1 = pos.side): boolean => { const k = kingSq(pos.b, side); return k >= 0 && attackedBy(pos.b, k, -side as 1 | -1); };

function pseudo(pos: OPos): OMove[] {
  const { b, side, cr, ep } = pos; const out: OMove[] = [];
  const push = (from: number, to: number, extra: Partial<OMove> = {}): void => { out.push({ from, to, ...extra }); };
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const v = b[s]; if (!v || Math.sign(v) !== side) continue; const t = Math.abs(v);
    if (t === P) {
      const up = side === 1 ? 16 : -16, start = side === 1 ? 1 : 6, last = side === 1 ? 7 : 0;
      const one = s + up;
      if (on(one) && !b[one]) {
        if ((one >> 4) === last) for (const pr of [Q, R, B, N]) push(s, one, { promo: pr }); else push(s, one);
        const two = s + 2 * up; if ((s >> 4) === start && !b[two]) push(s, two, { dbl: true });
      }
      for (const dc of [-1, 1]) {
        const to = one + dc; if (!on(to)) continue;
        if (b[to] && Math.sign(b[to]) === -side) { if ((to >> 4) === last) for (const pr of [Q, R, B, N]) push(s, to, { promo: pr }); else push(s, to); }
        else if (to === ep && ep >= 0) push(s, to, { epCap: true });
      }
    } else if (t === N || t === K) {
      for (const d of t === N ? KN : KG) { const to = s + d; if (on(to) && Math.sign(b[to]) !== side) push(s, to); }
      if (t === K) {
        const home = side === 1 ? 4 : 116; // e1 / e8
        if (s === home && !attackedBy(b, s, -side as 1 | -1)) {
          const kR = side === 1 ? 1 : 4, qR = side === 1 ? 2 : 8;
          if ((cr & kR) && !b[s + 1] && !b[s + 2] && b[s + 3] === side * R && !attackedBy(b, s + 1, -side as 1 | -1)) push(s, s + 2, { castle: 'K' });
          if ((cr & qR) && !b[s - 1] && !b[s - 2] && !b[s - 3] && b[s - 4] === side * R && !attackedBy(b, s - 1, -side as 1 | -1)) push(s, s - 2, { castle: 'Q' });
        }
      }
    } else {
      const dirs = t === B ? DG : t === R ? OR : [...DG, ...OR];
      for (const d of dirs) { let to = s + d; while (on(to)) { if (b[to]) { if (Math.sign(b[to]) === -side) push(s, to); break; } push(s, to); to += d; } }
    }
  }
  return out;
}
export function make(pos: OPos, m: OMove): OPos {
  const b = Int8Array.from(pos.b); const side = pos.side; let cr = pos.cr; let ep = -1;
  const v = b[m.from]; b[m.to] = m.promo ? side * m.promo : v; b[m.from] = 0;
  if (m.epCap) b[m.to - side * 16] = 0;
  if (m.dbl) ep = m.from + side * 16;
  if (m.castle === 'K') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = 0; }
  if (m.castle === 'Q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = 0; }
  if (Math.abs(v) === K) cr &= side === 1 ? ~3 : ~12;
  for (const s of [m.from, m.to]) { if (s === 0) cr &= ~2; if (s === 7) cr &= ~1; if (s === 112) cr &= ~8; if (s === 119) cr &= ~4; }
  return { b, side: -side as 1 | -1, cr, ep };
}
export function legal(pos: OPos): OMove[] {
  const out: OMove[] = [];
  for (const m of pseudo(pos)) { const n = make(pos, m); const k = kingSq(n.b, pos.side); if (k >= 0 && attackedBy(n.b, k, n.side)) continue; out.push(m); }
  return out;
}
export const uci = (m: OMove): string => sqStr(m.from) + sqStr(m.to) + (m.promo ? 'qrbn'[[Q, R, B, N].indexOf(m.promo)] : '');
export const isMate = (pos: OPos): boolean => inCheck(pos) && legal(pos).length === 0;
export function perft88(pos: OPos, d: number): number { if (d === 0) return 1; let n = 0; for (const m of legal(pos)) n += d === 1 ? 1 : perft88(make(pos, m), d - 1); return n; }
/** 棋子布局 + 走子方 + 易位权（不含 ep、不含步数）；与 rules.ts 的 FEN 前三段同格式，用来比较"走完之后" */
export function place(pos: OPos): string {
  let s = ''; for (let r = 7; r >= 0; r--) { let e = 0; for (let c = 0; c < 8; c++) { const v = pos.b[r * 16 + c]; if (!v) { e++; continue; } if (e) { s += e; e = 0; } const ch = 'pnbrqk'[Math.abs(v) - 1]; s += v > 0 ? ch.toUpperCase() : ch; } if (e) s += e; if (r) s += '/'; }
  return `${s} ${pos.side === 1 ? 'w' : 'b'} ${(pos.cr & 1 ? 'K' : '') + (pos.cr & 2 ? 'Q' : '') + (pos.cr & 4 ? 'k' : '') + (pos.cr & 8 ? 'q' : '') || '-'}`;
}
/** 终局：'mate' | 'stale' | 'on' */
export const terminal = (pos: OPos): 'mate' | 'stale' | 'on' => (legal(pos).length ? 'on' : inCheck(pos) ? 'mate' : 'stale');
