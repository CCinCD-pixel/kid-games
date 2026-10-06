/**
 * 随机新仓库 generator (spec §3.9, §4.8): reverse pull + forward verification + rejection rules.
 *
 *   generatePuzzle(tier, seed, rooms, { colors, avoid }) → GeneratedLevel (ok) | GeneratedFail
 *
 * Pipeline per candidate (≤ 60 per call): a room template → pillars (`x`) become walls with p = pFurn,
 * 50 % left–right / 50 % up–down flips → pads (template `o` cells first) with every crate on its pad
 * (the solved state) → an exact reverse BFS over pulls from every robot region (≤ 150 000 states)
 * → a start state at pull distance in the tier's push range with every crate off its pad → the
 * robot start (template `p` cells first, never on a pad) → the forward full graph (≤ 150 000
 * states): exact optimum and the reference line → rejection rules R1–R10 → the lesson tag.
 *
 * Deterministic: only seeded randomness (`createRng(seed)` = mulberry32, the prototype's rng) and
 * counted budgets — never the clock — so one seed gives the same warehouse in Node and on the iPad.
 * The generator runs in the Worker; the page only adds a wall-clock timeout (fallback pool).
 */
import { createRng } from '@kit/rng';
import { detectDeadlock } from './deadlock';
import { canonicalHash, nb, parseLevel } from './level';
import { greedy, sequential, switchesOf } from './plan';
import { applyPush, boxMap, canon, legalPushes, walkDist } from './rules';
import { lurdForPush } from './solver';
import { StateGraph } from './stategraph';
import type { DeadType, Level, State } from './types';

export type Tier = 1 | 2 | 3 | 4;
export type RoomSet = Record<string, readonly string[]>;

export interface TierSpec {
  name: string;
  boxes: number[];
  colors: number[];
  push: [number, number];
  rooms: string[];
  pFurn: number;
  needInsight: boolean;
  minTrap: number;
}

/** Tier table (spec §4.8; push ranges as measured). Tier 4 (特大货单) is v2 content but supported. */
export const TIERS: Record<Tier, TierSpec> = {
  1: { name: '小货单', boxes: [2], colors: [0], push: [5, 10], rooms: ['s1', 's2', 's3', 's4'], pFurn: 0.5, needInsight: false, minTrap: 0 },
  2: { name: '中货单', boxes: [2], colors: [0, 0, 2], push: [8, 14], rooms: ['s1', 's2', 's3', 's4', 'm1', 'm3'], pFurn: 0.5, needInsight: true, minTrap: 1 },
  3: { name: '大货单', boxes: [3], colors: [0, 0, 2], push: [10, 20], rooms: ['m1', 'm2', 'm3', 'm4', 'l2'], pFurn: 0.5, needInsight: true, minTrap: 1 },
  4: { name: '特大货单', boxes: [3, 4], colors: [0, 2], push: [16, 30], rooms: ['l1', 'l2', 'l3', 'l4', 'm2', 'm4'], pFurn: 0.45, needInsight: true, minTrap: 1 },
};

/** Counted budgets (spec §3.9): never a clock inside the generator. */
export const GEN_BUDGET = { candidates: 60, reverseStates: 150000, forwardStates: 150000, sequentialStates: 120000, hintStates: 50000 } as const;

export type LessonKey = 'park' | 'order' | 'color' | 'pair' | 'corner' | 'wall' | 'plan';
/** lesson key → narration line (spec §4.8 step 8) */
export const LESSON_LINES: Record<LessonKey, string> = {
  park: 'sok.rnd.park', order: 'sok.rnd.order', color: 'sok.rnd.color', pair: 'sok.rnd.pair', corner: 'sok.rnd.corner', wall: 'sok.rnd.wall', plan: 'sok.rnd.plan',
};

export interface GenStats {
  tries: number;
  rej: Record<string, number>;
}

export interface GeneratedLevel {
  ok: true;
  tier: Tier;
  seed: number;
  rows: string[];
  room: string;
  pushes: number;
  moves: number;
  /** push-optimal reference line (LURD) */
  lurd: string;
  lesson: LessonKey;
  hash: number;
  states: number;
  trapFirst: number;
  stats: GenStats;
}

