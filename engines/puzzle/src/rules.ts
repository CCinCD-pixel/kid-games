/**
 * Push rules (spec §3.3): the robot pushes one crate one cell; never two crates, never pulls.
 * Results are identical to the prototype (sokoban.mjs legalPushes / applyPush / isSolved).
 */
import { nb } from './level';
import { DIR_CH, OPP, type Dir, type Level, type Push, type State } from './types';

/** Sort each colour group (crates of one colour are interchangeable) → the canonical box list. */
export function canon(l: Level, boxes: ArrayLike<number>): Uint16Array {
  const b = Uint16Array.from(boxes as ArrayLike<number>);
  for (const [s, e] of l.groups) if (e - s > 1) b.subarray(s, e).sort();
  return b;
}

/** cell → slot (-1 = no crate) */
export function boxMap(l: Level, boxes: ArrayLike<number>): Int16Array {
  const m = new Int16Array(l.N).fill(-1);
  for (let s = 0; s < boxes.length; s += 1) m[boxes[s]] = s;
  return m;
}

/** Every crate on a pad of its own colour. */
export function isSolved(l: Level, boxes: ArrayLike<number>): boolean {
  for (let s = 0; s < boxes.length; s += 1) if (l.goal[boxes[s]] !== l.colorOf[s]) return false;
  return true;
}

/** BFS walking distances for the robot (crates are obstacles); -1 = unreachable. */
export function walkDist(l: Level, bmap: Int16Array, from: number): Int16Array {
  const dist = new Int16Array(l.N).fill(-1);
  const q = new Int32Array(l.N);
  let h = 0;
  let t = 0;
  q[t++] = from;
  dist[from] = 0;
  while (h < t) {
    const p = q[h++];
    for (let k = 0; k < 4; k += 1) {
      const y = nb(l, p, k);
      if (y < 0 || !l.floor[y] || bmap[y] >= 0 || dist[y] >= 0) continue;
      dist[y] = dist[p] + 1;
      q[t++] = y;
    }
  }
  return dist;
}

/** The smallest reachable cell (the normalised robot position of a push-state). */
export function minReach(dist: Int16Array): number {
  for (let i = 0; i < dist.length; i += 1) if (dist[i] >= 0) return i;
  return -1;
}

/** Normalise the robot to the smallest cell of its reachable area (prototype minReach). */
export function normalize(l: Level, s: State): State {
  const dist = walkDist(l, boxMap(l, s.boxes), s.player);
  return { player: minReach(dist), boxes: canon(l, s.boxes) };
}

/**
 * All legal pushes from a state, in prototype order (slot, then direction up/down/left/right).
 * `pruneDead` skips pushes that land a crate on a simple dead square of its colour.
 */
export function legalPushes(l: Level, s: State, pruneDead = false): { pushes: Push[]; dist: Int16Array } {
  const bmap = boxMap(l, s.boxes);
  const dist = walkDist(l, bmap, s.player);
  const out: Push[] = [];
  for (let slot = 0; slot < s.boxes.length; slot += 1) {
    const p = s.boxes[slot];
    for (let k = 0; k < 4; k += 1) {
      const stand = nb(l, p, OPP[k]);
      const to = nb(l, p, k);
      if (stand < 0 || to < 0 || dist[stand] < 0 || !l.floor[to] || bmap[to] >= 0) continue;
      if (pruneDead && l.dead[l.colorOf[slot]][to]) continue;
      out.push({ slot, from: p, to, dir: k as Dir, walk: dist[stand] });
    }
  }
  return { pushes: out, dist };
}

/** Crates after a push (canonical order). The robot ends on `push.from`. */
export function applyPush(l: Level, boxes: ArrayLike<number>, push: Push): Uint16Array {
  const b = Uint16Array.from(boxes as ArrayLike<number>);
  b[push.slot] = push.to;
  return canon(l, b);
}

/** Packed state key: robot + crates as UTF-16 code units (cells < 65536). */
export function stateKey(player: number, boxes: ArrayLike<number>): string {
  let k = String.fromCharCode(player);
  for (let i = 0; i < boxes.length; i += 1) k += String.fromCharCode(boxes[i]);
  return k;
}

export interface ReplayResult {
  ok: boolean;
  why?: string;
  solved: boolean;
  pushes: number;
  moves: number;
  player: number;
  /** identity-preserving crate cells (slot order of the level start) */
  boxes: Uint16Array;
}

/** Replay a LURD line with the game rules (lower case = walk, upper case = push). */
export function replayLurd(l: Level, lurd: string, from: State = l.start): ReplayResult {
  let player = from.player;
  const boxes = Uint16Array.from(from.boxes);
  let pushes = 0;
  let moves = 0;
  const fail = (why: string): ReplayResult => ({ ok: false, why, solved: false, pushes, moves, player, boxes });
  for (const ch of lurd) {
    const k = DIR_CH.indexOf(ch.toLowerCase());
    if (k < 0) return fail('bad char');
    const y = nb(l, player, k);
    if (y < 0 || !l.floor[y]) return fail('into wall');
    const s = boxes.indexOf(y);
    if (s >= 0) {
      const z = nb(l, y, k);
      if (z < 0 || !l.floor[z] || boxes.includes(z)) return fail('blocked push');
      if (ch !== ch.toUpperCase()) return fail('push not marked');
      boxes[s] = z;
      pushes += 1;
    } else if (ch === ch.toUpperCase()) return fail('marked push without crate');
    player = y;
    moves += 1;
  }
  return { ok: true, solved: isSolved(l, boxes), pushes, moves, player, boxes };
}
