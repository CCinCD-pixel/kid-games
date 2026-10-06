/**
 * Skin + persona painters (spec §6.3–6.5). Everything is Canvas-2D code rasterised once per match into the
 * atlas (art.ts) — no image files.
 *  - Head painters, one per `head` kind (§6.5 table). A head sprite's cell half-extent (64 px) is HEAD_HS·r,
 *    so 1 r ≈ 29 px inside a head cell; the head faces +x. Outlines use the same world thickness as the
 *    body (ball(..., k = 1/HEAD_HS)).
 *  - Body patterns: the shaded ball of a segment is never rotated (key light stays top-left, §6.1); the
 *    pattern detail ("deco": windows, plates, cleats, scales, bricks, wings, swirls…) is a second sprite
 *    rotated along the body and drawn right after its ball.
 *  - Extra sprites per head (comet crest, Saturn ring halves, dragon whiskers, solar wings, tower flag
 *    frames, candle flame frames, Yinglong's wings) and where each head keeps its eyes (§6.4 eye × head).
 *  - The 6 boost-trail styles (§4.6) as particle recipes; no style repeats a luminance change > 3 Hz.
 */
import { ball, mix, scale, rgb2css, type Rgb, type SkinDef } from './art';
import { rnd, type Fx } from './fx';
import { Blend } from './gl';

export const HEAD_HS = 2.2;
const TAU = Math.PI * 2;
const W: Rgb = [255, 255, 255];
const css = (c: Rgb, a = 1) => rgb2css(c, a);   // lazy: art.ts ↔ skins.ts import each other
const K = 1 / HEAD_HS;

// ------------------------------------------------------------------ eyes: where (head) × what (eyes)
export type EyeMode = 'free' | 'window' | 'dots' | 'dragon' | 'visorband' | 'glow';
export interface EyeSpot { fx: number; lat: number; er: number; mode: EyeMode }
export const EYE_SPOT: Record<string, EyeSpot> = {
  round: { fx: 0.36, lat: 0.46, er: 0.29, mode: 'free' },
  comet: { fx: 0.36, lat: 0.46, er: 0.29, mode: 'free' },
  ringed: { fx: 0.36, lat: 0.46, er: 0.29, mode: 'free' },
  tower: { fx: 0.3, lat: 0.4, er: 0.26, mode: 'free' },
  loco: { fx: -0.5, lat: 0.43, er: 0.21, mode: 'window' },
  digger: { fx: 0.12, lat: 0.4, er: 0.2, mode: 'window' },
  rocket: { fx: 0.26, lat: 0.17, er: 0.11, mode: 'dots' },
  maglev: { fx: 0.82, lat: 0.21, er: 0.1, mode: 'dots' },
  station: { fx: 0.38, lat: 0.13, er: 0.09, mode: 'dots' },
  mecha: { fx: 0.47, lat: 0.24, er: 0.11, mode: 'dots' },
  dragon: { fx: 0.2, lat: 0.42, er: 0.25, mode: 'dragon' },
  zhulong: { fx: 0.2, lat: 0.42, er: 0.25, mode: 'dragon' },
};
/** the effective eye drawing for a skin: the head decides where, `eyes` decides the look (§6.4 table) */
export function eyeLayout(head: string, eyes: string): EyeSpot {
  const sp = EYE_SPOT[head] ?? EYE_SPOT.round;
  if (sp.mode !== 'free') return sp;
  const mode: EyeMode = eyes === 'visor' ? 'visorband' : eyes === 'dragon' ? 'dragon' : eyes === 'glow' ? 'glow' : 'free';
  return { ...sp, mode, er: mode === 'dragon' ? 0.26 : sp.er };
}

