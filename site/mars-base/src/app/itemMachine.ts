/**
 * One question's state machine (spec §3.2): pure `transition(state, event, mode)`. Verified exhaustively in validate/machine.test.ts.
 * normal: miss#1→H1 (对质 + mechanism, stops before the final value) · miss#2→H2 (half pre-filled) · miss#3→H3 (ghost demo, answer
 *   shown and locked; ✓ = assisted delivery → twin). The hint key escalates only after a real attempt (H1→H2 needs ≥1 submission,
 *   H2→H3 needs ≥2). Idle is a neutral nudge only: no level, no counter, no first-try change.
 * cert | probe | calib: one attempt, any non-empty submit delivers, no hints, no demo, deferred feedback.
 */
import type { Mode } from './types';

export type Phase = 'ANSWERING' | 'CONSEQUENCE' | 'DELIVER';
export interface MachineState {
  phase: Phase; touched: boolean; subs: number; misses: number; hint: 0 | 1 | 2 | 3; firstTry: boolean | null; answerShown: boolean;
  assisted: boolean; done: boolean; nudged: boolean; consequences: number;
}
export type MachineEvent = 'op' | 'subEmpty' | 'subRight' | 'subWrong' | 'key' | 'idle' | 'bg' | 'skipDemo' | 'tapAck';
export const MACHINE_EVENTS: readonly MachineEvent[] = ['op', 'subEmpty', 'subRight', 'subWrong', 'key', 'idle', 'bg', 'skipDemo', 'tapAck'];
/** What counts as a child action in the "≤4 actions to an exit" bound (time events and demo acknowledgements are free). */
export const CHILD_ACTIONS: readonly MachineEvent[] = ['op', 'subRight', 'subWrong', 'key'];

export const initMachine = (): MachineState => ({ phase: 'ANSWERING', touched: false, subs: 0, misses: 0, hint: 0, firstTry: null, answerShown: false, assisted: false, done: false, nudged: false, consequences: 0 });

export function transition(s: MachineState, ev: MachineEvent, mode: Mode = 'normal'): MachineState {
  if (s.done) return s;
  const n: MachineState = { ...s };
  switch (ev) {
    case 'op': n.touched = true; return n;
    case 'idle': n.nudged = true; return n;
    case 'bg': n.nudged = false; return n;
    case 'skipDemo':
    case 'tapAck': if (n.phase === 'CONSEQUENCE') n.phase = 'ANSWERING'; return n;
    case 'subEmpty': return n;
    case 'key':
      if (mode !== 'normal') return n;
      if (!n.touched && n.subs === 0) return n;
      if (n.hint === 0) n.hint = 1;
      else if (n.hint === 1 && n.subs >= 1) n.hint = 2;
      else if (n.hint === 2 && n.subs >= 2) { n.hint = 3; n.answerShown = true; n.assisted = true; }
      return n;
    case 'subRight': {
      if (n.phase === 'CONSEQUENCE') return n;
      n.subs++;
      if (n.firstTry === null) n.firstTry = n.subs === 1 && n.hint === 0;
      n.done = true; n.phase = 'DELIVER'; if (n.hint === 3) n.assisted = true;
      return n;
    }
    case 'subWrong': {
      if (n.phase === 'CONSEQUENCE') return n;
      if (n.hint === 3) { n.subs++; n.done = true; n.phase = 'DELIVER'; n.assisted = true; return n; }
      n.subs++; n.misses++;
      if (n.firstTry === null) n.firstTry = false;
      if (mode !== 'normal') { n.done = true; n.phase = 'DELIVER'; return n; }
      n.hint = Math.max(n.hint, Math.min(3, n.misses)) as 0 | 1 | 2 | 3;
      if (n.hint === 3) { n.answerShown = true; n.assisted = true; n.phase = 'ANSWERING'; } else { n.phase = 'CONSEQUENCE'; n.consequences++; }
      return n;
    }
  }
  return n;
}

/** The neutral line the hint key gives when it does not escalate: before any attempt, or in a cert/probe/calibration item. */
export function hintKeyNote(s: MachineState, mode: Mode): 'alone' | 'tryFirst' | null {
  if (mode !== 'normal') return 'alone';
  if (!s.touched && s.subs === 0) return 'tryFirst';
  return null;
}