export interface GeneratedFail {
  ok: false;
  tier: Tier;
  seed: number;
  stats: GenStats;
}

export interface GenOptions {
  /** v1: false — colours are taught in chapter 5 (v2) */
  colors?: boolean;
  /** canonical hashes to avoid (recently played + every fixed v1 level) */
  avoid?: ReadonlySet<number>;
}

type Rand = () => number;

/** Sort each colour group in place (the canonical crate order). */
function canonInPlace(l: Level, b: Uint16Array): void {
  for (const [s, e] of l.groups) if (e - s > 1) b.subarray(s, e).sort();
}

// ------------------------------------------------------------------ room + pads + reverse pulls

function makeRoom(rng: Rand, template: readonly string[], pFurn: number): string[] {
  let rows = template.map((r) => r.replace(/x/g, () => (rng() < pFurn ? '#' : '-')));
  if (rng() < 0.5) rows = rows.map((r) => r.split('').reverse().join(''));
  if (rng() < 0.5) rows = rows.slice().reverse();
  return rows;
}

interface RevState {
  player: number;
  boxes: Uint16Array;
  d: number;
}

/**
 * Exact reverse BFS over pulls from every robot region of the solved state (prototype reverseBFS,
 * same visiting order and results). Scratch buffers instead of per-step allocations: this BFS is
 * most of the generator's time (a candidate that is "too short" explores it to the end).
 */
export function reverseBFS(l: Level, solved: Uint16Array, maxStates: number): RevState[] {
  const N = l.N;
  const K = solved.length;
  const seen = new Set<string>();
  const q: RevState[] = [];
  const bm = new Int16Array(N).fill(-1);
  const mark = new Int32Array(N);
  const queue = new Int32Array(N);
  let stamp = 0;
  /** flood from `from` (crates in bm are walls); marks reachable cells with the new stamp; returns the smallest cell */
  const flood = (from: number): number => {
    stamp += 1;
    let h = 0;
    let t = 0;
    queue[t++] = from;
    mark[from] = stamp;
    let min = from;
    while (h < t) {
      const p = queue[h++];
      if (p < min) min = p;
      for (let d = 0; d < 4; d += 1) {
        const y = nb(l, p, d);
        if (y < 0 || !l.floor[y] || bm[y] >= 0 || mark[y] === stamp) continue;
        mark[y] = stamp;
        queue[t++] = y;
      }
    }
    return min;
  };
  const keyOf = (p: number, b: ArrayLike<number>) => {
    let k = String.fromCharCode(p);
    for (let i = 0; i < b.length; i += 1) k += String.fromCharCode(b[i]);
    return k;
  };
  for (let s = 0; s < K; s += 1) bm[solved[s]] = s;
  const regionDone = new Uint8Array(N);
  for (let p = 0; p < N; p += 1) {
    if (!l.floor[p] || bm[p] >= 0 || regionDone[p]) continue;
    const np = flood(p);
    for (let i = 0; i < N; i += 1) if (mark[i] === stamp) regionDone[i] = 1;
    seen.add(keyOf(np, solved));
    q.push({ player: np, boxes: solved, d: 0 });
  }
  for (let s = 0; s < K; s += 1) bm[solved[s]] = -1;
  const reach = new Int32Array(N);
  const nbx = new Uint16Array(K);
  for (let h = 0; h < q.length && seen.size < maxStates; h += 1) {
    const st = q[h];
    for (let s = 0; s < K; s += 1) bm[st.boxes[s]] = s;
    flood(st.player);
    const here = stamp;
    reach.set(mark);
    for (let s = 0; s < K; s += 1) {
      const b = st.boxes[s];
      for (let d = 0; d < 4; d += 1) {
        const p1 = nb(l, b, d); // the robot stands here and pulls the crate toward d
        const p2 = p1 >= 0 ? nb(l, p1, d) : -1;
        if (p1 < 0 || p2 < 0 || reach[p1] !== here || !l.floor[p2] || bm[p2] >= 0) continue;
        nbx.set(st.boxes);
        nbx[s] = p1;
        canonInPlace(l, nbx);
        // the successor's robot region: crate s moved b → p1, robot at p2
        bm[b] = -1;
        bm[p1] = s;
        const np = flood(p2);
        bm[p1] = -1;
        bm[b] = s;
        const k = keyOf(np, nbx);
        if (seen.has(k)) continue;
        seen.add(k);
        q.push({ player: np, boxes: nbx.slice(), d: st.d + 1 });
      }
    }
    for (let s = 0; s < K; s += 1) bm[st.boxes[s]] = -1;
  }
  return q;
}