// ------------------------------------------------------------------ helpers
function shade(c: CanvasRenderingContext2D, base: Rgb, x0: number, y0: number, x1: number, y1: number, lw: number, outline?: Rgb) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, css(mix(base, W, 0.24))); g.addColorStop(0.55, css(base)); g.addColorStop(1, css(scale(base, 0.72)));
  c.fillStyle = g; c.fill();
  c.lineWidth = lw; c.lineJoin = 'round'; c.strokeStyle = css(outline ?? scale(base, 0.5)); c.stroke();
}
function gloss(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.32) {
  c.beginPath(); c.ellipse(x, y, rx, ry, -0.5, 0, TAU); c.fillStyle = `rgba(255,255,255,${a})`; c.fill();
}
function glass(c: CanvasRenderingContext2D, x: number, y: number, r: number, top = '#4a5f96', bottom = '#111a36') {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill();
  c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.38, r * 0.34, r * 0.16, -0.5, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.45)'; c.fill();
}
function nostrils(c: CanvasRenderingContext2D, u: number, b: Rgb, x: number) {
  c.fillStyle = css(scale(b, 0.45));
  c.beginPath(); c.ellipse(x * u, -0.17 * u, 0.075 * u, 0.05 * u, 0, 0, TAU); c.ellipse(x * u, 0.17 * u, 0.075 * u, 0.05 * u, 0, 0, TAU); c.fill();
}
function cheeks(c: CanvasRenderingContext2D, u: number) {
  c.fillStyle = 'rgba(255,110,120,0.33)';
  c.beginPath(); c.ellipse(0.3 * u, -0.69 * u, 0.2 * u, 0.11 * u, 0, 0, TAU); c.ellipse(0.3 * u, 0.69 * u, 0.2 * u, 0.11 * u, 0, 0, TAU); c.fill();
}
function sparkle(c: CanvasRenderingContext2D, x: number, y: number, r: number, a = 0.9) {
  c.beginPath();
  for (let i = 0; i < 8; i++) { const ang = (i * Math.PI) / 4, rr = i % 2 ? r * 0.28 : r; c.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
  c.closePath(); c.fillStyle = `rgba(255,255,255,${a})`; c.fill();
}

// ------------------------------------------------------------------ head painters (+x forward)
function headRound(c: CanvasRenderingContext2D, u: number, base: Rgb, acc: Rgb, sk: SkinDef) {
  const b = sk.id === 'basnake' ? acc : base;   // 巴蛇: black body, green head (§6.5)
  ball(c, u, b, { sx: 1.29, k: K });
  nostrils(c, u, b, 1.12);
  if (sk.eyes !== 'glow') cheeks(c, u);
  if (sk.id === 'blackhole') { c.beginPath(); c.arc(-0.2 * u, 0, 0.5 * u, 0, TAU); c.lineWidth = 0.06 * u; c.strokeStyle = 'rgba(178,140,255,0.55)'; c.stroke(); }
  if (sk.id === 'dipper') for (const [x, y, r] of [[-0.55, -0.42, 0.11], [-0.25, 0.55, 0.08], [-0.78, 0.2, 0.07]]) sparkle(c, x * u, y * u, r * u, 0.85);
}
function headComet(c: CanvasRenderingContext2D, u: number, base: Rgb, acc: Rgb, sk: SkinDef) {
  headRound(c, u, base, acc, sk);
  for (const [x, y, r] of [[-0.55, -0.45, 0.13], [-0.2, 0.62, 0.1], [-0.82, 0.18, 0.08]]) sparkle(c, x * u, y * u, r * u);
}
function headLoco(c: CanvasRenderingContext2D, u: number, base: Rgb) {
  const brass = '#e3b448', brassD = '#8c5d14';
  // cow-catcher (grill triangle) in front
  c.beginPath(); c.moveTo(0.9 * u, -0.74 * u); c.lineTo(1.64 * u, -0.07 * u); c.quadraticCurveTo(1.72 * u, 0, 1.64 * u, 0.07 * u); c.lineTo(0.9 * u, 0.74 * u); c.closePath();
  c.fillStyle = '#3a3f4f'; c.fill(); c.lineWidth = 0.09 * u; c.lineJoin = 'round'; c.strokeStyle = '#151821'; c.stroke();
  c.lineWidth = 0.055 * u; c.strokeStyle = '#9aa2b6'; c.lineCap = 'round';
  for (const y of [-0.52, -0.26, 0, 0.26, 0.52]) { c.beginPath(); c.moveTo(1.0 * u, y * u); c.lineTo(1.56 * u, y * 0.1 * u); c.stroke(); }
  // boiler
  const boiler = () => { c.beginPath(); c.roundRect(-1.02 * u, -0.8 * u, 1.98 * u, 1.6 * u, 0.42 * u); };
  boiler(); shade(c, base, -u, -0.8 * u, 0.6 * u, 0.8 * u, 0.09 * u);
  c.save(); boiler(); c.clip();
  c.fillStyle = brass; for (const x of [-0.08, 0.6]) c.fillRect((x - 0.05) * u, -0.8 * u, 0.1 * u, 1.6 * u);
  c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(-1.1 * u, 0.42 * u, 2.2 * u, 0.4 * u);
  c.restore();
  // smoke-box face + headlight
  c.beginPath(); c.roundRect(0.7 * u, -0.62 * u, 0.34 * u, 1.24 * u, 0.16 * u); c.fillStyle = '#2b2f3a'; c.fill(); c.lineWidth = 0.07 * u; c.strokeStyle = brass; c.stroke();
  const hl = c.createRadialGradient(0.91 * u, -0.05 * u, 0.02 * u, 0.95 * u, 0, 0.22 * u); hl.addColorStop(0, '#ffffff'); hl.addColorStop(0.5, '#fff1a8'); hl.addColorStop(1, '#f2b928');
  c.beginPath(); c.arc(0.95 * u, 0, 0.2 * u, 0, TAU); c.fillStyle = hl; c.fill(); c.lineWidth = 0.06 * u; c.strokeStyle = brassD; c.stroke();
  // chimney
  c.beginPath(); c.arc(0.3 * u, 0, 0.3 * u, 0, TAU); c.fillStyle = '#1f222c'; c.fill(); c.lineWidth = 0.08 * u; c.strokeStyle = brass; c.stroke();
  c.beginPath(); c.arc(0.3 * u, 0, 0.17 * u, 0, TAU); c.fillStyle = '#07080b'; c.fill();
  // cab windows — the eyes live in them
  for (const s of [-1, 1]) {
    c.beginPath(); c.arc(-0.5 * u, s * 0.43 * u, 0.29 * u, 0, TAU); c.fillStyle = brass; c.fill(); c.lineWidth = 0.05 * u; c.strokeStyle = brassD; c.stroke();
    const g = c.createRadialGradient(-0.56 * u, s * 0.43 * u - 0.08 * u, 0.02 * u, -0.5 * u, s * 0.43 * u, 0.23 * u); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#efe4c8');
    c.beginPath(); c.arc(-0.5 * u, s * 0.43 * u, 0.22 * u, 0, TAU); c.fillStyle = g; c.fill();
  }
  gloss(c, 0.0, -0.58 * u, 0.32 * u, 0.1 * u, 0.3);
}
function headRocket(c: CanvasRenderingContext2D, u: number, base: Rgb, acc: Rgb) {
  const red = css(acc), redD = css(scale(acc, 0.55));
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(-0.3 * u, s * 0.64 * u); c.lineTo(-1.02 * u, s * 1.16 * u); c.quadraticCurveTo(-1.18 * u, s * 0.98 * u, -1.0 * u, s * 0.56 * u); c.closePath();
    c.fillStyle = red; c.fill(); c.lineWidth = 0.08 * u; c.lineJoin = 'round'; c.strokeStyle = redD; c.stroke();
  }
  const body = () => { c.beginPath(); c.moveTo(-1.02 * u, -0.66 * u); c.lineTo(0.3 * u, -0.7 * u); c.bezierCurveTo(1.0 * u, -0.68 * u, 1.5 * u, -0.3 * u, 1.64 * u, 0); c.bezierCurveTo(1.5 * u, 0.3 * u, 1.0 * u, 0.68 * u, 0.3 * u, 0.7 * u); c.lineTo(-1.02 * u, 0.66 * u); c.quadraticCurveTo(-1.12 * u, 0, -1.02 * u, -0.66 * u); c.closePath(); };
  body(); shade(c, base, -u, -0.7 * u, u, 0.7 * u, 0.09 * u, [89, 96, 122]);
  c.save(); body(); c.clip();
  c.fillStyle = red; c.fillRect(1.14 * u, -u, u, 2 * u); c.fillRect(-0.66 * u, -u, 0.26 * u, 2 * u);
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-0.66 * u, -u, 0.26 * u, 0.36 * u);
  c.restore();
  // porthole
  c.beginPath(); c.arc(0.26 * u, 0, 0.45 * u, 0, TAU); c.fillStyle = '#aab3c7'; c.fill(); c.lineWidth = 0.07 * u; c.strokeStyle = '#4b5470'; c.stroke();
  c.fillStyle = '#6d7690'; for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2; c.beginPath(); c.arc(0.26 * u + Math.cos(a) * 0.385 * u, Math.sin(a) * 0.385 * u, 0.035 * u, 0, TAU); c.fill(); }
  glass(c, 0.26 * u, 0, 0.32 * u);
  gloss(c, -0.4 * u, -0.42 * u, 0.36 * u, 0.1 * u, 0.4);
}
function headMecha(c: CanvasRenderingContext2D, u: number, base: Rgb, acc: Rgb) {
  c.lineCap = 'round'; c.lineWidth = 0.1 * u; c.strokeStyle = '#3b4252';
  c.beginPath(); c.moveTo(-0.35 * u, -0.5 * u); c.lineTo(-0.95 * u, -1.22 * u); c.stroke();
  c.beginPath(); c.arc(-0.95 * u, -1.22 * u, 0.12 * u, 0, TAU); c.fillStyle = '#e6ebf5'; c.fill(); c.lineWidth = 0.05 * u; c.stroke();
  const hex = () => { c.beginPath(); for (const [x, y] of [[1.2, 0], [0.64, -0.92], [-0.74, -0.92], [-1.16, 0], [-0.74, 0.92], [0.64, 0.92]]) c.lineTo(x * u, y * u); c.closePath(); };
  hex(); shade(c, base, -u, -u, u, u, 0.09 * u);
  c.save(); hex(); c.clip();
  c.fillStyle = css(acc);
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-0.95 * u, s * 0.5 * u); c.lineTo(-0.65 * u, s * 0.5 * u); c.lineTo(-0.38 * u, s * 0.95 * u); c.lineTo(-0.7 * u, s * 0.95 * u); c.closePath(); c.fill(); }
  c.strokeStyle = css(scale(base, 0.6)); c.lineWidth = 0.05 * u;
  c.beginPath(); c.moveTo(-1.1 * u, 0); c.lineTo(0.12 * u, 0); c.moveTo(-0.15 * u, -0.92 * u); c.lineTo(0.12 * u, -0.45 * u); c.moveTo(-0.15 * u, 0.92 * u); c.lineTo(0.12 * u, 0.45 * u); c.stroke();
  c.restore();
  c.fillStyle = css(mix(base, W, 0.5));
  for (const [x, y] of [[-0.6, -0.7], [-0.6, 0.7], [0.32, -0.74], [0.32, 0.74]]) { c.beginPath(); c.arc(x * u, y * u, 0.055 * u, 0, TAU); c.fill(); }
  // LED visor (the eyes are two light points inside it)
  c.beginPath(); c.roundRect(0.18 * u, -0.64 * u, 0.62 * u, 1.28 * u, 0.24 * u);
  const vg = c.createLinearGradient(0.18 * u, 0, 0.8 * u, 0); vg.addColorStop(0, '#08141d'); vg.addColorStop(1, '#123247');
  c.fillStyle = vg; c.fill(); c.lineWidth = 0.07 * u; c.strokeStyle = '#3fe0ff'; c.stroke();
  c.strokeStyle = 'rgba(63,224,255,0.16)'; c.lineWidth = 0.03 * u;
  for (let y = -0.5; y <= 0.5; y += 0.14) { c.beginPath(); c.moveTo(0.26 * u, y * u); c.lineTo(0.74 * u, y * u); c.stroke(); }
  gloss(c, -0.45 * u, -0.48 * u, 0.3 * u, 0.1 * u, 0.35);
}
function headDigger(c: CanvasRenderingContext2D, u: number, base: Rgb, acc: Rgb, closed: boolean) {
  const steel: Rgb = [146, 155, 173];
  c.lineCap = 'round';
  for (const s of [-1, 1]) {
    c.lineWidth = 0.17 * u; c.strokeStyle = '#454a57'; c.beginPath(); c.moveTo(0.3 * u, s * 0.28 * u); c.lineTo(1.0 * u, s * 0.3 * u); c.stroke();
    c.lineWidth = 0.07 * u; c.strokeStyle = '#d3d8e2'; c.beginPath(); c.moveTo(0.58 * u, s * 0.28 * u); c.lineTo(0.96 * u, s * 0.3 * u); c.stroke();
  }
  if (!closed) {
    c.beginPath(); c.moveTo(0.9 * u, -0.6 * u); c.lineTo(1.48 * u, -0.76 * u); c.lineTo(1.48 * u, 0.76 * u); c.lineTo(0.9 * u, 0.6 * u); c.closePath();
    shade(c, steel, 0.9 * u, -0.7 * u, 1.5 * u, 0.7 * u, 0.08 * u, [52, 56, 68]);
    c.beginPath(); c.moveTo(1.0 * u, -0.5 * u); c.lineTo(1.4 * u, -0.62 * u); c.lineTo(1.4 * u, 0.62 * u); c.lineTo(1.0 * u, 0.5 * u); c.closePath(); c.fillStyle = 'rgba(20,22,30,0.4)'; c.fill();
    for (const y of [-0.56, -0.19, 0.19, 0.56]) { c.beginPath(); c.moveTo(1.46 * u, (y - 0.11) * u); c.lineTo(1.72 * u, y * u); c.lineTo(1.46 * u, (y + 0.11) * u); c.closePath(); c.fillStyle = '#e4e8ef'; c.fill(); c.lineWidth = 0.04 * u; c.strokeStyle = '#3a3f4c'; c.stroke(); }
  } else {
    c.beginPath(); c.roundRect(0.9 * u, -0.66 * u, 0.5 * u, 1.32 * u, [0.08 * u, 0.36 * u, 0.36 * u, 0.08 * u]);
    shade(c, steel, 0.9 * u, -0.7 * u, 1.4 * u, 0.7 * u, 0.08 * u, [52, 56, 68]);
    c.beginPath(); c.moveTo(1.05 * u, -0.5 * u); c.quadraticCurveTo(1.28 * u, 0, 1.05 * u, 0.5 * u); c.lineWidth = 0.05 * u; c.strokeStyle = 'rgba(30,32,40,0.5)'; c.stroke();
  }
  const cab = () => { c.beginPath(); c.roundRect(-1.0 * u, -0.82 * u, 1.55 * u, 1.64 * u, 0.3 * u); };
  cab(); shade(c, base, -u, -0.8 * u, 0.6 * u, 0.8 * u, 0.09 * u);
  c.save(); cab(); c.clip();
  c.fillStyle = css(acc); c.fillRect(-1.0 * u, -0.82 * u, 0.24 * u, 1.64 * u);
  c.fillStyle = css(base); for (let y = -0.9; y < 0.9; y += 0.3) { c.beginPath(); c.moveTo(-1.0 * u, y * u); c.lineTo(-0.76 * u, (y + 0.15) * u); c.lineTo(-0.76 * u, (y + 0.29) * u); c.lineTo(-1.0 * u, (y + 0.14) * u); c.closePath(); c.fill(); }
  c.restore();
  c.beginPath(); c.roundRect(-0.7 * u, -0.62 * u, 1.08 * u, 1.24 * u, 0.2 * u); c.fillStyle = css(mix(base, W, 0.14)); c.fill();
  for (const s of [-1, 1]) {
    c.beginPath(); c.arc(0.12 * u, s * 0.4 * u, 0.28 * u, 0, TAU); c.fillStyle = '#3a3a3a'; c.fill();
    const g = c.createRadialGradient(0.06 * u, s * 0.4 * u - 0.07 * u, 0.02 * u, 0.12 * u, s * 0.4 * u, 0.21 * u); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dbeef8');
    c.beginPath(); c.arc(0.12 * u, s * 0.4 * u, 0.21 * u, 0, TAU); c.fillStyle = g; c.fill();
  }
  gloss(c, -0.55 * u, -0.6 * u, 0.28 * u, 0.09 * u, 0.32);
}
function headMaglev(c: CanvasRenderingContext2D, u: number, base: Rgb, acc: Rgb) {
  const body = () => { c.beginPath(); c.moveTo(-1.02 * u, -0.68 * u); c.lineTo(0.15 * u, -0.7 * u); c.bezierCurveTo(1.0 * u, -0.7 * u, 1.72 * u, -0.3 * u, 1.8 * u, 0); c.bezierCurveTo(1.72 * u, 0.3 * u, 1.0 * u, 0.7 * u, 0.15 * u, 0.7 * u); c.lineTo(-1.02 * u, 0.68 * u); c.quadraticCurveTo(-1.1 * u, 0, -1.02 * u, -0.68 * u); c.closePath(); };
  body(); shade(c, base, -u, -0.7 * u, u, 0.7 * u, 0.09 * u, [93, 106, 133]);
  c.save(); body(); c.clip();
  c.strokeStyle = css(acc); c.lineWidth = 0.13 * u; c.lineCap = 'round';
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-1.2 * u, s * 0.52 * u); c.lineTo(0.2 * u, s * 0.54 * u); c.bezierCurveTo(0.9 * u, s * 0.52 * u, 1.4 * u, s * 0.3 * u, 1.85 * u, s * 0.05 * u); c.stroke(); }
  c.restore();
  c.beginPath(); c.moveTo(0.5 * u, -0.5 * u); c.bezierCurveTo(0.95 * u, -0.52 * u, 1.26 * u, -0.28 * u, 1.3 * u, 0); c.bezierCurveTo(1.26 * u, 0.28 * u, 0.95 * u, 0.52 * u, 0.5 * u, 0.5 * u); c.quadraticCurveTo(0.6 * u, 0, 0.5 * u, -0.5 * u); c.closePath();
  const g = c.createLinearGradient(0.5 * u, -0.5 * u, 1.2 * u, 0.5 * u); g.addColorStop(0, '#36508a'); g.addColorStop(1, '#0d1530');
  c.fillStyle = g; c.fill(); c.lineWidth = 0.05 * u; c.strokeStyle = '#a8bde8'; c.stroke();
  c.beginPath(); c.moveTo(0.66 * u, -0.38 * u); c.quadraticCurveTo(0.95 * u, -0.36 * u, 1.08 * u, -0.18 * u); c.lineWidth = 0.06 * u; c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineCap = 'round'; c.stroke();
  gloss(c, -0.45 * u, -0.46 * u, 0.4 * u, 0.1 * u, 0.4);
}
function headStation(c: CanvasRenderingContext2D, u: number, base: Rgb) {
  c.beginPath(); c.arc(0.98 * u, 0, 0.36 * u, 0, TAU); c.fillStyle = '#8d96a8'; c.fill(); c.lineWidth = 0.07 * u; c.strokeStyle = '#3c4354'; c.stroke();
  c.beginPath(); c.arc(0.98 * u, 0, 0.2 * u, 0, TAU); c.fillStyle = '#2c3242'; c.fill();
  const mod = () => { c.beginPath(); c.roundRect(-1.0 * u, -0.68 * u, 1.9 * u, 1.36 * u, 0.3 * u); };
  mod(); shade(c, base, -u, -0.7 * u, u, 0.7 * u, 0.09 * u, [89, 97, 122]);
  c.save(); mod(); c.clip();
  c.fillStyle = '#e8b84a'; c.fillRect(-1.0 * u, -0.7 * u, 0.3 * u, 1.4 * u);
  c.strokeStyle = 'rgba(140,90,20,0.6)'; c.lineWidth = 0.03 * u; for (let y = -0.6; y < 0.7; y += 0.22) { c.beginPath(); c.moveTo(-1.0 * u, y * u); c.lineTo(-0.7 * u, (y + 0.08) * u); c.stroke(); }
  c.strokeStyle = 'rgba(60,66,84,0.4)'; c.lineWidth = 0.05 * u; for (const x of [-0.5, 0.02, 0.62]) { c.beginPath(); c.moveTo(x * u, -0.7 * u); c.lineTo(x * u, 0.7 * u); c.stroke(); }
  c.restore();
  c.beginPath(); c.arc(0.38 * u, 0, 0.34 * u, 0, TAU); c.fillStyle = '#c9ced8'; c.fill(); c.lineWidth = 0.05 * u; c.strokeStyle = '#59617a'; c.stroke();
  glass(c, 0.38 * u, 0, 0.26 * u);
  gloss(c, -0.4 * u, -0.46 * u, 0.36 * u, 0.1 * u, 0.4);
}
function headDragon(c: CanvasRenderingContext2D, u: number, base: Rgb, acc: Rgb, sk: SkinDef) {
  const zhu = sk.id === 'zhulong';
  const horn = zhu ? '#ffcf4a' : '#f4e3b5', hornD = zhu ? '#7a4a00' : '#7d6232';
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const s of [-1, 1]) {
    const antler = () => { c.beginPath(); c.moveTo(-0.2 * u, s * 0.42 * u); c.quadraticCurveTo(-0.72 * u, s * 0.6 * u, -1.28 * u, s * 1.0 * u); c.moveTo(-0.66 * u, s * 0.6 * u); c.quadraticCurveTo(-0.74 * u, s * 0.95 * u, -0.6 * u, s * 1.24 * u); c.moveTo(-1.0 * u, s * 0.8 * u); c.lineTo(-1.3 * u, s * 0.66 * u); };
    antler(); c.lineWidth = 0.26 * u; c.strokeStyle = hornD; c.stroke();
    antler(); c.lineWidth = 0.15 * u; c.strokeStyle = horn; c.stroke();
  }
  // mane tufts around the back of the head
  const mane = css(acc), maneD = css(scale(acc, 0.62));
  for (const a of [2.35, 2.75, Math.PI, 3.53, 3.93]) {
    const x0 = Math.cos(a) * 0.62 * u, y0 = Math.sin(a) * 0.62 * u, x1 = Math.cos(a) * 1.22 * u, y1 = Math.sin(a) * 1.22 * u;
    const nx = -Math.sin(a) * 0.2 * u, ny = Math.cos(a) * 0.2 * u;
    c.beginPath(); c.moveTo(x0 + nx, y0 + ny); c.quadraticCurveTo(x1 + nx * 0.6, y1 + ny * 0.6, x1 - nx * 0.4, y1 - ny * 0.4); c.quadraticCurveTo(x0, y0, x0 - nx, y0 - ny); c.closePath();
    c.fillStyle = mane; c.fill(); c.lineWidth = 0.06 * u; c.strokeStyle = maneD; c.stroke();
  }
  c.save(); c.translate(-0.12 * u, 0); ball(c, 0.86 * u, base, { sx: 1.18, k: K }); c.restore();
  // snout
  c.beginPath(); c.ellipse(0.74 * u, 0, 0.62 * u, 0.52 * u, 0, 0, TAU);
  shade(c, mix(base, W, 0.08), 0.2 * u, -0.5 * u, 1.3 * u, 0.5 * u, 0.08 * u);
  c.strokeStyle = css(scale(base, 0.45)); c.lineWidth = 0.06 * u;
  for (const s of [-1, 1]) { c.beginPath(); c.arc(1.16 * u, s * 0.2 * u, 0.08 * u, s > 0 ? -1.2 : 1.2 - Math.PI, s > 0 ? 1.8 : 1.2 + Math.PI * 0.6); c.stroke(); }
  // forehead scale arcs
  c.strokeStyle = css(mix(acc, W, 0.2)); c.lineWidth = 0.055 * u;
  for (const [x, y] of [[-0.45, 0], [-0.2, -0.24], [-0.2, 0.24]]) { c.beginPath(); c.arc(x * u, y * u, 0.16 * u, Math.PI * 0.5, Math.PI * 1.5); c.stroke(); }
  gloss(c, 0.55 * u, -0.28 * u, 0.26 * u, 0.09 * u, 0.4);
  if (zhu) {   // a candle held in the mouth (the flame is a separate flickering sprite)
    c.beginPath(); c.roundRect(1.14 * u, -0.09 * u, 0.5 * u, 0.18 * u, 0.06 * u); c.fillStyle = '#fff4dc'; c.fill(); c.lineWidth = 0.04 * u; c.strokeStyle = '#b08850'; c.stroke();
    c.beginPath(); c.moveTo(1.56 * u, 0); c.lineTo(1.66 * u, 0); c.lineWidth = 0.035 * u; c.strokeStyle = '#2b2018'; c.stroke();
  }
}
function headTower(c: CanvasRenderingContext2D, u: number, base: Rgb, acc: Rgb) {
  const light = css(mix(base, W, 0.16)), dark = css(scale(base, 0.5));
  const merlon = (x: number, y: number, w: number, h: number) => { c.beginPath(); c.roundRect(x * u, y * u, w * u, h * u, 0.04 * u); c.fillStyle = light; c.fill(); c.lineWidth = 0.05 * u; c.strokeStyle = dark; c.stroke(); };
  for (const x of [-0.72, -0.26, 0.2, 0.66]) { merlon(x - 0.13, -1.0, 0.26, 0.26); merlon(x - 0.13, 0.74, 0.26, 0.26); }
  for (const y of [-0.42, 0, 0.42]) merlon(-1.1, y - 0.13, 0.26, 0.26);
  const blk = () => { c.beginPath(); c.roundRect(-0.98 * u, -0.86 * u, 1.98 * u, 1.72 * u, 0.18 * u); };
  blk(); shade(c, base, -u, -0.86 * u, u, 0.86 * u, 0.09 * u);
  c.save(); blk(); c.clip();
  c.strokeStyle = css(scale(acc, 0.85), 0.55); c.lineWidth = 0.045 * u;
  for (let r = 0, y = -0.86; y < 0.9; y += 0.34, r++) {
    c.beginPath(); c.moveTo(-u, y * u); c.lineTo(u, y * u); c.stroke();
    for (let x = -1 + (r % 2) * 0.3; x < 1; x += 0.6) { c.beginPath(); c.moveTo(x * u, y * u); c.lineTo(x * u, (y + 0.34) * u); c.stroke(); }
  }
  c.restore();
  c.beginPath(); c.roundRect(-0.7 * u, -0.6 * u, 1.48 * u, 1.2 * u, 0.12 * u); c.fillStyle = css(mix(base, W, 0.1), 0.85); c.fill(); c.lineWidth = 0.05 * u; c.strokeStyle = css(scale(base, 0.62)); c.stroke();
  gloss(c, -0.4 * u, -0.45 * u, 0.32 * u, 0.1 * u, 0.3);
}

