/**
 * V12 / V12c colour checks (spec §6.3, §9.2) on the shipped palette (src/view/art/palette.ts): the six
 * gem base colours are far apart for normal vision (CIEDE2000 ≥ 25) and under protan / deutan / tritan
 * simulation (Machado et al. 2009, severity 1.0, ≥ 12); every gem's light rim (base + 45 % white) has
 * ≥ 3:1 contrast against BOTH board tile colours. The silhouette half of V12 (pairwise IoU ≤ 0.80 of
 * the real rasterised sprites, thinnest stroke ≥ 2 px at cell 76) needs a canvas: it runs in the
 * browser (site/emoji-match/tests/play.spec.ts → __em.art()), and so does V12c on the RENDERED sprites
 * (QA r2: alpha-weighted mean colour of each atlas sprite's outermost 2 device px ring vs both tiles, ≥ 3:1);
 * the palette check here stays as the fast design-time guard.
 * Maths: the design system's checker (~/kid-games-work/design-system/_src/check_palette.py), ported.
 */
import { describe, expect, it } from 'vitest';
import { BOARD, GEMS, hexToRgb, mix } from '../src/view/art/palette';

type V3 = [number, number, number];
const MACHADO: Record<string, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const hex2lin = (h: string): V3 => [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as V3;
const mul = (m: number[][], v: V3): V3 => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) as V3;
function lin2lab(l: V3): V3 {
  const c = l.map((x) => Math.min(1, Math.max(0, x))) as V3;
  const X = mul([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], c);
  const n = [0.95047, 1, 1.08883];
  const f = X.map((x, i) => { const t = x / n[i]; return t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29; });
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
export function de2000([L1, a1, b1]: V3, [L2, a2, b2]: V3): number {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1 = ((deg(Math.atan2(b1, a1p)) % 360) + 360) % 360, h2 = ((deg(Math.atan2(b2, a2p)) % 360) + 360) % 360;
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = h2 - h1; dh = dh > 180 ? dh - 360 : dh < -180 ? dh + 360 : dh;
  if (C1p * C2p === 0) dh = 0;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2));
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  if (C1p * C2p === 0) hb = h1 + h2;
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb)) + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.2 * Math.cos(rad(4 * hb - 63));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(rad(60 * Math.exp(-(((hb - 275) / 25) ** 2))));
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const lum = (h: string) => { const l = hex2lin(h); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** the v1 colours: rygbp (+ the v2 sixth colour 环星, checked too so v2 needs no palette change) */
const SET = GEMS.map((g) => ({ name: g.name, hex: g.base }));
function closest(mode: 'normal' | keyof typeof MACHADO): { d: number; pair: string } {
  const labs = SET.map((g) => lin2lab(mode === 'normal' ? hex2lin(g.hex) : mul(MACHADO[mode], hex2lin(g.hex))));
  let best = { d: Infinity, pair: '' };
  for (let i = 0; i < SET.length; i += 1) for (let j = i + 1; j < SET.length; j += 1) {
    const d = de2000(labs[i], labs[j]);
    if (d < best.d) best = { d, pair: `${SET[i].name}/${SET[j].name}` };
  }
  return best;
}

describe('V12 palette', () => {
  it('ΔE2000 between gem colours: normal ≥ 25, protan / deutan / tritan ≥ 12 (prototype: 30.4 / 14.5 / 13.3 / 14.5)', () => {
    const n = closest('normal');
    expect(n.d, n.pair).toBeGreaterThanOrEqual(25);
    for (const m of ['protan', 'deutan', 'tritan'] as const) { const c = closest(m); expect(c.d, `${m} ${c.pair}`).toBeGreaterThanOrEqual(12); }
    expect(closest('normal').d).toBeCloseTo(30.4, 0);
  });
  it('V12c: every rim (base + 45 % white) ≥ 3:1 against both tiles (prototype worst 5.35, 火晶)', () => {
    let worst = Infinity;
    for (const g of GEMS) {
      const want = hexToRgb(mix(g.base, '#FFFFFF', 0.45)), got = hexToRgb(g.rim);
      expect(Math.max(...want.map((v, i) => Math.abs(v - got[i]))), `${g.name} rim ${g.rim}`).toBeLessThanOrEqual(1); // rounding
      for (const t of [BOARD.tileA, BOARD.tileB]) { const c = contrast(g.rim, t); worst = Math.min(worst, c); expect(c, `${g.name} on ${t}`).toBeGreaterThanOrEqual(3); }
    }
    expect(worst).toBeGreaterThan(5);
  });
});
