/**
 * Pure-TypeScript F0 tracker for short isolated syllables (child or adult voice).
 *
 * Method: YIN (de Cheveigne & Kawahara 2002) difference function with cumulative-mean normalisation and
 * parabolic interpolation, extended with a small pYIN-style Viterbi pass over per-frame candidates so that
 * octave jumps and one-frame voicing flicker are penalised instead of patched afterwards.
 * No dependencies, no browser APIs: runs in a Worker, on the main thread and in Node tests.
 */
export interface PitchTrack {
  /** Frame centre times in seconds. */
  t: number[];
  /** F0 in Hz per frame; 0 where the frame is unvoiced. */
  f0: number[];
  voiced: boolean[];
  /** Normalised aperiodicity 0..1+ of the winning candidate (lower = more periodic). */
  aperiodicity: number[];
  /** Frame RMS (linear, full scale = 1). */
  rms: number[];
  hopSeconds: number;
}
export interface PitchOptions {
  minHz?: number;
  maxHz?: number;
  frameSeconds?: number;
  hopSeconds?: number;
  /** YIN absolute threshold for a confident periodic frame. */
  threshold?: number;
  /** Frames quieter than this fraction of the loud-frame RMS are never voiced. */
  relativeEnergyFloor?: number;
  /** Absolute RMS floor (full scale = 1). */
  absoluteEnergyFloor?: number;
}
const DEFAULTS = {
  minHz: 75,
  maxHz: 600,
  frameSeconds: 0.04,
  hopSeconds: 0.01,
  threshold: 0.15,
  relativeEnergyFloor: 0.06,
  absoluteEnergyFloor: 0.004,
};
interface Candidate {
  hz: number;
  /** Aperiodicity d'(tau) of this candidate. */
  d: number;
  /** Extra cost when this looks like a sub-harmonic of a candidate that is just as periodic. */
  penalty: number;
}
const semitones = (hz: number) => 12 * Math.log2(hz);

/** YIN cumulative-mean-normalised difference for one frame. Returns d' for lags 0..tauMax. */
function cmndf(x: Float32Array, start: number, window: number, tauMax: number, out: Float32Array): void {
  // d(tau) = sum_j (x[j] - x[j+tau])^2 over an integration window of fixed length.
  let running = 0;
  out[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < window; j++) {
      const delta = x[start + j] - x[start + j + tau];
      sum += delta * delta;
    }
    running += sum;
    out[tau] = running > 0 ? (sum * tau) / running : 1;
  }
}

function candidatesFor(
  d: Float32Array,
  tauMin: number,
  tauMax: number,
  sampleRate: number,
  threshold: number,
): Candidate[] {
  const found: Candidate[] = [];
  for (let tau = Math.max(2, tauMin); tau < tauMax; tau++) {
    // Local minima of d' that are meaningfully periodic.
    if (d[tau] < d[tau - 1] && d[tau] <= d[tau + 1] && d[tau] < 0.55) {
      // Parabolic interpolation around the integer minimum.
      const a = d[tau - 1],
        b = d[tau],
        c = d[tau + 1];
      const denominator = a - 2 * b + c;
      const shift = denominator > 1e-12 ? (0.5 * (a - c)) / denominator : 0;
      const lag = tau + Math.max(-1, Math.min(1, shift));
      found.push({ hz: sampleRate / lag, d: b, penalty: 0 });
    }
  }
  // Octave-low guard: a perfectly periodic signal is equally periodic at 2T, 3T, ... If a higher-F0 candidate is
  // (nearly) as periodic as this one and sits at an integer multiple of its F0, this one is the sub-harmonic.
  for (const c of found)
    for (const other of found)
      if (other.hz > c.hz * 1.3 && other.d <= c.d + 0.02) {
        const k = other.hz / c.hz;
        if (Math.abs(k - Math.round(k)) < 0.04 * Math.round(k)) c.penalty = 0.2;
      }
  // Keep the most periodic few, but always keep the earliest (shortest-lag) one under the YIN threshold:
  // the shortest-lag-first rule is what protects against octave-low errors.
  found.sort((p, q) => p.d - q.d);
  const best = found.slice(0, 5);
  const firstConfident = found.filter((c) => c.d < threshold).sort((p, q) => q.hz - p.hz)[0];
  if (firstConfident && !best.includes(firstConfident)) best.push(firstConfident);
  return best;
}

