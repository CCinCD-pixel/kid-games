/**
 * apply(state, action) → { state, event } and the end-of-move checks (spec §3.6–§3.7, R6–R8).
 * Pure: the input state is never mutated.
 */
import type { Side } from './board';
import { resolve, type Outcome } from './combat';
import { hasAnyAction, isFlip, isPass, type Action } from './movegen';
import { COUNT_POINTS, FLAG, MARSHAL } from './pieces';
import { clone, type GameResult, type GameState } from './state';

export interface MoveEvent {
  action: Action;
  outcome: Outcome | null;
  att?: number;
  def?: number;
  removed: number[];
  /** sides whose flag became public this move (司令 down) */
  flagShown: Side[];
  /** flags auto-flipped in 翻翻棋 because their 司令 went down */
  autoFlipped: number[];
  flipped?: { pid: number; side: Side; type: number };
  /** quiet counter before the move (for the quiet-dots UI) */
  quietBefore: number;
  result: GameResult | null;
}

export function apply(s0: GameState, m: Action): { state: GameState; event: MoveEvent } {
  const s = clone(s0);
  const ev: MoveEvent = { action: m, outcome: null, removed: [], flagShown: [], autoFlipped: [], quietBefore: s0.quiet, result: null };
  if (isPass(m)) {
    s.turn = (1 - (s.turn as number)) as Side;
    s.ply++;
    s.quiet++;
    return finish(s, ev);
  }
  if (isFlip(m)) {
    const p = s.board[m.flip];
    if (p < 0 || s.pup[p]) throw new Error('nothing to flip');
    s.pup[p] = 1;
    ev.flipped = { pid: p, side: s.pside[p] as Side, type: s.ptype[p] };
    if (s.turn === -1) {
      // first flip: the flipper takes this colour, the turn passes to the other colour (R8.3, E13)
      s.colorOf[s.toAct] = s.pside[p] as Side;
      s.colorOf[1 - s.toAct] = (1 - s.pside[p]) as Side;
      s.turn = (1 - s.pside[p]) as Side;
    } else s.turn = (1 - s.turn) as Side;
    s.shuttle[1 - s.turn] = { pid: -1, from: -1, to: -1, n: 0 };
    s.ply++;
    s.quiet = 0;
    return finish(s, ev);
  }
  const { pid, from, to } = m;
  const side = s.pside[pid] as Side;
  // anti-shuttle bookkeeping (R5.8)
  const sh = s.shuttle[side];
  if (sh.pid === pid && from === sh.to && to === sh.from) sh.n++;
  else sh.n = 1;
  sh.pid = pid;
  sh.from = from;
  sh.to = to;
  const def = s.board[to];
  s.pmoved[pid] = 1;
  const removeP = (p: number): void => {
    s.palive[p] = 0;
    if (s.board[s.ppos[p]] === p) s.board[s.ppos[p]] = -1;
    ev.removed.push(p);
    if (s.ptype[p] === MARSHAL) {
      const fs = s.pside[p] as Side;
      s.flagShown[fs] = true;
      ev.flagShown.push(fs);
      if (s.mode === 'fan') {
        for (let q = 0; q < s.np; q++) {
          if (s.palive[q] && s.pside[q] === fs && s.ptype[q] === FLAG && !s.pup[q]) {
            s.pup[q] = 1;
            ev.autoFlipped.push(q);
          }
        }
      }
    }
  };
  if (def === -1) {
    s.board[from] = -1;
    s.board[to] = pid;
    s.ppos[pid] = to;
    s.quiet++;
  } else {
    const r = resolve(s.ptype[pid], s.ptype[def]);
    ev.outcome = r;
    ev.att = pid;
    ev.def = def;
    s.quiet = 0;
    if (r === 'A' || r === 'F') {
      removeP(def);
      s.board[from] = -1;
      s.board[to] = pid;
      s.ppos[pid] = to;
    } else if (r === 'D') removeP(pid);
    else {
      removeP(pid);
      removeP(def);
    }
    if (r === 'F') s.result = { winner: side, reason: 'flag' };
  }
  s.turn = (1 - side) as Side;
  s.ply++;
  return finish(s, ev);
}

/** 清点兵力 totals [red, blue] (spec §3.7 R7.3) */
export function tally(s: GameState): [number, number] {
  const t: [number, number] = [0, 0];
  for (let p = 0; p < s.np; p++) if (s.palive[p]) t[s.pside[p]] += COUNT_POINTS[s.ptype[p]];
  return t;
}

function countResult(s: GameState, via: 'quiet' | 'ply-cap'): GameResult {
  // E25: face-down pieces are turned up before counting (no rule effects)
  if (s.mode === 'fan') for (let p = 0; p < s.np; p++) if (s.palive[p]) s.pup[p] = 1;
  const t = tally(s);
  if (t[0] === t[1]) return { winner: -1, reason: 'count-draw', tally: t, via };
  return { winner: t[0] > t[1] ? 0 : 1, reason: 'count', tally: t, via };
}

function finish(s: GameState, ev: MoveEvent): { state: GameState; event: MoveEvent } {
  if (!s.result) {
    const mover = (1 - (s.turn as number)) as Side;
    if (s.rules.puzzle) {
      // puzzles: only RED's flag/goal matter; BLUE may pass; the no-move rule is checked for RED only
      if (s.turn === 0 && !hasAnyAction(s, 0)) s.result = { winner: 1, reason: 'no-moves' };
    } else if (s.turn !== -1 && !hasAnyAction(s, s.turn)) {
      s.result = hasAnyAction(s, mover) ? { winner: mover, reason: 'no-moves' } : { winner: -1, reason: 'both-immobile' };
    }
    if (!s.result && !s.rules.puzzle && s.quiet >= s.rules.quietLimit) {
      s.result = s.rules.endByCount ? countResult(s, 'quiet') : { winner: -1, reason: 'quiet' };
    }
    if (!s.result && !s.rules.puzzle && s.ply >= s.rules.plyCap) {
      s.result = s.rules.endByCount ? countResult(s, 'ply-cap') : { winner: -1, reason: 'ply-cap' };
    }
  }
  ev.result = s.result;
  return { state: s, event: ev };
}

/** 求和 accepted by both players (family games only, R7.5). */
export function agreeDraw(s0: GameState): GameState {
  const s = clone(s0);
  if (!s.result) s.result = { winner: -1, reason: 'agreed' };
  return s;
}

/** the quiet-dots warning shows from (limit − 10) on; returns how many dots remain lit (0 = none shown) */
export function quietDots(s: GameState): number {
  const left = s.rules.quietLimit - s.quiet;
  return left <= 10 && left > 0 ? left : 0;
}
