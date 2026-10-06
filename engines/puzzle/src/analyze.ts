/**
 * Validator / tooling analysis (never bundled into the page): the prototype's analyze.mjs, eval.mjs
 * and fixtures.mjs on the production engine — sequential (no-parking) solver, greedy bot, depth
 * scan, switches/turns, risk, difficulty D, the parity digest and the kid models (./kid: k1/k3, cb, L1).
 */
import { detectDeadlock } from './deadlock';
import { fnv1a32 } from './fnv';
import { nb, parseLevel } from './level';
import { greedy, sequential, switchesOf } from './plan';
import { applyPush, boxMap, canon, legalPushes, minReach, replayLurd, walkDist } from './rules';
import { solveOptimal } from './solver';
import { StateGraph } from './stategraph';
import { DIR_CH, type DeadType, type Level, type State } from './types';

export { greedy, sequential, switchesOf } from './plan';
export { kidAttempt, kidColorBlind, kidRates, learnerAttempt, learnerRate, manhattanToPads, mulberry32, type KidDistances, type Rng } from './kid';

export function exploreGraph(l: Level, maxStates = 400000): StateGraph | null {
  return StateGraph.buildSync(l, { maxStates, maxMs: Number.POSITIVE_INFINITY, keepEdges: true });
}

/** States before each push of a LURD line. */
export function replayStates(l: Level, lurd: string): State[] {
  const out: State[] = [];
  let player = l.start.player;
  const boxes = Array.from(l.start.boxes);
  for (const ch of lurd) {
    const k = DIR_CH.indexOf(ch.toLowerCase());
    const y = nb(l, player, k);
    const s = boxes.indexOf(y);
    if (s >= 0 && ch === ch.toUpperCase()) {
      out.push({ player, boxes: canon(l, boxes) });
      boxes[s] = nb(l, y, k);
    }
    player = y;
  }
  return out;
}

export function depthScan(l: Level, g: StateGraph): { first: Record<DeadType, number | null>; invis: number | null } {
  const first: Record<DeadType, number | null> = { corner: null, wall: null, pair: null, square: null };
  let invis: number | null = null;
  let frontier = [g.startIndex];
  const seen = new Set(frontier);
  for (let d = 0; frontier.length; d += 1) {
    for (const i of frontier) {
      const t = detectDeadlock(l, g.stateAt(i).boxes);
      if (t) {
        if (first[t.type] === null) first[t.type] = d;
      } else if (g.togoAt(i) < 0 && invis === null) invis = d;
    }
    const next: number[] = [];
    for (const i of frontier) for (const j of g.successors(i)) if (!seen.has(j)) {
      seen.add(j);
      next.push(j);
    }
    frontier = next;
  }
  return { first, invis };
}

/** Some state within `depth` pushes of the start satisfies pred. */
export function within(g: StateGraph, depth: number, pred: (index: number) => boolean): boolean {
  let frontier = [g.startIndex];
  const seen = new Set(frontier);
  for (let d = 0; d <= depth; d += 1) {
    for (const i of frontier) if (pred(i)) return true;
    const next: number[] = [];
    for (const i of frontier) for (const j of g.successors(i)) if (!seen.has(j)) {
      seen.add(j);
      next.push(j);
    }
    frontier = next;
  }
  return false;
}

export interface LevelAnalysis {
  level: Level;
  graph: StateGraph;
  solvable: boolean;
  truncated: boolean;
  W: number;
  H: number;
  boxes: number;
  pushes: number;
  movesAtOptPush: number;
  lurd: string;
  replayOk: boolean;
  states: number;
  trapFirst: number;
  firstPushes: number;
  risk: number;
  falsePos: number;
  seqFirsts: number[];
  seqOK: boolean;
  greedy: string;
  switches: number;
  turns: number;
  D: number;
}

/** Difficulty score D (spec §4.2): pushes + 4·switches + 1.5·turns + 25·risk + 6·log10(states). */
export function difficulty(a: { pushes: number; switches: number; turns: number; risk: number; states: number }): number {
  return +(a.pushes + 4 * a.switches + 1.5 * a.turns + 25 * a.risk + 6 * Math.log10(Math.max(10, a.states))).toFixed(1);
}

