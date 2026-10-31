/**
 * Energy VAD + endpointing + clip quality, pure and deterministic (16 kHz mono Float32 in, numbers out).
 *
 * The same Endpointer instance serves live capture (push chunks as they arrive, stop when it says done) and offline
 * analysis of a finished clip (analyzeClip), so what the unit tests prove is what the microphone path runs.
 */
import type { ClipQuality } from './types';

export const RATE = 16000;
const FRAME = 320; // 20 ms
const CALIBRATION_FRAMES = 5;
export interface VadConfig {
  maxSeconds: number; // utterance length after onset
  minVoicedSeconds: number;
  trailingSilenceSeconds: number; // silence that ends an utterance
  preRollSeconds: number;
  postRollSeconds: number;
  noSpeechTimeoutSeconds: number;
  onsetFrames: number; // consecutive loud frames to open
  onsetMarginDb: number; // over the noise floor
  releaseMarginDb: number;
  floorDb: number; // never treat anything below this as speech
  quietSpeechDb: number; // speech quieter than this is "too quiet"
  minSnrDb: number;
  clipLevel: number;
  clipRatio: number;
}
export const DEFAULT_VAD: VadConfig = {
  maxSeconds: 4,
  minVoicedSeconds: 0.15,
  trailingSilenceSeconds: 0.5,
  preRollSeconds: 0.14,
  postRollSeconds: 0.12,
  noSpeechTimeoutSeconds: 7,
  onsetFrames: 3,
  onsetMarginDb: 7,
  releaseMarginDb: 4,
  floorDb: -52,
  quietSpeechDb: -38,
  minSnrDb: 8,
  clipLevel: 0.985,
  clipRatio: 0.002,
};
export type EndReason = 'silence' | 'max' | 'no_speech' | 'stopped';
export interface EndpointState {
  /** Smoothed 0..1 level for a meter. */
  level: number;
  phase: 'waiting' | 'speech' | 'done';
  reason?: EndReason;
}
export interface ClipAnalysis {
  /** Leading/trailing-trimmed audio (copy). Empty when no speech was found. */
  pcm: Float32Array;
  heard: boolean;
  reason: EndReason;
  quality: ClipQuality;
}
const db = (rms: number) => 20 * Math.log10(rms + 1e-9);
const rmsOf = (x: Float32Array, a = 0, b = x.length) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};

