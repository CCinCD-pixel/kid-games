export class Resampler {
  private pending: number[] = [];
  private cursor = 0;
  constructor(
    private inputRate: number,
    private outputRate = 16000,
  ) {}
  push(input: Float32Array): Int16Array {
    const samples = [...this.pending, ...input],
      output: number[] = [];
    const step = this.inputRate / this.outputRate;
    while (this.cursor + 1 < samples.length) {
      const i = Math.floor(this.cursor),
        x = samples[i] + (samples[i + 1] - samples[i]) * (this.cursor - i);
      output.push(Math.round(Math.max(-1, Math.min(1, x)) * (x < 0 ? 32768 : 32767)));
      this.cursor += step;
    }
    const consumed = Math.min(Math.floor(this.cursor), Math.max(0, samples.length - 1));
    this.pending = samples.slice(consumed);
    this.cursor -= consumed;
    return Int16Array.from(output);
  }
}
export class Vad {
  samples = 0;
  voiced = 0;
  silent = 0;
  heard = false;
  constructor(private maxSeconds = 8) {}
  push(chunk: Int16Array) {
    this.samples += chunk.length;
    const rms = Math.sqrt(chunk.reduce((s, x) => s + (x / 32768) ** 2, 0) / Math.max(1, chunk.length));
    if (rms > 0.014) {
      this.voiced += chunk.length;
      this.silent = 0;
      if (this.voiced >= 1600) this.heard = true;
    } else this.silent += chunk.length;
    return { rms, done: this.samples >= this.maxSeconds * 16000 || (this.heard && this.silent >= 11200) };
  }
}
export function wav(pcm: Int16Array): ArrayBuffer {
  const data = new ArrayBuffer(44 + pcm.byteLength),
    view = new DataView(data);
  const str = (n: number, s: string) => [...s].forEach((c, i) => view.setUint8(n + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  pcm.forEach((s, i) => view.setInt16(44 + i * 2, s, true));
  return data;
}