function toRows(l: Level, player: number, boxes: ArrayLike<number>): string[] {
  const out: string[] = [];
  const bm = boxMap(l, boxes);
  for (let r = 0; r < l.H; r += 1) {
    let s = '';
    for (let c = 0; c < l.W; c += 1) {
      const i = r * l.W + c;
      if (l.wall[i] || !l.floor[i]) {
        s += l.wall[i] ? '#' : ' ';
        continue;
      }
      const g0 = l.goal[i];
      const b = bm[i];
      const bc = b >= 0 ? l.colorOf[b] : -1;
      if (i === player) s += g0 === 0 ? '+' : '@';
      else if (b >= 0) s += bc === 0 ? (g0 === 0 ? '*' : '$') : String.fromCharCode(64 + bc);
      else if (g0 >= 0) s += g0 === 0 ? '.' : String.fromCharCode(96 + g0);
      else s += '-';
    }
    out.push(s);
  }
  return out;
}

/** One candidate (prototype generateOne with choose = 'range', allOff = true). */
function generateOne(rng: Rand, o: { room: readonly string[]; boxes: number; colors: number; colorPlan: number[] | null; minPush: number; maxPush: number; pFurn: number; budget: number }): { rows: string[]; d: number } | { reject: string } {
  const shape = makeRoom(rng, o.room, o.pFurn);
  const cells: [number, number][] = [];
  const padCand: [number, number][] = [];
  const fixed: [number, number, string][] = [];
  shape.forEach((r, i) => [...r].forEach((ch, j) => {
    if (ch === '-' || ch === 'p') cells.push([i, j]);
    else if (ch === 'o') padCand.push([i, j]);
    else if (ch === '.' || /[a-d]/.test(ch)) fixed.push([i, j, ch]);
  }));
  const pick = <T>(arr: T[]): T => arr.splice((rng() * arr.length) | 0, 1)[0];
  const grid = shape.map((r) => r.replace(/[op]/g, '-').split(''));
  const pZone = new Set<string>();
  shape.forEach((r, i) => [...r].forEach((ch, j) => {
    if (ch === 'p') pZone.add(`${i},${j}`);
  }));
  const pads: [number, number, number][] = fixed.map(([i, j, ch]) => [i, j, ch === '.' ? 0 : ch.charCodeAt(0) - 96]);
  while (pads.length < o.boxes) {
    const c = padCand.length ? pick(padCand) : pick(cells);
    if (!c) return { reject: 'room too small' };
    const k = pads.length;
    pads.push([c[0], c[1], o.colorPlan ? o.colorPlan[k] : o.colors ? 1 + (k % o.colors) : 0]);
  }
  for (const c of padCand) cells.push(c);
  const free = cells.filter(([i, j]) => !pads.some(([a, b]) => a === i && b === j));
  if (!free.length) return { reject: 'no free cell' };
  const pl = pick(free);
  for (const [i, j, k] of pads) grid[i][j] = k ? String(k) : '*';
  grid[pl[0]][pl[1]] = '@';
  let l: Level;
  try {
    l = parseLevel(grid.map((r) => r.join('')));
  } catch (e) {
    return { reject: `parse: ${(e as Error).message}` };
  }
  const states = reverseBFS(l, l.start.boxes, o.budget);
  let maxD = 0;
  for (const s of states) if (s.d > maxD) maxD = s.d;
  if (maxD < o.minPush) return { reject: 'too short' };
  const cands = states.filter((s) => {
    if (s.d < o.minPush || s.d > o.maxPush) return false;
    for (let k = 0; k < s.boxes.length; k += 1) if (l.goal[s.boxes[k]] >= 0) return false;
    return true;
  });
  if (!cands.length) return { reject: 'no all-off state' };
  const st = cands[(rng() * cands.length) | 0];
  const dist = walkDist(l, boxMap(l, st.boxes), st.player);
  const region: number[] = [];
  for (let i = 0; i < l.N; i += 1) if (dist[i] >= 0) region.push(i);
  const zone = region.filter((i) => pZone.has(`${(i / l.W) | 0},${i % l.W}`) && l.goal[i] < 0);
  const nonPad = region.filter((i) => l.goal[i] < 0);
  if (!nonPad.length) return { reject: 'player-pocket-on-pad' };
  const ps = zone.length ? zone[(rng() * zone.length) | 0] : nonPad[0];
  return { rows: toRows(l, ps, st.boxes), d: st.d };
}