export function trackPitch(pcm: Float32Array, sampleRate = 16000, options: PitchOptions = {}): PitchTrack {
  const o = { ...DEFAULTS, ...options };
  const frameN = Math.round(o.frameSeconds * sampleRate),
    hopN = Math.max(1, Math.round(o.hopSeconds * sampleRate)),
    tauMin = Math.floor(sampleRate / o.maxHz),
    tauMax = Math.ceil(sampleRate / o.minHz),
    window = frameN - tauMax;
  const track: PitchTrack = { t: [], f0: [], voiced: [], aperiodicity: [], rms: [], hopSeconds: hopN / sampleRate };
  if (window < tauMax / 2 || pcm.length < frameN) return track;
  // Remove DC and apply a gentle pre-emphasis-free pass: DC offsets break the difference function on cheap mics.
  let mean = 0;
  for (let i = 0; i < pcm.length; i++) mean += pcm[i];
  mean /= pcm.length;
  const x = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) x[i] = pcm[i] - mean;

  const frames = Math.floor((x.length - frameN) / hopN) + 1;
  const dBuf = new Float32Array(tauMax + 2);
  const candidates: Candidate[][] = [];
  const rms: number[] = [];
  for (let f = 0; f < frames; f++) {
    const start = f * hopN;
    // RMS over the whole analysis frame.
    let energy = 0;
    for (let j = 0; j < frameN; j++) energy += x[start + j] * x[start + j];
    rms.push(Math.sqrt(energy / frameN));
    cmndf(x, start, window, tauMax + 1, dBuf);
    candidates.push(candidatesFor(dBuf, tauMin, tauMax, sampleRate, o.threshold));
    track.t.push((start + frameN / 2) / sampleRate);
  }
  const sortedRms = [...rms].sort((a, b) => a - b);
  const loud = sortedRms[Math.floor(sortedRms.length * 0.9)] ?? 0;
  const gate = Math.max(o.absoluteEnergyFloor, loud * o.relativeEnergyFloor);

  // Viterbi over {candidates..., unvoiced} per frame.
  const VOICED_SWITCH = 0.6;
  const SEMITONE_COST = 0.12;
  // Fast glides (tones 2 and 4) smear the 40 ms difference function, so a periodic-but-moving frame can have
  // d' up to ~0.45. Real noise sits above ~0.6, so the unvoiced cost is a constant just above that.
  const UNVOICED_COST = 0.85;
  const obsCost = (f: number, c: Candidate | null): number => {
    const quiet = rms[f] < gate;
    if (c === null) return quiet ? 0 : UNVOICED_COST;
    if (quiet) return 3;
    return 0.1 + (c.d + c.penalty) * 1.5;
  };
  const stateCount = (f: number) => candidates[f].length + 1;
  const cost: number[][] = [],
    back: number[][] = [];
  for (let f = 0; f < frames; f++) {
    const n = stateCount(f);
    cost.push(new Array(n).fill(Infinity));
    back.push(new Array(n).fill(0));
    for (let s = 0; s < n; s++) {
      const here = s === 0 ? null : candidates[f][s - 1];
      const own = obsCost(f, here);
      if (f === 0) {
        cost[f][s] = own;
        continue;
      }
      for (let p = 0; p < stateCount(f - 1); p++) {
        const there = p === 0 ? null : candidates[f - 1][p - 1];
        let move = 0;
        if (here && there) move = SEMITONE_COST * Math.abs(semitones(here.hz) - semitones(there.hz));
        else if (here || there) move = VOICED_SWITCH;
        const total = cost[f - 1][p] + move + own;
        if (total < cost[f][s]) {
          cost[f][s] = total;
          back[f][s] = p;
        }
      }
    }
  }
  let state = 0;
  {
    const last = cost[frames - 1];
    for (let s = 1; s < last.length; s++) if (last[s] < last[state]) state = s;
  }
  const path = new Array<number>(frames);
  for (let f = frames - 1; f >= 0; f--) {
    path[f] = state;
    state = back[f][state];
  }
  let hz = path.map((s, f) => (s === 0 ? 0 : candidates[f][s - 1].hz));
  const aper = path.map((s, f) => (s === 0 ? candidates[f].reduce((m, k) => Math.min(m, k.d), 1) : candidates[f][s - 1].d));

  // Remove voiced islands shorter than 3 frames (30 ms), then fold any residual octave outliers.
  hz = dropShortRuns(hz, 3);
  hz = repairOctaveSegments(hz);
  hz = foldOctaves(hz);
  hz = medianSmooth(hz, 5);
  track.f0 = hz;
  track.voiced = hz.map((v) => v > 0);
  track.aperiodicity = aper;
  track.rms = rms;
  return track;
}