export function paintSkinHead(c: CanvasRenderingContext2D, R: number, sk: SkinDef, base: Rgb, acc: Rgb, alt = false) {
  const u = (R + 8) / HEAD_HS;
  switch (sk.head) {
    case 'comet': headComet(c, u, base, acc, sk); break;
    case 'ringed': headRound(c, u, base, acc, sk); break;
    case 'loco': headLoco(c, u, base); break;
    case 'rocket': headRocket(c, u, base, acc); break;
    case 'mecha': headMecha(c, u, base, acc); break;
    case 'digger': headDigger(c, u, base, acc, alt); break;
    case 'maglev': headMaglev(c, u, base, acc); break;
    case 'station': headStation(c, u, base); break;
    case 'dragon': case 'zhulong': headDragon(c, u, base, acc, sk); break;
    case 'tower': headTower(c, u, base, acc); break;
    default: headRound(c, u, base, acc, sk);
  }
}

// ------------------------------------------------------------------ extra head sprites (same HEAD_HS scale)
export function paintExtra(c: CanvasRenderingContext2D, R: number, kind: string, base: Rgb, acc: Rgb) {
  const u = (R + 8) / HEAD_HS;
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (kind === 'comet') {      // ice-crystal crest streaming back (drawn white, tinted, additive)
    for (const [a, len, w] of [[-0.42, 1.2, 0.3], [0, 1.55, 0.4], [0.42, 1.2, 0.3]]) {
      c.save(); c.rotate(Math.PI + a);
      const g = c.createLinearGradient(0.45 * u, 0, (0.45 + len) * u, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.45, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.beginPath(); c.moveTo(0.45 * u, 0); c.quadraticCurveTo(0.9 * u, -w * u, (0.45 + len) * u, 0); c.quadraticCurveTo(0.9 * u, w * u, 0.45 * u, 0); c.fillStyle = g; c.fill();
      c.restore();
    }
  } else if (kind === 'ringB' || kind === 'ringF') {   // Saturn ring: back half under the head, front half over it
    const front = kind === 'ringF', tilt = 0.5, a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : TAU;
    for (const [w, col] of [[0.34, css(scale(acc, 0.5))], [0.26, css(acc)], [0.15, css(mix(base, W, 0.5))], [0.05, 'rgba(255,255,255,0.75)']] as [number, string][]) {
      c.beginPath(); c.ellipse(0, 0, 1.68 * u, 0.5 * u, tilt, a0, a1); c.lineWidth = w * u; c.lineCap = 'butt'; c.strokeStyle = col; c.stroke();
    }
    c.beginPath(); c.ellipse(0, 0, 1.6 * u, 0.475 * u, tilt, a0, a1); c.lineWidth = 0.025 * u; c.strokeStyle = css(scale(acc, 0.45), 0.8); c.stroke();
  } else if (kind === 'whisk') {   // two long dragon whiskers (swing ±15° with the turn)
    for (const s of [-1, 1]) {
      const p = () => { c.beginPath(); c.moveTo(1.12 * u, s * 0.32 * u); c.bezierCurveTo(0.95 * u, s * 1.2 * u, -0.1 * u, s * 1.0 * u, -0.6 * u, s * 1.62 * u); c.arc(-0.5 * u, s * 1.72 * u, 0.14 * u, s > 0 ? -2.4 : 2.4, s > 0 ? 1.2 : -1.2, s < 0); };
      p(); c.lineWidth = 0.13 * u; c.strokeStyle = css(scale(base, 0.4), 0.55); c.stroke();
      p(); c.lineWidth = 0.07 * u; c.strokeStyle = css(mix(acc, W, 0.3)); c.stroke();
    }
  } else if (kind === 'wings') {   // 天宫 solar wings (tilt = y-scale when turning)
    for (const s of [-1, 1]) {
      c.lineWidth = 0.09 * u; c.strokeStyle = '#a3acbf'; c.beginPath(); c.moveTo(-0.12 * u, s * 0.55 * u); c.lineTo(-0.12 * u, s * 0.98 * u); c.stroke();
      const y0 = s > 0 ? 0.95 : -2.05;
      c.beginPath(); c.roundRect(-0.6 * u, y0 * u, 0.96 * u, 1.1 * u, 0.06 * u);
      const g = c.createLinearGradient(-0.6 * u, y0 * u, 0.36 * u, (y0 + 1.1) * u); g.addColorStop(0, css(mix(acc, W, 0.35))); g.addColorStop(1, css(scale(acc, 0.7)));
      c.fillStyle = g; c.fill(); c.lineWidth = 0.05 * u; c.strokeStyle = '#d5ddeb'; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.025 * u;
      for (let x = -0.28; x < 0.36; x += 0.32) { c.beginPath(); c.moveTo(x * u, y0 * u); c.lineTo(x * u, (y0 + 1.1) * u); c.stroke(); }
      for (let y = y0 + 0.275; y < y0 + 1.1; y += 0.275) { c.beginPath(); c.moveTo(-0.6 * u, y * u); c.lineTo(0.36 * u, y * u); c.stroke(); }
    }
  } else if (kind === 'ywing') {   // 应龙: a pair of small feathered wings on the first body segment
    for (const s of [-1, 1]) for (const [ex, ey, w] of [[-0.95, 1.55, 0.26], [-0.55, 1.75, 0.28], [-0.12, 1.62, 0.3]]) {
      c.beginPath(); c.moveTo(0.15 * u, s * 0.5 * u); c.quadraticCurveTo((ex + 0.35) * u, s * (ey - 0.2) * u - s * w * u, ex * u, s * ey * u); c.quadraticCurveTo((ex + 0.1) * u, s * (ey - 0.6) * u, 0.15 * u, s * 0.5 * u);
      c.fillStyle = css(acc); c.fill(); c.lineWidth = 0.06 * u; c.strokeStyle = '#d99a2b'; c.stroke();
    }
  } else if (kind.startsWith('flag')) {   // 长城 tower flag: 3 frames of a waving pennant
    const ph = Number(kind.slice(4)) * 2.1;
    c.lineWidth = 0.08 * u; c.strokeStyle = '#4a3420'; c.beginPath(); c.arc(-0.62 * u, -0.62 * u, 0.06 * u, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(-0.62 * u, -0.62 * u);
    for (let i = 0; i <= 10; i++) { const x = -0.62 - i * 0.09, y = -0.62 - 0.08 * Math.sin(i * 0.7 + ph) * (i / 10); c.lineTo(x * u, (y - 0.42 + 0.06 * (i / 10)) * u); }
    for (let i = 10; i >= 0; i--) { const x = -0.62 - i * 0.09, y = -0.62 - 0.08 * Math.sin(i * 0.7 + ph) * (i / 10); c.lineTo(x * u, (y - 0.06 * (i / 10)) * u); }
    c.closePath(); c.fillStyle = '#e8452c'; c.fill(); c.lineWidth = 0.04 * u; c.strokeStyle = '#7a1a10'; c.stroke();
    c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(-0.86 * u, -0.86 * u, 0.06 * u, 0, TAU); c.fill();
  } else if (kind.startsWith('flame')) {   // 烛龙 candle flame, 3 frames (cycled at 8 fps); centred
    const f = Number(kind.slice(5)), lean = [-0.12, 0.05, 0.14][f] ?? 0, h = [1.0, 1.12, 0.94][f] ?? 1, r = R * 0.42;
    c.save(); c.rotate(lean);
    const g = c.createRadialGradient(0, r * 0.35, r * 0.05, 0, 0, r * 1.6 * h);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fff2a0'); g.addColorStop(0.65, '#ffb030'); g.addColorStop(1, '#ff5a1f');
    c.beginPath(); c.moveTo(0, -r * 1.6 * h); c.bezierCurveTo(r * 0.75, -r * 0.5, r * 0.85, r * 0.75, 0, r * 0.95); c.bezierCurveTo(-r * 0.85, r * 0.75, -r * 0.75, -r * 0.5, 0, -r * 1.6 * h); c.fillStyle = g; c.fill();
    c.restore();
  }
}
/** which extra sprites a skin needs (keys are `x:<skin>:<kind>`) */
export function extrasOf(sk: SkinDef): string[] {
  switch (sk.head) {
    case 'comet': return ['comet'];
    case 'ringed': return ['ringB', 'ringF'];
    case 'dragon': return sk.id === 'yinglong' ? ['whisk', 'ywing'] : ['whisk'];
    case 'zhulong': return ['whisk', 'flame0', 'flame1', 'flame2'];
    case 'station': return ['wings'];
    case 'tower': return ['flag0', 'flag1', 'flag2'];
    default: return [];
  }
}

// ------------------------------------------------------------------ body pattern overlays (segment cell, +x = toward the head)
/** variants whose ball is the plain shaded ball (their look is the rotated overlay) */
export const DECO = new Set(['car', 'panel', 'panelY', 'trackA', 'trackB', 'module', 'wing', 'scale', 'cloud', 'swirl', 'brickA', 'brickB', 'crenel']);
/** overlay size multiplier (wings and merlons reach outside the ball) */
export const DECO_K: Record<string, number> = { wing: 2, crenel: 1.3 };

export function paintDeco(c: CanvasRenderingContext2D, R: number, v: string, base: Rgb, acc: Rgb) {
  const k = DECO_K[v] ?? 1, Rb = (R + 8) / k - 8;   // the ball radius inside this cell
  const clipBall = () => { c.beginPath(); c.arc(0, 0, Rb - 6, 0, TAU); c.clip(); };
  c.lineCap = 'round'; c.lineJoin = 'round';
  switch (v) {
    case 'car': {   // a wagon: roof ridge + two windows each side
      c.save(); clipBall();
      c.fillStyle = css(scale(base, 0.8)); c.fillRect(-Rb, -Rb * 0.12, Rb * 2, Rb * 0.24);
      for (const sy of [-1, 1]) for (const x of [-0.3, 0.3]) { c.beginPath(); c.roundRect((x - 0.17) * Rb, sy * 0.36 * Rb - 0.14 * Rb, 0.34 * Rb, 0.28 * Rb, 0.06 * Rb); c.fillStyle = '#fff1c8'; c.fill(); c.lineWidth = 3; c.strokeStyle = css(scale(acc, 1)); c.stroke(); }
      c.restore(); break;
    }
    case 'panel': case 'panelY': {   // grey armour plate + rivets; every other one a yellow warning band
      c.save(); clipBall();
      c.beginPath(); c.roundRect(-0.55 * Rb, -0.55 * Rb, 1.1 * Rb, 1.1 * Rb, 0.14 * Rb); c.lineWidth = 3; c.strokeStyle = css(scale(base, 0.6)); c.stroke();
      if (v === 'panelY') {
        c.save(); c.beginPath(); c.rect(-0.22 * Rb, -Rb, 0.44 * Rb, 2 * Rb); c.clip();
        c.fillStyle = css(acc); c.fillRect(-0.22 * Rb, -Rb, 0.44 * Rb, 2 * Rb);
        c.fillStyle = '#2a2d36'; for (let y = -1.2; y < 1.2; y += 0.36) { c.beginPath(); c.moveTo(-0.3 * Rb, y * Rb); c.lineTo(0.3 * Rb, (y + 0.3) * Rb); c.lineTo(0.3 * Rb, (y + 0.48) * Rb); c.lineTo(-0.3 * Rb, (y + 0.18) * Rb); c.closePath(); c.fill(); }
        c.restore();
      }
      c.fillStyle = css(mix(base, W, 0.55)); for (const [x, y] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) { c.beginPath(); c.arc(x * Rb, y * Rb, 0.07 * Rb, 0, TAU); c.fill(); }
      c.restore(); break;
    }
    case 'trackA': case 'trackB': {   // crawler tracks along both sides, cleats scroll while boosting
      c.save(); clipBall();
      const off = v === 'trackB' ? 0.2 : 0;
      for (const sy of [-1, 1]) {
        c.fillStyle = css(acc); c.fillRect(-Rb, sy > 0 ? 0.42 * Rb : -Rb, 2 * Rb, 0.58 * Rb);
        c.fillStyle = css(mix(acc, W, 0.3));
        for (let x = -1.2 + off; x < 1.2; x += 0.4) c.fillRect((x - 0.07) * Rb, sy > 0 ? 0.46 * Rb : -0.98 * Rb, 0.14 * Rb, 0.52 * Rb);
      }
      c.restore(); break;
    }
    case 'module': {   // 天宫 cabin segment: two seams + foil patch
      c.save(); clipBall();
      c.strokeStyle = css(scale(base, 0.6)); c.lineWidth = 3;
      for (const x of [-0.42, 0.42]) { c.beginPath(); c.moveTo(x * Rb, -Rb); c.lineTo(x * Rb, Rb); c.stroke(); }
      c.fillStyle = 'rgba(232,184,74,0.75)'; c.fillRect(-0.18 * Rb, 0.3 * Rb, 0.36 * Rb, 0.4 * Rb);
      c.restore(); break;
    }
    case 'wing': {   // a pair of solar-panel wings sticking out sideways
      for (const sy of [-1, 1]) {
        c.lineWidth = 4; c.strokeStyle = '#a3acbf'; c.beginPath(); c.moveTo(0, sy * 0.4 * Rb); c.lineTo(0, sy * 1.0 * Rb); c.stroke();
        const y0 = sy > 0 ? 0.98 * Rb : -2.02 * Rb;
        c.beginPath(); c.roundRect(-0.42 * Rb, y0, 0.84 * Rb, 1.04 * Rb, 3);
        const g = c.createLinearGradient(-0.4 * Rb, y0, 0.4 * Rb, y0 + Rb); g.addColorStop(0, css(mix(acc, W, 0.35))); g.addColorStop(1, css(scale(acc, 0.7)));
        c.fillStyle = g; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#d5ddeb'; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, y0); c.lineTo(0, y0 + 1.04 * Rb); c.moveTo(-0.42 * Rb, y0 + 0.52 * Rb); c.lineTo(0.42 * Rb, y0 + 0.52 * Rb); c.stroke();
      }
      break;
    }
    case 'scale': {   // dragon scales: three overlapping arcs opening toward the head
      c.save(); clipBall();
      for (const [x, y] of [[-0.2, -0.36], [-0.2, 0.36], [0.22, 0]]) {
        c.beginPath(); c.arc(x * Rb, y * Rb, 0.42 * Rb, Math.PI * 0.5, Math.PI * 1.5); c.closePath();
        c.fillStyle = css(mix(base, W, 0.1)); c.fill(); c.lineWidth = 4; c.strokeStyle = css(acc, 0.9); c.stroke();
      }
      c.restore(); break;
    }
    case 'cloud': {   // 祥云 curl
      c.save(); clipBall();
      c.strokeStyle = css(acc, 0.9); c.lineWidth = 0.1 * Rb;
      c.beginPath(); c.arc(-0.25 * Rb, 0.05 * Rb, 0.26 * Rb, Math.PI * 0.2, Math.PI * 1.75); c.stroke();
      c.beginPath(); c.arc(0.22 * Rb, -0.1 * Rb, 0.3 * Rb, Math.PI * 1.0, Math.PI * 2.3); c.stroke();
      c.beginPath(); c.arc(-0.32 * Rb, 0.08 * Rb, 0.1 * Rb, 0, Math.PI * 1.6); c.stroke();
      c.beginPath(); c.moveTo(-0.6 * Rb, 0.42 * Rb); c.quadraticCurveTo(0, 0.6 * Rb, 0.55 * Rb, 0.3 * Rb); c.stroke();
      c.restore(); break;
    }
    case 'swirl': {   // 黑洞 spiral stroke (rotated by a phase that grows along the body → it "turns")
      c.save(); clipBall();
      c.strokeStyle = css(acc, 0.95); c.lineWidth = 0.11 * Rb;
      c.beginPath(); for (let t = 0; t < 9.5; t += 0.25) { const rr = Rb * 0.07 * t; c.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); } c.stroke();
      c.fillStyle = '#f4ecff'; c.beginPath(); c.arc(0, 0, 0.08 * Rb, 0, TAU); c.fill();
      c.restore(); break;
    }
    case 'brickA': case 'brickB': case 'crenel': {   // 长城: staggered bricks; every 10th a merlon on each side
      c.save(); clipBall();
      c.strokeStyle = css(scale(acc, 0.85), 0.75); c.lineWidth = 3;
      c.beginPath(); c.moveTo(-Rb, 0); c.lineTo(Rb, 0); c.stroke();
      const a = v === 'brickB' ? 0 : 0.42;
      for (const [x, y0, y1] of [[a - 0.42, -1, 0], [a + 0.42, -1, 0], [a, 0, 1]] as [number, number, number][]) { c.beginPath(); c.moveTo(x * Rb, y0 * Rb); c.lineTo(x * Rb, y1 * Rb); c.stroke(); }
      c.restore();
      if (v === 'crenel') for (const sy of [-1, 1]) { c.beginPath(); c.roundRect(-0.28 * Rb, sy > 0 ? 0.78 * Rb : -1.2 * Rb, 0.56 * Rb, 0.42 * Rb, 3); c.fillStyle = css(mix(base, W, 0.12)); c.fill(); c.lineWidth = 3; c.strokeStyle = css(scale(base, 0.5)); c.stroke(); }
      break;
    }
  }
}

/** extra segment ball variants of the skin / mission patterns (painted by art.paintSegment) */
export function paintSkinSegment(c: CanvasRenderingContext2D, R: number, base: Rgb, acc: Rgb, v: string): boolean {
  if (v.length === 2 && v[0] === 'f') {   // 彗星 fade: main → accent along the body, ice dots
    const q = Number(v[1]) / 5; const col = mix(base, acc, q);
    ball(c, R, col);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [x, y, r] of [[0.3, 0.25, 0.08], [-0.25, 0.35, 0.06], [0.1, -0.1, 0.05]]) { c.beginPath(); c.arc(x * R, y * R, r * R, 0, TAU); c.fill(); }
    return true;
  }
  if (v === 'star') {   // 北斗: a yellow star in the deep-blue segment
    ball(c, R, base);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.7); g.addColorStop(0, 'rgba(255,226,122,0.55)'); g.addColorStop(1, 'rgba(255,226,122,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R * 0.7, 0, TAU); c.fill();
    c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.2 : R * 0.48; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath();
    c.fillStyle = css(acc); c.fill(); c.lineWidth = 3; c.strokeStyle = '#b8860b'; c.stroke();
    return true;
  }
  if (v === 'coupler') { ball(c, R, scale(acc, 1.25)); return true; }
  if (v === 'dots') {   // 巡逻蛇: grey-blue with a dotted ring
    ball(c, R, base);
    c.fillStyle = css(scale(base, 0.5));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; c.beginPath(); c.arc(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52, R * 0.08, 0, TAU); c.fill(); }
    return true;
  }
  if (v === 'black') { ball(c, R, [52, 42, 36], { rim: [246, 196, 58] }); return true; }
  return false;
}