export class Endpointer {
  private frames: number[] = []; // dB per completed frame
  private chunks: Float32Array[] = [];
  private carry = new Float32Array(0);
  private samples = 0;
  private noiseDb = NaN;
  private calibration: number[] = [];
  /** Uncapped calibration median: what the room really sounded like (for the noisy-room flag). */
  private roomDb = NaN;
  private onset = -1; // frame index
  private run = 0;
  private lastVoiced = -1;
  private phase: EndpointState['phase'] = 'waiting';
  private endReason: EndReason | undefined;
  private levelValue = 0;
  private all: Float32Array | null = null;
  private fixedFloor = false;
  /**
   * @param noiseHintDb known room floor (offline analysis of a finished clip). Without it the first 100 ms of live
   * audio calibrate the floor.
   */
  constructor(
    private cfg: VadConfig = DEFAULT_VAD,
    noiseHintDb?: number,
  ) {
    if (noiseHintDb !== undefined) {
      this.noiseDb = this.roomDb = Math.max(cfg.floorDb - 4, noiseHintDb);
      this.fixedFloor = true;
    }
  }
  get done() {
    return this.phase === 'done';
  }
  push(input: Float32Array): EndpointState {
    if (this.phase === 'done') return this.state();
    this.chunks.push(input);
    // Rebuild a flat frame stream: carry + input.
    const joined = new Float32Array(this.carry.length + input.length);
    joined.set(this.carry);
    joined.set(input, this.carry.length);
    let at = 0;
    for (; at + FRAME <= joined.length && !this.done; at += FRAME) this.frame(joined.subarray(at, at + FRAME));
    this.carry = joined.slice(at);
    this.samples += input.length;
    return this.state();
  }
  /** The user pressed "done" (or the page is going away): close with what we have. */
  stop(): EndpointState {
    if (this.phase !== 'done') this.close(this.onset >= 0 ? 'stopped' : 'no_speech');
    return this.state();
  }
  private state(): EndpointState {
    return { level: this.levelValue, phase: this.phase, reason: this.endReason };
  }
  private close(reason: EndReason) {
    this.phase = 'done';
    this.endReason = reason;
  }
  private frame(f: Float32Array) {
    const level = db(rmsOf(f)),
      index = this.frames.length;
    this.frames.push(level);
    this.levelValue = Math.max(0, Math.min(1, (level + 55) / 40)) * 0.6 + this.levelValue * 0.4;
    if (!this.fixedFloor && index < CALIBRATION_FRAMES) {
      // First 100 ms: estimate the room floor. Capped so an immediate speaker is not mistaken for room noise,
      // floored so digital silence does not make every whisper of noise look like speech.
      this.calibration.push(level);
      const sorted = [...this.calibration].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      this.roomDb = Math.max(this.cfg.floorDb - 4, median);
      this.noiseDb = Math.max(this.cfg.floorDb - 4, Math.min(median, -35));
      return;
    }
    const startDb = Math.max(this.cfg.floorDb + 4, this.noiseDb + this.cfg.onsetMarginDb);
    const keepDb = Math.max(this.cfg.floorDb, this.noiseDb + this.cfg.releaseMarginDb);
    if (this.phase === 'waiting') {
      // Track the noise floor only while nobody is speaking (slow attack, faster release).
      if (!this.fixedFloor && level < this.noiseDb + 6) this.noiseDb += (level - this.noiseDb) * (level < this.noiseDb ? 0.2 : 0.04);
      this.run = level > startDb ? this.run + 1 : 0;
      if (this.run >= this.cfg.onsetFrames) {
        this.onset = index - this.cfg.onsetFrames + 1;
        this.lastVoiced = index;
        this.phase = 'speech';
      } else if (index * FRAME >= this.cfg.noSpeechTimeoutSeconds * RATE) this.close('no_speech');
      return;
    }
    if (level > keepDb) this.lastVoiced = index;
    const sinceOnset = (index - this.onset + 1) * FRAME;
    const quiet = (index - this.lastVoiced) * FRAME;
    if (sinceOnset >= this.cfg.maxSeconds * RATE) this.close('max');
    else if (quiet >= this.cfg.trailingSilenceSeconds * RATE) {
      const voiced = this.frames.slice(this.onset, this.lastVoiced + 1).filter((v) => v > keepDb).length;
      if (voiced * FRAME >= this.cfg.minVoicedSeconds * RATE) this.close('silence');
      else {
        // A click or cough: forget it and keep listening.
        this.onset = -1;
        this.run = 0;
        this.phase = 'waiting';
      }
    }
  }
  private flat(): Float32Array {
    if (!this.all) {
      this.all = new Float32Array(this.samples);
      let at = 0;
      for (const c of this.chunks) {
        this.all.set(c, at);
        at += c.length;
      }
    }
    return this.all;
  }
  /** Trim and grade what was heard. Call after done (or after stop()). */
  analysis(): ClipAnalysis {
    const cfg = this.cfg;
    const all = this.flat();
    const reason = this.endReason ?? 'stopped';
    const noise = Number.isNaN(this.noiseDb) ? cfg.floorDb : this.noiseDb;
    // Thresholds use `noise` (capped); the quality grade uses the room as measured, unless speech began during calibration.
    const room = Number.isNaN(this.roomDb) ? noise : this.onset >= 0 && this.onset <= CALIBRATION_FRAMES ? noise : Math.max(noise, this.roomDb);
    const keepDb = Math.max(cfg.floorDb, noise + cfg.releaseMarginDb);
    if (this.onset < 0 || this.lastVoiced < this.onset) {
      return {
        pcm: new Float32Array(0),
        heard: false,
        reason: reason === 'silence' || reason === 'max' ? 'no_speech' : reason,
        quality: quality(new Float32Array(0), 0, room, cfg, all.length / RATE),
      };
    }
    const from = Math.max(0, this.onset * FRAME - Math.round(cfg.preRollSeconds * RATE));
    const to = Math.min(all.length, (this.lastVoiced + 1) * FRAME + Math.round(cfg.postRollSeconds * RATE));
    const pcm = all.slice(from, to);
    const voicedFrames = this.frames.slice(this.onset, this.lastVoiced + 1).filter((v) => v > keepDb).length;
    return {
      pcm,
      heard: voicedFrames * FRAME >= cfg.minVoicedSeconds * RATE,
      reason,
      quality: quality(pcm, voicedFrames * FRAME, room, cfg, all.length / RATE),
    };
  }
}

