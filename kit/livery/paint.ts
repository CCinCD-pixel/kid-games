/**
 * Livery painters shared by the 涂装台 and the games:
 *  - stickers: `stickerSvg(id)` for menus, `drawSticker(ctx, id, x, y, size)` for any canvas (Path2D from the same
 *    path data, die-cut white border + soft shadow, flat colours + ink outline: they read as real stickers);
 *  - `paintBallMotif(ctx, pattern, R, look)`: one pattern mark on a round body part of radius R facing +x (the
 *    snake paints it into every segment sprite of its atlas, once per match — never per frame);
 *  - `paintSwatch(ctx, pattern, size, color)`: the round pattern chip of the studio, in the chosen colour.
 */
import { colorById, stickerById, COLORS, type LiveryColor, type StickerLayer } from './catalog';

const INK = '#2b2346';
const INKW = 2.4;
const CUT = 4.2;
/** half the extra room a sticker needs around its 64×64 board (ink + die-cut border) */
export const STICKER_PAD = CUT + INKW;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ colour helpers
export type Rgb = [number, number, number];
export const hexRgb = (h: string): Rgb => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
export const rgbCss = (c: Rgb, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const shadeRgb = (a: Rgb, k: number): Rgb => [Math.min(255, a[0] * k), Math.min(255, a[1] * k), Math.min(255, a[2] * k)];
const WHITE: Rgb = [255, 255, 255];
const luma = (c: Rgb) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

/** the colours a pattern is painted with, for a colour id */
export interface MotifInk { base: Rgb; trim: Rgb; edge: Rgb; glow: Rgb }
export function motifInk(color: string | LiveryColor): MotifInk {
  const c = typeof color === 'string' ? colorById(color) ?? COLORS[0] : color;
  return motifInkRgb(hexRgb(c.base), hexRgb(c.trim));
}
/** the same from raw colours (a game that lightens a body on some floors passes what it actually draws) */
export function motifInkRgb(base: Rgb, trim: Rgb): MotifInk {
  // the mark's thin edge: darker than the trim, never lost on a dark body
  const edge = luma(base) < 0.3 ? shadeRgb(trim, 0.55) : shadeRgb(mixRgb(base, trim, 0.25), 0.52);
  return { base, trim, edge, glow: mixRgb(trim, WHITE, 0.6) };
}

// ------------------------------------------------------------------ stickers
const paths = new Map<string, Path2D>();
const p2 = (d: string) => { let p = paths.get(d); if (!p) { p = new Path2D(d); paths.set(d, p); } return p; };
const silhouette = (layers: readonly StickerLayer[]) => layers.filter((l) => l.o || l.u);

/** paint sticker `id` centred at (x, y); `size` is the full width including its white border */
export function drawSticker(c: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, o: { shadow?: boolean; cut?: boolean } = {}): void {
  const st = stickerById(id);
  if (!st) return;
  const k = size / (64 + 2 * STICKER_PAD);
  c.save();
  c.translate(x, y); c.scale(k, k); c.translate(-32, -32);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const sil = silhouette(st.layers);
  const backing = (style: string, dy: number) => {
    c.save(); c.translate(0, dy); c.fillStyle = style; c.strokeStyle = style;
    for (const l of sil) {
      const p = p2(l.d);
      if (l.f) { c.fill(p); c.lineWidth = 2 * STICKER_PAD; c.stroke(p); }
      else { c.lineWidth = (l.w ?? 2) + 2 * STICKER_PAD - INKW; c.stroke(p); }
    }
    c.restore();
  };
  if (o.shadow !== false) backing('rgba(16,10,40,0.3)', 2.4);
  if (o.cut !== false) backing('#ffffff', 0);
  for (const l of st.layers) {
    const p = p2(l.d);
    c.globalAlpha = l.a ?? 1;
    if (l.u && l.f) { c.strokeStyle = INK; c.lineWidth = INKW * 2; c.stroke(p); }
    if (l.f) {
      c.fillStyle = l.f; c.fill(p, l.eo ? 'evenodd' : 'nonzero');
      if (l.o) { c.strokeStyle = INK; c.lineWidth = INKW; c.stroke(p); }
    }
    if (l.s) { c.strokeStyle = l.s; c.lineWidth = l.w ?? 2; c.stroke(p); }
  }
  c.restore();
}

const esc = (s: string) => s.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch]!);

