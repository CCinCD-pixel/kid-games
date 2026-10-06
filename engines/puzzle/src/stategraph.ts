/**
 * StateGraph — the full push-level pre-solve behind hints and the invisible-deadlock check
 * (spec §5.1 path 1, §8.2). From the start every push-state is expanded (robot normalised to the
 * smallest cell of its reachable area), including terminal states that have an off-pad crate on a
 * simple dead square; a reverse BFS from the solved states gives `togo` = pushes still needed.
 *
 * Typed arrays only: open-addressing hash (Int32, load ≤ 0.6) over packed Uint16 keys, forward CSR
 * while building, reverse CSR for the BFS, Int16 togo. After the build only the keys, the hash and
 * togo are retained (≈ 2·(1+boxes) + 2 + 7 bytes per state), unless `keepEdges` (validators).
 *
 * Semantics are identical to the prototype explore() (parity fixtures, tests/parity.test.ts).
 */
import { nb } from './level';
import type { Level, State } from './types';

export interface GraphOptions {
  maxStates: number;
  maxMs: number;
  signal?: AbortSignal;
  /** keep the forward edges (analysis / validators) */
  keepEdges?: boolean;
  /** states between cooperative yields in build() (default 5000) */
  yieldEvery?: number;
  now?: () => number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** FNV-1a over the packed key + a final avalanche (shared by build and lookup). */
function hashU16(key: Uint16Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key[i];
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

class Scratch {
  readonly bmap: Int16Array;
  readonly seen: Int32Array;
  readonly queue: Int32Array;
  readonly dist: Int16Array;
  stamp = 0;
  constructor(N: number) {
    this.bmap = new Int16Array(N).fill(-1);
    this.seen = new Int32Array(N);
    this.queue = new Int32Array(N);
    this.dist = new Int16Array(N);
  }
}

/** Mutable builder state; build steps yield so the async wrapper can breathe. */
class Builder {
  readonly K: number;
  states: Uint16Array;
  n = 0;
  table: Int32Array;
  mask: number;
  edgeTo: Int32Array;
  edgeCount = 0;
  edgeStart: Int32Array;
  readonly scratch: Scratch;
  readonly key: Uint16Array;
  readonly newBoxes: Uint16Array;

  constructor(readonly l: Level) {
    this.K = 1 + l.nBoxes;
    this.states = new Uint16Array(1024 * this.K);
    this.table = new Int32Array(2048);
    this.mask = 2047;
    this.edgeTo = new Int32Array(4096);
    this.edgeStart = new Int32Array(1025);
    this.scratch = new Scratch(l.N);
    this.key = new Uint16Array(this.K);
    this.newBoxes = new Uint16Array(l.nBoxes);
  }

  hashKey(key: Uint16Array): number {
    return hashU16(key);
  }

  equalsAt(index: number, key: Uint16Array): boolean {
    const base = index * this.K;
    for (let i = 0; i < this.K; i += 1) if (this.states[base + i] !== key[i]) return false;
    return true;
  }

  find(key: Uint16Array): number {
    let h = this.hashKey(key) & this.mask;
    for (;;) {
      const v = this.table[h];
      if (v === 0) return -1;
      if (this.equalsAt(v - 1, key)) return v - 1;
      h = (h + 1) & this.mask;
    }
  }

  private rehash(): void {
    const cap = this.table.length * 2;
    this.table = new Int32Array(cap);
    this.mask = cap - 1;
    const k = new Uint16Array(this.K);
    for (let i = 0; i < this.n; i += 1) {
      for (let j = 0; j < this.K; j += 1) k[j] = this.states[i * this.K + j];
      let h = this.hashKey(k) & this.mask;
      while (this.table[h] !== 0) h = (h + 1) & this.mask;
      this.table[h] = i + 1;
    }
  }

  /** index of key, inserting it when new */
  intern(key: Uint16Array): number {
    let h = this.hashKey(key) & this.mask;
    for (;;) {
      const v = this.table[h];
      if (v === 0) break;
      if (this.equalsAt(v - 1, key)) return v - 1;
      h = (h + 1) & this.mask;
    }
    const id = this.n;
    if ((id + 1) * this.K > this.states.length) {
      const next = new Uint16Array(this.states.length * 2);
      next.set(this.states);
      this.states = next;
    }
    this.states.set(key, id * this.K);
    this.n += 1;
    this.table[h] = id + 1;
    if (this.n > this.table.length * 0.6) this.rehash();
    return id;
  }

  addEdge(to: number): void {
    if (this.edgeCount >= this.edgeTo.length) {
      const next = new Int32Array(this.edgeTo.length * 2);
      next.set(this.edgeTo);
      this.edgeTo = next;
    }
    this.edgeTo[this.edgeCount++] = to;
  }

  markEdgeStart(i: number): void {
    if (i + 1 >= this.edgeStart.length) {
      const next = new Int32Array(this.edgeStart.length * 2);
      next.set(this.edgeStart);
      this.edgeStart = next;
    }
    this.edgeStart[i] = this.edgeCount;
  }

  /** BFS from `from` with crates (in `bmap`) as obstacles; returns the smallest reached cell. Fills scratch.dist when wanted. */
  reach(from: number, wantDist: boolean): number {
    const { l } = this;
    const sc = this.scratch;
    sc.stamp += 1;
    const st = sc.stamp;
    let h = 0;
    let t = 0;
    sc.queue[t++] = from;
    sc.seen[from] = st;
    if (wantDist) sc.dist[from] = 0;
    let min = from;
    while (h < t) {
      const p = sc.queue[h++];
      if (p < min) min = p;
      for (let d = 0; d < 4; d += 1) {
        const y = nb(l, p, d);
        if (y < 0 || !l.floor[y] || sc.bmap[y] >= 0 || sc.seen[y] === st) continue;
        sc.seen[y] = st;
        if (wantDist) sc.dist[y] = sc.dist[p] + 1;
        sc.queue[t++] = y;
      }
    }
    return min;
  }

  isReached(cell: number): boolean {
    return this.scratch.seen[cell] === this.scratch.stamp;
  }
}

function canonInPlace(l: Level, b: Uint16Array): void {
  for (const [s, e] of l.groups) if (e - s > 1) b.subarray(s, e).sort();
}

function isSolvedBoxes(l: Level, b: ArrayLike<number>): boolean {
  for (let s = 0; s < b.length; s += 1) if (l.goal[b[s]] !== l.colorOf[s]) return false;
  return true;
}

function onDeadSq(l: Level, b: ArrayLike<number>): boolean {
  for (let s = 0; s < b.length; s += 1) if (l.dead[l.colorOf[s]][b[s]]) return true;
  return false;
}

const OPPOSITE = [1, 0, 3, 2];

function* buildSteps(l: Level, o: GraphOptions): Generator<void, StateGraph | null, void> {
  const t0 = (o.now ?? now)();
  const b = new Builder(l);
  const { K } = b;
  const boxes = new Uint16Array(l.nBoxes);
  const sc = b.scratch;
  // start state
  for (let s = 0; s < l.nBoxes; s += 1) boxes[s] = l.start.boxes[s];
  canonInPlace(l, boxes);
  for (let s = 0; s < l.nBoxes; s += 1) sc.bmap[boxes[s]] = s;
  b.key[0] = b.reach(l.start.player, false);
  for (let s = 0; s < l.nBoxes; s += 1) {
    sc.bmap[boxes[s]] = -1;
    b.key[1 + s] = boxes[s];
  }
  const start = b.intern(b.key);
  const yieldEvery = o.yieldEvery ?? 5000;
  const solvedList: number[] = [];
  for (let i = 0; i < b.n; i += 1) {
    if (b.n > o.maxStates) return null;
    if ((i & 1023) === 1023) {
      if (o.signal?.aborted) return null;
      if ((o.now ?? now)() - t0 > o.maxMs) return null;
    }
    if (i > 0 && i % yieldEvery === 0) yield;
    b.markEdgeStart(i);
    const base = i * K;
    const player = b.states[base];
    for (let s = 0; s < l.nBoxes; s += 1) boxes[s] = b.states[base + 1 + s];
    if (isSolvedBoxes(l, boxes)) {
      solvedList.push(i);
      continue;
    }
    if (onDeadSq(l, boxes)) continue;
    for (let s = 0; s < l.nBoxes; s += 1) sc.bmap[boxes[s]] = s;
    b.reach(player, true);
    // collect pushes first (dist/seen are overwritten by successor BFS runs)
    const pushes: number[] = [];
    for (let s = 0; s < l.nBoxes; s += 1) {
      const p = boxes[s];
      for (let k = 0; k < 4; k += 1) {
        const stand = nb(l, p, OPPOSITE[k]);
        const to = nb(l, p, k);
        if (stand < 0 || to < 0 || !b.isReached(stand) || !l.floor[to] || sc.bmap[to] >= 0) continue;
        pushes.push(s, to);
      }
    }
    for (let j = 0; j < pushes.length; j += 2) {
      const s = pushes[j];
      const to = pushes[j + 1];
      const from = boxes[s];
      b.newBoxes.set(boxes);
      b.newBoxes[s] = to;
      canonInPlace(l, b.newBoxes);
      // bmap for the successor: move crate s
      sc.bmap[from] = -1;
      sc.bmap[to] = s;
      b.key[0] = b.reach(from, false);
      sc.bmap[to] = -1;
      sc.bmap[from] = s;
      for (let q = 0; q < l.nBoxes; q += 1) b.key[1 + q] = b.newBoxes[q];
      b.addEdge(b.intern(b.key));
    }
    for (let s = 0; s < l.nBoxes; s += 1) sc.bmap[boxes[s]] = -1;
  }
  if (b.n > o.maxStates) return null;
  b.markEdgeStart(b.n);
  const n = b.n;
  // reverse CSR
  const indeg = new Int32Array(n + 1);
  for (let e = 0; e < b.edgeCount; e += 1) indeg[b.edgeTo[e] + 1] += 1;
  for (let i = 0; i < n; i += 1) indeg[i + 1] += indeg[i];
  const revStart = indeg;
  const fill = revStart.slice(0, n);
  const revFrom = new Int32Array(b.edgeCount);
  for (let i = 0; i < n; i += 1) {
    for (let e = b.edgeStart[i]; e < b.edgeStart[i + 1]; e += 1) {
      const j = b.edgeTo[e];
      revFrom[fill[j]++] = i;
    }
  }
  const togo = new Int16Array(n).fill(-1);
  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  for (const i of solvedList) {
    togo[i] = 0;
    queue[qt++] = i;
  }
  while (qh < qt) {
    const j = queue[qh++];
    for (let e = revStart[j]; e < revStart[j + 1]; e += 1) {
      const i = revFrom[e];
      if (togo[i] < 0) {
        togo[i] = togo[j] + 1;
        queue[qt++] = i;
      }
    }
  }
  const states = b.states.slice(0, n * K);
  const edges = o.keepEdges ? { start: b.edgeStart.slice(0, n + 1), to: b.edgeTo.slice(0, b.edgeCount) } : null;
  return new StateGraph(l, K, states, b.table, b.mask, n, togo, start, (o.now ?? now)() - t0, edges);
}

export class StateGraph {
  private readonly probe: Uint16Array;
  private readonly bmap: Int16Array;
  private readonly sc: Scratch;

  constructor(
    readonly level: Level,
    private readonly K: number,
    private readonly states: Uint16Array,
    private readonly table: Int32Array,
    private readonly mask: number,
    readonly n: number,
    private readonly togoArr: Int16Array,
    readonly startIndex: number,
    readonly buildMs: number,
    private readonly edges: { start: Int32Array; to: Int32Array } | null,
  ) {
    this.probe = new Uint16Array(K);
    this.sc = new Scratch(level.N);
    this.bmap = this.sc.bmap;
  }

  /** Build with cooperative yields (Worker / page). Resolves null when over budget or aborted. */
  static async build(l: Level, o: GraphOptions): Promise<StateGraph | null> {
    const it = buildSteps(l, o);
    let r = it.next();
    while (!r.done) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (o.signal?.aborted) return null;
      r = it.next();
    }
    return r.value;
  }

  /** Build without yielding (tests, validators, tools). */
  static buildSync(l: Level, o: GraphOptions): StateGraph | null {
    const it = buildSteps(l, o);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }

  get size(): number {
    return this.n;
  }

  /** retained bytes (keys + hash + togo + optional edges) */
  get bytes(): number {
    return this.states.byteLength + this.table.byteLength + this.togoArr.byteLength + (this.edges ? this.edges.start.byteLength + this.edges.to.byteLength : 0);
  }

  get startTogo(): number {
    return this.togoArr[this.startIndex];
  }

  private lookup(key: Uint16Array): number {
    let slot = hashU16(key) & this.mask;
    for (;;) {
      const v = this.table[slot];
      if (v === 0) return -1;
      const base = (v - 1) * this.K;
      let eq = true;
      for (let i = 0; i < this.K; i += 1) {
        if (this.states[base + i] !== key[i]) {
          eq = false;
          break;
        }
      }
      if (eq) return v - 1;
      slot = (slot + 1) & this.mask;
    }
  }

  /** Index of a state (any robot cell, any crate order), or -1. */
  indexOf(s: State): number {
    const l = this.level;
    const b = Uint16Array.from(s.boxes);
    canonInPlace(l, b);
    for (let i = 0; i < b.length; i += 1) this.bmap[b[i]] = i;
    // smallest reachable cell
    const sc = this.sc;
    sc.stamp += 1;
    const st = sc.stamp;
    let h = 0;
    let t = 0;
    sc.queue[t++] = s.player;
    sc.seen[s.player] = st;
    let min = s.player;
    while (h < t) {
      const p = sc.queue[h++];
      if (p < min) min = p;
      for (let d = 0; d < 4; d += 1) {
        const y = nb(l, p, d);
        if (y < 0 || !l.floor[y] || this.bmap[y] >= 0 || sc.seen[y] === st) continue;
        sc.seen[y] = st;
        sc.queue[t++] = y;
      }
    }
    for (let i = 0; i < b.length; i += 1) this.bmap[b[i]] = -1;
    this.probe[0] = min;
    this.probe.set(b, 1);
    return this.lookup(this.probe);
  }

  /** ≥ 0 pushes still needed; −1 cannot be finished (dead square: no lookup); −2 unknown state. */
  togo(s: State): number {
    if (onDeadSq(this.level, s.boxes)) return -1;
    const i = this.indexOf(s);
    return i < 0 ? -2 : this.togoArr[i];
  }

  togoAt(index: number): number {
    return this.togoArr[index];
  }

  /** Normalised robot cell and canonical crates of state `index`. */
  stateAt(index: number): State {
    const base = index * this.K;
    return { player: this.states[base], boxes: this.states.slice(base + 1, base + this.K) };
  }

  /** Forward edges of `index` (only with keepEdges). */
  successors(index: number): Int32Array {
    if (!this.edges) throw new Error('StateGraph built without keepEdges');
    return this.edges.to.subarray(this.edges.start[index], this.edges.start[index + 1]);
  }

  get hasEdges(): boolean {
    return this.edges !== null;
  }
}
