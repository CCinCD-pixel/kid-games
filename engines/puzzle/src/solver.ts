/**
 * Solvers.
 *  - solvePushOptimal: the in-game fallback (spec §5.1 path 2) — push-optimal A* with an admissible
 *    heuristic (sum of single-crate push distances to the nearest pad of the crate's colour), dead
 *    squares pruned, normalised robot in the key, node + time budget.
 *  - solveOptimal: the offline exact solver (validators, G3): pushes then moves (or moves then
 *    pushes), exact robot cell in the key. A faithful port of the prototype solveOptimal(), so the
 *    reference lines (LURD) come out identical.
 */
import { nb } from './level';
import { applyPush, boxMap, canon, isSolved, legalPushes, minReach, stateKey, walkDist } from './rules';
import { DIR_CH, OPP, type Level, type Push, type State } from './types';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Pull-distance tables: dist[colour][cell] = fewest pushes for a lone crate from cell to a pad (−1 never). */
export function pushDistances(l: Level): Record<number, Int16Array> {
  const out: Record<number, Int16Array> = {};
  for (const k of new Set(l.colorOf)) {
    const d = new Int16Array(l.N).fill(-1);
    const q: number[] = [];
    for (let i = 0; i < l.N; i += 1) if (l.goal[i] === k) {
      d[i] = 0;
      q.push(i);
    }
    for (let h = 0; h < q.length; h += 1) {
      const x = q[h];
      for (let dir = 0; dir < 4; dir += 1) {
        const y = nb(l, x, dir);
        if (y < 0 || !l.floor[y]) continue;
        const z = nb(l, y, dir);
        if (z < 0 || !l.floor[z]) continue;
        if (d[y] < 0) {
          d[y] = d[x] + 1;
          q.push(y);
        }
      }
    }
    out[k] = d;
  }
  return out;
}

class MinHeap {
  private readonly f: number[] = [];
  private readonly g: number[] = [];
  private readonly id: number[] = [];
  get size(): number {
    return this.f.length;
  }
  push(f: number, g: number, id: number): void {
    this.f.push(f);
    this.g.push(g);
    this.id.push(id);
    let i = this.f.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  /** ties: larger g first (deeper nodes finish sooner) */
  private less(a: number, b: number): boolean {
    return this.f[a] < this.f[b] || (this.f[a] === this.f[b] && this.g[a] > this.g[b]);
  }
  private swap(a: number, b: number): void {
    [this.f[a], this.f[b]] = [this.f[b], this.f[a]];
    [this.g[a], this.g[b]] = [this.g[b], this.g[a]];
    [this.id[a], this.id[b]] = [this.id[b], this.id[a]];
  }
  pop(): number {
    const top = this.id[0];
    const lf = this.f.pop()!;
    const lg = this.g.pop()!;
    const li = this.id.pop()!;
    if (this.f.length) {
      this.f[0] = lf;
      this.g[0] = lg;
      this.id[0] = li;
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        const b = a + 1;
        let m = i;
        if (a < this.f.length && this.less(a, m)) m = a;
        if (b < this.f.length && this.less(b, m)) m = b;
        if (m === i) break;
        this.swap(m, i);
        i = m;
      }
    }
    return top;
  }
}

export type SolveResult = { pushes: Push[]; nodes: number } | { dead: true; nodes: number } | { unknown: true; nodes: number };

/**
 * Push-optimal A* from `from` (robot cell exact; crates in any order). Pushes carry the walk from
 * the robot's actual cell. `{dead}` = proven unsolvable; `{unknown}` = budget exhausted.
 */
export function solvePushOptimal(l: Level, from: State, budget: { nodes: number; ms: number }, dist?: Record<number, Int16Array>): SolveResult {
  const pd = dist ?? pushDistances(l);
  const t0 = now();
  const h = (boxes: ArrayLike<number>): number => {
    let sum = 0;
    for (let s = 0; s < boxes.length; s += 1) {
      const v = pd[l.colorOf[s]][boxes[s]];
      if (v < 0) return -1;
      sum += v;
    }
    return sum;
  };
  const startBoxes = canon(l, from.boxes);
  const h0 = h(startBoxes);
  if (h0 < 0) return { dead: true, nodes: 0 };
  const players: number[] = [];
  const boxesList: Uint16Array[] = [];
  const parent: number[] = [];
  const via: (Push | null)[] = [];
  const g: number[] = [];
  const index = new Map<string, number>();
  const exactPlayer: number[] = [];
  const add = (exact: number, boxes: Uint16Array, par: number, push: Push | null, cost: number): number => {
    const norm = minReach(walkDist(l, boxMap(l, boxes), exact));
    const key = stateKey(norm, boxes);
    const known = index.get(key);
    if (known !== undefined) {
      if (cost < g[known]) {
        g[known] = cost;
        parent[known] = par;
        via[known] = push;
        exactPlayer[known] = exact;
        return known;
      }
      return -1;
    }
    const id = players.length;
    index.set(key, id);
    players.push(norm);
    exactPlayer.push(exact);
    boxesList.push(boxes);
    parent.push(par);
    via.push(push);
    g.push(cost);
    return id;
  };
  const heap = new MinHeap();
  const startId = add(from.player, startBoxes, -1, null, 0);
  heap.push(h0, 0, startId);
  const closed = new Set<number>();
  let nodes = 0;
  while (heap.size) {
    const id = heap.pop();
    if (closed.has(id)) continue;
    closed.add(id);
    const boxes = boxesList[id];
    if (isSolved(l, boxes)) {
      const line: number[] = [];
      for (let x = id; x !== startId; x = parent[x]) line.push(x);
      line.reverse();
      // re-derive the pushes with walks from the exact robot cells along the line
      const pushes: Push[] = [];
      let cur: State = { player: from.player, boxes: startBoxes };
      for (const x of line) {
        const p = via[x]!;
        const { pushes: legal } = legalPushes(l, cur);
        const match = legal.find((q) => q.from === p.from && q.dir === p.dir) ?? p;
        pushes.push(match);
        cur = { player: match.from, boxes: applyPush(l, cur.boxes, match) };
      }
      return { pushes, nodes };
    }
    nodes += 1;
    if (nodes > budget.nodes) return { unknown: true, nodes };
    if ((nodes & 255) === 0 && now() - t0 > budget.ms) return { unknown: true, nodes };
    const { pushes } = legalPushes(l, { player: exactPlayer[id], boxes }, true);
    for (const p of pushes) {
      const nbx = applyPush(l, boxes, p);
      const hv = h(nbx);
      if (hv < 0) continue;
      const cost = g[id] + 1;
      const nid = add(p.from, nbx, id, p, cost);
      if (nid >= 0 && !closed.has(nid)) heap.push(cost + hv, cost, nid);
    }
  }
  return { dead: true, nodes };
}

