/**
 * Why can't this piece go there? The single most relevant reason for the child (E22/E23), used by
 * the board when a tap or a drop lands on a station that is not a legal destination. Pure.
 */
import { X, isCamp, isHQ, isRail, railNext, half } from './board';
import { minesLeft, shuttleBlocked } from './movegen';
import { ENG, FLAG, MINE } from './pieces';
import type { GameState } from './state';

export type Why =
  | 'own' // own piece there (just reselect)
  | 'immobile' // mine / flag never move
  | 'hq' // frozen in a 大本营
  | 'facedown' // 翻翻棋: face-down piece blocks / cannot be hit
  | 'camp' // target sits in a 行营
  | 'flaglock' // 翻翻棋 flag still guarded by mines
  | 'shuttle' // anti-shuttle
  | 'mountain' // b/d across the mountain band
  | 'rail.turn' // non-engineer would have to turn on the rail
  | 'rail.block' // something in the way on the rail
  | 'far'; // simply not reachable in one move

export const WHY_LINE: Record<Why, string | null> = {
  own: null,
  immobile: 'mc.ref.immobile',
  hq: 'mc.ref.hq',
  facedown: 'mc.ref.facedown',
  camp: 'mc.ref.camp',
  flaglock: 'mc.ref.flaglock',
  shuttle: 'mc.ref.shuttle',
  mountain: 'mc.ref.mountain',
  'rail.turn': 'mc.ref.rail.turn',
  'rail.block': 'mc.why.rail.block',
  far: null,
};

/** reason a piece cannot be selected at all, or null if it may move somewhere */
export function whyImmobile(s: GameState, pid: number): Why | null {
  const t = s.ptype[pid];
  if (t === MINE || t === FLAG) return 'immobile';
  if (s.rules.hqFreeze && isHQ(s.ppos[pid])) return 'hq';
  return null;
}

export function whyNot(s: GameState, pid: number, to: number): Why {
  const im = whyImmobile(s, pid);
  if (im) return im;
  const from = s.ppos[pid];
  const occ = s.board[to];
  const side = s.pside[pid];
  if (occ !== -1) {
    if (s.mode === 'fan' && !s.pup[occ]) return 'facedown';
    if (s.pside[occ] === side) return 'own';
    if (isCamp(to)) return 'camp';
    if (s.mode === 'fan' && s.rules.fanFlagLock && s.ptype[occ] === FLAG && minesLeft(s, s.pside[occ]) > 0) return 'flaglock';
  }
  if (shuttleBlocked(s, side, pid, from, to)) return 'shuttle';
  if (half(from) !== half(to) && X(from) === X(to) && (X(from) === 1 || X(from) === 3)) return 'mountain';
  if (isRail(from) && isRail(to)) {
    if (s.ptype[pid] === ENG) return 'rail.block';
    // on one straight rail line → something is in the way; otherwise it would have to turn
    for (let d = 0; d < 4; d++) {
      let cur = from;
      for (;;) {
        const nx = railNext[cur][d];
        if (nx < 0) break;
        if (nx === to) return 'rail.block';
        cur = nx;
      }
    }
    return 'rail.turn';
  }
  return 'far';
}
