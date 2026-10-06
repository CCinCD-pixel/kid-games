/**
 * Sound (spec §7.1/§7.2). The 62 design-system sounds come from kit (installKitSfx); this game's own
 * `em-*` sounds are LAYERED (review D22): a texture layer (the Kenney CC0 sample the spec names, prepared
 * by tools/emoji-match/build_sfx.py into assets/sfx/k-*.m4a, played at the spec's relative level), a
 * pitch layer (pentatonic synth, in key with the chain ladder) and an air layer (filtered noise) — the
 * synth layers are rendered once into AudioBuffers with plain JS DSP (no second AudioContext) and
 * everything plays through kit/audio's single context on the sfx bus.
 */
import { getAudioContext, music as kitMusic, playBuffer, sfx as kitSfx } from '@kit/audio';
import routeLoopUrl from '../assets/music/route-loop.m4a?url';
import sprite from '../assets/sfx/k-sprite.json';
import { installKitSfx, pentatonic } from '@kit/ui/sfx-bridge';

type Gen = (sr: number) => Float32Array;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- tiny DSP
function buf(sec: number, sr: number) { return new Float32Array(Math.max(1, Math.round(sec * sr))); }
let seed = 12345;
const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x3fffffff) - 1; };
/** RBJ biquad band-pass, frequency may change per sample */
function bandpass(x: Float32Array, sr: number, f: (t: number) => number, q = 1.2): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < x.length; n += 1) {
    const w = TAU * Math.min(f(n / sr), sr * 0.45) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
    const v = b0 * x[n] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[n]; y2 = y1; y1 = v; y[n] = v;
  }
  return y;
}
function lowpass1(x: Float32Array, sr: number, fc: number): Float32Array {
  const a = Math.exp((-TAU * fc) / sr); let z = 0; const y = new Float32Array(x.length);
  for (let n = 0; n < x.length; n += 1) { z = (1 - a) * x[n] + a * z; y[n] = z; }
  return y;
}
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));
function mixInto(dst: Float32Array, src: Float32Array, gain = 1, offset = 0): void { for (let n = 0; n < src.length && n + offset < dst.length; n += 1) dst[n + offset] += src[n] * gain; }
function normalize(x: Float32Array, peak = 0.8): Float32Array { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); if (m > 0) for (let n = 0; n < x.length; n += 1) x[n] *= peak / m; return x; }
function fade(x: Float32Array, sr: number, ms = 6): Float32Array { const k = Math.round((ms / 1000) * sr); for (let n = 0; n < k && n < x.length; n += 1) { x[x.length - 1 - n] *= n / k; } return x; }