/** the sticker as an inline <svg> (menus, the studio's sticker tiles). Pure string, safe to call in Node. */
export function stickerSvg(id: string, o: { shadow?: boolean; cut?: boolean; className?: string } = {}): string {
  const st = stickerById(id);
  if (!st) return '';
  const B = STICKER_PAD + 1, vb = `${-B} ${-B} ${64 + 2 * B} ${64 + 2 * B}`;
  const sil = silhouette(st.layers);
  const backing = (style: string, dy: number) => `<g${dy ? ` transform="translate(0 ${dy})"` : ''} fill="${style}" stroke="${style}">${sil.map((l) => l.f
    ? `<path d="${l.d}" stroke-width="${2 * STICKER_PAD}"/>`
    : `<path d="${l.d}" fill="none" stroke-width="${(l.w ?? 2) + 2 * STICKER_PAD - INKW}"/>`).join('')}</g>`;
  const body = st.layers.map((l) => {
    const a = l.a !== undefined && l.a !== 1 ? ` opacity="${l.a}"` : '';
    let s = '';
    if (l.u && l.f) s += `<path d="${l.d}" fill="none" stroke="${INK}" stroke-width="${INKW * 2}"${a}/>`;
    if (l.f) s += `<path d="${l.d}" fill="${l.f}"${l.eo ? ' fill-rule="evenodd"' : ''}${l.o ? ` stroke="${INK}" stroke-width="${INKW}"` : ''}${a}/>`;
    if (l.s) s += `<path d="${l.d}" fill="none" stroke="${l.s}" stroke-width="${l.w ?? 2}"${a}/>`;
    return s;
  }).join('');
  return `<svg class="${esc(o.className ?? 'lv-sticker')}" viewBox="${vb}" role="img" aria-label="${esc(st.name)}" stroke-linejoin="round" stroke-linecap="round">`
    + (o.shadow !== false ? backing('rgba(16,10,40,.3)', 2.4) : '') + (o.cut !== false ? backing('#fff', 0) : '') + body + '</svg>';
}

// ------------------------------------------------------------------ pattern marks
function starPath(c: CanvasRenderingContext2D, x: number, y: number, R: number, r: number, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5, q = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  c.closePath();
}
/** a flame pointing along -x: root at (x0, y0), tip `len` behind, `wid` wide, three tongues */
function flamePath(c: CanvasRenderingContext2D, x0: number, y0: number, len: number, wid: number) {
  c.beginPath();
  c.moveTo(x0, y0 - wid * 0.5);
  c.bezierCurveTo(x0 - len * 0.35, y0 - wid * 0.62, x0 - len * 0.62, y0 - wid * 0.42, x0 - len, y0 - wid * 0.62);
  c.bezierCurveTo(x0 - len * 0.72, y0 - wid * 0.18, x0 - len * 0.68, y0 - wid * 0.08, x0 - len * 0.86, y0 + wid * 0.06);
  c.bezierCurveTo(x0 - len * 0.62, y0 + wid * 0.12, x0 - len * 0.55, y0 + wid * 0.25, x0 - len * 0.78, y0 + wid * 0.6);
  c.bezierCurveTo(x0 - len * 0.45, y0 + wid * 0.5, x0 - len * 0.2, y0 + wid * 0.6, x0, y0 + wid * 0.5);
  c.quadraticCurveTo(x0 + wid * 0.28, y0, x0, y0 - wid * 0.5);
  c.closePath();
}
function zig(c: CanvasRenderingContext2D, xs: number[], ys: number[]) { c.beginPath(); for (let i = 0; i < xs.length; i++) c.lineTo(xs[i], ys[i]); }

/**
 * One pattern mark inside a round body part of radius R centred at (0, 0), facing +x. `variant` 0/1 alternates
 * along a body so marks stagger. Segments of a body overlap from the front, so marks sit toward the back (-x).
 * Returns false for patterns that are not a mark (plain, stripes: the game paints those as whole colours).
 */
