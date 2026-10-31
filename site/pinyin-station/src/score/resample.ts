/**
 * Band-limited resampling to 16 kHz mono (windowed-sinc, Hann). The legacy speech/pcm.ts Resampler interpolates
 * linearly without a low-pass filter, which aliases 48 kHz microphone input; pitch work wants the clean version.
 * Streaming: push() any chunk size, get the output samples that are fully determined so far.
 */
export class StreamResampler {
  private buf = new Float32Array(0);
  private pos = 0;
  private readonly ratio: number;
  private readonly half: number;
  private readonly cutoff: number;
  constructor(
    private inputRate: number,
    private outputRate = 16000,
    zeroCrossings = 8,
  ) {
    this.ratio = inputRate / outputRate;
    // Cutoff relative to the INPUT Nyquist; 0.92 of the output Nyquist leaves a transition band.
    this.cutoff = this.ratio > 1 ? 0.92 / this.ratio : 0.98;
    this.half = Math.ceil(zeroCrossings * Math.max(1, this.ratio));
  }
  get passthrough() {
    return this.inputRate === this.outputRate;
  }
  push(input: Float32Array): Float32Array {
    if (this.passthrough) return input.slice();
    const joined = new Float32Array(this.buf.length + input.length);
    joined.set(this.buf);
    joined.set(input, this.buf.length);
    this.buf = joined;
    const out: number[] = [];
    const { half, cutoff, ratio } = this;
    while (this.pos + half < this.buf.length) {
      const centre = this.pos;
      const from = Math.ceil(centre - half),
        to = Math.floor(centre + half);
      let sum = 0,
        norm = 0;
      for (let k = from; k <= to; k++) {
        const u = k - centre;
        const x = Math.PI * cutoff * u;
        const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x;
        const w = sinc * (0.5 + 0.5 * Math.cos((Math.PI * u) / half)) * cutoff;
        norm += w;
        if (k >= 0 && k < this.buf.length) sum += w * this.buf[k];
      }
      out.push(norm > 1e-9 ? sum / norm : 0);
      this.pos += ratio;
    }
    const keepFrom = Math.max(0, Math.floor(this.pos - half) - 1);
    if (keepFrom > 0) {
      this.buf = this.buf.slice(keepFrom);
      this.pos -= keepFrom;
    }
    return Float32Array.from(out);
  }
}
export function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  const r = new StreamResampler(inputRate);
  // Pad the tail so the last real samples are emitted.
  const padded = new Float32Array(input.length + Math.ceil(16 * (inputRate / 16000)) + 2);
  padded.set(input);
  const out = r.push(padded);
  return out.subarray(0, Math.floor((input.length * 16000) / inputRate));
}
export function toInt16(pcm: Float32Array): Int16Array {
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const x = Math.max(-1, Math.min(1, pcm[i]));
    out[i] = Math.round(x * (x < 0 ? 32768 : 32767));
  }
  return out;
}
export function fromInt16(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / (pcm[i] < 0 ? 32768 : 32767);
  return out;
}