/** Full per-level analysis (the prototype analyze() minus the kid models). */
export function analyzeLevel(rows: readonly string[], o: { maxStates?: number; exactMaxStates?: number } = {}): LevelAnalysis | null {
  const l = parseLevel(rows);
  const g = exploreGraph(l, o.maxStates ?? 400000);
  if (!g) return null;
  const opt = solveOptimal(l, 'push', { maxStates: o.exactMaxStates ?? 600000 });
  const base = { level: l, graph: g, truncated: false, W: l.W, H: l.H, boxes: l.nBoxes, states: g.n };
  if (!opt) {
    return { ...base, solvable: false, pushes: 0, movesAtOptPush: 0, lurd: '', replayOk: false, trapFirst: 0, firstPushes: 0, risk: 0, falsePos: 0, seqFirsts: [], seqOK: false, greedy: 'stuck', switches: 0, turns: 0, D: 0 };
  }
  const rp = replayLurd(l, opt.lurd);
  const firstIds = Array.from(g.successors(g.startIndex));
  const trapFirst = firstIds.filter((j) => g.togoAt(j) < 0).length;
  let risk = 0;
  let riskN = 0;
  for (const st of replayStates(l, opt.lurd)) {
    const { pushes } = legalPushes(l, st);
    if (!pushes.length) continue;
    let bad = 0;
    for (const pu of pushes) if (g.togo({ player: pu.from, boxes: applyPush(l, st.boxes, pu) }) < 0) bad += 1;
    risk += bad / pushes.length;
    riskN += 1;
  }
  let falsePos = 0;
  for (let i = 0; i < g.n; i += 1) if (detectDeadlock(l, g.stateAt(i).boxes) && g.togoAt(i) >= 0) falsePos += 1;
  const sq = sequential(l);
  const gr = greedy(l, g);
  const { switches, turns } = switchesOf(l, opt.lurd);
  const a = {
    ...base, solvable: true, pushes: opt.pushes, movesAtOptPush: opt.moves, lurd: opt.lurd,
    replayOk: rp.ok && rp.solved && rp.pushes === opt.pushes, trapFirst, firstPushes: firstIds.length,
    risk: riskN ? risk / riskN : 0, falsePos, seqFirsts: sq.firsts, seqOK: sq.firsts.length > 0, greedy: gr, switches, turns, D: 0,
  };
  a.D = difficulty(a);
  return a;
}

// ---------------------------------------------------------------- parity digest (fixtures)

export interface LevelDigest {
  states: number;
  truncated: boolean;
  startTogo: number;
  dead: number;
  flagged: Record<DeadType, number>;
  digest: number;
}

/** Same digest as the prototype fixtures.mjs (spec §8.10). */
export function levelDigest(rows: readonly string[], maxStates = 400000): LevelDigest {
  const l = parseLevel(rows);
  const g = StateGraph.buildSync(l, { maxStates, maxMs: Number.POSITIVE_INFINITY });
  if (!g) return { states: maxStates, truncated: true, startTogo: -1, dead: 0, flagged: { corner: 0, wall: 0, pair: 0, square: 0 }, digest: 0 };
  const lines: string[] = new Array(g.n);
  const flagged: Record<DeadType, number> = { corner: 0, wall: 0, pair: 0, square: 0 };
  let dead = 0;
  for (let i = 0; i < g.n; i += 1) {
    const st = g.stateAt(i);
    const t = detectDeadlock(l, st.boxes);
    if (t) flagged[t.type] += 1;
    const togo = g.togoAt(i);
    if (togo < 0) dead += 1;
    lines[i] = `${st.player},${Array.from(st.boxes).join(',')}:${togo}:${t ? t.type : '-'}`;
  }
  lines.sort();
  return { states: g.n, truncated: false, startTogo: g.startTogo, dead, flagged, digest: fnv1a32(lines.join('\n')) };
}

// ---------------------------------------------------------------- 侦探题 (quiz boards, spec §3.7, Q1–Q6)

/**
 * Exact dead crates of a board (prototype quiz.mjs exactDead): an identity-tracking BFS over every
 * reachable state; a crate is alive when it stands on a pad of its colour in SOME reachable state.
 * Returns the dead crates' start cells, ascending.
 */
export function exactDead(l: Level, maxStates = 300000): number[] {
  const n = l.nBoxes;
  const alive = new Array<boolean>(n).fill(false);
  const start = Array.from(l.start.boxes);
  const seen = new Set<string>();
  const q: { player: number; boxes: number[] }[] = [{ player: l.start.player, boxes: start }];
  for (let h = 0; h < q.length && h < maxStates; h += 1) {
    const st = q[h];
    const bm = boxMap(l, st.boxes);
    const dist = walkDist(l, bm, st.player);
    const np = minReach(dist);
    const k = `${np}:${st.boxes.join(',')}`;
    if (seen.has(k)) continue;
    seen.add(k);
    for (let s = 0; s < n; s += 1) if (l.goal[st.boxes[s]] === l.colorOf[s]) alive[s] = true;
    for (let s = 0; s < n; s += 1) {
      const p = st.boxes[s];
      for (let d = 0; d < 4; d += 1) {
        const from = nb(l, p, [1, 0, 3, 2][d]);
        const to = nb(l, p, d);
        if (from < 0 || to < 0 || dist[from] < 0 || !l.floor[to] || bm[to] >= 0) continue;
        const b = st.boxes.slice();
        b[s] = to;
        q.push({ player: p, boxes: b });
      }
    }
  }
  return alive.map((a, s) => (a ? -1 : l.start.boxes[s])).filter((x) => x >= 0).sort((a, b) => a - b);
}
