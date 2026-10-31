import { describe, expect, it } from 'vitest';
import { analyzeClip, DEFAULT_VAD, Endpointer, RATE } from './vad';
import { gaussian, rng, synthVoice } from './test-support';

/** silence (room noise) + voiced + silence, 16 kHz. */
function clip(opts: { lead?: number; voiced?: number; tail?: number; amp?: number; noise?: number; seed?: number }) {
  const { lead = 0.4, voiced = 0.6, tail = 0.8, amp = 0.5, noise = 0.0008, seed = 5 } = opts;
  const n = Math.round((lead + voiced + tail) * RATE),
    out = new Float32Array(n),
    random = rng(seed);
  const v = synthVoice({ seconds: voiced, f0: () => 280, amp: () => amp });
  for (let i = 0; i < n; i++) out[i] = noise * gaussian(random);
  out.set(
    v.map((x, i) => x + out[Math.round(lead * RATE) + i]),
    Math.round(lead * RATE),
  );
  return out;
}

describe('energy VAD and endpointing', () => {
  it('trims leading/trailing silence to the voiced part plus a short pre/post roll', () => {
    const a = analyzeClip(clip({}));
    expect(a.heard).toBe(true);
    expect(a.reason).toBe('silence');
    const seconds = a.pcm.length / RATE;
    expect(seconds).toBeGreaterThan(0.6);
    expect(seconds).toBeLessThan(0.6 + DEFAULT_VAD.preRollSeconds + DEFAULT_VAD.postRollSeconds + 0.12);
    expect(a.quality.voicedSeconds).toBeGreaterThan(0.5);
    expect(a.quality.unreliable).toBe(false);
  });
  it('gives the same trimmed length whatever the chunk size the audio arrives in', () => {
    const pcm = clip({});
    const lengths = [128, 1000, 2048, 4096].map((chunk) => {
      const e = new Endpointer();
      for (let at = 0; at < pcm.length && !e.done; at += chunk) e.push(pcm.subarray(at, at + chunk));
      e.stop();
      return e.analysis().pcm.length;
    });
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(640);
  });
  it('ends by itself after about half a second of silence, and reports a rising level meter', () => {
    const pcm = clip({ tail: 1.5 });
    const e = new Endpointer();
    const levels: number[] = [];
    let doneAt = -1;
    for (let at = 0; at < pcm.length; at += 320) {
      const s = e.push(pcm.subarray(at, at + 320));
      levels.push(s.level);
      if (s.phase === 'done') {
        doneAt = at / RATE;
        break;
      }
    }
    expect(doneAt).toBeGreaterThan(1.0 + 0.4);
    expect(doneAt).toBeLessThan(1.0 + 0.4 + 0.2);
    expect(Math.max(...levels)).toBeGreaterThan(0.5);
    expect(Math.max(...levels)).toBeLessThanOrEqual(1);
    expect(levels[3]).toBeLessThan(0.15);
  });
  it('caps an utterance at 4 s', () => {
    const a = analyzeClip(clip({ voiced: 6, tail: 0.5 }));
    expect(a.reason).toBe('max');
    expect(a.pcm.length / RATE).toBeLessThan(4.4);
    expect(a.pcm.length / RATE).toBeGreaterThan(3.9);
  });
  it('rejects a click or cough (< 0.15 s voiced) and keeps listening, then catches real speech', () => {
    const blip = analyzeClip(clip({ voiced: 0.08 }));
    expect(blip.heard).toBe(false);
    const e = new Endpointer();
    const stream = new Float32Array(Math.round(3 * RATE));
    stream.set(clip({ lead: 0.3, voiced: 0.07, tail: 0.7 }), 0); // blip
    stream.set(clip({ lead: 0.1, voiced: 0.5, tail: 0.9 }), Math.round(1.2 * RATE));
    for (let at = 0; at < stream.length && !e.done; at += 320) e.push(stream.subarray(at, at + 320));
    e.stop();
    const a = e.analysis();
    expect(a.heard).toBe(true);
    expect(a.pcm.length / RATE).toBeLessThan(1.0);
  });
  it('times out when nobody speaks (no_speech) and when stopped early', () => {
    const quiet = new Endpointer();
    const room = clip({ voiced: 0.01, amp: 0 });
    for (let k = 0; k < 10 && !quiet.done; k++) quiet.push(room);
    expect(quiet.done).toBe(true);
    expect(quiet.analysis().heard).toBe(false);
    expect(quiet.analysis().reason).toBe('no_speech');
    const early = new Endpointer();
    early.push(clip({ lead: 0.3, voiced: 0.5, tail: 0.1 }));
    early.stop();
    expect(early.analysis().heard).toBe(true);
    expect(early.analysis().reason).toBe('stopped');
    const never = new Endpointer();
    never.stop();
    expect(never.analysis().heard).toBe(false);
  });
});

describe('clip quality flags', () => {
  it('flags a too-short utterance', () => {
    const a = analyzeClip(clip({ voiced: 0.1 }));
    expect(a.quality.tooShort || !a.heard).toBe(true);
  });
  it('flags speech that is too quiet', () => {
    const a = analyzeClip(clip({ amp: 0.01, noise: 0.00005 }));
    expect(a.quality.tooQuiet).toBe(true);
    expect(a.quality.unreliable).toBe(true);
  });
  it('flags hard clipping', () => {
    const loud = clip({ amp: 6 }).map((x) => Math.max(-1, Math.min(1, x)));
    const a = analyzeClip(loud);
    expect(a.quality.clipped).toBe(true);
    expect(a.quality.unreliable).toBe(true);
  });
  it('flags a noisy room (low speech-to-noise ratio) and estimates the noise floor', () => {
    const a = analyzeClip(clip({ amp: 0.4, noise: 0.05 }));
    expect(a.quality.noisy).toBe(true);
    expect(a.quality.noiseDb).toBeGreaterThan(-35);
    const clean = analyzeClip(clip({ amp: 0.4, noise: 0.0008 }));
    expect(clean.quality.noisy).toBe(false);
    expect(clean.quality.snrDb).toBeGreaterThan(30);
    expect(clean.quality.noiseDb).toBeLessThan(-55);
  });
  it('does not mistake steady moderate room noise for speech', () => {
    const e = new Endpointer();
    const random = rng(9);
    const noise = Float32Array.from({ length: 6 * RATE }, () => 0.01 * gaussian(random));
    for (let at = 0; at < noise.length && !e.done; at += 320) e.push(noise.subarray(at, at + 320));
    e.stop();
    expect(e.analysis().heard).toBe(false);
  });
});
