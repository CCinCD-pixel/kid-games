/**
 * Motion table (spec §6.8). Every duration in the game comes from here, multiplied by `speed`
 * (?test=1&fast=1 → ×0.1, ?slow=4 → ×4). prefers-reduced-motion: movement collapses to ~1 ms and
 * reveals become a 150 ms fade; no screen shake.
 */
import { prefersReducedMotion } from '@kit/tween';

export const MS = {
  lift: 120,
  drop: 160,
  destAppear: 160,
  destStagger: 12,
  road: 240,
  railBase: 120,
  railPerStation: 70,
  railMax: 760,
  snap: 180,
  bounce: 320,
  wobble: 180,
  approach: 220,
  clash: 140,
  plate: 520,
  plateHold: 650,
  refereeFull: 600,
  refereeShort: 150,
  loserOut: 360,
  winnerSettle: 180,
  both: 420,
  bombFlash: 80,
  bombRing: 400,
  bombShake: 220,
  mineDust: 500,
  mineShake: 160,
  dig: 300,
  flagCapture: 1200,
  flagShow: 520,
  flip: 260,
  countTotal: 1800,
  turnSwitch: 240,
  thinkMin: 450,
  lastArrow: 200,
  handoffUp: 350,
  handoffHold: 600,
  handoffDown: 300,
  swap: 220,
  layoutSwap: 220,
} as const;

export const EASE = {
  road: 'cubic-bezier(.3,.7,.2,1)',
  back: 'cubic-bezier(.34,1.56,.64,1)',
  spring: 'cubic-bezier(.22,1.4,.36,1)',
  pop: 'cubic-bezier(.2,1.6,.4,1)',
  out: 'cubic-bezier(.2,.8,.2,1)',
  in: 'cubic-bezier(.5,0,.75,0)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
};

let speed = 1;
let reduced = false;
export function configureMotion(o: { speed?: number; reduced?: boolean } = {}): void {
  speed = o.speed ?? 1;
  reduced = o.reduced ?? prefersReducedMotion();
}
export const motionReduced = (): boolean => reduced;
/** scaled duration for an entry of the table (or a raw ms value) */
export function d(ms: number): number {
  return Math.max(1, Math.round(ms * speed));
}
/** movement durations collapse under reduced motion */
export function dm(ms: number): number {
  return reduced ? 1 : d(ms);
}
export const railDuration = (stations: number): number => Math.min(MS.railMax, MS.railBase + MS.railPerStation * stations);

/** WAAPI helper that resolves when finished (or immediately when cancelled) */
export function run(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Promise<void> {
  const a = el.animate(frames, { fill: 'forwards', ...opts });
  return new Promise((res) => {
    a.onfinish = () => res();
    a.oncancel = () => res();
  });
}
