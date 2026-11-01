/**
 * Node-only helpers for the scoring tests: WAV encode/decode, synthetic voices, and on-demand conversion of
 * the licensed syllable recordings (mp3) to 16 kHz mono WAV with ffmpeg. Never plays audio; only writes files
 * under tests/fixtures. Not imported by any browser code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SITE_ROOT = path.resolve(here, '../..');
export const REPO_ROOT = path.resolve(SITE_ROOT, '../..');
export const FIXTURES = path.join(SITE_ROOT, 'tests/fixtures');

export function decodeWav(bytes: Uint8Array): { sampleRate: number; samples: Float32Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a wav file');
  let at = 12,
    sampleRate = 16000,
    channels = 1,
    bits = 16,
    format = 1;
  while (at + 8 <= bytes.length) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === 'fmt ') {
      format = view.getUint16(at + 8, true);
      channels = view.getUint16(at + 10, true);
      sampleRate = view.getUint32(at + 12, true);
      bits = view.getUint16(at + 22, true);
    } else if (tag(at) === 'data') {
      const bodyBytes = Math.min(size, bytes.length - at - 8);
      const bytesPer = bits / 8;
      const n = Math.floor(bodyBytes / bytesPer / channels);
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          const p = at + 8 + (i * channels + c) * bytesPer;
          sum += format === 3 ? view.getFloat32(p, true) : bits === 16 ? view.getInt16(p, true) / 32768 : 0;
        }
        samples[i] = sum / channels;
      }
      return { sampleRate, samples };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('wav has no data chunk');
}
export function encodeWav(samples: Float32Array, sampleRate = 16000): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2),
    view = new DataView(out.buffer);
  const str = (n: number, s: string) => [...s].forEach((c, i) => (out[n + i] = c.charCodeAt(0)));
  str(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * 32767), true));
  return out;
}

/** Deterministic PRNG so noise fixtures are reproducible. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gaussian(random: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
}

export interface SynthOptions {
  sampleRate?: number;
  seconds: number;
  /** F0 in Hz as a function of time (s). */
  f0: (t: number) => number;
  /** Amplitude envelope 0..1 as a function of time (s). Default: 10 ms fades in/out. */
  amp?: (t: number) => number;
  harmonics?: number;
  /** Harmonic rolloff exponent (spectral tilt). */
  tilt?: number;
  noise?: number;
  seed?: number;
}
/** Glottal-like harmonic source with exactly known F0: the ground truth for pitch tests. */
export function synthVoice(o: SynthOptions): Float32Array {
  const sr = o.sampleRate ?? 16000,
    n = Math.round(o.seconds * sr),
    out = new Float32Array(n),
    random = rng(o.seed ?? 7),
    harmonics = o.harmonics ?? 12,
    tilt = o.tilt ?? 1.2;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      f = o.f0(t);
    phase += (2 * Math.PI * f) / sr;
    let v = 0;
    for (let h = 1; h <= harmonics; h++) if (f * h < sr / 2 - 200) v += Math.sin(h * phase) / h ** tilt;
    const fade = Math.min(1, t / 0.01, (o.seconds - t) / 0.01);
    out[i] = 0.3 * v * (o.amp ? o.amp(t) : 1) * Math.max(0, fade) + (o.noise ? o.noise * gaussian(random) : 0);
  }
  return out;
}

/** Path of the 16 kHz mono WAV for a human syllable id like "ma1"; converts from mp3 on first use. */
export function syllableWav(id: string): string | null {
  const target = path.join(FIXTURES, `${id}.wav`);
  if (fs.existsSync(target)) return target;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8'),
  ) as Record<string, { src: string }>;
  const entry = manifest[`py.syl.${id}`];
  if (!entry) return null;
  const source = path.join(REPO_ROOT, 'public', entry.src);
  try {
    fs.mkdirSync(FIXTURES, { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-ar', '16000', '-ac', '1', '-sample_fmt', 's16', target], {
      stdio: 'ignore',
    });
  } catch {
    return null;
  }
  return fs.existsSync(target) ? target : null;
}
export function loadSyllable(id: string): Float32Array | null {
  const file = syllableWav(id);
  return file ? decodeWav(fs.readFileSync(file)).samples : null;
}
export function syllableIds(): string[] {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8'),
  ) as Record<string, unknown>;
  return Object.keys(manifest)
    .filter((k) => k.startsWith('py.syl.'))
    .filter((k) => !(manifest[k] as { synthetic?: boolean } | null)?.synthetic)   // real-person recordings only (call-sounds for lessons 9–13 are synthetic)
    .map((k) => k.slice(7))
    .filter((id) => /[1-4]$/.test(id))
    .sort();
}
export const ffmpegAvailable = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const contourCache = new Map<string, { medianHz: number; rangeSt: number } | null>();
/** A speaker profile built from `count` OTHER recordings of the library (never the clip under test). */
export async function libraryProfile(excludeId: string, count = 20, start = 0) {
  const { trackPitch } = await import('./pitch');
  const { buildContour } = await import('./contour');
  const { addRecording, emptySpeaker } = await import('./speaker');
  const ids = syllableIds().filter((id) => id !== excludeId && id !== 'o1');
  let profile = emptySpeaker();
  for (let k = 0; k < ids.length && profile.recent.length < count; k++) {
    const id = ids[(start + k * 7) % ids.length];
    let c = contourCache.get(id);
    if (c === undefined) {
      const pcm = loadSyllable(id);
      c = pcm ? buildContour(trackPitch(pcm)) : null;
      contourCache.set(id, c);
    }
    if (c) profile = addRecording(profile, { hz: c.medianHz, range: c.rangeSt });
  }
  return profile;
}
