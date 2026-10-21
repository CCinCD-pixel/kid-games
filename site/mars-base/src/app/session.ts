/** Visit numbering (spec §3.1): one visit = one page open; <20 min since the last activity keeps the number. Never wall-clock-dependent beyond that gap. */
import type { MarsSaveV5 } from '../save/schema';
import { SESSION_GAP_MS } from './tuning';

export function beginVisit(save: MarsSaveV5, now: number): number {
  const s = save.session;
  if (s.index === 0 || now - s.lastActiveAt > SESSION_GAP_MS || now < s.lastActiveAt - SESSION_GAP_MS) s.index++;   // a clock moved backwards = a new visit, never a skip
  s.lastActiveAt = now;
  return s.index;
}
export function touchVisit(save: MarsSaveV5, now: number): void { save.session.lastActiveAt = Math.max(save.session.lastActiveAt, now); }
