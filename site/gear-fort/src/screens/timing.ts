// Presentation-only speed rules (spec §3.15; the kernel never sees speed). Everything is counted in game ticks, so a
// pause never uses anything up (§3.21-16b), and the child's speed choice is only *held*, never overwritten (§3.21-20).
import type { SimState } from '../lane/types';

/** the level's new machine, first appearance: 0.6× until it is dismantled, at most 12 s of wall time
 *  (12 s × 20 ticks/s × 0.6 = 144 ticks) — spec §2.4 / §8.4 (QA r4: was a fixed 48 ticks ≈ 4 s) */
export const SLOWMO_TICKS = 144;
export const PHASE_TICKS = 60;                    // a Boss changing phase holds 1.5× at 1× for 3 s
export const FLAG_BEFORE = 100, FLAG_AFTER = 500; // …and 5 s before each 战鼓 until 25 s after it
export interface SpeedHold { slowUntil: number; phaseUntil: number; slowId?: number }
/** the debut machine `id` appeared at `tick`: slow-mo starts and stays on while it lives (≤ SLOWMO_TICKS). */
export function slowmoStart(h: SpeedHold, tick: number, id: number | undefined): void { h.slowUntil = tick + SLOWMO_TICKS; h.slowId = id; }
/** machine `id` is gone (dismantled, captured or through): if it is the debut machine the slow-mo ends at once. */
export function slowmoGone(h: SpeedHold, tick: number, id: number | undefined): void {
  if (id != null && h.slowId === id) { h.slowUntil = Math.min(h.slowUntil, tick); h.slowId = undefined; }
}
export const PHASE_EVENTS = new Set(['shellOn', 'shellOff', 'owlRage', 'owlLanded', 'owlDown']);

/** true while a chosen 1.5× is held at 1× (the button greys out and shows a small drum). */
export function held(S: Pick<SimState, 'tick' | 'flags'>, h: SpeedHold): boolean {
  if (S.tick < h.slowUntil || S.tick < h.phaseUntil) return true;
  for (const f of S.flags || []) if (S.tick >= f - FLAG_BEFORE && S.tick < f + FLAG_AFTER) return true;
  return false;
}
/** ticks per 50 ms of wall time: 0.6 during the slow-mo, else the child's choice (1.5 held at 1 when `held`). */
export function effSpeed(sel: number, S: Pick<SimState, 'tick' | 'flags'>, h: SpeedHold): number {
  if (S.tick < h.slowUntil) return 0.6;
  return sel > 1 && held(S, h) ? 1 : sel;
}
