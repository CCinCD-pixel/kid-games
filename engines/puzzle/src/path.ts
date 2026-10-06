/**
 * Tap-to-walk path finding (spec §3.2 row 7): the fewest cells, then the fewest turns, then the
 * direction preference up → right → down → left. Crates are obstacles. A tiny Dijkstra over
 * (cell, heading) states — boards are ≤ 12×12, so this is microseconds.
 */
import { nb } from './level';
import { boxMap, walkDist } from './rules';
import type { Level, State } from './types';

/** URDL exploration order (spec tie-break), as engine directions (0 up, 3 right, 1 down, 2 left). */
const PREF = [0, 3, 1, 2] as const;
const STEP = 1024;

/**
 * Cells from the robot to `to` (excluding the start; [] when already there), or null when `to`
 * cannot be reached. `heading` (optional) is the robot's current facing: a first step that keeps
 * it is preferred on full ties.
 */
export function walkPath(l: Level, s: State, to: number, heading = -1): number[] | null {
  if (to < 0 || to >= l.N || !l.floor[to]) return null;
  const bmap = boxMap(l, s.boxes);
  if (bmap[to] >= 0) return null;
  if (to === s.player) return [];
  // state id = cell * 5 + (lastDir + 1)
  const S = l.N * 5;
  const cost = new Int32Array(S).fill(0x7fffffff);
  const parent = new Int32Array(S).fill(-1);
  const heapCost: number[] = [];
  const heapSeq: number[] = [];
  const heapId: number[] = [];
  let seq = 0;
  const push = (c: number, id: number) => {
    heapCost.push(c);
    heapSeq.push(seq++);
    heapId.push(id);
    let i = heapCost.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapCost[p] < heapCost[i] || (heapCost[p] === heapCost[i] && heapSeq[p] < heapSeq[i])) break;
      swap(p, i);
      i = p;
    }
  };
  const swap = (a: number, b: number) => {
    [heapCost[a], heapCost[b]] = [heapCost[b], heapCost[a]];
    [heapSeq[a], heapSeq[b]] = [heapSeq[b], heapSeq[a]];
    [heapId[a], heapId[b]] = [heapId[b], heapId[a]];
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [heapCost[0], heapId[0]];
    const lc = heapCost.pop()!;
    const ls = heapSeq.pop()!;
    const li = heapId.pop()!;
    if (heapCost.length) {
      heapCost[0] = lc;
      heapSeq[0] = ls;
      heapId[0] = li;
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        const b = a + 1;
        let m = i;
        const less = (x: number, y: number) => heapCost[x] < heapCost[y] || (heapCost[x] === heapCost[y] && heapSeq[x] < heapSeq[y]);
        if (a < heapCost.length && less(a, m)) m = a;
        if (b < heapCost.length && less(b, m)) m = b;
        if (m === i) break;
        swap(m, i);
        i = m;
      }
    }
    return top;
  };
  const startId = s.player * 5 + (heading + 1);
  cost[startId] = 0;
  push(0, startId);
  let goalId = -1;
  while (heapCost.length) {
    const [c, id] = pop();
    if (c !== cost[id]) continue;
    const cell = (id / 5) | 0;
    if (cell === to) {
      goalId = id;
      break;
    }
    const last = (id % 5) - 1;
    for (const d of PREF) {
      const y = nb(l, cell, d);
      if (y < 0 || !l.floor[y] || bmap[y] >= 0) continue;
      // a turn costs 1 (the very first step only counts when it leaves the current heading)
      const turn = last >= 0 && last !== d ? 1 : 0;
      const nid = y * 5 + (d + 1);
      const nc = c + STEP + turn;
      if (nc < cost[nid]) {
        cost[nid] = nc;
        parent[nid] = id;
        push(nc, nid);
      }
    }
  }
  if (goalId < 0) return null;
  const cells: number[] = [];
  for (let id = goalId; id !== startId; id = parent[id]) cells.push((id / 5) | 0);
  return cells.reverse();
}

/** Can the robot reach `to` (crates as obstacles)? */
export function canReach(l: Level, s: State, to: number): boolean {
  if (to < 0 || to >= l.N || !l.floor[to]) return false;
  return walkDist(l, boxMap(l, s.boxes), s.player)[to] >= 0;
}

/** Direction of a single step a → b (cells must be neighbours), or -1. */
export function stepDir(l: Level, a: number, b: number): number {
  for (let d = 0; d < 4; d += 1) if (nb(l, a, d) === b) return d;
  return -1;
}
