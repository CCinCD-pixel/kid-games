/**
 * Tiny animation helpers.
 *  - `ease.*`      easing functions t∈[0,1] → [0,1] (outBack/outElastic overshoot)
 *  - `tween()`     rAF-driven number tween for canvas/JS-driven values
 *  - `animate()`   Web Animations API wrapper that resolves on finish and honours reduced motion
 *  - `sleep()`, `nextFrame()`
 * Prefer CSS transitions/WAAPI for DOM (compositor-friendly: transform/opacity only).
 */

export type Easing = (t: number) => number;

const c1 = 1.70158;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;

function outBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  outElastic: (t: number) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1),
  outBounce,
} satisfies Record<string, Easing>;

/** CSS equivalents for WAAPI/CSS (match the design-system motion tokens where possible). */
export const cssEase = {
  out: 'cubic-bezier(.22, 1, .36, 1)',
  in: 'cubic-bezier(.55, 0, 1, .45)',
  inOut: 'cubic-bezier(.65, 0, .35, 1)',
  back: 'cubic-bezier(.34, 1.56, .64, 1)',
} as const;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Inverse lerp: where v sits between a and b, clamped to [0,1]. */
export const progress = (a: number, b: number, v: number): number => (a === b ? 1 : clamp((v - a) / (b - a), 0, 1));

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
export const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

export interface TweenOptions {
  from: number;
  to: number;
  /** milliseconds */
  duration: number;
  delay?: number;
  ease?: Easing;
  onUpdate: (value: number, t: number) => void;
  onComplete?: () => void;
}

export interface TweenHandle {
  /** Stops at the current value; `finished` resolves with false. */
  cancel(): void;
  /** Resolves true when completed, false when cancelled. */
  readonly finished: Promise<boolean>;
}

/** rAF tween. Always delivers a final onUpdate(to, 1) on completion. */
export function tween(opts: TweenOptions): TweenHandle {
  const easing = opts.ease ?? ease.outCubic;
  const delay = opts.delay ?? 0;
  let start = -1;
  let raf = 0;
  let done = false;
  let resolve!: (ok: boolean) => void;
  const finished = new Promise<boolean>((r) => (resolve = r));

  const step = (now: number) => {
    if (done) return;
    if (start < 0) start = now;
    const elapsed = now - start - delay;
    if (elapsed < 0) {
      raf = requestAnimationFrame(step);
      return;
    }
    const t = opts.duration <= 0 ? 1 : Math.min(1, elapsed / opts.duration);
    opts.onUpdate(lerp(opts.from, opts.to, easing(t)), t);
    if (t >= 1) {
      done = true;
      opts.onComplete?.();
      resolve(true);
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  return {
    cancel() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      resolve(false);
    },
    finished,
  };
}

/**
 * WAAPI wrapper: resolves when the animation finishes (or immediately with reduced motion, after
 * applying the final keyframe). `fill: 'forwards'` by default so the end state sticks.
 */
export function animate(el: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes, options: number | KeyframeAnimationOptions = {}): Promise<void> {
  const opts: KeyframeAnimationOptions = typeof options === 'number' ? { duration: options } : { ...options };
  if (opts.fill === undefined) opts.fill = 'forwards';
  if (prefersReducedMotion()) opts.duration = 1;
  if (typeof el.animate !== 'function') return Promise.resolve();
  const anim = el.animate(keyframes, opts);
  return anim.finished.then(
    () => undefined,
    () => undefined, // cancelled
  );
}