/** air layer: band-passed noise sweeping f0 → f1 */
const whoosh = (sec: number, f0: number, f1: number, q = 1.4, a = 0.03): Gen => (sr) => {
  const x = buf(sec, sr); for (let n = 0; n < x.length; n += 1) x[n] = noise();
  const y = bandpass(x, sr, (t) => f0 * (f1 / f0) ** (t / sec), q);
  for (let n = 0; n < y.length; n += 1) { const t = n / sr; y[n] *= Math.min(1, t / a) * (1 - t / sec) ** 1.5; }
  return y;
};
/** pitch layer: marimba-ish FM pluck */
const pluck = (freq: number, sec = 0.35, bright = 2.2): Gen => (sr) => {
  const x = buf(sec, sr);
  for (let n = 0; n < x.length; n += 1) { const t = n / sr; const m = Math.sin(TAU * freq * 4 * t) * bright * Math.exp(-t / 0.05); x[n] = Math.sin(TAU * freq * t + m) * env(t, 0.003, sec / 4); }
  return x;
};
const bell = (freq: number, sec = 0.9): Gen => (sr) => {
  const x = buf(sec, sr); const parts = [[1, 1, 1], [2.76, 0.5, 0.45], [5.4, 0.25, 0.25], [8.93, 0.12, 0.15]];
  for (let n = 0; n < x.length; n += 1) { const t = n / sr; let v = 0; for (const [r, g, d] of parts) v += g * Math.sin(TAU * freq * r * t) * Math.exp(-t / (sec * d)); x[n] = v * Math.min(1, t / 0.002); }
  return x;
};
const thump = (f0: number, f1: number, sec: number): Gen => (sr) => {
  const x = buf(sec, sr); let ph = 0;
  for (let n = 0; n < x.length; n += 1) { const t = n / sr; const f = f1 + (f0 - f1) * Math.exp(-t / 0.03); ph += (TAU * f) / sr; x[n] = Math.sin(ph) * env(t, 0.002, sec / 3); }
  return x;
};
const crackle = (sec: number, fc: number, q = 0.9): Gen => (sr) => {
  const x = buf(sec, sr); for (let n = 0; n < x.length; n += 1) { const t = n / sr; x[n] = noise() * env(t, 0.001, sec / 4) * (noise() > 0.2 ? 1 : 0.3); }
  return bandpass(x, sr, () => fc, q);
};
function layer(...parts: [Gen, number, number?][]): Gen {
  return (sr) => {
    const outs = parts.map(([g]) => g(sr));
    const len = Math.max(...outs.map((o, k) => o.length + Math.round(((parts[k][2] ?? 0) / 1000) * sr)));
    const y = new Float32Array(len);
    outs.forEach((o, k) => mixInto(y, o, parts[k][1], Math.round(((parts[k][2] ?? 0) / 1000) * sr)));
    return fade(normalize(y), sr);
  };
}
const P = (step: number) => 523.25 * 2 ** (pentatonic(step) / 12); // C5-based pentatonic ladder