// ------------------------------------------------------------------ forward verification

interface Probe {
  l: Level;
  g: StateGraph;
  pushes: number;
  moves: number;
  lurd: string;
  trapFirst: number;
  trapTypes: Set<DeadType>;
  states: number;
}

/** Push-optimal line read off the graph: togo descent, shortest walk first (legalPushes order on ties). */
function referenceLine(l: Level, g: StateGraph): { lurd: string; pushes: number; moves: number } | null {
  let s: State = { player: l.start.player, boxes: canon(l, l.start.boxes) };
  let lurd = '';
  for (let guard = 0; guard < 200; guard += 1) {
    const cur = g.togo(s);
    if (cur === 0) return { lurd, pushes: [...lurd].filter((c) => c !== c.toLowerCase()).length, moves: lurd.length };
    if (cur < 0) return null;
    const { pushes } = legalPushes(l, s);
    let best: (typeof pushes)[number] | null = null;
    let bestBoxes: Uint16Array | null = null;
    for (const p of pushes) {
      const nbx = applyPush(l, s.boxes, p);
      if (g.togo({ player: p.from, boxes: nbx }) === cur - 1 && (!best || p.walk < best.walk)) {
        best = p;
        bestBoxes = nbx;
      }
    }
    if (!best || !bestBoxes) return null;
    const step = lurdForPush(l, s, best);
    if (!step) return null;
    lurd += step;
    s = { player: best.from, boxes: bestBoxes };
  }
  return null;
}

/** Forward verification with the full graph (the cheap facts; the plan probes run only when needed). */
function probe(rows: string[]): Probe | { reject: string } {
  const l = parseLevel(rows);
  const g = StateGraph.buildSync(l, { maxStates: GEN_BUDGET.forwardStates, maxMs: Number.POSITIVE_INFINITY });
  if (!g || g.startTogo < 0) return { reject: 'R1-unsolvable' };
  const ref = referenceLine(l, g);
  if (!ref) return { reject: 'R1-unsolvable' };
  const start: State = { player: l.start.player, boxes: canon(l, l.start.boxes) };
  const trapTypes = new Set<DeadType>();
  let trapFirst = 0;
  for (const p of legalPushes(l, start).pushes) {
    const nbx = applyPush(l, start.boxes, p);
    if (g.togo({ player: p.from, boxes: nbx }) < 0) trapFirst += 1;
    const d = detectDeadlock(l, nbx);
    if (d) trapTypes.add(d.type);
  }
  return { l, g, pushes: ref.pushes, moves: ref.moves, lurd: ref.lurd, trapFirst, trapTypes, states: g.size };
}

/** "这关教什么" by structure (spec §4.8 step 8). */
export function lessonOf(a: { seqOK: boolean; seqFirsts: number; colored: boolean }, trapTypes: ReadonlySet<DeadType>): LessonKey {
  if (!a.seqOK) return 'park';
  if (a.seqFirsts === 1) return 'order';
  if (a.colored) return 'color';
  if (trapTypes.has('pair')) return 'pair';
  if (trapTypes.has('corner')) return 'corner';
  if (trapTypes.has('wall')) return 'wall';
  return 'plan';
}

