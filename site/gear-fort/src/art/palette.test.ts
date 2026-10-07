// V15 (spec §9.1, §6.5): feedback colours stand out — ΔE2000 ≥ 15 from the board's ground colours, ≥ 12 from object
// colours, and ≥ 8 from them under a deuteranopia simulation (red-green colour weakness). Pure maths on the palette.
import { describe, it, expect } from 'vitest';
import { PAL, FB } from '../theme/mozi';

const hex = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lab(rgb: number[]): number[] {
  const [r, g, b] = rgb.map(lin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
function de2000(a: number[], b: number[]): number { // CIEDE2000 (Sharma et al. 2005)
  const [L1, a1, b1] = a, [L2, a2, b2] = b; const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2; const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G); const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (bb: number, ap: number): number => { const v = Math.atan2(bb, ap) / rad; return v < 0 ? v + 360 : v; };
  const h1p = h(b1, a1p), h2p = h(b2, a2p); const dL = L2 - L1, dC = C2p - C1p;
  let dh = h2p - h1p; if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad); const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p; if (C1p * C2p !== 0) hm = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T;
  const Rt = -2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}
// Machado et al. 2009 deuteranopia (severity 1) in linear RGB
const deut = (rgb: number[]): number[] => { const [r, g, b] = rgb.map(lin); const m = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]; return m.map((row) => { const v = Math.max(0, Math.min(1, row[0] * r + row[1] * g + row[2] * b)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; }); };
const dE = (p: string, q: string, cvd = false): number => de2000(lab(cvd ? deut(hex(p)) : hex(p)), lab(cvd ? deut(hex(q)) : hex(q)));

const FEEDBACK = { ...FB, fire: PAL.fire2 } as Record<string, string>;
const GROUND = { sandHi: PAL.sandHi, sandLo: PAL.sandLo, fieldA: PAL.fieldA, fieldB: PAL.fieldB } as Record<string, string>;
const OBJECT = { woodHi: PAL.woodHi, woodMid: PAL.woodMid, woodLo: PAL.woodLo, bronze: PAL.bronze, verdigris: PAL.verdigris } as Record<string, string>;

describe('V15 palette', () => {
  it('ΔE2000 known value (Sharma test pair 1)', () => { expect(de2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3); });
  for (const [f, fc] of Object.entries(FEEDBACK)) it(`feedback ${f} stands out`, () => {
    const low: string[] = [];
    for (const [g, gc] of Object.entries(GROUND)) { if (dE(fc, gc) < 15) low.push(`${g} ${dE(fc, gc).toFixed(1)}`); if (dE(fc, gc, true) < 8) low.push(`${g} cvd ${dE(fc, gc, true).toFixed(1)}`); }
    for (const [o, oc] of Object.entries(OBJECT)) { if (dE(fc, oc) < 12) low.push(`${o} ${dE(fc, oc).toFixed(1)}`); if (dE(fc, oc, true) < 8) low.push(`${o} cvd ${dE(fc, oc, true).toFixed(1)}`); }
    expect(low).toEqual([]);
  });
});