function dropShortRuns(hz: number[], minRun: number): number[] {
  const out = hz.slice();
  let i = 0;
  while (i < out.length) {
    if (out[i] <= 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < out.length && out[j] > 0) j++;
    if (j - i < minRun) for (let k = i; k < j; k++) out[k] = 0;
    i = j;
  }
  return out;
}

/**
 * Creaky voice (the tail of tone 3 and 4 in many speakers, common in children) halves F0 for several frames.
 * That is a physical octave drop, not a contour feature. Where two neighbouring voiced segments meet at a ratio
 * of about 2:1, the shorter segment is folded onto the longer one's octave so the contour stays continuous.
 */
function repairOctaveSegments(hz: number[]): number[] {
  const out = hz.slice();
  const MAX_GAP = 4;
  for (let round = 0; round < 4; round++) {
    // Segments: voiced runs (small gaps allowed), cut wherever the pitch jumps by more than ~7 semitones in one step.
    const segments: { a: number; b: number }[] = [];
    let previous = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i] <= 0) continue;
      const last = segments[segments.length - 1];
      const near = last && previous >= 0 && i - previous - 1 <= MAX_GAP;
      const ratio = previous >= 0 ? out[i] / out[previous] : 1;
      if (near && ratio < 1.5 && ratio > 1 / 1.5) last.b = i;
      else segments.push({ a: i, b: i });
      previous = i;
    }
    let changed = false;
    for (let k = 1; k < segments.length; k++) {
      const left = segments[k - 1],
        right = segments[k];
      // Compare the nearest voiced samples on either side of the gap.
      const ratio = out[right.a] / out[left.b];
      const octave = ratio > 1.75 && ratio < 2.3 ? 'up' : ratio > 0.43 && ratio < 0.57 ? 'down' : null;
      if (!octave) continue;
      // The shorter side is the artefact; fold it toward the longer side.
      const leftLen = left.b - left.a + 1,
        rightLen = right.b - right.a + 1;
      const fixRight = rightLen <= leftLen;
      const factor = fixRight ? (octave === 'up' ? 0.5 : 2) : octave === 'up' ? 2 : 0.5;
      const seg = fixRight ? right : left;
      for (let i = seg.a; i <= seg.b; i++) if (out[i] > 0) out[i] *= factor;
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return out;
}

/** A frame near 2x or 0.5x of its local median is an octave slip: fold it back (after Viterbi this is rare). */
function foldOctaves(hz: number[]): number[] {
  const out = hz.slice();
  const voiced = hz.filter((v) => v > 0).sort((a, b) => a - b);
  if (voiced.length < 5) return out;
  const median = voiced[Math.floor(voiced.length / 2)];
  for (let i = 0; i < out.length; i++) {
    if (out[i] <= 0) continue;
    // Local reference: median of the voiced neighbours within +-4 frames, else the utterance median.
    const near: number[] = [];
    for (let k = Math.max(0, i - 4); k <= Math.min(out.length - 1, i + 4); k++) if (k !== i && hz[k] > 0) near.push(hz[k]);
    near.sort((a, b) => a - b);
    const ref = near.length >= 2 ? near[Math.floor(near.length / 2)] : median;
    const ratio = out[i] / ref;
    if (ratio > 1.75 && ratio < 2.3) out[i] /= 2;
    else if (ratio > 0.43 && ratio < 0.57) out[i] *= 2;
  }
  return out;
}

function medianSmooth(hz: number[], width: number): number[] {
  const half = (width - 1) / 2;
  return hz.map((v, i) => {
    if (v <= 0) return 0;
    const w: number[] = [];
    for (let k = i - half; k <= i + half; k++) if (k >= 0 && k < hz.length && hz[k] > 0) w.push(hz[k]);
    w.sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}
