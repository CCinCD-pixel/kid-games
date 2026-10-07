// Frame-cost probes and adaptive quality (spec §8.6, §9.8).
// The first 120 battle frames measure the median frame WORK time — kernel steps + stage render + HUD, i.e. our own share
// of the 16.7 ms budget. Then:
//   > 14 ms → half the particles · > 18 ms → the stage canvas drops to DPR 1.5 · > 22 ms → no idle breathing, no shadows.
// JS time cannot see a GPU / compositor that falls behind, so the rAF interval is probed too: a median interval > 22 ms
// (the screen no longer holds 60 fps) asks for at least level 2, > 30 ms for level 3.
// The level only goes up inside one battle; `?dev=perf&degrade=N` (or __gf.degrade(N)) forces it for the readability shot.

export const DEGRADE_MS = [14, 18, 22] as const;
export const PROBE_FRAMES = 120;
export type Degrade = 0 | 1 | 2 | 3;

export function degradeFor(medianMs: number): Degrade {
  return medianMs > DEGRADE_MS[2] ? 3 : medianMs > DEGRADE_MS[1] ? 2 : medianMs > DEGRADE_MS[0] ? 1 : 0;
}

export const INTERVAL_MS = [22, 30] as const;
export function degradeForInterval(medianMs: number): Degrade { return medianMs > INTERVAL_MS[1] ? 3 : medianMs > INTERVAL_MS[0] ? 2 : 0; }
const med = (b: Float32Array): number => { const s = Array.from(b).sort((x, y) => x - y); return (s[PROBE_FRAMES / 2 - 1] + s[PROBE_FRAMES / 2]) / 2; };

/** collects the first PROBE_FRAMES work times (and rAF intervals); push() returns the decided level exactly once */
export class FrameProbe {
  private readonly buf = new Float32Array(PROBE_FRAMES);
  private readonly gap = new Float32Array(PROBE_FRAMES);
  private n = 0;
  median = 0; interval = 0;
  get done(): boolean { return this.n >= PROBE_FRAMES; }
  push(ms: number, intervalMs = 16.7): Degrade | null {
    if (this.n >= PROBE_FRAMES) return null;
    this.gap[this.n] = intervalMs; this.buf[this.n++] = ms;
    if (this.n < PROBE_FRAMES) return null;
    this.median = med(this.buf); this.interval = med(this.gap);
    return Math.max(degradeFor(this.median), degradeForInterval(this.interval)) as Degrade;
  }
}

/** fixed ring of per-frame numbers (no allocation per frame); q() sorts a copy, so call it rarely (overlay, tests) */
export class Ring {
  private readonly a: Float32Array; private i = 0; n = 0;
  constructor(readonly size: number) { this.a = new Float32Array(size); }
  push(v: number): void { this.a[this.i] = v; this.i = (this.i + 1) % this.size; if (this.n < this.size) this.n++; }
  reset(): void { this.i = 0; this.n = 0; }
  values(): number[] { return Array.from(this.a.subarray(0, this.n)); }
  q(f: number): number { const s = this.values().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0; }
  max(): number { let m = 0; for (let k = 0; k < this.n; k++) m = Math.max(m, this.a[k]); return m; }
  mean(): number { let t = 0; for (let k = 0; k < this.n; k++) t += this.a[k]; return this.n ? t / this.n : 0; }
}

/** draw cost of the non-battle canvases (story shots, the inn, the 宋城 tray) — window.__gfCost() for the perf check */
const COST: Record<string, Ring> = {};
export function cost(name: string, ms: number): void { (COST[name] ??= new Ring(600)).push(ms); }
export function costReport(): Record<string, { n: number; p50: number; p95: number; max: number }> {
  const out: Record<string, { n: number; p50: number; p95: number; max: number }> = {};
  for (const [k, r] of Object.entries(COST)) out[k] = { n: r.n, p50: +r.q(0.5).toFixed(2), p95: +r.q(0.95).toFixed(2), max: +r.max().toFixed(2) };
  return out;
}
if (typeof window !== 'undefined') (window as unknown as { __gfCost?: unknown }).__gfCost = costReport;
