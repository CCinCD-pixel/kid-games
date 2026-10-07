// Story / 驿站 / 宋城沙盘 figures and props (spec §6.3b, §5.7): lacquered peg dolls and paper-cut props in the SAME
// shadePart recipe as the sand-table rigs (gradient + grain/gleam + top bevel + dark-brown outline). Everything is drawn
// in design units (du) on a context the caller has already scaled; `u` = CSS px per du (constant-pixel strokes).
import { shadePart, shift, type Mat, type ShadeOpts } from './shade';
import { PAL } from '../theme/mozi';

export type C2 = CanvasRenderingContext2D;
export interface Box { x: number; y: number; w: number; h: number }
const TAU = Math.PI * 2;

/** shade one path built by f — the only fill recipe for solid parts */
export function sp(c: C2, u: number, mat: Mat, f: (p: Path2D) => void, b: Box, o?: ShadeOpts): void { const p = new Path2D(); f(p); shadePart(c, p, mat, b, u, o); }
export const rr = (c: C2, u: number, mat: Mat, x: number, y: number, w: number, h: number, r = 2, o?: ShadeOpts): void =>
  sp(c, u, mat, (p) => p.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))), { x, y, w, h }, o);
export const ell = (c: C2, u: number, mat: Mat, x: number, y: number, rx: number, ry: number, o?: ShadeOpts): void =>
  sp(c, u, mat, (p) => p.ellipse(x, y, rx, ry, 0, 0, TAU), { x: x - rx, y: y - ry, w: rx * 2, h: ry * 2 }, o);
export function poly(c: C2, u: number, mat: Mat, pts: number[], o?: ShadeOpts): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  sp(c, u, mat, (p) => { p.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]); p.closePath(); }, { x: x0, y: y0, w: x1 - x0 || 1, h: y1 - y0 || 1 }, o);
}
/** a flat paper-cut silhouette (no shading — far layers stay calm) */
export function paper(c: C2, color: string, f: (p: Path2D) => void, edge = 0, u = 1): void {
  const p = new Path2D(); f(p); c.fillStyle = color; c.fill(p);
  if (edge) { c.strokeStyle = shift(color, -0.25); c.lineWidth = edge / u; c.lineJoin = 'round'; c.stroke(p); }
}
export function glow(c: C2, x: number, y: number, r: number, color: string, a: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color.replace('A', String(a))); g.addColorStop(1, color.replace('A', '0'));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
const line = (c: C2, u: number, w: number, color: string, f: () => void): void => { c.strokeStyle = color; c.lineWidth = w / u; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); f(); c.stroke(); };