/** Some crate starts nearer (Manhattan) to a pad of another colour (R10, v2). */
function hasColorDecoy(l: Level): boolean {
  for (let s = 0; s < l.nBoxes; s += 1) {
    const p = l.start.boxes[s];
    let best = 1e9;
    let bestCol = -1;
    for (let i = 0; i < l.N; i += 1) {
      if (l.goal[i] < 0) continue;
      const d = Math.abs(((p / l.W) | 0) - ((i / l.W) | 0)) + Math.abs((p % l.W) - (i % l.W));
      if (d < best) {
        best = d;
        bestCol = l.goal[i];
      }
    }
    if (bestCol !== l.colorOf[s]) return true;
  }
  return false;
}

/** Interior wall share (R7: ≤ 30 %). */
function cluttered(rows: string[]): boolean {
  const interior = rows.slice(1, -1).map((r) => r.slice(1, -1)).join('');
  const walls = [...interior].filter((c) => c === '#').length;
  return walls > 0.3 * interior.replace(/ /g, '').length;
}

export function generatePuzzle(tier: Tier, seed: number, rooms: RoomSet, o: GenOptions = {}): GeneratedLevel | GeneratedFail {
  const T = TIERS[tier];
  const rng = createRng(seed >>> 0).next;
  const avoid = o.avoid ?? new Set<number>();
  const stats: GenStats = { tries: 0, rej: {} };
  const rej = (k: string) => {
    stats.rej[k] = (stats.rej[k] ?? 0) + 1;
  };
  for (let t = 0; t < GEN_BUDGET.candidates; t += 1) {
    stats.tries += 1;
    const roomId = T.rooms[(rng() * T.rooms.length) | 0];
    const boxes = T.boxes[(rng() * T.boxes.length) | 0];
    // the colour draw always consumes the rng (same stream with colours on or off)
    const drawn = T.colors[(rng() * T.colors.length) | 0];
    const colors = o.colors ? drawn : 0;
    const colorPlan = colors ? Array.from({ length: boxes }, (_, k) => 1 + (k % colors)) : null;
    const room = rooms[roomId];
    if (!room) {
      rej('R0-room');
      continue;
    }
    const g = generateOne(rng, { room, boxes, colors, colorPlan, minPush: T.push[0], maxPush: T.push[1], pFurn: T.pFurn, budget: GEN_BUDGET.reverseStates });
    if ('reject' in g) {
      rej(`R0-${g.reject.split(':')[0]}`);
      continue;
    }
    const a = probe(g.rows);
    if ('reject' in a) {
      rej(a.reject);
      continue;
    }
    if (a.pushes < T.push[0] || a.pushes > T.push[1]) {
      rej('R1-range');
      continue;
    }
    if (detectDeadlock(a.l, canon(a.l, a.l.start.boxes))) {
      rej('R2-deadstart');
      continue;
    }
    if (a.trapFirst < T.minTrap) {
      rej('R4-notension');
      continue;
    }
    if (a.moves > 3 * a.pushes + 12) {
      rej('R5-walky');
      continue;
    }
    if (cluttered(g.rows)) {
      rej('R7-cluttered');
      continue;
    }
    const hash = canonicalHash(g.rows);
    if (avoid.has(hash)) {
      rej('R8-repeat');
      continue;
    }
    if (a.states > GEN_BUDGET.hintStates) {
      rej('R9-hintbudget');
      continue;
    }
    if (colors && !hasColorDecoy(a.l)) {
      rej('R10-nodecoy');
      continue;
    }
    // the plan probes (the expensive part) only for a candidate that passed everything else
    const sq = sequential(a.l, { maxStates: GEN_BUDGET.sequentialStates });
    const seqFirsts = sq.firsts.length;
    const seqOK = seqFirsts > 0;
    if (T.needInsight && seqOK && seqFirsts !== 1 && greedy(a.l, null) === 'solved') {
      rej('R3-noinsight');
      continue;
    }
    const lesson = lessonOf({ seqOK, seqFirsts, colored: a.l.colored }, a.trapTypes);
    return { ok: true, tier, seed, rows: g.rows, room: roomId, pushes: a.pushes, moves: a.moves, lurd: a.lurd, lesson, hash, states: a.states, trapFirst: a.trapFirst, stats };
  }
  return { ok: false, tier, seed, stats };
}

/** Switches/turns of a generated line (tools, reports). */
export function lineShape(rows: string[], lurd: string): { switches: number; turns: number } {
  return switchesOf(parseLevel(rows), lurd);
}
