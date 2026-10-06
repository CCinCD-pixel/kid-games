/**
 * Animation clock (spec §6.10, §8.5): tweens and timed events on one ms clock driven by rAF;
 * timeScale (test hook), pause on background (onPause), skip-to-end (BONUS fast-forward).
 */
export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  inBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
};

interface Item { start: number; dur: number; fn: (p: number) => void; ease: Ease; started: boolean; done: boolean }
interface At { t: number; fn: () => void; done: boolean }

export class Timeline {
  now = 0;
  private items: Item[] = [];
  private ats: At[] = [];
  end = 0;
  tween(start: number, dur: number, fn: (p: number) => void, e: Ease = ease.linear): void {
    this.items.push({ start, dur: Math.max(1, dur), fn, ease: e, started: false, done: false });
    this.end = Math.max(this.end, start + dur);
  }
  at(t: number, fn: () => void): void { this.ats.push({ t, fn, done: false }); this.end = Math.max(this.end, t); }
  get running(): boolean { return this.items.some((i) => !i.done) || this.ats.some((a) => !a.done); }
  /** advance the clock by dt ms; returns true while something is pending */
  step(dt: number): boolean {
    this.now += dt;
    const t = this.now;
    // events first, in time order (so state changes happen before tweens that start at the same ms)
    const due = this.ats.filter((a) => !a.done && a.t <= t).sort((a, b) => a.t - b.t);
    for (const a of due) { a.done = true; a.fn(); }
    for (const it of this.items) {
      if (it.done || t < it.start) continue;
      const p = Math.min(1, (t - it.start) / it.dur);
      it.started = true;
      it.fn(it.ease(p));
      if (p >= 1) it.done = true;
    }
    if (this.items.length > 400 && this.items.every((i) => i.done)) this.items = [];
    const live = this.running;
    if (!live) { this.items = []; this.ats = []; }
    return live;
  }
  /** jump to the end (fast-forward) */
  finish(): void { this.step(Math.max(0, this.end - this.now) + 1); }
  clear(): void { this.items = []; this.ats = []; this.now = 0; this.end = 0; }
}