// ───────────── peg dolls ─────────────
export type Who = 'mozi' | 'luban' | 'bubu' | 'farmer' | 'smith';
export interface DollSt {
  t: number; walk?: number; /** right (front) arm raise 0..1 */ arm?: number; /** left arm raise 0..1 */ armL?: number;
  face?: 'calm' | 'happy' | 'sleepy'; talk?: boolean; look?: 1 | -1; sit?: boolean;
  carry?: 'pack' | 'lantern' | 'square' | 'hammer' | 'cake' | 'hook' | null;
}
const LOOK: Record<Who, { robe: string; trim: string; s: number }> = {
  mozi: { robe: '#D8C3A0', trim: PAL.teal, s: 1 }, luban: { robe: '#5A3A2C', trim: PAL.gold, s: 1.02 },
  bubu: { robe: '#4AA391', trim: '#F2E3C2', s: 0.74 }, farmer: { robe: '#B49A6A', trim: '#7A5A35', s: 0.92 }, smith: { robe: '#8E6A45', trim: PAL.lacRed, s: 0.9 },
};
/** a lacquered peg doll standing at (x, y) = feet, s = scale (1 → ~60 du tall) */
export function doll(c: C2, u: number, who: Who, x: number, y: number, s: number, st: DollSt): void {
  const L = LOOK[who]; const k = s * L.s; const t = st.t;
  const bob = st.walk ? Math.abs(Math.sin(t * 7.5)) * 2.2 * st.walk : Math.sin(t * 2.1) * 0.5;
  const sway = st.walk ? Math.sin(t * 7.5) * 0.07 * st.walk : 0;
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(40,25,15,0.22)'; c.beginPath(); c.ellipse(0, 0, 14 * k, 3.4 * k, 0, 0, TAU); c.fill();
  c.scale(k * (st.look ?? 1), k); const uu = u * k;
  if (st.sit) c.translate(0, 8);
  c.translate(0, -bob); c.rotate(sway);
  // back arm, then the pack (behind the body)
  const arm = (side: number, raise: number): void => {
    c.save(); c.translate(side * 8, -31); c.rotate(0.2 - raise * 2.6);
    rr(c, uu, 'paper', -2.6, -1, 5.2, 15, 2.6, { tint: shift(L.robe, side > 0 ? 0 : -0.08), seed: 3 });
    ell(c, uu, 'skin', 0, 15, 2.8, 2.8, { outline: 1.6 });
    c.restore();
  };
  arm(-1, st.armL ?? 0);
  if (st.carry === 'pack') { rr(c, uu, 'woodRed', -17, -36, 10, 16, 3, { seed: 5 }); line(c, uu, 1.6, PAL.outline, () => { c.moveTo(-8, -34); c.lineTo(-4, -22); }); }
  // robe (bell), sash, collar
  sp(c, uu, 'paper', (p) => { p.moveTo(-13, 0); p.quadraticCurveTo(-14.5, -18, -8.5, -34); p.quadraticCurveTo(0, -37, 8.5, -34); p.quadraticCurveTo(14.5, -18, 13, 0); p.quadraticCurveTo(0, 2.4, -13, 0); p.closePath(); }, { x: -14, y: -37, w: 28, h: 38 }, { tint: L.robe, seed: who.length });
  rr(c, uu, 'paper', -10.5, -22, 21, 3.4, 1.4, { tint: L.trim, flat: true, outline: 1.6 });
  line(c, uu, 1.8, shift(L.trim, -0.1), () => { c.moveTo(-5, -34); c.lineTo(0, -27); c.lineTo(5, -34); });
  if (who === 'smith') rr(c, uu, 'paper', -8, -24, 16, 22, 3, { tint: '#7A4A30', flat: true, outline: 1.6 });
  // head
  ell(c, uu, 'skin', 0, -43.5, 9.6, 10.2, { seed: 2 });
  // hair / hats
  if (who === 'mozi' || who === 'bubu') {
    sp(c, uu, 'lacBlack', (p) => { p.moveTo(-9.8, -44); p.quadraticCurveTo(-10, -54.5, 0, -54.5); p.quadraticCurveTo(10, -54.5, 9.8, -44); p.quadraticCurveTo(0, -50, -9.8, -44); p.closePath(); }, { x: -10, y: -55, w: 20, h: 11 }, { outline: 1.8 });
    if (who === 'mozi') ell(c, uu, 'lacBlack', 0, -57, 3.8, 3.4, { outline: 1.6 });
    else { ell(c, uu, 'lacBlack', -6.5, -54, 3.4, 3.2, { outline: 1.6 }); ell(c, uu, 'lacBlack', 6.5, -54, 3.4, 3.2, { outline: 1.6 }); }
    rr(c, uu, 'teal', -9.9, -49.6, 19.8, 2.8, 1.2, { outline: 1.4 });
  } else if (who === 'luban') {
    sp(c, uu, 'lacRed', (p) => { p.moveTo(-10.4, -46); p.quadraticCurveTo(-10, -57, 0, -57); p.quadraticCurveTo(10, -57, 10.4, -46); p.closePath(); }, { x: -10.5, y: -57, w: 21, h: 11 });
    rr(c, uu, 'gold', -10.8, -48, 21.6, 3, 1.2, { outline: 1.4 });
  } else if (who === 'farmer') {
    poly(c, uu, 'straw', [-17, -47, 0, -59, 17, -47, 0, -49.5], { seed: 9 });
  } else {
    rr(c, uu, 'lacRed', -10, -51, 20, 5, 2.4, { outline: 1.6 });
  }
  // face
  const ey = -43; c.fillStyle = PAL.ink; c.strokeStyle = PAL.ink; c.lineWidth = 1.5 / uu; c.lineCap = 'round';
  if (st.face === 'happy' || st.face === 'sleepy') { for (const ex of [-3.6, 3.6]) { c.beginPath(); if (st.face === 'happy') c.arc(ex, ey + 0.8, 1.7, Math.PI * 1.1, Math.PI * 1.9); else { c.moveTo(ex - 1.7, ey); c.lineTo(ex + 1.7, ey); } c.stroke(); } }
  else for (const ex of [-3.6, 3.6]) { c.beginPath(); c.ellipse(ex, ey, 1.25, 1.55, 0, 0, TAU); c.fill(); }
  const open = st.talk ? 0.6 + 0.6 * Math.abs(Math.sin(t * 11)) : 0;
  c.beginPath(); if (open > 0.1) { c.ellipse(0, -38.2, 1.6, open * 1.5, 0, 0, TAU); c.fillStyle = '#7A2A20'; c.fill(); } else { c.arc(0, -39.6, 2.1, Math.PI * 0.2, Math.PI * 0.8); c.stroke(); }
  c.fillStyle = 'rgba(232,120,100,0.35)'; c.beginPath(); c.arc(-6.2, -40.2, 1.9, 0, TAU); c.arc(6.2, -40.2, 1.9, 0, TAU); c.fill();
  if (who === 'mozi') sp(c, uu, 'lacBlack', (p) => { p.moveTo(-4.6, -37); p.quadraticCurveTo(0, -27.5, 4.6, -37); p.quadraticCurveTo(0, -35, -4.6, -37); p.closePath(); }, { x: -5, y: -37, w: 10, h: 9 }, { outline: 1.2 });
  if (who === 'luban') line(c, uu, 1.8, '#3B2A22', () => { c.moveTo(-4, -37.4); c.quadraticCurveTo(0, -35.6, 4, -37.4); });
  // front arm + what it carries
  c.save(); c.translate(8, -31); c.rotate(-0.2 - (st.arm ?? 0) * 2.4);
  if (st.carry && st.carry !== 'pack') carryProp(c, uu, st.carry, t);
  rr(c, uu, 'paper', -2.6, -1, 5.2, 15, 2.6, { tint: L.robe, seed: 4 });
  ell(c, uu, 'skin', 0, 15, 2.8, 2.8, { outline: 1.6 });
  c.restore();
  c.restore();
}
function carryProp(c: C2, u: number, what: NonNullable<DollSt['carry']>, t: number): void {
  if (what === 'lantern') { line(c, u, 1.6, '#5A3A22', () => { c.moveTo(0, 15); c.lineTo(9, 22); c.lineTo(9, 27); }); lantern(c, u, 9, 33, 0.8, t, 1); }
  else if (what === 'square') { poly(c, u, 'gold', [-1, 12, 1.5, 12, 1.5, 28, 12, 28, 12, 30.5, -1, 30.5]); }
  else if (what === 'hammer') { c.save(); c.translate(0, 15); c.rotate(0.3); rr(c, u, 'wood', -1.2, -2, 2.4, 14, 1); rr(c, u, 'iron', -4, 10, 8, 4.5, 1.2); c.restore(); }
  else if (what === 'cake') { line(c, u, 1.4, '#5A3A22', () => { c.moveTo(0, 15); c.lineTo(10, 6); }); ell(c, u, 'grain', 11, 5, 3.6, 2.6, { outline: 1.4 }); }
  else if (what === 'hook') { c.save(); c.translate(0, 15); c.rotate(-0.4); rr(c, u, 'woodDark', -1.2, -16, 2.4, 22, 1); poly(c, u, 'iron', [-1.2, -16, -6, -19, -6, -14, -3, -15, -1.2, -12]); c.restore(); }
}