export function paintBallMotif(c: CanvasRenderingContext2D, pattern: string, R: number, ink: MotifInk, variant = 0): boolean {
  const s = variant ? 1 : -1;
  c.save();
  c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
  c.lineJoin = 'round'; c.lineCap = 'round';
  let ok = true;
  switch (pattern) {
    case 'dots': {
      for (const [x, y, r] of [[-0.6, 0.4 * s, 0.22], [-0.68, -0.34 * s, 0.13], [-0.15, -0.62 * s, 0.11]]) {
        c.beginPath(); c.arc(x * R, y * R, r * R, 0, TAU); c.fillStyle = rgbCss(ink.trim); c.fill();
        c.lineWidth = Math.max(1.5, R * 0.05); c.strokeStyle = rgbCss(ink.edge, 0.7); c.stroke();
        c.beginPath(); c.arc((x - r * 0.3) * R, (y - r * 0.32) * R, r * 0.32 * R, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
      }
      break;
    }
    case 'stars': {
      const g = c.createRadialGradient(-0.55 * R, 0, 0, -0.55 * R, 0, 0.6 * R); g.addColorStop(0, rgbCss(ink.trim, 0.45)); g.addColorStop(1, rgbCss(ink.trim, 0));
      c.fillStyle = g; c.fillRect(-R, -R, 2 * R, 2 * R);
      starPath(c, -0.52 * R, 0, 0.44 * R, 0.2 * R, Math.PI / 2 + (variant ? 0.3 : -0.3));
      c.fillStyle = rgbCss(ink.trim); c.fill(); c.lineWidth = Math.max(1.6, R * 0.06); c.strokeStyle = rgbCss(ink.edge); c.stroke();
      c.beginPath(); c.arc(-0.6 * R, -0.12 * R, 0.07 * R, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill();
      break;
    }
    case 'flames': {
      const w = variant ? 1.05 : 0.9;
      flamePath(c, -0.18 * R, 0.05 * s * R, 1.0 * R, w * R);
      c.fillStyle = rgbCss(ink.trim); c.fill(); c.lineWidth = Math.max(1.6, R * 0.06); c.strokeStyle = rgbCss(ink.edge, 0.85); c.stroke();
      flamePath(c, -0.3 * R, 0.05 * s * R, 0.62 * R, w * 0.52 * R);
      c.fillStyle = rgbCss(ink.glow); c.fill();
      break;
    }
    case 'zigzag': {
      const x0 = -0.62 * R, a = 0.16 * R * s;
      zig(c, [x0 + a, x0 - a, x0 + a, x0 - a, x0 + a], [-1.1 * R, -0.55 * R, 0, 0.55 * R, 1.1 * R].map((y) => y));
      c.lineWidth = 0.32 * R; c.strokeStyle = rgbCss(ink.edge, 0.9); c.stroke();
      c.lineWidth = 0.2 * R; c.strokeStyle = rgbCss(ink.trim); c.stroke();
      break;
    }
    case 'scales': {
      const oy = variant ? 0.32 : 0;
      for (const y of [-0.64 + oy, 0 + oy, 0.64 + oy, -1.28 + oy]) {
        c.beginPath(); c.arc(-0.42 * R, y * R, 0.38 * R, Math.PI * 0.5, Math.PI * 1.5); c.closePath();
        c.fillStyle = rgbCss(mixRgb(ink.base, WHITE, 0.14)); c.fill();
        c.lineWidth = Math.max(1.6, R * 0.075); c.strokeStyle = rgbCss(ink.trim); c.stroke();
      }
      break;
    }
    default: ok = false;
  }
  c.restore();
  return ok;
}

/** a glossy ball of `base` (rim, outline, key light top-left) — the studio chips and generic previews */
export function paintBall(c: CanvasRenderingContext2D, x: number, y: number, R: number, base: Rgb) {
  c.beginPath(); c.arc(x, y, R, 0, TAU); c.fillStyle = rgbCss(mixRgb(base, WHITE, 0.4)); c.fill();
  c.beginPath(); c.arc(x, y, R * 0.93, 0, TAU); c.fillStyle = rgbCss(shadeRgb(base, 0.55)); c.fill();
  const g = c.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.08, x, y, R * 0.88);
  g.addColorStop(0, rgbCss(mixRgb(base, WHITE, 0.2))); g.addColorStop(0.65, rgbCss(base)); g.addColorStop(1, rgbCss(shadeRgb(base, 0.78)));
  c.beginPath(); c.arc(x, y, R * 0.88, 0, TAU); c.fillStyle = g; c.fill();
}

/** the pattern laid over an area centred at (0, 0) that reaches `r` each way (the caller clips): chips, crate tops,
 *  robot bodies — one look everywhere */
export function paintPatternIn(c: CanvasRenderingContext2D, pattern: string, r: number, ink: MotifInk): void {
  c.save();
  c.lineJoin = 'round'; c.lineCap = 'round';
  const fill = rgbCss(ink.trim), edge = rgbCss(ink.edge, 0.8), lw = Math.max(1.5, r * 0.05);
  switch (pattern) {
    case 'stripes': c.rotate(-0.6); for (const x of [-1.5, -0.75, 0, 0.75, 1.5]) { c.fillStyle = fill; c.fillRect((x - 0.17) * r, -1.6 * r, 0.34 * r, 3.2 * r); c.fillStyle = rgbCss(ink.edge, 0.35); c.fillRect((x + 0.13) * r, -1.6 * r, 0.04 * r, 3.2 * r); } break;
    case 'dots': for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const x = (i + (j % 2 ? 0.5 : 0)) * 0.5 * r, y = j * 0.45 * r; c.beginPath(); c.arc(x, y, 0.13 * r, 0, TAU); c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = edge; c.stroke(); } break;
    case 'stars': for (const [x, y, k, a] of [[-0.35, -0.3, 0.42, -0.2], [0.42, 0.05, 0.32, 0.3], [-0.15, 0.52, 0.26, 0.1], [0.3, -0.6, 0.18, 0], [-0.75, 0.25, 0.2, 0.2], [0.78, 0.68, 0.2, -0.1]]) { starPath(c, x * r, y * r, k * r, k * 0.45 * r, -Math.PI / 2 + a); c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = edge; c.stroke(); } break;
    case 'flames': c.rotate(-Math.PI / 2); for (const [y, k] of [[-0.42, 0.8], [0.18, 1], [0.7, 0.7]]) { flamePath(c, -0.75 * r, y * r, 1.25 * k * r, 0.6 * k * r); c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = edge; c.stroke(); flamePath(c, -0.8 * r, y * r, 0.75 * k * r, 0.3 * k * r); c.fillStyle = rgbCss(ink.glow); c.fill(); } break;
    case 'zigzag': for (const y of [-1.15, -0.45, 0.25, 0.95]) { zig(c, [-1.1, -0.66, -0.22, 0.22, 0.66, 1.1].map((x) => x * r), [0, -1, 0, -1, 0, -1].map((q) => (y + q * 0.3) * r)); c.lineWidth = 0.22 * r; c.strokeStyle = edge; c.stroke(); c.lineWidth = 0.13 * r; c.strokeStyle = fill; c.stroke(); } break;
    case 'scales': for (let j = -3; j <= 3; j++) for (let i = -2; i <= 2; i++) { const x = (i + (j % 2 ? 0.5 : 0)) * 0.56 * r, y = j * 0.36 * r; c.beginPath(); c.arc(x, y, 0.3 * r, 0, Math.PI); c.closePath(); c.fillStyle = rgbCss(mixRgb(ink.base, WHITE, 0.14)); c.fill(); c.lineWidth = Math.max(1.5, r * 0.06); c.strokeStyle = fill; c.stroke(); } break;
    default: break;
  }
  c.restore();
}