const SYNTH: Record<string, Gen> = {
  'em-select': layer([pluck(P(7), 0.18, 0.6), 0.7], [bell(P(12), 0.25), 0.25]),
  'em-swap': layer([whoosh(0.14, 700, 2200, 1.2, 0.02), 1]),
  'em-swap-bad': layer([thump(220, 120, 0.16), 1], [whoosh(0.12, 500, 300, 1, 0.01), 0.35]),
  'em-land': layer([thump(900, 420, 0.05), 0.6], [crackle(0.04, 3800, 1.5), 0.25]),
  'em-special-make': layer([pluck(P(5), 0.3), 0.6], [pluck(P(7), 0.3), 0.6, 70], [pluck(P(10), 0.45), 0.8, 140], [whoosh(0.3, 500, 3000, 1.1), 0.4]),
  'em-rocket': layer([whoosh(0.32, 400, 3200, 1.3, 0.02), 1], [crackle(0.08, 2500, 0.7), 0.35], [pluck(P(9), 0.25, 1.4), 0.28, 20]),
  'em-bomb': layer([thump(140, 52, 0.38), 1], [crackle(0.14, 900, 0.6), 0.75], [whoosh(0.3, 1800, 300, 0.8, 0.005), 0.4]),
  'em-drone': (sr) => {
    const sec = 0.42, x = buf(sec, sr); let ph = 0;
    for (let n = 0; n < x.length; n += 1) { const t = n / sr; ph += (TAU * (110 + 9 * Math.sin(TAU * 4 * t) + 60 * t)) / sr; const saw = ((ph / TAU) % 1) * 2 - 1; x[n] = saw * Math.min(1, t / 0.04) * (1 - t / sec); }
    const y = lowpass1(lowpass1(x, sr, 2000), sr, 2400);
    mixInto(y, whoosh(0.35, 600, 1600, 1)(sr), 0.25);
    return fade(normalize(y, 0.7), sr);
  },
  'em-orb': layer([bell(P(5), 0.7), 0.5], [bell(P(7), 0.7), 0.5, 60], [bell(P(9), 0.7), 0.5, 120], [bell(P(10), 0.7), 0.5, 180], [bell(P(12), 0.9), 0.55, 240], [whoosh(0.5, 200, 900, 0.9, 0.05), 0.35]),
  'em-combo': layer([pluck(P(5), 0.6), 0.55], [pluck(P(7), 0.6), 0.55], [pluck(P(9), 0.6), 0.55], [bell(P(12), 0.8), 0.4, 40], [whoosh(0.4, 300, 2500, 1), 0.3]),
  'em-ice-crack': layer([crackle(0.09, 4200, 1.2), 1], [bell(P(14), 0.15), 0.2]),
  'em-ice-break': layer([crackle(0.22, 3600, 0.9), 1], [bell(P(15), 0.35), 0.35], [bell(P(17), 0.3), 0.25, 40]),
  'em-crate-metal': layer([bell(310, 0.35), 0.5], [thump(260, 160, 0.12), 0.6], [crackle(0.06, 2500, 1), 0.3]),
  'em-crate-break': layer([thump(180, 70, 0.22), 0.8], [crackle(0.22, 1300, 0.6), 0.8]),
  'em-dust': layer([crackle(0.08, 6000, 0.7), 0.6], [bell(P(16), 0.2), 0.12]),
  'em-drill': (sr) => {
    const sec = 0.3, x = buf(sec, sr); let ph = 0;
    for (let n = 0; n < x.length; n += 1) { const t = n / sr; ph += (TAU * (880 + 400 * t)) / sr; x[n] = (((ph / TAU) % 1) * 2 - 1) * 0.5 * env(t, 0.01, 0.15) + noise() * 0.25 * env(t, 0.005, 0.1); }
    return fade(normalize(lowpass1(x, sr, 5000), 0.7), sr);
  },
  'em-ion': layer([whoosh(0.4, 300, 4000, 2.5, 0.02), 1], [pluck(P(10), 0.4, 3), 0.35]),
  'em-tractor': layer([thump(500, 300, 0.06), 0.8], [thump(560, 340, 0.06), 0.8, 140], [crackle(0.04, 3000, 1.2), 0.3]),
  'em-bonus-rocket': layer([whoosh(0.18, 600, 3000, 1.3, 0.01), 1]),
};
/** texture layers under the synth: [sample id, gain, rate?] — k-* = assets/sfx (Kenney CC0), others = kit */
const TEXTURE: Record<string, [string, number, number?][]> = {
  'em-select': [['k-glass', 0.45]],
  'em-swap': [['k-scroll', 0.5]],
  'em-swap-bad': [['k-soft', 0.55]],
  'em-land': [['k-land', 0.25]],                       // −12 dB
  'em-special-make': [['whoosh-up', 0.5]],
  'em-rocket': [['k-laser', 0.4]],                      // −8 dB
  'em-bomb': [['k-plate', 0.7]],
  'em-drone': [['k-phase', 0.32]],                      // −10 dB
  'em-orb': [['powerup', 0.3]],
  'em-combo': [['jingle-magic', 0.45]],
  'em-board-clear': [['jingle-magic', 0.8], ['bell', 0.6]],
  'em-crate-paper': [['k-plank', 0.6]],
  'em-crate-metal': [['k-metal', 0.55]],
  'em-crate-break': [['k-wood', 0.6]],
  'em-ice-crack': [['k-ice-crack', 0.5]],
  'em-ice-break': [['k-ice-break', 0.6]],
  'em-dust': [['k-scratch', 0.32]],                     // −10 dB
  'em-goal-done': [['correct', 0.9]],
  'em-tractor': [['ui-snap', 0.6], ['k-metal', 0.32]],
  'em-drill': [['k-metal', 0.3, 1.4]],
  'em-ion': [['k-laser', 0.32, 0.8]],
};
/** the Kenney texture samples: ONE audio sprite (tools/emoji-match/build_sfx.py) decoded after the start
 *  gate and sliced into AudioBuffers by the offsets in k-sprite.json (one request; never inlined) */
