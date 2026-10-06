/**
 * Simulation core (spec §3, §8.1 移植规则): constants, formulas, rng, Snake, spatial hashes, geometry.
 * A line-by-line port of the prototype `snake-battle-tools/core.mjs`: same function names, iteration
 * order and floating-point expression order, so the event stream is bit-identical in Node (V1b).
 * Pure, deterministic, no DOM. Do not "optimise" anything that could change a result.
 */
import physics from '../../../../content/snake-battle/physics.json';

export const TICK = 1 / 60;

export type Phys = typeof physics.phys;
export const PHYS: Phys = { ...physics.phys };

export const radiusOf = (m: number) => Math.min(32, 9 + 0.9 * Math.sqrt(Math.max(m, 1)));
export const bodyLenOf = (m: number) => 40 + 20 * Math.pow(Math.max(m, 1), 0.78);
export const turnRateOf = (m: number) => {
  const t = Math.min(1, Math.max(0, Math.log10(Math.max(m, 10) / 10) / 2));
  return PHYS.turnMax - (PHYS.turnMax - PHYS.turnMin) * t;
};
export const sampleSpacingOf = (r: number) => 0.6 * r;
/** camera: visible world height multiplier vs zoom 1 (spec §3.14) */
export const viewScaleOf = (m: number) => 1 + 0.9 * (1 - Math.exp(-m / 600));

// ---------------------------------------------------------------- rng (mulberry32 + the prototype's FNV-1a fork rule)
export interface Rng {
  next(): number;
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  gauss(): number;
  fork(label: string | number): Rng;
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    chance: (p) => next() < p,
    gauss: () => { let u = 0, v = 0; while (u === 0) u = next(); v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    fork: (label) => createRng((hashString(String(label)) ^ Math.floor(next() * 4294967296)) >>> 0),
  };
  return rng;
}

const TAU = Math.PI * 2;
export const angDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

// ---------------------------------------------------------------- snake
const CAP = 8192; // path ring capacity (power of 2) -> max body 40k wu (L(9999) ≈ 26 400 wu, spec §3.19-19)
const MASK = CAP - 1;

export type KillTag = 'headon' | 'body' | 'cut' | 'encircle';
export interface KillTagRec { tag: KillTag; victim: number; victimPersona: string; victimMass: number; killerMass: number; t: number; victimLifeKills: number }
export interface SnakeStats {
  kills: number; deaths: number; peak: number; eaten: number; eatenByKind: Record<string, number>; boostTime: number; nearMiss: number;
  killTags: KillTagRec[]; lifeKills: number; multi: number; lastKillT: number; bestMulti: number;
  bestStreak?: number; shieldSaves?: number; dropValue?: number; pu?: number; puKinds?: Record<string, number>;
}
export interface RespawnRule { delay: number; keep?: number; min?: number }
export interface SnakeOpts { name?: string; team?: number; isPlayer?: boolean; persona?: string; tier?: string; respawn?: RespawnRule | null; skin?: string; color?: string }
export interface Cause { killer: number; tag: KillTag; x: number; y: number; s?: number }
/** the subset of Brain the world calls (sim/brain.ts) */
export interface BrainLike { tick(s: Snake, w: any): void }

export class Snake {
  id: number; name: string; team: number; isPlayer: boolean; persona: string; tier: string;
  brain: BrainLike | null = null;
  px = new Float32Array(CAP);
  py = new Float32Array(CAP);
  alive = false;
  stats: SnakeStats = { kills: 0, deaths: 0, peak: 0, eaten: 0, eatenByKind: {}, boostTime: 0, nearMiss: 0, killTags: [], lifeKills: 0, multi: 0, lastKillT: -99, bestMulti: 0 };
  x = 0; y = 0; angle = 0; target = 0; mass = 0;
  boost = false; wantBoost = false; boostLatch = false;
  protect = 0; shield = 0; magnet = 0; speedPu = 0;
  dropAcc = 0; dropTimer = 0; acc = 0;
  h = 0; n = 0;
  spawnT = 0; lifeStart = 0; deadAt: number | null = null; cause: Cause | null = null;
  respawn: RespawnRule | null = null;
  // optional per-mode flags
  sleep = false; speedMul?: number; crown?: number; respawning?: boolean; sleeperPath?: number[][];
  // mission-only flags (sim/mission.ts; prototype sets them as ad-hoc fields)
  target_?: boolean; king?: boolean; crownMax?: number; phase2?: boolean; phase3?: boolean; wakeR?: number; sleeperMass?: number;
  brainSpec?: { tier: string; persona: string; rng: Rng; tierObj?: any };
  /** mission bookkeeping for him (ring index, bot line-up state) */
  m?: { ring: number; kills: number; start: number; lined?: boolean; linedFor?: number };
  /** presentation only: the mission persona (sleeper / king / patrol / guard) and the sleeper kind */
  missionPersona?: string; sleeperKind?: 'light' | 'deep';
  touching = false; wallTouch?: number; bumps?: number; nearArm?: boolean; lastNear?: number;
  // presentation only (never read by the sim): skin / colour id
  skin?: string; color?: string;

