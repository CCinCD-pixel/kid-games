// Pure-JS DSP (spec §7.1): every battle sound and every music instrument is computed sample by sample into a
// Float32Array with a fixed seed, then copied into an AudioBuffer of the kit's ONE context (sfx.ts / music.ts).
// Nothing here touches WebAudio, so the same code is unit-tested in Node (synth.test.ts, V16) and rendered to WAV
// offline for dad (tools/render-audio.test.ts). Deterministic: same recipe + seed → bit-identical samples.
export const SR = 44100;
export type Buf = Float32Array<ArrayBuffer>;
export const ms2n = (ms: number): number => Math.round((ms * SR) / 1000);

const TAB = 4096; const SIN = new Float32Array(TAB + 1);
for (let i = 0; i <= TAB; i++) SIN[i] = Math.sin((2 * Math.PI * i) / TAB);
/** sine of a phase given in cycles (table + linear interpolation; ~1e-6 error) */
export function sn(ph: number): number { let p = ph - Math.floor(ph); p *= TAB; const i = p | 0; const f = p - i; return SIN[i] + (SIN[i + 1] - SIN[i]) * f; }
/** mulberry32 → [0, 1) */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** per-sample factor that decays to −60 dB after `ms` */
const dk = (ms: number): number => Math.exp(Math.log(0.001) / Math.max(1, ms2n(ms)));
const lpA = (hz: number): number => 1 - Math.exp((-2 * Math.PI * Math.min(hz, SR * 0.45)) / SR);

/** add src into dst at an offset (ms), scaled; clipped to dst */
export function mix(dst: Buf, src: Buf, atMs = 0, g = 1): Buf { const o = ms2n(atMs); const n = Math.min(src.length, dst.length - o); for (let i = 0; i < n; i++) dst[o + i] += src[i] * g; return dst; }
/** peak-normalise to `db` dBFS (spec: −3 dBFS) */
export function normalize(b: Buf, db = -3): Buf { let p = 0; for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > p) p = a; } if (p > 0) { const k = Math.pow(10, db / 20) / p; for (let i = 0; i < b.length; i++) b[i] *= k; } return b; }
/** short linear fade at the end so a cut never clicks */
export function fadeTail(b: Buf, ms = 4): Buf { const n = Math.min(b.length, ms2n(ms)); for (let i = 0; i < n; i++) b[b.length - 1 - i] *= i / n; return b; }
/** a loopable buffer: the last `fadeMs` are cross-faded into the head (b has len + fade samples) */
export function loopify(b: Buf, fadeMs: number): Buf { const F = ms2n(fadeMs); const L = b.length - F; const o = b.slice(0, L); for (let i = 0; i < F; i++) { const x = i / F; o[i] = b[i] * x + b[L + i] * (1 - x); } return o; }
/** generic envelope a(attack) d(decay) s(sustain level) r(release) in ms over a total length */
export function env(b: Buf, a: number, d: number, s: number, r: number): Buf {
  const na = ms2n(a), nd = ms2n(d), nr = ms2n(r), n = b.length;
  for (let i = 0; i < n; i++) { let g = i < na ? i / Math.max(1, na) : i < na + nd ? 1 - (1 - s) * ((i - na) / Math.max(1, nd)) : s; const ir = n - i; if (ir < nr) g *= ir / nr; b[i] *= g; }
  return b;
}