/** the round pattern chip: the chosen colour with the pattern laid over it (studio tiles, parent page) */
export function paintSwatch(c: CanvasRenderingContext2D, pattern: string, size: number, color: string | LiveryColor): void {
  const ink = motifInk(color), R = size / 2, cx = R, cy = R, r = R * 0.88;
  paintBall(c, cx, cy, R, ink.base);
  c.save(); c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.clip(); c.translate(cx, cy);
  paintPatternIn(c, pattern, r, ink);
  c.restore();
  c.beginPath(); c.ellipse(cx - R * 0.3, cy - R * 0.42, R * 0.34, R * 0.17, -0.5, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.38)'; c.fill();
}

// ------------------------------------------------------------------ cached images (draw once, blit every frame)
const layers = new Map<string, HTMLCanvasElement | null>();
const canvasOf = (px: number) => { const cv = document.createElement('canvas'); cv.width = cv.height = px; return cv; };
/** the pattern alone (transparent elsewhere) on a px×px square, cached: games blit it clipped to a surface. null for 素色. */
export function patternLayer(pattern: string, color: LiveryColor, px = 192): HTMLCanvasElement | null {
  const key = `${pattern}|${color.base}|${color.trim}|${px}`;
  if (layers.has(key)) return layers.get(key)!;
  let cv: HTMLCanvasElement | null = null;
  if (pattern !== 'plain' && pattern) { cv = canvasOf(px); const c = cv.getContext('2d')!; c.translate(px / 2, px / 2); paintPatternIn(c, pattern, px / 2, motifInk(color)); }
  layers.set(key, cv);
  return cv;
}
const stickerImgs = new Map<string, HTMLCanvasElement>();
/** a sticker drawn once into a px×px canvas (full width incl. its border), cached */
export function stickerImage(id: string, px = 128): HTMLCanvasElement {
  const key = `${id}|${px}`;
  let cv = stickerImgs.get(key);
  if (!cv) { cv = canvasOf(px); drawSticker(cv.getContext('2d')!, id, px / 2, px / 2, px * 0.94); stickerImgs.set(key, cv); }
  return cv;
}