  constructor(id: number, opts: SnakeOpts) {
    this.id = id;
    this.name = opts.name ?? `S${id}`;
    this.team = opts.team ?? id;          // same team => pass through each other (team mode, v2)
    this.isPlayer = !!opts.isPlayer;
    this.persona = opts.persona ?? 'forager';
    this.tier = opts.tier ?? 'T1';
    this.skin = opts.skin; this.color = opts.color;
  }
  spawn(x: number, y: number, angle: number, mass: number, t: number) {
    this.x = x; this.y = y; this.angle = angle; this.target = angle;
    this.mass = mass; this.alive = true; this.boost = false; this.wantBoost = false;
    this.protect = PHYS.spawnProtect; this.shield = 0; this.magnet = 0; this.speedPu = 0;
    this.dropAcc = 0; this.dropTimer = 0; this.acc = 0;
    this.h = 0; this.n = 0;
    // lay the initial body straight behind the head
    const L = bodyLenOf(mass);
    const cnt = Math.ceil(L / PHYS.pathStep) + 2;
    for (let i = cnt - 1; i >= 0; i--) {
      this.pushPoint(x - Math.cos(angle) * i * PHYS.pathStep, y - Math.sin(angle) * i * PHYS.pathStep);
    }
    this.spawnT = t; this.lifeStart = t; this.stats.lifeKills = 0; this.stats.multi = 0;
    this.stats.peak = Math.max(this.stats.peak, mass);
    this.deadAt = null; this.cause = null;
  }
  pushPoint(x: number, y: number) { this.h = (this.h + 1) & MASK; this.px[this.h] = x; this.py[this.h] = y; if (this.n < CAP) this.n++; }
  /** path point i steps behind the newest (0 = newest) */
  pt(i: number): [number, number] { const k = (this.h - i) & MASK; return [this.px[k], this.py[k]]; }
  /** ring index of path point i (render: no tuple allocation) */
  idx(i: number) { return (this.h - i) & MASK; }
  get r() { return radiusOf(this.mass); }
  get L() { return bodyLenOf(this.mass); }
  get intangible() { return this.protect > 0; }
  speed() {
    if (this.sleep) return 0;
    const k = this.speedMul ?? 1;   // only mission dummies (patrol) may be < 1; never > 1
    if (this.boost) return PHYS.baseSpeed * PHYS.boostMul * k;
    if (this.speedPu > 0) return PHYS.baseSpeed * PHYS.speedPuMul * k;
    return PHYS.baseSpeed * k;
  }
  /** lay the body along a polyline [tail ... head] (sleeping snakes, spec §4.4.2) */
  layPath(points: number[][]) {
    this.h = 0; this.n = 0;
    const pts: number[][] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i], [bx, by] = points[i + 1];
      const d = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.round(d / PHYS.pathStep));
      for (let j = 0; j < k; j++) pts.push([ax + ((bx - ax) * j) / k, ay + ((by - ay) * j) / k]);
    }
    pts.push(points[points.length - 1]);
    for (const [x, y] of pts) this.pushPoint(x, y);
    const [hx, hy] = points[points.length - 1], [px, py] = points[points.length - 2];
    this.x = hx; this.y = hy; this.angle = Math.atan2(hy - py, hx - px); this.target = this.angle;
  }
  /** body samples: positions every sampleSpacing along the path, starting one spacing behind the head */
  samples(out: number[]) {
    const r = this.r, sp = sampleSpacingOf(r), L = this.L;
    const [p0x, p0y] = this.pt(0);
    const d0 = Math.hypot(this.x - p0x, this.y - p0y);
    let k = 0;
    for (let s = sp; s <= L; s += sp) {
      const idx = Math.max(0, Math.round((s - d0) / PHYS.pathStep));
      if (idx >= this.n) break;
      const q = (this.h - idx) & MASK;
      out.push(this.px[q], this.py[q], s);
      k++;
    }
    return k;
  }
}

