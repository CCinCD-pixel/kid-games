/**
 * From an F0 track to a speaker-independent tone contour, and a deliberately simple tone-shape descriptor.
 *
 * Normalisation is per utterance: semitones relative to the utterance's own median F0, so a 6-year-old at 330 Hz
 * and an adult at 120 Hz produce comparable shapes. The descriptor names one of four shapes and says how sure it is;
 * it makes no claim about which of the five Mandarin tones was meant (tone 3 in connected speech, neutral tone and
 * tone sandhi are out of scope here).
 */
import type { PitchTrack } from './pitch';

export type Shape = 'level' | 'rising' | 'dipping' | 'falling';
export const SHAPES: readonly Shape[] = ['level', 'rising', 'dipping', 'falling'];
/** The textbook isolated-syllable shape of each tone. Tone 5 has no pitch shape of its own. */
export const TONE_SHAPE: Record<1 | 2 | 3 | 4, Shape> = { 1: 'level', 2: 'rising', 3: 'dipping', 4: 'falling' };
export const SHAPE_TONE: Record<Shape, 1 | 2 | 3 | 4> = { level: 1, rising: 2, dipping: 3, falling: 4 };

export interface Contour {
  /** 10 time-normalised points over the voiced span, semitones relative to the utterance median F0. */
  points: number[];
  /** Same span at 24 points, for drawing. */
  curve: number[];
  medianHz: number;
  /** max - min of `points`, in semitones. */
  rangeSt: number;
  /** Fraction of frames inside the voiced span that were actually voiced (1 = unbroken). */
  continuity: number;
  voicedSeconds: number;
  spanSeconds: number;
  voicedFrames: number;
}
export interface BuildOptions {
  minVoicedFrames?: number;
}

export function buildContour(track: PitchTrack, options: BuildOptions = {}): Contour | null {
  const minVoiced = options.minVoicedFrames ?? 8;
  const hop = track.hopSeconds;
  const first = track.f0.findIndex((v) => v > 0);
  if (first < 0) return null;
  let last = track.f0.length - 1;
  while (last > first && track.f0[last] <= 0) last--;
  const voiced = track.f0.filter((v) => v > 0);
  if (voiced.length < minVoiced) return null;
  const sorted = [...voiced].sort((a, b) => a - b);
  const medianHz = sorted[Math.floor(sorted.length / 2)];
  // Onset/offset frames of a voiced region are the least reliable (irregular glottal pulses): trim them.
  const trim = last - first + 1 >= 20 ? 2 : 0;
  const a = first + trim,
    b = last - trim;
  const st: number[] = [];
  for (let i = a; i <= b; i++) st.push(track.f0[i] > 0 ? 12 * Math.log2(track.f0[i] / medianHz) : NaN);
  // Bridge unvoiced gaps by linear interpolation in the semitone domain.
  for (let i = 0; i < st.length; i++) {
    if (!Number.isNaN(st[i])) continue;
    let lo = i - 1,
      hi = i + 1;
    while (hi < st.length && Number.isNaN(st[hi])) hi++;
    const left = lo >= 0 ? st[lo] : st[hi],
      right = hi < st.length ? st[hi] : left;
    const width = hi - lo;
    for (let k = i; k < hi; k++) st[k] = left + ((right - left) * (k - lo)) / width;
    i = hi;
  }
  const inside = track.f0.slice(first, last + 1).filter((v) => v > 0).length;
  const bins = (n: number) =>
    Array.from({ length: n }, (_, k) => {
      const from = (k * st.length) / n,
        to = ((k + 1) * st.length) / n;
      let sum = 0,
        weight = 0;
      for (let i = Math.floor(from); i < Math.ceil(to) && i < st.length; i++) {
        const w = Math.min(i + 1, to) - Math.max(i, from);
        sum += st[i] * w;
        weight += w;
      }
      return weight > 0 ? sum / weight : st[Math.min(st.length - 1, Math.floor(from))];
    });
  const points = bins(10);
  return {
    points,
    curve: bins(24),
    medianHz,
    rangeSt: Math.max(...points) - Math.min(...points),
    continuity: inside / (last - first + 1),
    voicedSeconds: voiced.length * hop,
    spanSeconds: (last - first + 1) * hop,
    voicedFrames: voiced.length,
  };
}

