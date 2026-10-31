import { describe, expect, it } from 'vitest';
import { trackPitch } from './pitch';
import { gaussian, loadSyllable, rng, synthVoice, syllableIds, ffmpegAvailable } from './test-support';

const SR = 16000;
const st = (a: number, b: number) => 12 * Math.log2(a / b);
/** Relative error (%) of each voiced frame against the known instantaneous F0, skipping fade edges. */
function errors(f0: (t: number) => number, seconds: number, opts: Parameters<typeof synthVoice>[0] extends infer _ ? Partial<Parameters<typeof synthVoice>[0]> : never = {}) {
  const pcm = synthVoice({ seconds, f0, ...opts });
  const tr = trackPitch(pcm, SR);
  const errs: number[] = [];
  let voiced = 0,
    total = 0;
  tr.t.forEach((t, i) => {
    if (t < 0.06 || t > seconds - 0.06) return;
    total++;
    if (tr.f0[i] > 0) {
      voiced++;
      errs.push((100 * Math.abs(tr.f0[i] - f0(t))) / f0(t));
    } else errs.push(100);
  });
  return { tr, errs, voicedRatio: voiced / total };
}
const p = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];
function maxJump(f0: number[]) {
  let m = 0;
  for (let i = 1; i < f0.length; i++) if (f0[i] > 0 && f0[i - 1] > 0) m = Math.max(m, Math.abs(st(f0[i], f0[i - 1])));
  return m;
}

describe('pitch tracker on synthetic voices with known F0', () => {
  it.each([110, 160, 220, 330, 440, 520])('holds a clean %i Hz tone within 3% on every frame', (hz) => {
    const { errs, voicedRatio } = errors(() => hz, 0.7);
    expect(voicedRatio).toBeGreaterThan(0.97);
    expect(Math.max(...errs)).toBeLessThanOrEqual(3);
    expect(p(errs, 0.5)).toBeLessThan(0.6);
  });
  it.each([
    ['rising 200->300', (t: number) => 200 * Math.pow(1.5, t / 0.6)],
    ['falling 450->225 (tone-4 like)', (t: number) => 450 * Math.pow(0.5, t / 0.6)],
    ['child falling 520->300', (t: number) => 520 * Math.pow(300 / 520, t / 0.5)],
    ['adult rising 100->150', (t: number) => 100 * Math.pow(1.5, t / 0.5)],
  ] as const)('follows a %s sweep within 3% (p95) and never jumps an octave', (_name, f0) => {
    const { tr, errs, voicedRatio } = errors(f0, 0.62);
    expect(voicedRatio).toBeGreaterThan(0.93);
    expect(p(errs, 0.95)).toBeLessThanOrEqual(3);
    expect(maxJump(tr.f0)).toBeLessThan(3);
  });
  it('tracks a pitch step without octave errors', () => {
    const { tr, errs } = errors((t) => (t < 0.35 ? 200 : 300), 0.7);
    expect(p(errs, 0.9)).toBeLessThanOrEqual(3);
    // The step itself is the only allowed large jump: 200 -> 300 Hz = 7 semitones.
    expect(maxJump(tr.f0)).toBeLessThan(8);
    for (let i = 1; i < tr.f0.length; i++) if (tr.f0[i] > 0 && tr.f0[i - 1] > 0) expect(Math.abs(st(tr.f0[i], tr.f0[i - 1]))).not.toBeCloseTo(12, 0);
  });
  it('tracks vibrato (250 Hz +/- 6%, 5 Hz) within 3% on average', () => {
    const { errs } = errors((t) => 250 * (1 + 0.06 * Math.sin(2 * Math.PI * 5 * t)), 0.8);
    expect(errs.reduce((a, b) => a + b, 0) / errs.length).toBeLessThanOrEqual(3);
    expect(p(errs, 0.9)).toBeLessThanOrEqual(5);
  });
  it('still finds the pitch of a noisy voice (SNR about 12 dB) within 3%', () => {
    const { errs, voicedRatio } = errors(() => 280, 0.7, { noise: 0.03 });
    expect(voicedRatio).toBeGreaterThan(0.9);
    expect(p(errs, 0.5)).toBeLessThanOrEqual(3);
    expect(p(errs, 0.9)).toBeLessThanOrEqual(3);
  });
  it('calls white noise unvoiced', () => {
    const random = rng(3);
    const noise = Float32Array.from({ length: SR }, () => 0.1 * gaussian(random));
    const tr = trackPitch(noise, SR);
    expect(tr.f0.filter((v) => v > 0).length / tr.f0.length).toBeLessThan(0.05);
  });
  it('calls silence and a too-short buffer unvoiced without throwing', () => {
    expect(trackPitch(new Float32Array(SR), SR).f0.every((v) => v === 0)).toBe(true);
    expect(trackPitch(new Float32Array(100), SR).f0).toEqual([]);
  });
  it('treats a halved (creaky) stretch as an octave artefact and keeps the contour continuous', () => {
    // 100 ms of true 110 Hz creak inside a 220 Hz vowel: physically an octave drop, not part of the tone shape.
    const { tr } = errors((t) => (t > 0.3 && t < 0.4 ? 110 : 220), 0.7);
    expect(maxJump(tr.f0)).toBeLessThan(3);
  });
  it('works at other input rates (44.1 kHz, 48 kHz) without resampling', () => {
    for (const rate of [44100, 48000]) {
      const pcm = synthVoice({ seconds: 0.6, sampleRate: rate, f0: () => 300 });
      const tr = trackPitch(pcm, rate);
      const v = tr.f0.filter((x) => x > 0);
      expect(v.length / tr.f0.length).toBeGreaterThan(0.9);
      expect(p(v.map((x) => (100 * Math.abs(x - 300)) / 300), 0.95)).toBeLessThanOrEqual(3);
    }
  });
  it('analyses a 1.5 s clip quickly (pure JS, no FFT)', () => {
    const pcm = synthVoice({ seconds: 1.5, f0: (t) => 250 * (1 + 0.2 * t) });
    const t0 = performance.now();
    trackPitch(pcm, SR);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe.skipIf(!ffmpegAvailable)('pitch tracker on the licensed real-person syllables', () => {
  it('finds a continuous, octave-jump-free F0 on every recording', { timeout: 120000 }, () => {
    const ids = syllableIds();
    expect(ids.length).toBeGreaterThan(150);
    let tooFewVoiced = 0,
      worstJump = 0;
    for (const id of ids) {
      const pcm = loadSyllable(id);
      expect(pcm, id).not.toBeNull();
      const tr = trackPitch(pcm!, SR);
      if (tr.f0.filter((v) => v > 0).length < 10) tooFewVoiced++;
      worstJump = Math.max(worstJump, maxJump(tr.f0));
    }
    // pa3 is a creaky recording below the 75 Hz floor; it is allowed to be unvoiced.
    expect(tooFewVoiced).toBeLessThanOrEqual(2);
    expect(worstJump).toBeLessThan(6);
  });
});
