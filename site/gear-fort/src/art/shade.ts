// shadePart — the ONE shading recipe for every lacquered-wood-toy part (spec §6.2, starport graft #13):
// base fill → top-light/bottom-dark gradient (OKLab lightness ±) → 1-px top highlight → material detail
// (wood grain / lacquer gleam / bronze highlight + verdigris / cloth folds) → ink marks → 2.5-px dark-brown outline.
// Parts never set a flat fillStyle themselves (art.test.ts scans parts.ts for that).
import { PAL } from '../theme/mozi';

export type Mat = 'wood' | 'woodDark' | 'woodRed' | 'lacRed' | 'lacBlack' | 'gold' | 'bronze' | 'teal' | 'iron' | 'stone'
  | 'straw' | 'grain' | 'skin' | 'rope' | 'soil' | 'paper' | 'leaf' | 'white';

const BASE: Record<Mat, string> = {
  wood: '#E0B47A', woodDark: '#A86E3E', woodRed: '#B5623A', lacRed: PAL.lacRed, lacBlack: '#3A2620', gold: PAL.gold,
  bronze: PAL.bronze, teal: PAL.teal, iron: '#6E6A66', stone: '#9C968C', straw: '#E4C46A', grain: '#E9C877', skin: '#F2D3A8',
  rope: '#C9A26A', soil: '#8E6A45', paper: '#F6EAD2', leaf: '#8DB255', white: '#FFFFFF',
};
const DETAIL: Partial<Record<Mat, 'grain' | 'gleam' | 'metal' | 'cloth' | 'speck'>> = {
  wood: 'grain', woodDark: 'grain', woodRed: 'grain', lacRed: 'gleam', lacBlack: 'gleam', gold: 'metal', bronze: 'metal',
  iron: 'metal', teal: 'cloth', stone: 'speck', soil: 'speck', straw: 'grain', rope: 'cloth',
};

// ── colour: hex ⇄ OKLab (lightness shifts stay hue-true, as the spec asks) ──
const toLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function hexToOklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16); const r = toLin(((n >> 16) & 255) / 255), g = toLin(((n >> 8) & 255) / 255), b = toLin((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklabToHex([L, a, b]: [number, number, number]): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return '#' + rgb.map((c) => Math.round(Math.max(0, Math.min(1, toSrgb(Math.max(0, c)))) * 255).toString(16).padStart(2, '0')).join('');
}
/** lighten (+) / darken (−) by a fraction of OKLab lightness */
export function shift(hex: string, dl: number): string { const o = hexToOklab(hex); o[0] = Math.max(0, Math.min(1, o[0] * (1 + dl))); return oklabToHex(o); }
export const matColor = (m: Mat): string => BASE[m];

function rnd(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

export interface ShadeOpts { seed?: number; marks?: Path2D; markW?: number; markColor?: string; outline?: number; night?: boolean; flat?: boolean; tint?: string }

/**
 * Shade one part path in local design units (the caller has already scaled the context: 1 du = s px).
 * box = the part's bounding box in du (for gradients and detail placement); `u` = px per du (for constant-pixel strokes).
 */
export function shadePart(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, path: Path2D, mat: Mat, box: { x: number; y: number; w: number; h: number }, u: number, o: ShadeOpts = {}): void {
  const base = o.tint ?? BASE[mat];
  const px = 1 / u; // one CSS-scale pixel in du
  ctx.save();
  if (mat === 'white') { ctx.fillStyle = '#ffffff'; ctx.fill(path); ctx.lineWidth = 2.5 * px; ctx.strokeStyle = '#ffffff'; ctx.stroke(path); ctx.restore(); return; }
  const g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
  g.addColorStop(0, shift(base, 0.15)); g.addColorStop(0.45, base); g.addColorStop(1, shift(base, -0.18));
  ctx.fillStyle = g; ctx.fill(path);
  ctx.save(); ctx.clip(path);
  // material detail
  const r = rnd((o.seed ?? 7) * 2654435761);
  const det = o.flat ? undefined : DETAIL[mat];
  if (det === 'grain') {
    ctx.strokeStyle = shift(base, -0.35); ctx.globalAlpha = 0.16; ctx.lineWidth = 1.1 * px;
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const y = box.y + ((i + 0.5 + (r() - 0.5) * 0.6) / n) * box.h; const amp = box.h * 0.04 * (0.5 + r());
      ctx.beginPath(); ctx.moveTo(box.x - 2, y);
      ctx.bezierCurveTo(box.x + box.w * 0.3, y - amp, box.x + box.w * 0.6, y + amp, box.x + box.w + 2, y + (r() - 0.5) * amp);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (det === 'gleam') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(box.x + box.w * 0.32, box.y + box.h * 0.28, Math.max(1, box.w * 0.2), Math.max(0.6, box.h * 0.09), -0.5, 0, Math.PI * 2); ctx.fill();
  } else if (det === 'metal') {
    ctx.fillStyle = 'rgba(255,250,235,0.75)';
    ctx.beginPath(); ctx.arc(box.x + box.w * 0.3, box.y + box.h * 0.3, Math.max(0.8, Math.min(box.w, box.h) * 0.08), 0, Math.PI * 2); ctx.fill();
    if (mat === 'bronze') {
      ctx.fillStyle = PAL.verdigris; ctx.globalAlpha = 0.55;
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(box.x + box.w * (0.15 + r() * 0.7), box.y + box.h * (0.45 + r() * 0.5), Math.max(0.6, Math.min(box.w, box.h) * (0.04 + r() * 0.05)), 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  } else if (det === 'cloth') {
    ctx.strokeStyle = shift(base, -0.3); ctx.globalAlpha = 0.35; ctx.lineWidth = 1.2 * px;
    for (let i = 1; i <= 2; i++) { const x = box.x + (box.w * i) / 3; ctx.beginPath(); ctx.moveTo(x, box.y); ctx.quadraticCurveTo(x + box.w * 0.06, box.y + box.h * 0.5, x - box.w * 0.02, box.y + box.h); ctx.stroke(); }
    ctx.globalAlpha = 1;
  } else if (det === 'speck') {
    ctx.fillStyle = shift(base, -0.3); ctx.globalAlpha = 0.3;
    const n = 4 + Math.floor((box.w * box.h) / 120);
    for (let i = 0; i < Math.min(n, 30); i++) { ctx.beginPath(); ctx.arc(box.x + r() * box.w, box.y + r() * box.h, px * (0.8 + r()), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  // top highlight (a 1-px bevel along the upper edges)
  ctx.translate(0, 1.3 * px); ctx.strokeStyle = 'rgba(255,240,210,0.6)'; ctx.lineWidth = 1.6 * px; ctx.stroke(path);
  ctx.restore();
  if (o.marks) { ctx.strokeStyle = o.markColor ?? PAL.outline; ctx.lineWidth = (o.markW ?? 1.6) * px; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(o.marks); }
  if (o.outline !== 0) { ctx.strokeStyle = 'rgba(42,27,18,0.7)'; ctx.lineWidth = (o.outline ?? 2.5) * px; ctx.lineJoin = 'round'; ctx.stroke(path); }
  ctx.restore();
}