// ------------------------------------------------------------------ shared sprites for eyes, persona accessories and trails
export function addSharedSprites(add: (key: string, paint: (c: CanvasRenderingContext2D, R: number) => void) => void, trail: string) {
  add('visor', (c, R) => {   // a dark glass visor band (round heads with eyes:'visor')
    c.beginPath(); c.roundRect(-R * 0.42, -R * 0.95, R * 0.84, R * 1.9, R * 0.4);
    const g = c.createLinearGradient(-R * 0.4, -R, R * 0.4, R); g.addColorStop(0, '#2c3a66'); g.addColorStop(1, '#0c1128');
    c.fillStyle = g; c.fill(); c.lineWidth = 6; c.strokeStyle = '#dfe6ff'; c.stroke();
    c.beginPath(); c.ellipse(-R * 0.12, -R * 0.5, R * 0.1, R * 0.3, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
  });
  add('deye', (c, R) => {   // dragon eye: golden almond iris
    c.beginPath(); c.ellipse(0, 0, R * 0.98, R * 0.8, 0, 0, TAU); c.fillStyle = '#2a1608'; c.fill();
    const g = c.createRadialGradient(-R * 0.25, -R * 0.25, R * 0.1, 0, 0, R * 0.8); g.addColorStop(0, '#fff3a0'); g.addColorStop(0.6, '#ffc21a'); g.addColorStop(1, '#d97a00');
    c.beginPath(); c.ellipse(0, 0, R * 0.84, R * 0.66, 0, 0, TAU); c.fillStyle = g; c.fill();
  });
  add('slit', (c, R) => { c.beginPath(); c.ellipse(0, 0, R * 0.2, R * 0.82, 0, 0, TAU); c.fillStyle = '#140a04'; c.fill(); c.beginPath(); c.arc(-R * 0.25, -R * 0.45, R * 0.16, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill(); });
  add('dbrow', (c, R) => { c.beginPath(); c.moveTo(-R * 0.95, R * 0.25); c.quadraticCurveTo(0, -R * 0.55, R * 0.95, -R * 0.05); c.lineWidth = R * 0.3; c.lineCap = 'round'; c.strokeStyle = '#fff'; c.stroke(); });
  add('geye', (c, R) => {   // 黑洞: glowing hollow eye
    const g = c.createRadialGradient(0, 0, R * 0.3, 0, 0, R); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,1)'); g.addColorStop(0.75, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    c.beginPath(); c.arc(0, 0, R * 0.36, 0, TAU); c.fillStyle = 'rgba(10,6,24,0.9)'; c.fill();
  });
  add('tongue', (c, R) => {
    c.beginPath(); c.moveTo(-R * 0.9, 0); c.lineTo(R * 0.35, 0); c.lineTo(R * 0.85, -R * 0.32); c.moveTo(R * 0.35, 0); c.lineTo(R * 0.85, R * 0.32);
    c.lineWidth = R * 0.24; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#7a1630'; c.stroke(); c.lineWidth = R * 0.14; c.strokeStyle = '#ff5f8a'; c.stroke();
  });
  add('lockArc', (c, R) => {   // hunter lock-on: a pale orange arc + chevron toward its prey
    c.lineCap = 'round'; c.lineWidth = R * 0.14; c.strokeStyle = '#fff';
    c.beginPath(); c.arc(-R * 0.3, 0, R * 0.95, -0.75, 0.75); c.stroke();
    c.beginPath(); c.moveTo(R * 0.55, -R * 0.28); c.lineTo(R * 0.85, 0); c.lineTo(R * 0.55, R * 0.28); c.stroke();
  });
  add('lamp', (c, R) => {   // patrol beacon dome
    c.beginPath(); c.arc(0, 0, R * 0.9, 0, TAU); c.fillStyle = '#2f3550'; c.fill();
    const g = c.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R * 0.75); g.addColorStop(0, '#fff2e0'); g.addColorStop(0.5, '#ff8a5c'); g.addColorStop(1, '#c2382a');
    c.beginPath(); c.arc(0, 0, R * 0.72, 0, TAU); c.fillStyle = g; c.fill();
  });
  if (trail === 'meteor') add('streak', (c, R) => {
    const g = c.createLinearGradient(-R, 0, R, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    c.beginPath(); c.ellipse(0, 0, R, R * 0.22, 0, 0, TAU); c.fillStyle = g; c.fill();
  });
  if (trail === 'cloud') add('puff', (c, R) => {
    c.fillStyle = '#fff';
    for (const [x, y, r] of [[-0.4, 0.12, 0.42], [0.05, -0.12, 0.5], [0.48, 0.14, 0.38], [0.02, 0.28, 0.36]]) { c.beginPath(); c.arc(x * R, y * R, r * R, 0, TAU); c.fill(); }
    c.strokeStyle = 'rgba(160,140,220,0.9)'; c.lineWidth = R * 0.08; c.lineCap = 'round';
    c.beginPath(); c.arc(0.05 * R, 0.02 * R, 0.22 * R, Math.PI * 0.1, Math.PI * 1.7); c.stroke();
  });
  if (trail === 'lightning') add('bolt', (c, R) => {
    c.beginPath(); c.moveTo(-R * 0.9, -R * 0.2); c.lineTo(-R * 0.25, -R * 0.35); c.lineTo(-R * 0.05, R * 0.1); c.lineTo(R * 0.4, -R * 0.12); c.lineTo(R * 0.9, R * 0.3);
    c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = R * 0.22; c.strokeStyle = 'rgba(255,255,255,0.45)'; c.stroke(); c.lineWidth = R * 0.1; c.strokeStyle = '#fff'; c.stroke();
  });
}

// ------------------------------------------------------------------ boost trails (§4.6; spawned at his tail while boosting)
const STARS: Rgb[] = [[255, 216, 77], [255, 138, 61], [255, 95, 126], [200, 107, 255], [108, 140, 255], [63, 208, 255], [79, 227, 161], [182, 242, 90]];
export const TRAIL_FOOD: Record<string, Rgb | null> = { stardust: null, flame: [255, 150, 60], aurora: [90, 240, 190], meteor: [255, 236, 190], cloud: [214, 200, 255], lightning: [255, 236, 110] };
export const TRAIL_EVERY: Record<string, number> = { stardust: 0.035, flame: 0.03, aurora: 0.05, meteor: 0.04, cloud: 0.07, lightning: 0.08 };
export function spawnTrail(fx: Fx, style: string, x: number, y: number, ang: number, r: number, T: number) {
  const back = ang + Math.PI, jx = (rnd() - 0.5) * r, jy = (rnd() - 0.5) * r;
  switch (style) {
    case 'flame': {
      const c = [[255, 236, 120], [255, 160, 50], [255, 92, 40]][Math.floor(rnd() * 3)];
      fx.spawn({ x: x + jx, y: y + jy, vx: Math.cos(back) * 70 + (rnd() - 0.5) * 40, vy: Math.sin(back) * 70 + (rnd() - 0.5) * 40, life: 0.45, size: 9 + rnd() * 6, size1: 2, key: 'dot', r: c[0], g: c[1], b: c[2], drag: 3 });
      break;
    }
    case 'aurora': {   // slow hue drift green → cyan → violet (0.1 Hz), soft and wide
      const h = (Math.sin(T * 0.6) + 1) / 2, c = h < 0.5 ? mix([80, 255, 170], [90, 210, 255], h * 2) : mix([90, 210, 255], [190, 120, 255], (h - 0.5) * 2);
      fx.spawn({ x: x + jx, y: y + jy, vx: (rnd() - 0.5) * 20, vy: (rnd() - 0.5) * 20, life: 1.1, size: 12 + rnd() * 6, size1: 24, key: 'dot', r: c[0] * 0.6, g: c[1] * 0.6, b: c[2] * 0.6, drag: 1.5 });
      break;
    }
    case 'meteor': {
      fx.spawn({ x: x + jx * 0.5, y: y + jy * 0.5, vx: Math.cos(back) * 160, vy: Math.sin(back) * 160, life: 0.5, size: 14, size1: 5, key: 'streak', r: 255, g: 240, b: 200, rot: back + Math.PI, drag: 2.2 });
      if (rnd() < 0.3) fx.spawn({ x: x + jx, y: y + jy, vx: (rnd() - 0.5) * 60, vy: (rnd() - 0.5) * 60, life: 0.5, size: 6, size1: 0, key: 'spark', r: 255, g: 140, b: 200, rot: rnd() * 6, vr: 4 });
      break;
    }
    case 'cloud': {
      fx.spawn({ x: x + jx, y: y + jy, vx: Math.cos(back) * 25, vy: Math.sin(back) * 25, life: 0.9, size: 9 + rnd() * 3, size1: 17, key: 'puff', r: 236, g: 228, b: 255, blend: Blend.Normal, rot: (rnd() - 0.5) * 0.6, vr: (rnd() - 0.5) * 0.8, drag: 2 });
      break;
    }
    case 'lightning': {
      const c = rnd() < 0.5 ? [255, 240, 120] : [150, 230, 255];
      fx.spawn({ x: x + jx, y: y + jy, vx: 0, vy: 0, life: 0.24, size: 12 + rnd() * 4, size1: 9, key: 'bolt', r: c[0], g: c[1], b: c[2], rot: rnd() * TAU, drag: 0 });
      break;
    }
    default: {   // stardust
      const c = STARS[Math.floor(rnd() * 8)];
      fx.spawn({ x: x + jx, y: y + jy, vx: (rnd() - 0.5) * 40, vy: (rnd() - 0.5) * 40, life: 0.7, size: 6 + rnd() * 5, size1: 0, key: 'spark', r: c[0], g: c[1], b: c[2], rot: rnd() * 6, vr: 3 });
    }
  }
}

// ------------------------------------------------------------------ menu preview (collection cards, unlock cards, lobby)
/** a static portrait of a skin: head + a short wavy body with its pattern, painted directly on a 2D canvas */
export function paintSkinPortrait(c: CanvasRenderingContext2D, W_: number, H: number, sk: SkinDef, base: Rgb, acc: Rgb, paintSeg: (c: CanvasRenderingContext2D, R: number, v: string) => void, segV: (i: number, n: number) => string, o: { closed?: boolean } = {}) {
  const r = Math.min(H * 0.22, W_ / 10);
  const n = 7, pts: [number, number][] = [];
  const hx = W_ * 0.72, hy = H * 0.52;
  for (let i = 0; i <= n; i++) pts.push([hx - (i + 0.8) * r * 0.9, hy + Math.sin(i * 0.9 + 0.6) * r * 0.45]);
  for (let i = n - 1; i >= 0; i--) {
    const [x, y] = pts[i], v = segV(i, n), k = i > n * 0.7 ? 1 - 0.3 * (i - n * 0.7) / (n * 0.3) : 1;
    const sz = r * k * (v === 'coupler' ? 0.7 : 1);
    c.save(); c.translate(x, y); c.scale(sz / CELL_HALF, sz / CELL_HALF); paintSeg(c, CELL_R, DECO.has(v) ? 'plain' : v); c.restore();
    if (DECO.has(v)) {
      const [px, py] = i ? pts[i - 1] : [hx, hy], a = Math.atan2(py - y, px - x), dk = DECO_K[v] ?? 1;
      c.save(); c.translate(x, y); c.rotate(v === 'swirl' ? i * 0.8 : a); c.scale(sz * dk / CELL_HALF, sz * dk / CELL_HALF); paintDeco(c, CELL_R, v, base, acc); c.restore();
    }
  }
  const hs = r * HEAD_HS / CELL_HALF;
  const ex = extrasOf(sk);
  const at = (fn: () => void, rot = 0) => { c.save(); c.translate(hx, hy); c.rotate(rot); c.scale(hs, hs); fn(); c.restore(); };
  if (ex.includes('ywing')) { const [x, y] = pts[0]; c.save(); c.translate(x, y); c.scale(hs * 0.8, hs * 0.8); paintExtra(c, CELL_R, 'ywing', base, acc); c.restore(); }
  for (const k of ['wings', 'ringB', 'whisk', 'flag1']) if (ex.includes(k)) at(() => paintExtra(c, CELL_R, k, base, acc));
  if (ex.includes('comet')) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.7; at(() => paintExtra(c, CELL_R, 'comet', base, acc)); c.restore(); }
  at(() => paintSkinHead(c, CELL_R, sk, base, acc));
  if (ex.includes('ringF')) at(() => paintExtra(c, CELL_R, 'ringF', base, acc));
  if (sk.head === 'zhulong') { c.save(); c.translate(hx + r * 1.78, hy); c.scale(r * 0.38 / CELL_HALF, r * 0.38 / CELL_HALF); c.rotate(-Math.PI / 2); paintExtra(c, CELL_R, 'flame1', base, acc); c.restore(); }
  paintEyes2D(c, hx, hy, r, sk, base, !!o.closed);
}
const CELL_HALF = 64, CELL_R = 56;