const SPRITE_URL = new URL('../assets/sfx/k-sprite.m4a', import.meta.url).href;
async function loadSprite(ctx: AudioContext): Promise<void> {
  const res = await fetch(SPRITE_URL);
  const all = await ctx.decodeAudioData(await res.arrayBuffer());
  const x = all.getChannelData(0), sr = all.sampleRate;
  // AAC priming: if the decoder kept the encoder delay, the first attack lands late — measure and shift
  const expect = Math.round(sprite.firstStart * sr);
  let first = 0; while (first < x.length && Math.abs(x[first]) < 0.02) first += 1;
  const shift = first < x.length && Math.abs(first - expect) < 0.12 * sr ? Math.min(first - expect, 0.1 * sr) : 0;
  for (const [id, o] of Object.entries(sprite.samples)) {
    const s0 = Math.max(0, Math.round(o.start * sr) + Math.max(0, shift) - 64), n = Math.min(x.length - s0, Math.round(o.dur * sr) + 128);
    if (n <= 0) continue;
    const b = ctx.createBuffer(1, n, sr);
    b.copyToChannel(x.subarray(s0, s0 + n) as Float32Array<ArrayBuffer>, 0);
    buffers.set(id, b);
  }
}
const THROTTLE: Record<string, number> = { 'em-land': 60, 'em-dust': 50, 'em-ice-crack': 50, coin: 40, 'match-clear': 40 };

const buffers = new Map<string, AudioBuffer>();
const last = new Map<string, number>();
let ready = false;

export async function initAudio(): Promise<void> {
  await installKitSfx().catch(() => []);
  const ctx = getAudioContext();
  if (!ctx) return;
  for (const [name, gen] of Object.entries(SYNTH)) {
    const data = gen(ctx.sampleRate);
    const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
    b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    buffers.set(name, b);
  }
  ready = true;
  await loadSprite(ctx).catch(() => { /* texture layer missing: the synth layers still play */ });
}

/** how many Kenney texture samples are decoded (audition board / tests) */
export function textureCount(): number { let n = 0; for (const k of buffers.keys()) if (k.startsWith('k-')) n += 1; return n; }
export let muted = false;
/** the pause menu's 声音 switch: game sound effects only (narration and music are separate) */
export function setSfxMuted(on: boolean): void { muted = on; }
export function play(name: string, o: { rate?: number; gain?: number } = {}): void {
  if (muted) return;
  const now = performance.now();
  const th = THROTTLE[name];
  if (th && now - (last.get(name) ?? -1e9) < th) return;
  last.set(name, now);
  const g = o.gain ?? 1;
  const b = buffers.get(name);
  if (b && ready) playBuffer(b, { volume: 0.55 * g, rate: o.rate ?? 1 });
  const tex = TEXTURE[name];
  if (tex) for (const [id, tg, tr] of tex) {
    const kb = id.startsWith('k-') ? buffers.get(id) : undefined;
    if (kb) playBuffer(kb, { volume: tg * g, rate: (tr ?? 1) * (o.rate ?? 1) });
    else if (!id.startsWith('k-')) kitSfx.play(id, { volume: tg * g, rate: (tr ?? 1) * (o.rate ?? 1) });
  }
  if (!b && !tex) kitSfx.play(name, { volume: g, rate: o.rate ?? 1 });
}
/**
 * menu music (spec §7.3): route, maps, hangar, arrival only — never on the board. An original
 * 62.6 s loop (tools/emoji-match/build_music.py) through kit `music` (the music bus, ducked under
 * narration); the loop seam is near-silent so the <audio loop> restart cannot click (kit request #7).
 */
let musicOn = false;
export function routeMusic(on: boolean): void {
  if (on === musicOn) return;
  musicOn = on;
  if (on) kitMusic.play(routeLoopUrl, { volume: 0.42, fadeMs: 900 });
  else kitMusic.stop(500);
}
/** chain ladder (spec §7.2): k-th round → k-th pentatonic step, capped at the 10th */
export function chime(step: number): void { play('chime', { rate: 2 ** (pentatonic(Math.min(step, 9)) / 12), gain: 0.8 }); }
/** collect flights: each goal card climbs its own ladder from C within one move */
export function coin(n: number): void { play('coin', { rate: 2 ** (pentatonic(Math.min(n, 12)) / 12), gain: 0.55 }); }
export function bonusRocket(n: number): void { play('em-bonus-rocket', { gain: 0.6 }); play('chime', { rate: 2 ** (pentatonic(Math.min(n, 12)) / 12), gain: 0.4 }); }
