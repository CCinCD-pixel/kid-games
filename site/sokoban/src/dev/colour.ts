/**
 * Colour science for the palette gates (spec §6.2): Machado 2009 colour-vision-deficiency matrices
 * (severity 1.0, applied in linear sRGB) + CIEDE2000 — the same maths as the spec's `palette.py`
 * and the design system's `check_palette.py`. Pure (no DOM): the unit test checks the constants,
 * the browser test (§9.4 group 7) checks the pixels the renderers really draw.
 */

export type Vision = 'normal' | 'protan' | 'deutan' | 'tritan';
export const VISIONS: readonly Vision[] = ['normal', 'protan', 'deutan', 'tritan'];
export const CVD: readonly Vision[] = ['protan', 'deutan', 'tritan'];

const M: Record<Exclude<Vision, 'normal'>, number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

const hex2lin = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const mul = (m: number[][], v: number[]): number[] => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

function lin2lab(l: number[]): number[] {
  const c = l.map((x) => Math.min(1, Math.max(0, x)));
  const X = mul([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], c);
  const n = [0.95047, 1, 1.08883];
  const f = X.map((x, i) => {
    const t = x / n[i];
    return t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29;
  });
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function de2000(a: number[], b: number[]): number {
  const [L1, a1, b1] = a;
  const [L2, a2, b2] = b;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1 = ((deg(Math.atan2(b1, a1p)) % 360) + 360) % 360;
  const h2 = ((deg(Math.atan2(b2, a2p)) % 360) + 360) % 360;
  const dL = L2 - L1;
  const dC = C2p - C1p;
  let dh = h2 - h1;
  dh = dh > 180 ? dh - 360 : dh < -180 ? dh + 360 : dh;
  if (C1p * C2p === 0) dh = 0;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2));
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  if (C1p * C2p === 0) hb = h1 + h2;
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb)) + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.2 * Math.cos(rad(4 * hb - 63));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(rad(60 * Math.exp(-(((hb - 275) / 25) ** 2))));
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

/** CIELAB of a #rrggbb colour as seen with `vision`. */
export const lab = (hex: string, vision: Vision = 'normal'): number[] => lin2lab(vision === 'normal' ? hex2lin(hex) : mul(M[vision], hex2lin(hex)));
/** ΔE00 between two #rrggbb colours as seen with `vision`. */
export const deltaE = (a: string, b: string, vision: Vision = 'normal'): number => de2000(lab(a, vision), lab(b, vision));
/** The smallest ΔE00 over the given visions (default: all four). */
export const worstDeltaE = (a: string, b: string, visions: readonly Vision[] = VISIONS): number => Math.min(...visions.map((v) => deltaE(a, b, v)));

export const rgbHex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

export interface PaletteSample {
  /** crate tops and fronts by colour index (0 = 星港补给 … 3 = seed; 4 reserved, not gated) */
  crateTop: string[];
  crateFront: string[];
  robotBody: string;
  floors: string[];
  signals: string[];
}

/**
 * The four spec §6.2 gates over a set of colours (constants or sampled pixels). Returns the
 * failures (empty = pass) and the worst margins for the report.
 */
export function paletteGates(p: PaletteSample): { failures: string[]; worst: Record<string, number> } {
  const failures: string[] = [];
  const worst: Record<string, number> = { crate: Infinity, floor: Infinity, floorCvd: Infinity, robot: Infinity, robotCvd: Infinity, robotFloor: Infinity, signal: Infinity };
  const tops = p.crateTop.slice(0, 4);
  const crateCols = tops.flatMap((t, i) => [t, p.crateFront[i]]);
  for (let i = 0; i < tops.length; i += 1) {
    for (let j = i + 1; j < tops.length; j += 1) {
      const d = worstDeltaE(tops[i], tops[j]);
      worst.crate = Math.min(worst.crate, d);
      if (d < 12) failures.push(`G-crate ${i}/${j} ${d.toFixed(1)}`);
    }
  }
  for (const c of crateCols) {
    for (const f of p.floors) {
      const d = deltaE(c, f);
      const dc = worstDeltaE(c, f, CVD);
      worst.floor = Math.min(worst.floor, d);
      worst.floorCvd = Math.min(worst.floorCvd, dc);
      if (d < 20 || dc < 12) failures.push(`G-floor ${c}/${f} ${d.toFixed(1)}/${dc.toFixed(1)}`);
    }
    const d = deltaE(p.robotBody, c);
    const dc = worstDeltaE(p.robotBody, c, CVD);
    worst.robot = Math.min(worst.robot, d);
    worst.robotCvd = Math.min(worst.robotCvd, dc);
    if (d < 20 || dc < 12) failures.push(`G-robot ${p.robotBody}/${c} ${d.toFixed(1)}/${dc.toFixed(1)}`);
  }
  for (const f of p.floors) {
    const d = deltaE(p.robotBody, f);
    worst.robotFloor = Math.min(worst.robotFloor, d);
    if (d < 20) failures.push(`G-robot floor ${f} ${d.toFixed(1)}`);
  }
  for (const s of p.signals) {
    for (const t of [...crateCols, p.robotBody, ...p.floors]) {
      const d = deltaE(s, t);
      worst.signal = Math.min(worst.signal, d);
      if (d < 20) failures.push(`G-signal ${s}/${t} ${d.toFixed(1)}`);
    }
  }
  return { failures, worst };
}
