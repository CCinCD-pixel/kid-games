/**
 * 涂装台 catalogue: the picked-in-advance colours, patterns and stickers every game shares. Nothing here is
 * locked, earned or bought — every option is open from the first visit (Dad, 2026-11). All art is our own
 * (paths drawn in code, no image files): stickers are layers of SVG path data on a 64×64 board, so the same data
 * paints an inline <svg> in menus and a Path2D on any canvas (snake atlas, sokoban sprites).
 */

export interface LiveryColor {
  id: string;
  name: string;
  /** body colour */
  base: string;
  /** the pattern / trim colour picked to go with it */
  trim: string;
}

export interface LiveryPattern { id: string; name: string }

/** one painted layer of a sticker (64×64 board). `o`: outlined in ink and part of the die-cut silhouette;
 *  `u`: union outline (ink drawn under the fill, so overlapping sub-paths read as one shape) + die-cut;
 *  `s`/`w`: a stroke instead of (or after) the fill; `a`: opacity; `eo`: even-odd fill. */
export interface StickerLayer { d: string; f?: string; s?: string; w?: number; o?: 1; u?: 1; a?: number; eo?: 1 }
export interface LiverySticker { id: string; name: string; theme: 'space' | 'machine' | 'myth'; layers: StickerLayer[] }

export const COLORS: readonly LiveryColor[] = [
  { id: 'sun', name: '金星黄', base: '#ffc93c', trim: '#ff7a1f' },
  { id: 'rocket', name: '火箭红', base: '#e8452c', trim: '#ffd23f' },
  { id: 'leaf', name: '青草绿', base: '#5cc94a', trim: '#fff06a' },
  { id: 'jade', name: '青龙青', base: '#1fb39e', trim: '#d4fff0' },
  { id: 'sky', name: '天空蓝', base: '#3f8cff', trim: '#ffffff' },
  { id: 'nebula', name: '星云紫', base: '#8b5cf6', trim: '#ffd84d' },
  { id: 'steel', name: '机甲银', base: '#c4ccda', trim: '#2f7bff' },
  { id: 'night', name: '夜空蓝', base: '#26305f', trim: '#7fe8ff' },
];

export const PATTERNS: readonly LiveryPattern[] = [
  { id: 'plain', name: '素色' },
  { id: 'stripes', name: '条纹' },
  { id: 'dots', name: '波点' },
  { id: 'stars', name: '星星' },
  { id: 'flames', name: '火焰' },
  { id: 'zigzag', name: '锯齿' },
  { id: 'scales', name: '龙鳞' },
];