// ───────────────────────── building blocks (spec §7.1: each ≤40 lines) ─────────────────────────
/** "梆": two decaying sine partials (the upper one dies faster) + a 1.2 ms noise click */
export function woodblock(f1: number, f2: number, decay: number, seed = 7): Buf {
  const n = ms2n(decay * 1.5 + 4); const b = new Float32Array(n); const r = rng(seed);
  const k1 = dk(decay), k2 = dk(decay * 0.5); let a1 = 1, a2 = 0.55, lp = 0; const tn = ms2n(1.2);
  for (let i = 0; i < n; i++) {
    const t = i / SR; let s = a1 * sn(f1 * t) + a2 * sn(f2 * t + 0.25);
    if (i < tn) { const x = r() * 2 - 1; lp += 0.45 * (x - lp); s += (x - lp) * 0.8 * (1 - i / tn); }
    b[i] = s * (i < 30 ? i / 30 : 1); a1 *= k1; a2 *= k2;
  }
  return b;
}
/** 编钟: two-operator FM (carrier f, modulator f·ratio), the index falls from `index` to ~0 */
export function bell(f: number, ratio = 1.4, index = 2.2, decay = 1200, lenMs = decay): Buf {
  const n = ms2n(lenMs); const b = new Float32Array(n); const ka = dk(decay), ki = dk(decay * 0.3);
  let a = 1, I = index / (2 * Math.PI); const fm = f * ratio;
  for (let i = 0; i < n; i++) { const t = i / SR; b[i] = a * sn(f * t + I * sn(fm * t)) * (i < 88 ? i / 88 : 1); a *= ka; I *= ki; }
  return b;
}
/** inharmonic struck metal: [freq, gain, decay ms] partials */
export function partials(ps: readonly (readonly [number, number, number])[], lenMs: number): Buf {
  const n = ms2n(lenMs); const b = new Float32Array(n);
  for (const [f, g, d] of ps) { const k = dk(d); let a = g; for (let i = 0; i < n; i++) { b[i] += a * sn((f * i) / SR) * (i < 22 ? i / 22 : 1); a *= k; } }
  return b;
}
/** Karplus–Strong pluck (弩弦, 琴) */
export function ks(f: number, damp = 0.996, ms = 150, seed = 3, bright = 0.55): Buf {
  const n = ms2n(ms); const b = new Float32Array(n); const r = rng(seed);
  const N = Math.max(2, Math.round(SR / f)); const d = new Float32Array(N); let lp = 0, m = 0;
  for (let i = 0; i < N; i++) { lp += bright * (r() * 2 - 1 - lp); d[i] = lp; m += lp; }
  m /= N; for (let i = 0; i < N; i++) d[i] -= m;
  for (let i = 0; i < n; i++) { const j = i % N; const cur = d[j]; b[i] = cur; d[j] = damp * 0.5 * (cur + d[(j + 1) % N]); }
  return b;
}
/** filtered noise: low-pass sweeps lp0→lp1, a one-pole high-pass at hp, shaped by an amplitude curve over x∈[0,1] */
export function noise(ms: number, seed: number, lp0: number, lp1: number, hp: number, amp: (x: number) => number): Buf {
  const n = ms2n(ms); const b = new Float32Array(n); const r = rng(seed); const ah = lpA(hp);
  let l = 0, l2 = 0, h = 0, al = lpA(lp0);
  for (let i = 0; i < n; i++) {
    if ((i & 31) === 0) { const x = i / n; al = lpA(lp0 * Math.pow(lp1 / lp0, x)); }
    const w = r() * 2 - 1; l += al * (w - l); l2 += al * (l - l2); h += ah * (l2 - h); b[i] = (l2 - h) * amp(i / n);
  }
  return b;
}
/** percussive noise burst: low-pass `lp`, high-pass `hp`, decays to −60 dB in `ms` */
export const noiseBurst = (lp: number, hp: number, ms: number, seed = 5, atkMs = 1.5): Buf => {
  const ta = atkMs / ms; return noise(ms, seed, lp, lp, hp, (x) => (x < ta ? x / ta : Math.pow(0.001, (x - ta) / (1 - ta))));
};
/** brown rumble (integrated noise, leaky) */
export function brown(ms: number, seed: number, lp: number, amp: (x: number) => number): Buf {
  const n = ms2n(ms); const b = new Float32Array(n); const r = rng(seed); const a = lpA(lp); let y = 0, l = 0;
  for (let i = 0; i < n; i++) { y = y * 0.995 + (r() * 2 - 1) * 0.08; l += a * (y - l); b[i] = l * amp(i / n); }
  return b;
}
/** falling sine: heavy hits and drums (`drop` = final pitch ratio) */
export function thump(f0: number, drop = 0.5, ms = 200): Buf {
  const n = ms2n(ms); const b = new Float32Array(n); const k = dk(ms), kf = dk(ms * 0.35); let a = 1, e = 1, ph = 0;
  for (let i = 0; i < n; i++) { ph += (f0 * (drop + (1 - drop) * e)) / SR; b[i] = sn(ph) * a * (i < 66 ? i / 66 : 1); a *= k; e *= kf; }
  return b;
}
/** a row of short clicks (梯子、齿轮、棘轮) */
export function ratchet(count: number, gapMs: number, seed = 11): Buf {
  const r = rng(seed); const b = new Float32Array(ms2n(count * gapMs + 40));
  for (let i = 0; i < count; i++) mix(b, woodblock(1700 + r() * 500, 2900 + r() * 600, 14, seed + i), i * gapMs, 0.6 + r() * 0.3);
  return b;
}
/** wooden whistle (木哨): exponential sweep, soft bell-shaped envelope, optional vibrato (Hz) */
export function chirp(f0: number, f1: number, ms: number, vib = 0): Buf {
  const n = ms2n(ms); const b = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const x = i / n; const f = f0 * Math.pow(f1 / f0, x) * (1 + (vib ? 0.03 * sn((vib * i) / SR) : 0)); ph += f / SR; b[i] = (sn(ph) + 0.18 * sn(2 * ph)) * Math.sqrt(Math.sin(Math.PI * x)); }
  return b;
}
/** creak (吱呀): a rough low-passed saw sweeping f0→f1 */
export function creak(f0: number, f1: number, ms: number, seed = 13): Buf {
  const n = ms2n(ms); const b = new Float32Array(n); const r = rng(seed); let ph = 0, l = 0; const a = lpA(1400); let jit = 1;
  for (let i = 0; i < n; i++) {
    if (i % 300 === 0) jit = 0.6 + r() * 0.8;
    const x = i / n; ph += (f0 * Math.pow(f1 / f0, x) * (0.97 + 0.06 * jit)) / SR; const saw = 2 * (ph - Math.floor(ph + 0.5));
    l += a * (saw - l); b[i] = l * jit * Math.sin(Math.PI * x);
  }
  return b;
}
/** grains: `count` tiny clicks spread over `ms` (gravel, rustle, crackle) */
function grains(ms: number, count: number, seed: number, f: [number, number], grainMs: number, amp: (x: number) => number): Buf {
  const r = rng(seed); const b = new Float32Array(ms2n(ms));
  for (let i = 0; i < count; i++) { const x = r(); mix(b, noiseBurst(f[1], f[0], grainMs, seed * 31 + i), x * (ms - grainMs * 1.2), amp(x) * (0.5 + r() * 0.5)); }
  return b;
}