// ───────────── props ─────────────
export function lantern(c: C2, u: number, x: number, y: number, s: number, t: number, lit: number): void {
  c.save(); c.translate(x, y); c.scale(s, s); const uu = u * s;
  if (lit > 0) glow(c, 0, 0, 26, 'rgba(255,170,80,A)', 0.42 * lit * (0.92 + 0.08 * Math.sin(t * 6)));
  rr(c, uu, 'gold', -3.4, -9.6, 6.8, 2.2, 0.8, { outline: 1.2 });
  ell(c, uu, 'lacRed', 0, 0, 6.6, 8.2, { seed: 8 });
  line(c, uu, 1, 'rgba(60,20,10,0.5)', () => { c.moveTo(-3, -7.5); c.quadraticCurveTo(-4.4, 0, -3, 7.5); c.moveTo(3, -7.5); c.quadraticCurveTo(4.4, 0, 3, 7.5); });
  rr(c, uu, 'gold', -3.4, 7.4, 6.8, 2.2, 0.8, { outline: 1.2 });
  line(c, uu, 1.4, PAL.gold, () => { c.moveTo(0, 9.6); c.lineTo(0, 14 + Math.sin(t * 3) * 0.6); });
  c.restore();
}
export function campfire(c: C2, u: number, x: number, y: number, s: number, t: number): void {
  c.save(); c.translate(x, y); c.scale(s, s); const uu = u * s;
  glow(c, 0, -10, 90, 'rgba(255,150,60,A)', 0.36 + 0.05 * Math.sin(t * 5.3) + 0.03 * Math.sin(t * 13));
  for (const [r, ox] of [[-0.35, -2], [0.35, 2], [0, 0]] as const) { c.save(); c.rotate(r); rr(c, uu, 'woodDark', -14 + ox, -3, 28, 6, 3, { seed: 11 }); c.restore(); }
  for (let i = 0; i < 6; i++) ell(c, uu, 'stone', Math.cos(i / 6 * TAU) * 16, 2 + Math.sin(i / 6 * TAU) * 4, 4, 3, { outline: 1.4, seed: i });
  const fl = (sx: number, h: number, ph: number, tint: string): void => {
    const w = Math.sin(t * 7 + ph) * 2.2; const hh = h * (0.9 + 0.12 * Math.sin(t * 9 + ph));
    sp(c, uu, 'paper', (p) => { p.moveTo(sx - 8, -1); p.quadraticCurveTo(sx - 9, -hh * 0.5, sx + w, -hh); p.quadraticCurveTo(sx + 9, -hh * 0.5, sx + 8, -1); p.closePath(); }, { x: sx - 9, y: -hh, w: 18, h: hh }, { tint, flat: true, outline: 1.2 });
  };
  fl(-5, 22, 0, PAL.fire2); fl(5, 19, 2, PAL.fire2); fl(0, 28, 1, PAL.fire1); fl(0, 15, 3, '#FFE7A0');
  c.fillStyle = '#FFD27A';
  for (let i = 0; i < 5; i++) { const ph = (t * 0.6 + i * 0.21) % 1; c.globalAlpha = 1 - ph; c.beginPath(); c.arc(Math.sin(i * 7 + t * 2) * 8 * ph, -20 - ph * 50, 1.3, 0, TAU); c.fill(); }
  c.globalAlpha = 1; c.restore();
}
export function tent(c: C2, u: number, x: number, y: number, s: number): void {
  c.save(); c.translate(x, y); c.scale(s, s); const uu = u * s;
  poly(c, uu, 'paper', [-46, 0, 0, -58, 46, 0], { tint: '#E9D8B4', seed: 4 });
  poly(c, uu, 'paper', [-12, 0, 0, -36, 12, 0], { tint: '#6E4A30', flat: true });
  line(c, uu, 2, '#7A5A35', () => { c.moveTo(0, -58); c.lineTo(0, -66); });
  c.restore();
}
/** the sand-table box 鲁班's 木鹊 brings (open = 0 closed … 1 open, sand + lanes showing) */
export function sandbox(c: C2, u: number, x: number, y: number, s: number, open: number): void {
  c.save(); c.translate(x, y); c.scale(s, s); const uu = u * s;
  rr(c, uu, 'lacRed', -40, -14, 80, 18, 4, { seed: 6 });
  rr(c, uu, 'gold', -40, -2, 80, 3, 1, { outline: 1.2 });
  if (open > 0) {
    rr(c, uu, 'paper', -35, -12, 70, 9, 2, { tint: PAL.sandHi, flat: true, outline: 1.2 });
    line(c, uu, 1, 'rgba(120,80,40,0.4)', () => { for (let i = 1; i < 5; i++) { c.moveTo(-35 + i * 14, -12); c.lineTo(-35 + i * 14, -3); } });
    c.save(); c.translate(0, -14); c.scale(1, -open); rr(c, uu, 'lacRed', -40, 0, 80, 12, 4, { seed: 7 }); c.restore();
  } else rr(c, uu, 'lacRed', -40, -24, 80, 12, 4, { seed: 7 });
  c.restore();
}
export function table(c: C2, u: number, x: number, y: number, s: number): void {
  c.save(); c.translate(x, y); c.scale(s, s); const uu = u * s;
  rr(c, uu, 'woodDark', -50, -26, 6, 26, 2); rr(c, uu, 'woodDark', 44, -26, 6, 26, 2);
  rr(c, uu, 'wood', -58, -32, 116, 8, 3, { seed: 3 });
  c.restore();
}
export function plough(c: C2, u: number, x: number, y: number, s: number): void {
  c.save(); c.translate(x, y); c.scale(s, s); const uu = u * s;
  c.save(); c.rotate(-0.5); rr(c, uu, 'woodDark', -2, -36, 4, 36, 2); c.restore();
  rr(c, uu, 'wood', -4, -6, 34, 4.5, 2, { seed: 2 });
  poly(c, uu, 'bronze', [-6, -4, 8, -4, 2, 6, -10, 2], { seed: 4 });
  c.restore();
}
/** the owl kite (木鸢折成的风筝) */
export function kite(c: C2, u: number, x: number, y: number, s: number, t: number): void {
  c.save(); c.translate(x, y); c.rotate(Math.sin(t * 1.7) * 0.12); c.scale(s, s); const uu = u * s;
  line(c, uu, 1.4, '#C8372D', () => { c.moveTo(0, 12); for (let i = 1; i <= 4; i++) c.lineTo(Math.sin(t * 3 + i) * 3, 12 + i * 6); });
  poly(c, uu, 'paper', [-22, -2, -6, -6, 0, -12, 6, -6, 22, -2, 6, 4, 0, 12, -6, 4], { tint: '#F3E2BE', seed: 3 });
  poly(c, uu, 'woodDark', [-20, -2, -6, -4, -6, 2], { flat: true, outline: 1.2 }); poly(c, uu, 'woodDark', [20, -2, 6, -4, 6, 2], { flat: true, outline: 1.2 });
  ell(c, uu, 'gold', -2.6, -5, 1.8, 1.8, { outline: 1 }); ell(c, uu, 'gold', 2.6, -5, 1.8, 1.8, { outline: 1 });
  c.restore();
}
/** 鲁班's 云梯 (a wheeled base + n of 6 ladder sections) */
export function siegeLadder(c: C2, u: number, x: number, y: number, s: number, n: number): void {
  c.save(); c.translate(x, y); c.scale(s, s); const uu = u * s;
  rr(c, uu, 'woodDark', -34, -16, 68, 12, 3, { seed: 2 });
  for (const wx of [-22, 22]) { ell(c, uu, 'wood', wx, -4, 8, 8, { seed: 5 }); ell(c, uu, 'iron', wx, -4, 2.4, 2.4, { outline: 1.2 }); }
  const k = Math.max(0, Math.min(6, n));
  for (let i = 0; i < Math.ceil(k); i++) {
    const f = Math.min(1, k - i); const y0 = -16 - i * 30;
    c.save(); c.globalAlpha = f; c.translate(0, (1 - f) * 12);
    rr(c, uu, 'wood', -14, y0 - 31, 4.5, 33, 2, { seed: 10 + i }); rr(c, uu, 'wood', 9.5, y0 - 31, 4.5, 33, 2, { seed: 20 + i });
    for (let r = 0; r < 3; r++) rr(c, uu, 'woodDark', -12, y0 - 8 - r * 10, 24, 3, 1.2, { outline: 1.4 });
    c.restore();
  }
  c.restore();
}
/** 楚王宫 / 郢都 paper-cut silhouettes */
export function palace(c: C2, x: number, y: number, s: number, col: string, u = 1): void {
  paper(c, col, (p) => {
    p.rect(x - 160 * s, y - 30 * s, 320 * s, 30 * s); // platform
    p.rect(x - 110 * s, y - 80 * s, 220 * s, 50 * s); // hall
    const roof = (w: number, yy: number, hh: number): void => { p.moveTo(x - w * s, yy * s + y); p.quadraticCurveTo(x - w * 0.7 * s, (yy - 6) * s + y, x - w * 0.55 * s, (yy - hh) * s + y); p.lineTo(x + w * 0.55 * s, (yy - hh) * s + y); p.quadraticCurveTo(x + w * 0.7 * s, (yy - 6) * s + y, x + w * s, yy * s + y); p.closePath(); };
    roof(150, -78, 34); p.rect(x - 70 * s, y - 132 * s, 140 * s, 24 * s); roof(100, -128, 30);
  }, 2, u);
}
export function cityWall(c: C2, x0: number, x1: number, y: number, h: number, col: string, u = 1): void {
  paper(c, col, (p) => {
    p.moveTo(x0, y); p.lineTo(x0, y - h);
    for (let x = x0; x < x1; x += h * 0.5) { p.lineTo(x, y - h - h * 0.18); p.lineTo(x + h * 0.25, y - h - h * 0.18); p.lineTo(x + h * 0.25, y - h); p.lineTo(Math.min(x1, x + h * 0.5), y - h); }
    p.lineTo(x1, y); p.closePath();
    const gx = (x0 + x1) / 2; p.rect(gx - h * 0.9, y - h * 1.75, h * 1.8, h * 0.6);
    p.moveTo(gx - h * 1.25, y - h * 1.7); p.lineTo(gx, y - h * 2.15); p.lineTo(gx + h * 1.25, y - h * 1.7); p.closePath();
  }, 2, u);
}
export function hills(c: C2, x0: number, x1: number, y: number, amp: number, col: string, seed: number): void {
  paper(c, col, (p) => { p.moveTo(x0, y + 400); p.lineTo(x0, y); const n = 7; for (let i = 0; i < n; i++) { const xa = x0 + ((x1 - x0) * (i + 0.5)) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n; p.quadraticCurveTo(xa, y - amp * (0.5 + 0.5 * Math.sin(seed * 3.1 + i * 1.7)), xb, y - amp * 0.15 * Math.cos(seed + i)); } p.lineTo(x1, y + 400); p.closePath(); });
}
export function stars(c: C2, x0: number, y0: number, w: number, h: number, n: number, t: number, a = 1): void {
  let s = 12345; const r = (): number => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  c.fillStyle = '#FFF6DA';
  for (let i = 0; i < n; i++) { const x = x0 + r() * w, y = y0 + r() * h, rad = 0.8 + r() * 1.8, ph = r() * TAU; c.globalAlpha = a * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * (1 + r()) + ph))); c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill(); }
  c.globalAlpha = 1;
}
export function sun(c: C2, x: number, y: number, r: number, t: number): void {
  glow(c, x, y, r * 3.2, 'rgba(255,214,120,A)', 0.55);
  c.strokeStyle = 'rgba(255,200,90,0.75)'; c.lineWidth = r * 0.14; c.lineCap = 'round';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + t * 0.15; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); c.lineTo(x + Math.cos(a) * r * 1.65, y + Math.sin(a) * r * 1.65); c.stroke(); }
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, '#FFF3C4'); g.addColorStop(1, '#FFB347');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
export function moon(c: C2, x: number, y: number, r: number): void {
  glow(c, x, y, r * 3, 'rgba(255,246,210,A)', 0.25);
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, '#FFFBEA'); g.addColorStop(1, '#F1DFAE');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
/** the 墨子号 quantum-satellite silhouette (dock scene) */
export function satellite(c: C2, u: number, x: number, y: number, s: number, t: number): void {
  c.save(); c.translate(x, y); c.rotate(-0.25 + Math.sin(t * 0.8) * 0.04); c.scale(s, s); const uu = u * s;
  for (const sx of [-1, 1]) { rr(c, uu, 'teal', sx > 0 ? 12 : -46, -9, 34, 18, 2, { seed: 4 }); line(c, uu, 1, 'rgba(255,255,255,0.45)', () => { for (let i = 1; i < 4; i++) { const xx = (sx > 0 ? 12 : -46) + i * 8.5; c.moveTo(xx, -9); c.lineTo(xx, 9); } c.moveTo(sx > 0 ? 12 : -46, 0); c.lineTo(sx > 0 ? 46 : -12, 0); }); }
  rr(c, uu, 'gold', -12, -14, 24, 28, 4, { seed: 2 });
  ell(c, uu, 'paper', 0, -18, 6, 3, { tint: '#E9E2D0' });
  c.restore();
}