// ---------------------------------------------------------------- spatial hash for body samples
export class BodyHash {
  cell: number; off: number; dim: number;
  head: Int32Array; next: Int32Array; x: Float32Array; y: Float32Array; r: Float32Array; s: Float32Array; owner: Int16Array;
  count = 0; cap: number; used: number[] = [];
  constructor(R: number, cell = 64, cap = 40000) {
    this.cell = cell; this.off = R + 200; this.dim = Math.ceil((2 * this.off) / cell);
    this.head = new Int32Array(this.dim * this.dim).fill(-1);
    this.next = new Int32Array(cap); this.x = new Float32Array(cap); this.y = new Float32Array(cap);
    this.r = new Float32Array(cap); this.s = new Float32Array(cap); this.owner = new Int16Array(cap);
    this.cap = cap;
  }
  clear() { for (const c of this.used) this.head[c] = -1; this.used.length = 0; this.count = 0; }
  cellOf(x: number, y: number) {
    const cx = Math.min(this.dim - 1, Math.max(0, Math.floor((x + this.off) / this.cell)));
    const cy = Math.min(this.dim - 1, Math.max(0, Math.floor((y + this.off) / this.cell)));
    return cy * this.dim + cx;
  }
  add(x: number, y: number, r: number, s: number, owner: number) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    this.x[i] = x; this.y[i] = y; this.r[i] = r; this.s[i] = s; this.owner[i] = owner;
    const c = this.cellOf(x, y);
    if (this.head[c] === -1) this.used.push(c);
    this.next[i] = this.head[c]; this.head[c] = i;
  }
  /** visit samples whose cell intersects the circle (x,y,rad); fn(i) returns true to stop */
  query(x: number, y: number, rad: number, fn: (i: number) => boolean | void) {
    const c = this.cell, off = this.off;
    const x0 = Math.max(0, Math.floor((x - rad + off) / c)), x1 = Math.min(this.dim - 1, Math.floor((x + rad + off) / c));
    const y0 = Math.max(0, Math.floor((y - rad + off) / c)), y1 = Math.min(this.dim - 1, Math.floor((y + rad + off) / c));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (let i = this.head[cy * this.dim + cx]; i !== -1; i = this.next[i]) if (fn(i)) return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------- food grid
export type FoodKind = 'orb' | 'orb2' | 'big' | 'drop' | 'trail';
export interface Food { x: number; y: number; v: number; kind: FoodKind; drop: boolean; die: number; born: number; c: number; color?: string }

export class FoodGrid {
  cell: number; off: number; dim: number;
  cells: Food[][]; value: Float32Array; dropValue: Float32Array; count = 0;
  constructor(R: number, cell = 100) {
    this.cell = cell; this.off = R + 200; this.dim = Math.ceil((2 * this.off) / cell);
    this.cells = Array.from({ length: this.dim * this.dim }, () => []);
    this.value = new Float32Array(this.dim * this.dim);      // total value per cell (AI foraging)
    this.dropValue = new Float32Array(this.dim * this.dim);  // death/boost drops only (scavengers)
  }
  cellOf(x: number, y: number) {
    const cx = Math.min(this.dim - 1, Math.max(0, Math.floor((x + this.off) / this.cell)));
    const cy = Math.min(this.dim - 1, Math.max(0, Math.floor((y + this.off) / this.cell)));
    return cy * this.dim + cx;
  }
  add(f: Food) { f.c = this.cellOf(f.x, f.y); this.cells[f.c].push(f); this.value[f.c] += f.v; if (f.drop) this.dropValue[f.c] += f.v; this.count++; }
  remove(f: Food) {
    const arr = this.cells[f.c]; const i = arr.indexOf(f);
    if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); this.value[f.c] -= f.v; if (f.drop) this.dropValue[f.c] -= f.v; this.count--; }
  }
  move(f: Food, x: number, y: number) { const c = this.cellOf(x, y); if (c !== f.c) { this.remove(f); f.x = x; f.y = y; this.add(f); } else { f.x = x; f.y = y; } }
  query(x: number, y: number, rad: number, fn: (f: Food) => void) {
    const c = this.cell, off = this.off;
    const x0 = Math.max(0, Math.floor((x - rad + off) / c)), x1 = Math.min(this.dim - 1, Math.floor((x + rad + off) / c));
    const y0 = Math.max(0, Math.floor((y - rad + off) / c)), y1 = Math.min(this.dim - 1, Math.floor((y + rad + off) / c));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const arr = this.cells[cy * this.dim + cx];
      for (let k = arr.length - 1; k >= 0; k--) fn(arr[k]);
    }
  }
}

// ---------------------------------------------------------------- geometry helpers (spec §8.4)
export function pointInPoly(px: number, py: number, xs: number[], ys: number[], n: number) {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if ((ys[i] > py) !== (ys[j] > py) && px < ((xs[j] - xs[i]) * (py - ys[i])) / (ys[j] - ys[i] + 1e-9) + xs[i]) inside = !inside;
  }
  return inside;
}

/** Is (x,y) enclosed by a loop of snake s's body? (spec §3.8 围住) */
export function enclosedBy(s: Snake, x: number, y: number) {
  const buf: number[] = []; s.samples(buf);
  const n = buf.length / 3; if (n < 10) return false;
  const xs = [s.x], ys = [s.y];
  for (let i = 0; i < n; i++) { xs.push(buf[i * 3]); ys.push(buf[i * 3 + 1]); }
  const r = s.r, close = 3.5 * r;
  for (let j = 8; j < xs.length; j++) {
    if (Math.hypot(xs[j] - xs[0], ys[j] - ys[0]) < close) {
      if (pointInPoly(x, y, xs, ys, j + 1)) return true;
    }
  }
  const m = xs.length - 1;
  if (m > 10 && Math.hypot(xs[m] - xs[0], ys[m] - ys[0]) < close && pointInPoly(x, y, xs, ys, m + 1)) return true;
  return false;
}