// ───────────────────────── recipes (spec §7.1 table; v1 = volume-1 machines + all shared events) ─────────────────────────
export interface Recipe {
  /** exact buffer length in ms (V16: length = recipe) */ ms: number;
  /** same id at once · per second */ max: number; perSec: number;
  /** ± pitch jitter (rate) */ jit: number;
  /** 0 never dropped · 1 important · 2 the rest (mixer, §7.1) */ pri: 0 | 1 | 2;
  /** play volume on the sfx bus */ vol: number;
  /** continuous loops go through the game's own gain chain */ loop?: boolean;
  make: (o: Buf, r: () => number) => void;
}
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5;
const dec = (x: number): number => Math.pow(0.001, x);
const R = (ms: number, max: number, perSec: number, jit: number, pri: 0 | 1 | 2, vol: number, make: Recipe['make'], loop = false): Recipe => ({ ms, max, perSec, jit, pri, vol, make, loop });

export const RECIPES: Record<string, Recipe> = {
  place: R(240, 3, 6, 0.04, 2, 0.75, (o) => { mix(o, thump(140, 0.6, 120)); mix(o, woodblock(420, 690, 80, 21), 0, 0.8); mix(o, noiseBurst(4000, 1000, 90, 22), 6, 0.3); }),
  'place.spikes': R(300, 2, 4, 0.06, 2, 0.6, (o, r) => { for (let i = 0; i < 4; i++) { const f = 2400 + r() * 1200; mix(o, partials([[f, 1, 120], [f * 2.7, 0.3, 60]], 160), r() * 110, 0.5); } }),
  'place.pit': R(320, 2, 4, 0.06, 2, 0.7, (o) => { mix(o, noise(260, 31, 6000, 3500, 2000, (x) => Math.sin(Math.PI * Math.min(1, x * 1.3)) * (1 - x * 0.5))); mix(o, thump(110, 0.6, 120), 190, 0.6); }),
  refund: R(560, 1, 4, 0, 2, 0.55, (o) => { mix(o, bell(G5, 1.4, 2.2, 420)); mix(o, bell(C6, 1.4, 2.2, 430), 110); }),
  shovel: R(280, 1, 4, 0.04, 2, 0.6, (o) => { mix(o, noise(150, 41, 3600, 2400, 1400, (x) => Math.sin(Math.PI * x)), 0, 0.7); mix(o, woodblock(300, 520, 60, 42), 130, 0.9); }),
  'shoot.crossbow': R(200, 4, 8, 0.05, 2, 0.5, (o) => { mix(o, ks(220, 0.996, 160, 51)); mix(o, noise(90, 52, 9000, 5000, 3000, (x) => Math.sin(Math.PI * x)), 12, 0.45); }),
  'shoot.lobber': R(380, 3, 4, 0.05, 2, 0.55, (o) => { mix(o, creak(120, 80, 160, 61), 0, 0.8); mix(o, noise(300, 62, 600, 1600, 200, (x) => Math.sin(Math.PI * x)), 50, 0.6); }),
  'shoot.burner': R(340, 3, 4, 0.05, 2, 0.55, (o) => { mix(o, woodblock(1180, 1870, 60, 71), 0, 0.6); mix(o, partials([[2600, 1, 90], [3900, 0.4, 60]], 120), 4, 0.35); mix(o, noise(220, 72, 700, 1500, 200, (x) => Math.sin(Math.PI * x)), 60, 0.45); }),
  'fire.burst': R(420, 3, 4, 0.06, 2, 0.65, (o) => { mix(o, noise(380, 81, 600, 380, 60, (x) => (x < 0.03 ? x / 0.03 : dec((x - 0.03) * 0.9)))); mix(o, grains(360, 12, 82, [2500, 9000], 3, (x) => 1 - x), 10, 0.5); }),
  'hit.wood': R(130, 4, 6, 0.05, 2, 0.6, (o) => { mix(o, woodblock(800, 1350, 80, 91)); }),
  'hit.wood.heavy': R(180, 3, 6, 0.05, 2, 0.65, (o) => { mix(o, woodblock(400, 675, 110, 92)); }),
  'hit.metal': R(300, 3, 6, 0.04, 2, 0.5, (o) => { mix(o, partials([[2100, 1, 250], [3400, 0.65, 170], [5300, 0.4, 110]], 300)); mix(o, noiseBurst(12000, 4000, 8, 93), 0, 0.3); }),
  'hit.fizz': R(240, 2, 4, 0, 2, 0.45, (o) => { mix(o, noise(220, 94, 9000, 9000, 3000, (x) => (x < 0.05 ? x / 0.05 : 1 - x))); }),
  'shield.crack': R(240, 2, 3, 0.05, 2, 0.6, (o) => { mix(o, noiseBurst(7000, 1500, 60, 101)); mix(o, woodblock(620, 980, 50, 102), 40, 0.8); mix(o, woodblock(560, 900, 50, 103), 95, 0.6); }),
  'shield.break': R(420, 2, 3, 0.05, 2, 0.7, (o) => { mix(o, noiseBurst(8000, 900, 120, 111)); for (let i = 0; i < 3; i++) mix(o, woodblock(640 - i * 90, 1000 - i * 120, 60, 112 + i), 50 + i * 70, 0.8); mix(o, thump(160, 0.6, 140), 30, 0.5); }),
  'machine.break': R(600, 3, 4, 0.05, 1, 0.65, (o, r) => { let t = 0; for (let i = 0; i < 5; i++) { mix(o, woodblock(300 + r() * 420, 520 + r() * 600, 60, 121 + i), t, 0.7 + r() * 0.3); t += 40 + r() * 50; } mix(o, chirp(600, 300, 260, 12), 130, 0.45); }),
  capture: R(400, 2, 4, 0, 1, 0.65, (o) => { mix(o, thump(120, 0.5, 220)); mix(o, woodblock(220, 350, 90, 131), 0, 0.7); mix(o, noiseBurst(9000, 1200, 45, 132), 160, 0.9); mix(o, woodblock(900, 1400, 30, 133), 160, 0.5); }),
  'unit.hurt': R(100, 3, 6, 0.06, 2, 0.35, (o) => { mix(o, woodblock(500, 760, 50, 141)); }),
  'unit.break': R(560, 2, 3, 0.05, 1, 0.6, (o, r) => { for (let i = 0; i < 4; i++) mix(o, woodblock(520 - i * 70, 840 - i * 90, 70, 151 + i), i * (55 + r() * 25), 0.8); mix(o, chirp(900, 600, 120), 240, 0.5); }),
  'ram.roll': R(1000, 2, 99, 0, 1, 0.5, (o) => { mix(o, brown(1060, 161, 160, () => 1), 0, 2.2); for (let i = 0; i < 5; i++) mix(o, woodblock(160, 260, 40, 162 + (i % 4)), i * 250, 0.35); }, true),
  'ram.hit': R(460, 2, 2, 0, 1, 0.8, (o) => { mix(o, thump(70, 0.5, 400)); mix(o, noiseBurst(5000, 800, 130, 171), 4, 0.5); mix(o, woodblock(330, 540, 80, 172), 10, 0.5); }),
  'ram.jam': R(340, 2, 2, 0, 1, 0.6, (o) => { mix(o, noise(220, 181, 900, 500, 80, (x) => (x < 0.04 ? x / 0.04 : dec(x)))); mix(o, creak(300, 200, 150, 182), 90, 0.4); }),
  'ant.chitter': R(1000, 2, 99, 0, 2, 0.4, (o, r) => { for (let i = 0; i < 19; i++) { const t = i * (1000 / 18) + r() * 20; if (t < 1040) mix(o, woodblock(2200 + r() * 900, 3300 + r() * 900, 8, 191 + i), t, 0.3 + r() * 0.35); } }, true),
  'beam.hum': R(1000, 2, 99, 0, 2, 0.3, (o) => { for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = (sn(660 * t) + 0.5 * sn(990 * t) + 0.12 * sn(1320 * t)) * (0.85 + 0.15 * sn(6 * t)); } }, true),
  'strike.whistle': R(620, 1, 1, 0, 1, 0.45, (o) => { mix(o, chirp(900, 300, 600)); }),
  'strike.land': R(740, 1, 1, 0, 1, 0.85, (o) => { mix(o, thump(55, 0.5, 500)); mix(o, grains(700, 34, 201, [1500, 7000], 5, (x) => dec(x)), 15, 0.5); }),
  'log.roll': R(1200, 1, 1, 0, 0, 0.8, (o) => { mix(o, brown(1200, 211, 200, (x) => Math.min(1, x / 0.12) * (x > 0.8 ? (1 - x) / 0.2 : 1)), 0, 2.5); mix(o, thump(45, 0.8, 1200), 0, 0.35); }),
  'log.crush': R(130, 3, 6, 0.05, 1, 0.6, (o) => { mix(o, woodblock(260, 410, 70, 221)); }),
  'yield.farm': R(280, 2, 4, 0.03, 2, 0.4, (o) => { mix(o, thump(320, 0.5, 50)); mix(o, grains(230, 12, 231, [3000, 10000], 4, () => 0.7), 20, 0.45); }),
  'yield.bank': R(400, 2, 4, 0.03, 2, 0.45, (o) => { mix(o, thump(320, 0.5, 50)); mix(o, grains(230, 12, 241, [3000, 10000], 4, () => 0.7), 20, 0.45); mix(o, woodblock(240, 380, 70, 242), 210, 0.7); }),
  collect: R(480, 4, 12, 0, 2, 0.4, (o) => { mix(o, bell(C5, 1.4, 2.2, 460)); }),
  'parts.fly': R(220, 6, 12, 0, 2, 0.35, (o) => { mix(o, ks(C6, 0.994, 220, 251)); }),
  'token.ready': R(1000, 1, 1, 0, 1, 0.55, (o) => { [C5, D5, E5, G5, A5].forEach((f, i) => mix(o, bell(f, 1.4, 2.2, 560), i * 80, 0.6)); mix(o, creak(400, 620, 120, 261), 470, 0.3); }),
  'token.use': R(1000, 1, 1, 0, 1, 0.6, (o) => { [C5, E5, G5, C6].forEach((f) => mix(o, bell(f, 1.4, 2.2, 900), 0, 0.4)); mix(o, noise(220, 271, 9000, 6000, 4000, (x) => Math.sin(Math.PI * x)), 0, 0.5); }),
  'gate.knock': R(540, 1, 1, 0, 0, 0.85, (o) => { mix(o, thump(80, 0.6, 180)); mix(o, thump(76, 0.6, 200), 230); }),
  // ── volume 2 (spec §7.1): 木鹊 · 烟车 · 云梯车 · 鼓车 · 橐 · 钩拒 · 转射机 · 夜枭木鸢 · 天亮 ──
  'flyer.flap': R(360, 3, 6, 0.06, 2, 0.4, (o) => { for (let i = 0; i < 4; i++) mix(o, noise(70, 301 + i, 1800, 900, 600, (x) => Math.sin(Math.PI * x)), i * 80, 0.7); }),
  'flyer.peck': R(140, 3, 8, 0.08, 2, 0.4, (o) => { mix(o, woodblock(1600, 2600, 30, 311)); }),
  'flyer.down': R(520, 2, 3, 0.04, 1, 0.6, (o) => { mix(o, chirp(1200, 400, 360), 0, 0.5); mix(o, woodblock(380, 600, 80, 321), 380, 0.9); mix(o, thump(150, 0.6, 120), 380, 0.5); }),
  'smoke.puff': R(700, 2, 2, 0.05, 2, 0.45, (o) => { mix(o, noise(680, 331, 500, 900, 300, (x) => (x < 0.15 ? x / 0.15 : 1 - (x - 0.15) / 0.85))); }),
  'gust.blow': R(800, 2, 3, 0.04, 1, 0.6, (o) => { mix(o, creak(220, 160, 160, 341), 0, 0.5); mix(o, noise(700, 342, 900, 2400, 500, (x) => Math.sin(Math.PI * Math.min(1, x * 1.15)) * (1 - x * 0.3)), 80, 1); }),
  'ladder.raise': R(900, 2, 2, 0.03, 1, 0.55, (o) => { for (let i = 0; i < 5; i++) mix(o, creak(300 + i * 40, 380 + i * 40, 140, 351 + i), i * 150, 0.6); mix(o, woodblock(300, 480, 90, 357), 760, 0.9); }),
  'ladder.down': R(700, 2, 2, 0.03, 1, 0.65, (o) => { mix(o, creak(500, 200, 300, 361), 0, 0.6); mix(o, thump(90, 0.6, 260), 300, 0.9); mix(o, woodblock(260, 420, 90, 362), 310, 0.7); }),
  'hook.swing': R(420, 2, 4, 0.04, 2, 0.55, (o) => { mix(o, noise(260, 371, 2500, 1800, 1200, (x) => Math.sin(Math.PI * x)), 0, 0.6); mix(o, partials([[1800, 1, 160], [2900, 0.5, 100]], 200), 240, 0.5); }),
  'drum.beat': R(500, 1, 3, 0.02, 2, 0.5, (o) => { mix(o, thump(70, 0.5, 380)); mix(o, noiseBurst(1200, 400, 40, 381), 0, 0.3); }),
  'radial.shoot': R(220, 4, 8, 0.05, 2, 0.45, (o) => { mix(o, ks(260, 0.996, 170, 391)); mix(o, creak(700, 900, 40, 392), 0, 0.3); }),
  'owl.screech': R(900, 1, 1, 0, 0, 0.6, (o) => { mix(o, chirp(1800, 2600, 300), 0, 0.5); mix(o, chirp(2600, 1400, 500), 280, 0.6); mix(o, noise(800, 401, 4000, 3000, 2000, (x) => Math.sin(Math.PI * x) * 0.4), 0, 0.4); }),
  'owl.flap': R(700, 1, 2, 0.03, 1, 0.55, (o) => { mix(o, noise(650, 411, 400, 700, 250, (x) => Math.sin(Math.PI * x))); }),
  dawn: R(1600, 1, 1, 0, 0, 0.5, (o) => { [C5, E5, G5, C6].forEach((f, i) => mix(o, bell(f, 1.4, 2.2, 1200), i * 180, 0.5)); }),
  'flag.drum': R(1600, 1, 1, 0, 0, 0.75, (o) => { let t = 0, g = 0.35, gap = 95; while (t < 1150) { mix(o, thump(90, 0.7, 130), t, g); t += gap; gap = Math.max(45, gap * 0.93); g = Math.min(1, g * 1.08); } mix(o, bell(830, 1.41, 4, 380), 1180, 0.45); mix(o, thump(84, 0.6, 260), 1180, 1); }),
  'boss.gong': R(2600, 1, 1, 0, 0, 0.8, (o) => { mix(o, bell(98, 1.41, 6, 2500, 2600)); mix(o, bell(196.5, 1.34, 3, 1600, 2000), 0, 0.35); mix(o, noiseBurst(2500, 120, 60, 281), 0, 0.25); }),
  'boss.phase': R(1500, 1, 1, 0, 0, 0.75, (o) => { mix(o, bell(131, 1.41, 5, 1400, 1460), 40); mix(o, noiseBurst(2500, 150, 50, 291), 40, 0.25); }),
  'rhino.stomp': R(2000, 1, 1, 0, 0, 0.8, (o) => { for (let i = 0; i < 3; i++) mix(o, thump(60, 0.5, 260), i * 350); const h = new Float32Array(ms2n(1100)); for (let i = 0; i < h.length; i++) { const t = i / SR; h[i] = (sn(120 * t) + 0.35 * sn(240 * t)) * (0.7 + 0.3 * sn(7 * t)); } env(h, 160, 0, 1, 220); mix(o, h, 900, 0.35); }),
  'rhino.crack': R(540, 1, 1, 0, 0, 0.7, (o) => { mix(o, partials([[1700, 1, 160], [2900, 0.6, 110], [4100, 0.4, 80]], 220)); mix(o, noiseBurst(9000, 2000, 90, 301), 0, 0.6); mix(o, grains(480, 14, 302, [2000, 8000], 4, (x) => dec(x)), 60, 0.4); }),
  'boss.fold': R(2600, 1, 1, 0, 0, 0.7, (o) => { mix(o, ratchet(12, 115, 311), 0, 0.7); [C5, E5, G5, A5, C6].forEach((f, i) => mix(o, bell(f, 1.4, 2.2, 1000), 1450 + i * 60, 0.4)); }),
  syll: R(90, 9, 14, 0, 2, 0.4, (o) => { mix(o, woodblock(700, 1100, 55, 321)); }),
  'seal.stamp': R(340, 1, 2, 0, 1, 0.65, (o) => { mix(o, woodblock(900, 1400, 40, 331)); mix(o, noiseBurst(6000, 900, 30, 332), 0, 0.6); mix(o, thump(110, 0.6, 220), 20, 0.7); }),
  newcomer: R(1300, 1, 1, 0, 1, 0.55, (o) => { mix(o, bell(E5, 1.4, 2.2, 1150)); mix(o, noise(1000, 341, 400, 1300, 120, (x) => Math.sin(Math.PI * x)), 80, 0.5); }),
  'repair.knock': R(1300, 1, 1, 0, 1, 0.6, (o) => { for (let i = 0; i < 3; i++) mix(o, woodblock(560, 900, 70, 351 + i), i * 220); mix(o, bell(C6, 1.4, 2.2, 560), 700, 0.7); }),
};

