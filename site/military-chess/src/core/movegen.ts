/**
 * Move generation (spec §3.5–§3.6, R4–R6.1). Same generation order as the reference prototype
 * (road steps by ascending neighbour, then railway: engineer BFS / straight slides by direction),
 * so perft numbers and reply books agree byte for byte.
 */
import { DIRS, X, Y, adj, isAdj, isCamp, isHQ, isRail, railNext, type Side } from './board';
import { ENG, FLAG, MINE, isMobileType } from './pieces';
import type { GameState } from './state';

export interface Move {
  pid: number;
  from: number;
  to: number;
  kind: 'move' | 'attack';
  /** stations visited, from first to last (for animation) */
  path: number[];
  /** the path turned a corner (only an engineer can) */
  eng: boolean;
}
export interface Flip {
  flip: number;
}
export interface Pass {
  pass: true;
}
export type Action = Move | Flip | Pass;

export const isFlip = (a: Action): a is Flip => (a as Flip).flip !== undefined;
export const isPass = (a: Action): a is Pass => (a as Pass).pass === true;
export const isMove = (a: Action): a is Move => (a as Move).pid !== undefined;

export function minesLeft(s: GameState, side: number): number {
  let n = 0;
  for (let p = 0; p < s.np; p++) if (s.palive[p] && s.pside[p] === side && s.ptype[p] === MINE) n++;
  return n;
}

/** Can piece `def` be attacked at all (independent of reach)? R6.1 */
export function canBeAttacked(s: GameState, def: number): boolean {
  if (isCamp(s.ppos[def])) return false;
  if (s.mode === 'fan') {
    if (!s.pup[def]) return false;
    if (s.rules.fanFlagLock && s.ptype[def] === FLAG && minesLeft(s, s.pside[def]) > 0) return false;
  }
  return true;
}

export function shuttleBlocked(s: GameState, side: number, pid: number, from: number, to: number): boolean {
  const sh = s.shuttle[side];
  return sh.pid === pid && sh.n >= s.rules.shuttleMax && from === sh.to && to === sh.from;
}

/** R5.1 */
export function pieceCanMove(s: GameState, pid: number): boolean {
  if (!s.palive[pid]) return false;
  if (!isMobileType(s.ptype[pid])) return false;
  if (s.rules.hqFreeze && isHQ(s.ppos[pid])) return false;
  if (s.mode === 'fan' && !s.pup[pid]) return false;
  return true;
}

function onStraightLine(path: number[]): boolean {
  if (path.length <= 2) return true;
  const x0 = X(path[0]), y0 = Y(path[0]);
  let sameX = true, sameY = true;
  for (const p of path) {
    if (X(p) !== x0) sameX = false;
    if (Y(p) !== y0) sameY = false;
  }
  return sameX || sameY;
}

/** All destinations of one piece; each with its path and whether it turned a corner. */
export function pieceMoves(s: GameState, pid: number, out: Move[] = []): Move[] {
  if (!pieceCanMove(s, pid)) return out;
  const side = s.pside[pid], from = s.ppos[pid], t = s.ptype[pid];
  const seen = new Uint8Array(60);
  const add = (to: number, path: number[], eng: boolean): void => {
    if (seen[to]) return;
    const occ = s.board[to];
    if (occ !== -1) {
      if (s.mode === 'fan' && !s.pup[occ]) return; // face-down pieces block (any colour)
      if (s.pside[occ] === side) return;
      if (!canBeAttacked(s, occ)) return;
    }
    if (shuttleBlocked(s, side, pid, from, to)) return;
    seen[to] = 1;
    out.push({ pid, from, to, kind: occ === -1 ? 'move' : 'attack', path, eng });
  };
  // 1) road steps (any drawn line)
  for (const n of adj[from]) add(n, [from, n], false);
  // 2) railway
  if (isRail(from)) {
    if (t === ENG) {
      const prev = new Int8Array(60).fill(-2);
      prev[from] = -1;
      const q = [from];
      let head = 0;
      while (head < q.length) {
        const cur = q[head++];
        for (let d = 0; d < 4; d++) {
          const nx = railNext[cur][d];
          if (nx < 0 || prev[nx] !== -2) continue;
          prev[nx] = cur;
          const path: number[] = [];
          for (let p = nx; p !== -1; p = prev[p]) path.unshift(p);
          if (s.board[nx] === -1) q.push(nx);
          add(nx, path, !onStraightLine(path));
        }
      }
    } else {
      for (let d = 0; d < 4; d++) {
        let cur = from;
        const path = [from];
        for (;;) {
          const nx = railNext[cur][d];
          if (nx < 0) break;
          path.push(nx);
          add(nx, path.slice(), false);
          if (s.board[nx] !== -1) break;
          cur = nx;
        }
      }
    }
  }
  return out;
}

export function legalMoves(s: GameState): Action[] {
  const out: Action[] = [];
  if (s.result) return out;
  if (s.mode === 'fan') {
    for (let i = 0; i < 60; i++) {
      const p = s.board[i];
      if (p !== -1 && !s.pup[p]) out.push({ flip: i });
    }
    if (s.turn === -1) return out;
  }
  const mv: Move[] = [];
  for (let p = 0; p < s.np; p++) if (s.pside[p] === s.turn) pieceMoves(s, p, mv);
  for (const m of mv) out.push(m);
  if (s.rules.puzzle && s.turn === 1) out.push({ pass: true });
  return out;
}

export function hasAnyAction(s: GameState, side: Side): boolean {
  if (s.mode === 'fan') {
    for (let p = 0; p < s.np; p++) if (s.palive[p] && !s.pup[p]) return true;
  }
  const buf: Move[] = [];
  for (let p = 0; p < s.np; p++) {
    if (s.pside[p] === side && pieceCanMove(s, p)) {
      buf.length = 0;
      if (pieceMoves(s, p, buf).length) return true;
    }
  }
  return false;
}

/**
 * Could `to` be reached from `from` by a non-engineer in the PRE-move position? A move that only an
 * engineer can make proves the piece is an engineer (R11.1).
 */
export function needsEngineer(s: GameState, from: number, to: number): boolean {
  if (isAdj(from, to)) return false;
  if (!isRail(from) || !isRail(to)) return false;
  for (let d = 0; d < 4; d++) {
    let cur = from;
    for (;;) {
      const nx = railNext[cur][d];
      if (nx < 0) break;
      if (nx === to) return false;
      if (s.board[nx] !== -1) break;
      cur = nx;
    }
  }
  return true;
}

/** the legal move of piece `pid` to station `to`, if any */
export function findMove(s: GameState, pid: number, to: number): Move | null {
  if (s.result || s.pside[pid] !== s.turn) return null;
  for (const m of pieceMoves(s, pid)) if (m.to === to) return m;
  return null;
}

export { DIRS };