export interface ShapeFeatures {
  /** Mean of the first two / last two points, semitones. */
  start: number;
  end: number;
  /** Net change end - start. */
  delta: number;
  /** How far the valley sits below the start / end (semitones, >= 0). */
  fallIn: number;
  riseOut: number;
  /** Index (0..9) of the lowest and highest points. */
  minAt: number;
  maxAt: number;
  rangeSt: number;
}
export interface ShapeDescriptor {
  shape: Shape;
  /** 0..1: how clearly the best shape beats the runner-up (and how unambiguous the evidence is). */
  confidence: number;
  scores: Record<Shape, number>;
  runnerUp: Shape;
  features: ShapeFeatures;
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

export function shapeFeatures(points: number[]): ShapeFeatures {
  const start = mean(points.slice(0, 2)),
    end = mean(points.slice(-2));
  const min = Math.min(...points),
    max = Math.max(...points);
  return {
    start,
    end,
    delta: end - start,
    fallIn: Math.max(0, start - min),
    riseOut: Math.max(0, end - min),
    minAt: points.indexOf(min),
    maxAt: points.indexOf(max),
    rangeSt: max - min,
  };
}

/**
 * Soft score per shape from the 10-point semitone contour. The thresholds are phonetic priors (a rise of about 3-5
 * semitones is a tone 2, a fall of 6+ a tone 4, a valley of 2+ semitones on both sides a tone 3, anything inside
 * ~2 semitones is level), not values fitted to a child corpus; see the baseline report in the tests.
 */
export function describeShape(contour: Pick<Contour, 'points'>): ShapeDescriptor {
  const f = shapeFeatures(contour.points);
  const { delta, fallIn, riseOut, minAt, rangeSt } = f;
  // A valley needs a fall before it and a rise after it, with the minimum away from both edges.
  const interior = minAt >= 2 && minAt <= 8 ? 1 : 0.35;
  const dipping = clamp01((Math.min(fallIn, riseOut) - 0.8) / 2.4) * interior;
  const rising = clamp01((delta - 1.5) / 3.5) * (1 - clamp01((fallIn - 1.2) / 2.5));
  const falling = clamp01((-delta - 2.5) / 4) * (1 - clamp01((riseOut - 1.8) / 2.5));
  const level = clamp01(1 - (rangeSt - 1.5) / 3);
  const scores: Record<Shape, number> = { level, rising, dipping, falling };
  const ranked = (Object.keys(scores) as Shape[]).sort((p, q) => scores[q] - scores[p]);
  const top = scores[ranked[0]],
    second = scores[ranked[1]];
  // Confidence: the winner must be strong in absolute terms AND clearly ahead.
  const confidence = clamp01(top) * clamp01(1 - second / Math.max(top, 1e-6));
  // If nothing scores, call it level with low confidence rather than inventing a shape.
  const shape = top < 0.15 ? 'level' : ranked[0];
  return { shape, confidence: top < 0.15 ? 0 : confidence, scores, runnerUp: ranked[1], features: f };
}

/** Brings a contour from a narrow- or wide-ranged speaker to the reference range (excursions about the median). */
export function scalePoints(points: number[], scale: number): number[] {
  const centre = points.reduce((a, b) => a + b, 0) / points.length;
  return points.map((v) => centre + (v - centre) * scale);
}
/** Softmax over the four soft scores: a rough P(shape), used with the abstention threshold c = 0.9. */
export const POSTERIOR_SHARPNESS = 6;
export function posterior(scores: Record<Shape, number>): Record<Shape, number> {
  const e = SHAPES.map((s) => Math.exp(POSTERIOR_SHARPNESS * scores[s]));
  const total = e.reduce((a, b) => a + b, 0);
  return Object.fromEntries(SHAPES.map((s, i) => [s, e[i] / total])) as Record<Shape, number>;
}
