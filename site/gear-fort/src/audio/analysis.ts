// Objective audio checks (V16) — tests and the offline renderer only; never imported by the page.
import { SR, type Buf } from './synth';

/** ITU-R BS.1770-4 integrated loudness (mono, K-weighted, gated), in LUFS */
export function lufs(x: Buf, sr = SR): number {
  const biq = (b0: number, b1: number, b2: number, a0: number, a1: number, a2: number, s: Float64Array | Float32Array): Float64Array => {
    const y = new Float64Array(s.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < s.length; i++) { const v = (b0 * s[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = s[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  };
  // pyloudnorm's K-weighting design (valid at any sample rate)
  let w0 = (2 * Math.PI * 1681.974450955533) / sr; let A = Math.pow(10, 3.99984385397 / 40); let al = Math.sin(w0) / (2 * 0.7071752369554193); let c = Math.cos(w0);
  const s1 = biq(A * (A + 1 + (A - 1) * c + 2 * Math.sqrt(A) * al), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - 2 * Math.sqrt(A) * al),
    A + 1 - (A - 1) * c + 2 * Math.sqrt(A) * al, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - 2 * Math.sqrt(A) * al, x);
  w0 = (2 * Math.PI * 38.13547087613982) / sr; al = Math.sin(w0) / (2 * 0.5003270373253953); c = Math.cos(w0); A = 1;
  const y = biq((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al, s1);
  const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr); const z: number[] = [];
  for (let i = 0; i + blk <= y.length; i += hop) { let s = 0; for (let j = i; j < i + blk; j++) s += y[j] * y[j]; z.push(s / blk); }
  const L = (m: number): number => -0.691 + 10 * Math.log10(m);
  const abs = z.filter((m) => L(m) > -70); if (!abs.length) return -Infinity;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((m) => L(m) > rel); return L(g.reduce((a, b) => a + b, 0) / g.length);
}
/** spectral centroid (Hz) of the loudest `win` samples, by a 50 Hz-grid DFT up to 12 kHz (Hann window) */
export function centroid(x: Buf, win = 4096, sr = SR): number {
  let best = 0, at = 0; for (let i = 0; i + win <= x.length; i += 256) { let e = 0; for (let j = i; j < i + win; j += 4) e += x[j] * x[j]; if (e > best) { best = e; at = i; } }
  const n = Math.min(win, x.length - at); let num = 0, den = 0;
  for (let f = 50; f <= 12000; f += 50) {
    let re = 0, im = 0; const w = (2 * Math.PI * f) / sr;
    for (let j = 0; j < n; j++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / (n - 1)); const v = x[at + j] * h; re += v * Math.cos(w * j); im -= v * Math.sin(w * j); }
    const mag = Math.hypot(re, im); num += f * mag; den += mag;
  }
  return den ? num / den : 0;
}
export const peakDb = (x: Buf): number => { let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return 20 * Math.log10(p || 1e-12); };
export const rmsDb = (x: Buf, from = 0, to = x.length): number => { let s = 0; for (let i = from; i < to; i++) s += x[i] * x[i]; return 10 * Math.log10(s / Math.max(1, to - from) || 1e-24); };
/** 16-bit PCM mono WAV bytes */
export function wav(x: Buf, sr = SR): Uint8Array {
  const n = x.length; const b = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), true);
  return new Uint8Array(b.buffer);
}