/** eyes for the menu portrait (same layout table as the in-match sprites) */
export function paintEyes2D(c: CanvasRenderingContext2D, hx: number, hy: number, r: number, sk: SkinDef, base: Rgb, closed: boolean) {
  const L = eyeLayout(sk.head, sk.eyes);
  const spots: [number, number][] = L.lat === 0 ? [[L.fx, 0]] : [[L.fx, -L.lat], [L.fx, L.lat]];
  if (L.mode === 'visorband') {
    c.save(); c.translate(hx + 0.4 * r, hy); c.beginPath(); c.roundRect(-0.2 * r, -0.62 * r, 0.42 * r, 1.24 * r, 0.2 * r);
    const g = c.createLinearGradient(-0.2 * r, -0.6 * r, 0.2 * r, 0.6 * r); g.addColorStop(0, '#2c3a66'); g.addColorStop(1, '#0c1128'); c.fillStyle = g; c.fill(); c.lineWidth = r * 0.06; c.strokeStyle = '#dfe6ff'; c.stroke(); c.restore();
  }
  for (const [fx, ly] of spots) {
    const x = hx + fx * r, y = hy + ly * r, er = L.er * r * (L.mode === 'free' ? 1.05 : 1);
    if (closed) { c.beginPath(); c.arc(x, y - er * 0.1, er * 0.7, 0.15 * Math.PI, 0.85 * Math.PI); c.lineWidth = er * 0.22; c.lineCap = 'round'; c.strokeStyle = L.mode === 'dots' ? '#7ff0ff' : '#20223a'; c.stroke(); continue; }
    if (L.mode === 'free') {
      c.beginPath(); c.arc(x, y, er, 0, TAU); c.fillStyle = '#20223a'; c.fill(); c.beginPath(); c.arc(x, y, er * 0.86, 0, TAU); c.fillStyle = '#fffdf6'; c.fill();
      c.beginPath(); c.arc(x + er * 0.25, y, er * 0.52, 0, TAU); c.fillStyle = '#1a1830'; c.fill(); c.beginPath(); c.arc(x + er * 0.08, y - er * 0.2, er * 0.17, 0, TAU); c.fillStyle = '#fff'; c.fill();
    } else if (L.mode === 'window') {
      c.beginPath(); c.arc(x + er * 0.2, y, er * 0.62, 0, TAU); c.fillStyle = '#1a1830'; c.fill(); c.beginPath(); c.arc(x + er * 0.05, y - er * 0.2, er * 0.2, 0, TAU); c.fillStyle = '#fff'; c.fill();
    } else if (L.mode === 'dots' || L.mode === 'visorband') {
      const d = L.mode === 'visorband' ? [x + 0.05 * r, y * 0 + hy + Math.sign(ly) * 0.24 * r] : [x, y];
      const g = c.createRadialGradient(d[0], d[1], 0, d[0], d[1], er * 1.8); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#9ff4ff'); g.addColorStop(1, 'rgba(63,224,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(d[0], d[1], er * 1.8, 0, TAU); c.fill();
    } else if (L.mode === 'dragon') {
      c.beginPath(); c.ellipse(x, y, er, er * 0.8, 0, 0, TAU); c.fillStyle = '#2a1608'; c.fill();
      const g = c.createRadialGradient(x - er * 0.25, y - er * 0.25, er * 0.1, x, y, er * 0.8); g.addColorStop(0, '#fff3a0'); g.addColorStop(0.6, '#ffc21a'); g.addColorStop(1, '#d97a00');
      c.beginPath(); c.ellipse(x, y, er * 0.84, er * 0.66, 0, 0, TAU); c.fillStyle = g; c.fill();
      c.beginPath(); c.ellipse(x + er * 0.12, y, er * 0.17, er * 0.6, 0, 0, TAU); c.fillStyle = '#140a04'; c.fill();
      c.beginPath(); c.moveTo(x - er, y + Math.sign(ly) * -er * 0.7); c.quadraticCurveTo(x, y + Math.sign(ly) * -er * 1.25, x + er, y + Math.sign(ly) * -er * 0.85); c.lineWidth = er * 0.28; c.lineCap = 'round'; c.strokeStyle = css(scale(base, 0.55)); c.stroke();
    } else if (L.mode === 'glow') {
      const g = c.createRadialGradient(x, y, er * 0.3, x, y, er * 1.3); g.addColorStop(0, 'rgba(210,180,255,0)'); g.addColorStop(0.5, 'rgba(225,205,255,1)'); g.addColorStop(1, 'rgba(178,140,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, er * 1.3, 0, TAU); c.fill(); c.beginPath(); c.arc(x, y, er * 0.36, 0, TAU); c.fillStyle = '#0a0618'; c.fill();
    }
  }
}

/** his head for menus (lobby showcase, podium): extras under/over + head + eyes, at the origin facing +x; r = body radius */
export function paintHeadPortrait(c: CanvasRenderingContext2D, r: number, sk: SkinDef, base: Rgb, acc: Rgb, closed = false) {
  const hs = (r * HEAD_HS) / CELL_HALF, ex = extrasOf(sk);
  const at = (fn: () => void) => { c.save(); c.scale(hs, hs); fn(); c.restore(); };
  for (const k of ['wings', 'ringB', 'whisk', 'flag1']) if (ex.includes(k)) at(() => paintExtra(c, CELL_R, k, base, acc));
  at(() => paintSkinHead(c, CELL_R, sk, base, acc));
  if (ex.includes('ringF')) at(() => paintExtra(c, CELL_R, 'ringF', base, acc));
  if (sk.head === 'zhulong') { c.save(); c.translate(r * 1.78, 0); c.scale(r * 0.38 / CELL_HALF, r * 0.38 / CELL_HALF); c.rotate(Math.PI / 2); paintExtra(c, CELL_R, 'flame1', base, acc); c.restore(); }
  paintEyes2D(c, 0, 0, r, sk, base, closed);
}