// ------------------------------------------------------------------ path helpers (64×64 board)
const n = (v: number) => String(Math.round(v * 100) / 100);
const TAU = Math.PI * 2;
export const circle = (cx: number, cy: number, r: number) => `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
export function ellipse(cx: number, cy: number, rx: number, ry: number, deg = 0): string {
  const t = (deg * Math.PI) / 180, x1 = cx + rx * Math.cos(t), y1 = cy + rx * Math.sin(t), x2 = cx - rx * Math.cos(t), y2 = cy - rx * Math.sin(t);
  return `M${n(x1)} ${n(y1)}A${n(rx)} ${n(ry)} ${n(deg)} 1 0 ${n(x2)} ${n(y2)}A${n(rx)} ${n(ry)} ${n(deg)} 1 0 ${n(x1)} ${n(y1)}Z`;
}
export function rrect(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  return `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}v${n(h - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}h${n(-(w - 2 * r))}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}v${n(-(h - 2 * r))}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}Z`;
}
export const poly = (...p: number[]) => { let s = ''; for (let i = 0; i < p.length; i += 2) s += `${i ? 'L' : 'M'}${n(p[i])} ${n(p[i + 1])}`; return s + 'Z'; };
const pts = (list: [number, number][]) => list.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('') + 'Z';
const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number, steps = 28): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) { const a = a0 + ((a1 - a0) * i) / steps; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
};
/** the part of circle 1 outside circle 2 (a crescent), as a sampled outline */
export function crescent(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): string {
  const d = Math.hypot(x2 - x1, y2 - y1), a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const phi = Math.atan2(y2 - y1, x2 - x1), al = Math.acos(Math.max(-1, Math.min(1, a / r1)));
  const psi = Math.atan2(y1 - y2, x1 - x2), be = Math.acos(Math.max(-1, Math.min(1, (d - a) / r2)));
  const outer = arcPts(x1, y1, r1, phi + al, phi + TAU - al, 40);
  let inner = arcPts(x2, y2, r2, psi - be, psi + be, 24);
  const end = outer[outer.length - 1];
  if (Math.hypot(inner[0][0] - end[0], inner[0][1] - end[1]) > Math.hypot(inner[inner.length - 1][0] - end[0], inner[inner.length - 1][1] - end[1])) inner = inner.reverse();
  return pts([...outer, ...inner]);
}
/** a toothed wheel: `teeth` flat-topped teeth between radius ri and ro */
export function gear(cx: number, cy: number, ro: number, ri: number, teeth: number): string {
  const p: [number, number][] = [], step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    for (const [da, r] of [[-0.3, ri], [-0.19, ro], [0.19, ro], [0.3, ri]] as [number, number][]) p.push([cx + Math.cos(a + da * step * 1.6) * r, cy + Math.sin(a + da * step * 1.6) * r]);
  }
  return pts(p);
}
/** the front half of a tilted ring (an annulus between two ellipses), from angle 0 to π through the bottom */
export function ringHalf(cx: number, cy: number, rx: number, ry: number, irx: number, iry: number, deg: number): string {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const at = (a: number, ax: number, ay: number): [number, number] => { const x = Math.cos(a) * ax, y = Math.sin(a) * ay; return [cx + x * c - y * s, cy + x * s + y * c]; };
  const out: [number, number][] = [];
  for (let i = 0; i <= 28; i++) out.push(at((Math.PI * i) / 28, rx, ry));
  for (let i = 28; i >= 0; i--) out.push(at((Math.PI * i) / 28, irx, iry));
  return pts(out);
}
export const ringFull = (cx: number, cy: number, rx: number, ry: number, irx: number, iry: number, deg: number) => ellipse(cx, cy, rx, ry, deg) + ellipse(cx, cy, irx, iry, deg);
const spark = (cx: number, cy: number, R: number) => {
  const p: [number, number][] = [];
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2, q = i % 2 ? R * 0.3 : R; p.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); }
  return pts(p);
};

// ------------------------------------------------------------------ the stickers
const SHINE = 'rgba(255,255,255,.62)';
const INKC = '#2b2346';

export const STICKERS: readonly LiverySticker[] = [
  {
    id: 'rocket', name: '火箭', theme: 'space', layers: [
      { d: 'M25 47Q32 66 39 47Z', f: '#ff9f1c', o: 1 },
      { d: 'M28.5 47Q32 59 35.5 47Z', f: '#fff1a8' },
      { d: 'M21 33L11 44.5L11 51L21 46Z', f: '#e8452c', o: 1 },
      { d: 'M43 33L53 44.5L53 51L43 46Z', f: '#e8452c', o: 1 },
      { d: 'M32 5C40.5 11 44.5 21.5 44.5 33.5L44.5 47L19.5 47L19.5 33.5C19.5 21.5 23.5 11 32 5Z', f: '#f4f6fb', o: 1 },
      { d: 'M32 5C37 8.6 40.3 13.6 42.1 19.5L21.9 19.5C23.7 13.6 27 8.6 32 5Z', f: '#e8452c', o: 1 },
      { d: 'M23.5 23Q23 33 24 43', s: SHINE, w: 2.6 },
      { d: circle(32, 30.5, 6.4), f: '#3f8cff', o: 1 },
      { d: ellipse(30, 28.4, 2.4, 1.4, -30), f: SHINE },
      { d: rrect(24.5, 45.5, 15, 4.5, 2), f: '#8d97ad', o: 1 },
      { d: 'M32 40V43', s: '#c4ccda', w: 2.2 },
    ],
  },
  {
    id: 'saturn', name: '土星', theme: 'space', layers: [
      { d: ringFull(32, 33, 28, 9, 19.5, 5.4, -18), f: '#c99a52', eo: 1, o: 1 },
      { d: circle(32, 32, 15.5), f: '#f2c25b', o: 1 },
      { d: 'M17.6 27.6Q32 23 46.4 27.6L46.9 31Q32 26.4 17.1 31Z', f: '#dd9a3a' },
      { d: 'M17.4 36.5Q32 32 46.6 36.5L45.6 40Q32 35.6 18.4 40Z', f: '#e9b04c' },
      { d: ellipse(25.5, 22.5, 4.4, 2.3, -30), f: SHINE },
      { d: ringHalf(32, 33, 28, 9, 19.5, 5.4, -18), f: '#f6d9a0', o: 1 },
      { d: spark(53, 13, 4.6), f: '#fff1a8', o: 1 },
    ],
  },
  {
    id: 'moon', name: '月亮', theme: 'space', layers: [
      { d: crescent(29, 33, 22, 41, 24, 18), f: '#ffd84d', o: 1 },
      { d: circle(17, 37, 3.2), f: '#f2b72e' },
      { d: circle(25, 48, 2.3), f: '#f2b72e' },
      { d: 'M14.5 28.5Q17 31 19.5 28.5', s: INKC, w: 2.2 },
      { d: ellipse(14.5, 34, 2.6, 1.6, 0), f: 'rgba(255,110,120,.45)' },
      { d: 'M12.6 20Q14 15 18 12.2', s: SHINE, w: 2.4 },
      { d: spark(49, 44, 5.2), f: '#fff6c8', o: 1 },
    ],
  },
  {
    id: 'ufo', name: '飞碟', theme: 'space', layers: [
      { d: 'M23 40L17.5 55L46.5 55L41 40Z', f: 'rgba(160,240,255,.55)' },
      { d: 'M18.5 33A13.5 13.5 0 0 1 45.5 33Z', f: '#bff6ff', o: 1 },
      { d: circle(32, 27, 5.6), f: '#5cc94a', o: 1 },
      { d: circle(30, 26.2, 1.3), f: INKC },
      { d: circle(34, 26.2, 1.3), f: INKC },
      { d: 'M23.5 25Q25 20.5 29 19', s: SHINE, w: 2.2 },
      { d: ellipse(32, 36.5, 25, 8.5), f: '#a9b4cc', o: 1 },
      { d: ellipse(32, 34.2, 19, 3.4), f: '#d9dee9' },
      { d: circle(17, 38.4, 2.1), f: '#ffd23f' },
      { d: circle(25.5, 40.6, 2.1), f: '#ff5f7e' },
      { d: circle(38.5, 40.6, 2.1), f: '#ffd23f' },
      { d: circle(47, 38.4, 2.1), f: '#ff5f7e' },
    ],
  },
  {
    id: 'satellite', name: '卫星', theme: 'space', layers: [
      { d: 'M23 34H41', s: INKC, w: 7, o: 1 },
      { d: rrect(5, 28, 17, 12, 2), f: '#2f7bff', o: 1 },
      { d: rrect(42, 28, 17, 12, 2), f: '#2f7bff', o: 1 },
      { d: 'M10.7 28V40M16.3 28V40M5 34H22M47.7 28V40M53.3 28V40M42 34H59', s: 'rgba(255,255,255,.5)', w: 1.4 },
      { d: rrect(24, 25, 16, 18, 3), f: '#ffc93c', o: 1 },
      { d: 'M27 29H37M27 33.5H37M27 38H37', s: 'rgba(160,100,10,.55)', w: 1.6 },
      { d: 'M25.5 25Q32 12 38.5 25Z', f: '#f4f6fb', o: 1 },
      { d: 'M32 18V9', s: INKC, w: 2.4, o: 1 },
      { d: circle(32, 8.5, 3.2), f: '#e8452c', o: 1 },
    ],
  },
  {
    id: 'comet', name: '彗星', theme: 'space', layers: [
      { d: 'M33 14.5C22 23 12 39 6 57C22 50.5 37.5 41 49.5 31Z', f: '#7fe8ff', o: 1 },
      { d: 'M36 20C28 28 20 39 14 50C25 45 35.5 38 45 30Z', f: '#d4fbff' },
      { d: circle(43, 21, 11.5), f: '#ffffff', o: 1 },
      { d: circle(43, 21, 7.5), f: '#fff1a8' },
      { d: ellipse(39.5, 17, 3.2, 1.8, -35), f: '#ffffff' },
      { d: spark(13, 14, 4.6), f: '#ffd84d', o: 1 },
      { d: spark(54, 49, 3.6), f: '#ffd84d', o: 1 },
    ],
  },
  {
    id: 'gear', name: '齿轮', theme: 'machine', layers: [
      { d: gear(32, 32, 26, 19.5, 9), f: '#ffb000', o: 1 },
      { d: circle(32, 32, 13), f: '#ffd166' },
      { d: circle(32, 32, 8.5), f: '#7d8aa3', o: 1 },
      { d: circle(32, 32, 3.6), f: '#d9dde6' },
      { d: 'M17 22Q21 15.5 28.5 13.5', s: SHINE, w: 2.6 },
    ],
  },
  {
    id: 'robot', name: '机器人', theme: 'machine', layers: [
      { d: 'M32 17V8.5', s: INKC, w: 2.6, o: 1 },
      { d: circle(32, 8, 3.8), f: '#e8452c', o: 1 },
      { d: rrect(7.5, 27, 7, 14, 2.5), f: '#a9b4cc', o: 1 },
      { d: rrect(49.5, 27, 7, 14, 2.5), f: '#a9b4cc', o: 1 },
      { d: rrect(12.5, 16.5, 39, 33, 9), f: '#e4e8f0', o: 1 },
      { d: rrect(17.5, 22, 29, 20, 6), f: '#26305f', o: 1 },
      { d: circle(25.5, 31, 3.6), f: '#7fe8ff' },
      { d: circle(38.5, 31, 3.6), f: '#7fe8ff' },
      { d: 'M27.5 36.6Q32 39.6 36.5 36.6', s: '#7fe8ff', w: 2.2 },
      { d: ellipse(15.5, 45, 2.6, 1.7, 0), f: 'rgba(255,110,120,.5)' },
      { d: ellipse(48.5, 45, 2.6, 1.7, 0), f: 'rgba(255,110,120,.5)' },
      { d: 'M16 22Q17.5 18.5 22 18', s: '#ffffff', w: 2.2 },
      { d: rrect(24, 49.5, 16, 7, 2.5), f: '#a9b4cc', o: 1 },
    ],
  },
  {
    id: 'bolt', name: '闪电', theme: 'machine', layers: [
      { d: poly(38, 4, 14, 36, 29, 36, 23, 60, 51, 25, 35, 25, 44, 4), f: '#ffd23f', o: 1 },
      { d: poly(36.5, 8.5, 20.5, 32, 32.5, 32, 29, 47, 45, 28.5, 31, 28.5, 38.5, 8.5), f: '#fff1a8' },
    ],
  },
  {
    id: 'rabbit', name: '玉兔', theme: 'myth', layers: [
      { d: ellipse(18.5, 15, 4.6, 12.5, -14), f: '#f7f3ff', o: 1 },
      { d: ellipse(27.5, 14, 4.6, 12.5, 12), f: '#f7f3ff', o: 1 },
      { d: ellipse(18.7, 15.8, 2, 8.6, -14), f: '#ffb3c6' },
      { d: ellipse(27.3, 14.8, 2, 8.6, 12), f: '#ffb3c6' },
      { d: circle(48.5, 46, 5.5), f: '#f7f3ff', o: 1 },
      { d: ellipse(37, 44, 16, 13.5), f: '#f7f3ff', o: 1 },
      { d: circle(23.5, 32, 11.5), f: '#f7f3ff', o: 1 },
      { d: circle(19.5, 31, 2.1), f: INKC },
      { d: circle(18.8, 30.2, 0.7), f: '#ffffff' },
      { d: circle(13.3, 34.6, 1.4), f: '#ff7a9a' },
      { d: ellipse(19.5, 37, 2.8, 1.7, 0), f: 'rgba(255,110,140,.45)' },
      { d: 'M30 50Q33 54 37 54', s: 'rgba(43,35,70,.35)', w: 1.8 },
    ],
  },
  {
    id: 'cloud', name: '祥云', theme: 'myth', layers: [
      { d: circle(20, 35, 11) + circle(34.5, 27, 14.5) + circle(47, 36, 10) + rrect(10, 34, 46, 13, 6.5), f: '#ffd36b', u: 1 },
      { d: 'M33 31.5A5 5 0 1 1 38 26.5', s: '#d9612a', w: 2.8 },
      { d: 'M17.5 39.5A4 4 0 1 1 21.5 35.5', s: '#d9612a', w: 2.8 },
      { d: 'M44.5 40.5A3.6 3.6 0 1 0 48 37', s: '#d9612a', w: 2.8 },
      { d: 'M24.5 19.5Q29.5 14 37 14.5', s: SHINE, w: 2.6 },
    ],
  },
  {
    id: 'gourd', name: '葫芦', theme: 'myth', layers: [
      { d: rrect(29.8, 5.5, 4.4, 9, 1.6), f: '#8c5d14', o: 1 },
      { d: ellipse(41.5, 9.5, 7, 3.4, -24), f: '#5cc94a', o: 1 },
      { d: circle(32, 22, 10.5) + circle(32, 43, 16.5), f: '#ff9f1c', u: 1 },
      { d: rrect(24.5, 29.4, 15, 4.6, 2.2), f: '#e8452c', o: 1 },
      { d: ellipse(26, 18.5, 2.8, 4.4, 20), f: SHINE },
      { d: ellipse(22.6, 40, 3.4, 6.4, 20), f: SHINE },
    ],
  },
];

export const colorById = (id: string): LiveryColor | undefined => COLORS.find((c) => c.id === id);
export const patternById = (id: string): LiveryPattern | undefined => PATTERNS.find((p) => p.id === id);
export const stickerById = (id: string): LiverySticker | undefined => STICKERS.find((s) => s.id === id);