/** render one recipe (length = recipe exactly; −3 dBFS; tail faded; loops are seamless) */
export function renderSfx(id: string): Buf {
  const rc = RECIPES[id]; if (!rc) throw new Error(`no recipe ${id}`);
  const L = ms2n(rc.ms); const seed = [...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  if (rc.loop && id !== 'beam.hum') { const F = ms2n(60); const b = new Float32Array(L + F); rc.make(b, rng(seed)); return normalize(loopify(b, 60)); }
  const b = new Float32Array(L); rc.make(b, rng(seed)); normalize(b); return rc.loop ? b : fadeTail(b);
}

// ───────────────────────── music instruments (sample-based; the same samples play in the page and offline) ─────────────────────────
export type Inst = 'qin' | 'qinHi' | 'xun' | 'bell' | 'drum';
/** base pitch of each sample (Hz); notes play at rate = hz(midi) / base */
export const INST_BASE: Record<Inst, number> = { qin: 261.63, qinHi: 523.25, xun: 262, bell: 523.25, drum: 1 };
export const INST_LOOP: Record<Inst, boolean> = { qin: false, qinHi: false, xun: true, bell: false, drum: false };
export function renderInst(inst: Inst): Buf {
  switch (inst) {
    case 'qin': { // plucked silk string: KS + a soft body resonance an octave up + a felt pluck
      const b = ks(261.63, 0.9988, 2600, 401, 0.42); mix(b, ks(523.25, 0.9975, 1400, 402, 0.3), 0, 0.18); mix(b, noiseBurst(2500, 200, 18, 403), 0, 0.25);
      return fadeTail(normalize(b), 40);
    }
    case 'qinHi': { const b = ks(523.25, 0.9982, 1800, 404, 0.4); mix(b, noiseBurst(3500, 300, 14, 405), 0, 0.2); return fadeTail(normalize(b), 40); }
    case 'xun': { // vessel flute: exact-cycle sine + 2nd partial + 5 Hz vibrato (1 s loop) + cross-faded breath
      const L = SR; const b = new Float32Array(L); let ph = 0;
      for (let i = 0; i < L; i++) { const t = i / SR; ph += (262 * (1 + 0.004 * sn(5 * t))) / SR; b[i] = sn(ph) + 0.12 * sn(2 * ph); }
      const br = loopify(noise(1060, 411, 900, 900, 350, () => 1), 60); mix(b, br, 0, 0.35);
      return normalize(b);
    }
    case 'bell': { const b = bell(523.25, 1.4, 2.2, 2400); mix(b, bell(523.25 * 0.5, 1.4, 1.2, 1800), 0, 0.25); return fadeTail(normalize(b), 30); }
    case 'drum': { const b = thump(95, 0.5, 460); mix(b, noiseBurst(400, 40, 130, 421), 0, 0.5); return fadeTail(normalize(b)); }
  }
}
export interface NoteEv { inst: Inst; m: number; t: number; dur: number; vel: number }
export const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
/** music trim (calibrated so the map theme renders at −24 LUFS, V16) */
export const MUSIC_TRIM = 3.05;
/** gain envelope of one note, in seconds: level, attack (0 = the sample's own), hold-until, end */
export function noteEnv(e: NoteEv): { lvl: number; atk: number; hold: number; end: number } {
  switch (e.inst) {
    case 'qin': case 'qinHi': { const end = Math.min(2.4, 0.7 + e.dur * 0.9); return { lvl: 0.32 * e.vel * MUSIC_TRIM, atk: 0, hold: end - 0.18, end }; }
    case 'xun': return { lvl: 0.16 * e.vel * MUSIC_TRIM, atk: 0.18, hold: Math.max(0.2, e.dur - 0.3), end: e.dur + 0.05 };
    case 'bell': return { lvl: 0.24 * e.vel * MUSIC_TRIM, atk: 0, hold: 2.1, end: 2.35 };
    case 'drum': return { lvl: 0.5 * e.vel * MUSIC_TRIM, atk: 0, hold: 0.4, end: 0.45 };
  }
}
/** offline mix of a note list (same samples, rates and envelopes as the page's scheduler) */
export function renderNotes(evs: readonly NoteEv[], sec: number, gain = 1, inst: Partial<Record<Inst, Buf>> = {}): Buf {
  const out = new Float32Array(Math.ceil(sec * SR)); const get = (k: Inst): Buf => (inst[k] ??= renderInst(k));
  for (const e of evs) {
    const s = get(e.inst); const rate = e.inst === 'drum' ? 1 : hz(e.m) / INST_BASE[e.inst]; const E = noteEnv(e); const loop = INST_LOOP[e.inst];
    const o = Math.round(e.t * SR); const n = Math.min(Math.round(E.end * SR), out.length - o); const L = s.length;
    for (let i = 0; i < n; i++) {
      let p = i * rate; if (loop) p %= L; else if (p >= L - 1) break;
      const j = p | 0; const f = p - j; const x = s[j] + (s[(j + 1) % L] - s[j]) * f; const t = i / SR;
      let g = E.lvl;
      if (E.atk && t < E.atk) g = 0.0001 * Math.pow(E.lvl / 0.0001, t / E.atk);
      else if (t > E.hold) g = E.lvl * Math.pow(0.0001 / E.lvl, (t - E.hold) / (E.end - E.hold));
      out[o + i] += x * g * gain;
    }
  }
  return out;
}
