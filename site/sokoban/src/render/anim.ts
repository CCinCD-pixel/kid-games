/**
 * One clock for every board animation (spec §6.6): tweens advance in the board's single rAF loop,
 * so a frame draws everything once. Durations scale with `speed` (reduced motion ×0.5 → speed 2,
 * test mode → instant). `finishAll()` jumps every tween to its end (rotation, page hidden).
 */
import { ease as kitEase } from '@kit/tween';

export type Ease = (t: number) => number;

export const ease = {
  ...kitEase,
  /** outBack with a custom overshoot (spec: crate lands with outBack(1.4)) */
  outBackK: (k: number): Ease => (t) => 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

interface Item {
  start: number;
  dur: number;
  ease: Ease;
  fn: (v: number) => void;
  resolve: () => void;
  done: boolean;
}

export class Animator {
  private items: Item[] = [];
  /** duration multiplier (0 = instant) */
  scale = 1;
  /**
   * Called whenever a timed item is added, so the owner can (re)start its frame loop: a `wait()` or a
   * tween chained in a promise continuation runs after the loop's last frame has already decided to
   * stop — without this kick it would never tick (e.g. a lone footprint that never fades).
   */
  onAdd: (() => void) | null = null;
  private clock: () => number;

  constructor(clock: () => number = () => performance.now()) {
    this.clock = clock;
  }

  get active(): boolean {
    return this.items.length > 0;
  }

  /** Tween 0 → 1 over `dur` ms (after `delay`), calling fn(eased). Resolves at the end (or when finished early). */
  add(dur: number, fn: (v: number) => void, o: { ease?: Ease; delay?: number } = {}): Promise<void> {
    const d = dur * this.scale;
    const delay = (o.delay ?? 0) * this.scale;
    return new Promise<void>((resolve) => {
      const it: Item = { start: this.clock() + delay, dur: d, ease: o.ease ?? ease.outCubic, fn, resolve, done: false };
      if (d <= 0 && delay <= 0) {
        fn(1);
        resolve();
        return;
      }
      this.items.push(it);
      this.onAdd?.();
    });
  }

  /** Wait (in animation time). */
  wait(ms: number): Promise<void> {
    return this.add(ms, () => {}, { ease: ease.linear });
  }

  tick(now = this.clock()): boolean {
    if (!this.items.length) return false;
    const items = this.items;
    this.items = [];
    const finished: Item[] = [];
    for (const it of items) {
      if (now < it.start) {
        this.items.push(it);
        continue;
      }
      const t = it.dur <= 0 ? 1 : Math.min(1, (now - it.start) / it.dur);
      it.fn(it.ease(t));
      if (t >= 1) finished.push(it);
      else this.items.push(it);
    }
    for (const it of finished) {
      it.done = true;
      it.resolve();
    }
    return this.items.length > 0;
  }

  /** Jump every running tween to its end state. */
  finishAll(): void {
    let guard = 0;
    while (this.items.length && guard < 50) {
      const items = this.items;
      this.items = [];
      for (const it of items) {
        it.fn(it.ease(1));
        it.done = true;
        it.resolve();
      }
      guard += 1;
    }
  }

  clear(): void {
    this.items = [];
  }
}