// ---------------------------------------------------------------- exact offline solver (prototype port)

class ProtoHeap {
  private readonly a: [number, string][] = [];
  get size(): number {
    return this.a.length;
  }
  push(c: number, v: string): void {
    const a = this.a;
    a.push([c, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, string] {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

interface SolveInfo {
  parent: string | null;
  player: number;
  boxes: Uint16Array;
  pushes: number;
  moves: number;
  push?: Push;
  prevPlayer?: number;
  prevBoxes?: Uint16Array;
}

/** BFS parents for the walk (prototype walk(…, true): u d l r order, FIFO). */
function walkParents(l: Level, bmap: Int16Array, from: number): Int8Array {
  const dist = new Int16Array(l.N).fill(-1);
  const par = new Int8Array(l.N).fill(-1);
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
      par[y] = k;
      q[t++] = y;
    }
  }
  return par;
}

function reconstruct(l: Level, info: Map<string, SolveInfo>, k: string): string {
  const chain: SolveInfo[] = [];
  for (let x = info.get(k)!; x.parent !== null; x = info.get(x.parent)!) chain.push(x);
  chain.reverse();
  let s = '';
  for (const st of chain) {
    const pu = st.push!;
    const par = walkParents(l, boxMap(l, st.prevBoxes!), st.prevPlayer!);
    const stand = nb(l, pu.from, OPP[pu.dir]);
    let path = '';
    let x = stand;
    while (x !== st.prevPlayer) {
      const kk = par[x];
      path = DIR_CH[kk] + path;
      x = nb(l, x, OPP[kk]);
    }
    s += path + DIR_CH[pu.dir].toUpperCase();
  }
  return s;
}

export interface OptimalResult {
  pushes: number;
  moves: number;
  lurd: string;
  expanded: number;
}

/** Exact optimum: mode 'push' = fewest pushes, then fewest moves; 'move' = the reverse. Null = unsolvable / over budget. */
export function solveOptimal(l: Level, mode: 'push' | 'move' = 'push', o: { maxStates?: number; from?: State } = {}): OptimalResult | null {
  const W1 = mode === 'push' ? 1e6 : 1;
  const W2 = mode === 'push' ? 1 : 1e6;
  const maxStates = o.maxStates ?? 600000;
  const start = o.from ? { player: o.from.player, boxes: canon(l, o.from.boxes) } : { player: l.start.player, boxes: canon(l, l.start.boxes) };
  const heap = new ProtoHeap();
  const best = new Map<string, number>();
  const info = new Map<string, SolveInfo>();
  const k0 = stateKey(start.player, start.boxes);
  best.set(k0, 0);
  info.set(k0, { parent: null, player: start.player, boxes: start.boxes, pushes: 0, moves: 0 });
  heap.push(0, k0);
  let expanded = 0;
  while (heap.size) {
    const [cost, k] = heap.pop();
    if (best.get(k) !== cost) continue;
    const st = info.get(k)!;
    if (isSolved(l, st.boxes)) return { pushes: st.pushes, moves: st.moves, lurd: reconstruct(l, info, k), expanded };
    expanded += 1;
    if (expanded > maxStates) return null;
    const { pushes } = legalPushes(l, { player: st.player, boxes: st.boxes }, true);
    for (const pu of pushes) {
      const nbx = applyPush(l, st.boxes, pu);
      const nk = stateKey(pu.from, nbx);
      const np = st.pushes + 1;
      const nm = st.moves + pu.walk + 1;
      const c = np * W1 + nm * W2;
      const old = best.get(nk);
      if (old === undefined || c < old) {
        best.set(nk, c);
        info.set(nk, { parent: k, player: pu.from, boxes: nbx, pushes: np, moves: nm, push: pu, prevPlayer: st.player, prevBoxes: st.boxes });
        heap.push(c, nk);
      }
    }
  }
  return null;
}

/** The LURD walk + push for one push from the robot's exact cell (walk = BFS tree path, u d l r). */
export function lurdForPush(l: Level, s: State, p: Push): string {
  const par = walkParents(l, boxMap(l, s.boxes), s.player);
  const stand = nb(l, p.from, OPP[p.dir]);
  let path = '';
  let x = stand;
  while (x !== s.player) {
    const kk = par[x];
    if (kk < 0) return '';
    path = DIR_CH[kk] + path;
    x = nb(l, x, OPP[kk]);
  }
  return path + DIR_CH[p.dir].toUpperCase();
}