function quality(pcm: Float32Array, voicedSamples: number, noiseDb: number, cfg: VadConfig, totalSeconds: number): ClipQuality {
  let peak = 0,
    clipped = 0,
    run = 0,
    runClips = 0;
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i]);
    if (a > peak) peak = a;
    if (a >= cfg.clipLevel) {
      clipped++;
      run++;
      if (run === 3) runClips++;
    } else run = 0;
  }
  // Speech level: RMS over the loud 20 ms frames only (so leading/trailing pads do not dilute it).
  const speechDb = (() => {
    const levels: number[] = [];
    for (let at = 0; at + FRAME <= pcm.length; at += FRAME) levels.push(rmsOf(pcm, at, at + FRAME));
    const loud = levels.filter((v) => db(v) > noiseDb + cfg.releaseMarginDb);
    if (!loud.length) return -120;
    return db(Math.sqrt(loud.reduce((s, v) => s + v * v, 0) / loud.length));
  })();
  const voicedSeconds = voicedSamples / RATE;
  const clippedRatio = pcm.length ? clipped / pcm.length : 0;
  const q: ClipQuality = {
    seconds: totalSeconds,
    voicedSeconds,
    peak,
    speechDb,
    noiseDb,
    snrDb: speechDb - noiseDb,
    clippedRatio,
    tooShort: voicedSeconds < cfg.minVoicedSeconds,
    tooQuiet: speechDb < cfg.quietSpeechDb || peak < 0.03,
    clipped: clippedRatio > cfg.clipRatio || runClips >= 3,
    noisy: speechDb - noiseDb < cfg.minSnrDb || noiseDb > -28,
    unreliable: false,
  };
  q.unreliable = q.tooShort || q.tooQuiet || q.clipped || q.noisy;
  return q;
}

/** Offline: trim and grade a whole clip with exactly the live endpointer's rules (floor taken from its quietest frames). */
export function analyzeClip(pcm: Float32Array, config: Partial<VadConfig> = {}): ClipAnalysis {
  const cfg = { ...DEFAULT_VAD, ...config };
  const levels: number[] = [];
  for (let at = 0; at + FRAME <= pcm.length; at += FRAME) levels.push(db(rmsOf(pcm, at, at + FRAME)));
  const sorted = [...levels].sort((a, b) => a - b);
  // A finished clip may be trimmed tight (speech from sample 0), so the first 100 ms say nothing about the room:
  // use the quietest 8 % of frames instead.
  const hint = sorted.length ? Math.min(sorted[Math.max(1, Math.floor(sorted.length * 0.08))] ?? cfg.floorDb, -26) : cfg.floorDb;
  const e = new Endpointer(cfg, hint);
  const tail = new Float32Array(Math.round((cfg.trailingSilenceSeconds + 0.1) * RATE));
  const stream = new Float32Array(pcm.length + tail.length);
  stream.set(pcm);
  for (let at = 0; at < stream.length && !e.done; at += FRAME) e.push(stream.subarray(at, Math.min(stream.length, at + FRAME)));
  if (!e.done) e.stop();
  return e.analysis();
}
