// art/shade.ts — OKLab 配色配方（纯函数，无 DOM）：从一个底色派生"车削木玩具 / 漆器"的亮面、暗面、边、侧面、高光；对比度计算。
// 为什么用 OKLab：在感知均匀的空间里加减明度，色相不漂移（RGB 里"变暗"会变脏变灰）。光源永远在左上。
export interface Lab { L: number; a: number; b: number }
export interface Lch { L: number; C: number; h: number }
type Rgb = readonly [number, number, number];

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export function parseColor(c: string): Rgb {
  const s = c.trim();
  if (s[0] === '#') {
    const h = s.length === 4 ? s.slice(1).split('').map((x) => x + x).join('') : s.slice(1, 7);
    const n = Number.parseInt(h, 16); if (!Number.isFinite(n) || h.length !== 6) throw new Error(`bad colour ${c}`);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(s);
  if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
  throw new Error(`bad colour ${c}`);
}
export function rgbToLab([r, g, b]: Rgb): Lab {
  const R = lin(r / 255), G = lin(g / 255), B = lin(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s };
}
export function labToRgb({ L, a, b }: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [Math.round(clamp01(gam(clamp01(R))) * 255), Math.round(clamp01(gam(clamp01(G))) * 255), Math.round(clamp01(gam(clamp01(B))) * 255)];
}
export const toHex = (rgb: Rgb): string => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
export const labOf = (c: string): Lab => rgbToLab(parseColor(c));
export const hexOf = (lab: Lab): string => toHex(labToRgb(lab));
export function lchOf(c: string): Lch { const { L, a, b } = labOf(c); return { L, C: Math.hypot(a, b), h: Math.atan2(b, a) }; }
export const fromLch = ({ L, C, h }: Lch): string => hexOf({ L, a: C * Math.cos(h), b: C * Math.sin(h) });

/** 在 OKLab 里混色：t = 0 → a，1 → b */
export function mix(a: string, b: string, t: number): string { const A = labOf(a), B = labOf(b); return hexOf({ L: A.L + (B.L - A.L) * t, a: A.a + (B.a - A.a) * t, b: A.b + (B.b - A.b) * t }); }
/** 改明度（dL，约 ±0.1 = 肉眼一档）、彩度乘子、色相偏移（弧度；暗部略偏暖更像木头） */
export function tweak(c: string, o: { dL?: number; chroma?: number; hue?: number }): string {
  const x = lchOf(c); return fromLch({ L: Math.min(1, Math.max(0, x.L + (o.dL ?? 0))), C: Math.max(0, x.C * (o.chroma ?? 1)), h: x.h + (o.hue ?? 0) });
}
export const lighten = (c: string, dL: number, chroma = 1): string => tweak(c, { dL, chroma });
export const darken = (c: string, dL: number, chroma = 1): string => tweak(c, { dL: -dL, chroma });
export function alpha(c: string, a: number): string { const [r, g, b] = parseColor(c); return `rgba(${r},${g},${b},${+a.toFixed(3)})`; }

/** WCAG 相对亮度与对比度 */
export function luminance(c: string): number { const [r, g, b] = parseColor(c); return 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255); }
export function contrast(a: string, b: string): number { const la = luminance(a), lb = luminance(b); const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return (hi + 0.05) / (lo + 0.05); }
/** 感知明度差 ΔL*（CIE L* 近似，0–100） */
export function deltaLstar(a: string, b: string): number { const f = (c: string): number => { const y = luminance(c); return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; }; return Math.abs(f(a) - f(b)); }

export interface ToyPalette { hi: string; lo: string; rim: string; side: string; glint: string; shadow: string }
/**
 * 配方：一个底色 → 圆片的面渐变（左上亮 hi → 右下暗 lo）、外缘 rim、侧面 side、高光 glint、软阴影 shadow。
 * kind 'wood'：暗部偏暖（色相 +0.06 rad）、彩度略升；'lacquer'：漆面更深、高光更亮更冷。
 */
export function toyPalette(base: string, kind: 'wood' | 'lacquer' = 'wood'): ToyPalette {
  if (kind === 'wood') return { hi: lighten(base, 0.05, 1.04), lo: tweak(base, { dL: -0.07, chroma: 1.12, hue: 0.06 }), rim: tweak(base, { dL: -0.2, chroma: 1.1, hue: 0.07 }), side: tweak(base, { dL: -0.26, chroma: 1.05, hue: 0.08 }), glint: lighten(base, 0.16, 0.45), shadow: alpha(tweak(base, { dL: -0.45, chroma: 0.6 }), 0.45) };
  return { hi: lighten(base, 0.05, 1), lo: tweak(base, { dL: -0.08, chroma: 1.05, hue: -0.04 }), rim: lighten(base, 0.3, 0.7), side: tweak(base, { dL: -0.14, chroma: 0.95 }), glint: lighten(base, 0.38, 0.35), shadow: alpha(tweak(base, { dL: -0.2, chroma: 0.6 }), 0.55) };
}
