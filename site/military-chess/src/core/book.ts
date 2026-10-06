/**
 * Reply books for 'best' puzzles (spec §3.9 R9.3): BLUE's reply for every position the child can reach
 * with optimal play plus up to one deviation, the forced-win distance of every RED-to-move node and
 * the optimal RED moves (hint order). The page only looks things up (`lookup`); `buildBook` is for
 * the tools (byte-identical rebuild of the canonical books, heavy test).
 *
 * JSON node: { d: <moves to forced win>, b: [optimal moves, hint order], m: { <red move>: entry } }
 *   entry = 'W'            RED's move itself completes the goal
 *         | 'F'            RED's move itself fails
 *         | [reply, 0]     BLUE's reply; RED can no longer finish within the budget → the puzzle fails
 *         | [reply, node]  BLUE's reply and the next node
 */
import { apply } from './rules';
import { mirrorNote } from './notation';
import type { GameState } from './state';
import { distToWin, optimalMoves, note, type Memo } from './solver';
import { bluePolicy } from './policy';
import { buildPuzzleState, failed, goalReached, posKey, redMoves, type PuzzleDef } from './puzzle';

export interface BookNode {
  d: number;
  b: string[];
  m: Record<string, BookEntry>;
}
export type BookEntry = 'W' | 'F' | [string] | [string, 0 | BookNode];
export interface Book {
  id: string;
  stamp: string;
  budget: 'par+2';
  root: BookNode;
}

export const SLACK = 2;

export function buildBook(pz: PuzzleDef, par: number): { root: BookNode; stats: { entries: number; nodes: number; memo: number } } {
  const s0 = buildPuzzleState(pz);
  const memo: Memo = new Map();
  const total = par + SLACK;
  const cache = new Map<string, BookNode | 0>();
  let entries = 0, nodesN = 0;
  function node(s: GameState, used: number, devs: number): BookNode | 0 {
    const ck = posKey(s) + '|' + used + '|' + devs;
    const hit = cache.get(ck);
    if (hit !== undefined) return hit;
    const remaining = total - used;
    const d = distToWin(pz, s0, s, remaining, memo);
    if (d > remaining) {
      cache.set(ck, 0);
      return 0;
    }
    const best = optimalMoves(pz, s0, s, d, memo);
    const out: BookNode = { d, b: best.map(note), m: {} };
    nodesN++;
    // devs = 0: every RED move gets an entry; devs = 1: only the optimal moves (a second deviation is off-book)
    for (const m of redMoves(s)) {
      const k = note(m);
      if (devs >= 1 && !out.b.includes(k)) continue;
      const a = apply(s, m).state;
      entries++;
      if (failed(pz, s0, a)) {
        out.m[k] = 'F';
        continue;
      }
      if (goalReached(pz, s0, a, false)) {
        out.m[k] = 'W';
        continue;
      }
      if (a.result) {
        out.m[k] = 'F';
        continue;
      }
      const { reply } = bluePolicy(pz, s0, a, remaining - 1, memo);
      const bb = apply(a, reply).state;
      const r = note(reply);
      if (failed(pz, s0, bb)) {
        out.m[k] = [r, 0];
        continue;
      }
      if (goalReached(pz, s0, bb, true)) {
        out.m[k] = 'W';
        continue;
      }
      const isBest = out.b.includes(k);
      out.m[k] = [r, node(bb, used + 1, isBest ? devs : devs + 1)];
    }
    cache.set(ck, out);
    return out;
  }
  const root = node(s0, 0, 0) as BookNode;
  return { root, stats: { entries, nodes: nodesN, memo: memo.size } };
}

/** main line (H3 demo, tests): follow the first optimal move and the book reply */
export function lineFromBook(root: BookNode): string[] {
  const line: string[] = [];
  let n: BookNode | 0 | undefined = root;
  while (n && n.b && n.b.length) {
    const mv: string = n.b[0];
    line.push(mv);
    const e: BookEntry = n.m[mv];
    if (e === 'W' || e === 'F') break;
    line.push(e[0]);
    n = e.length > 1 ? (e[1] as BookNode | 0) : undefined;
  }
  return line;
}

export type Lookup =
  | { kind: 'node'; node: BookNode }
  | { kind: 'end'; end: 'W' | 'F' }
  | { kind: 'fail'; reply: string }
  | { kind: 'reply'; reply: string; node: BookNode | null }
  | { kind: 'off' };

/**
 * Walk the book with the child's RED moves. The last move's entry is returned as 'end' / 'fail' /
 * 'reply' (BLUE's answer and the next node); the earlier ones must be in the book. Mirror twin:
 * `mirror = true` and the twin's own notation (moves are mirrored before lookup, replies after).
 */
export function lookup(root: BookNode, redHistory: readonly string[], mirror = false): Lookup {
  let n: BookNode | null = root;
  for (let i = 0; i < redHistory.length; i++) {
    const mv = mirror ? mirrorNote(redHistory[i]) : redHistory[i];
    if (!n || !n.m) return { kind: 'off' };
    const e: BookEntry | undefined = n.m[mv];
    if (e === undefined) return { kind: 'off' };
    const last = i === redHistory.length - 1;
    if (e === 'W' || e === 'F') return last ? { kind: 'end', end: e } : { kind: 'off' };
    const reply = mirror ? mirrorNote(e[0]) : e[0];
    if (e.length > 1 && e[1] === 0) return last ? { kind: 'fail', reply } : { kind: 'off' };
    const next: BookNode | null = e.length > 1 ? (e[1] as BookNode) : null;
    if (last) return { kind: 'reply', reply, node: next };
    n = next;
  }
  return n ? { kind: 'node', node: n } : { kind: 'off' };
}

/** the current node's optimal moves in the child's notation (twin: mirrored) */
export const bestMoves = (node: BookNode, mirror = false): string[] => (mirror ? node.b.map(mirrorNote) : node.b.slice());

/** mirror a whole book (heavy test: the twin's rebuilt book equals the mirrored book) */
export function mirrorBook(n: BookNode | 0): BookNode | 0 {
  if (n === 0) return 0;
  const m: Record<string, BookEntry> = {};
  for (const [k, e] of Object.entries(n.m)) {
    m[mirrorNote(k)] = typeof e === 'string' ? e : e.length > 1 ? [mirrorNote(e[0]), mirrorBook(e[1] as BookNode | 0)] : [mirrorNote(e[0])];
  }
  return { d: n.d, b: n.b.map(mirrorNote), m };
}
/** order-independent form for comparisons */
export function canonBook(n: BookNode | 0): unknown {
  if (n === 0) return 0;
  return {
    d: n.d,
    b: n.b.slice().sort(),
    m: Object.fromEntries(Object.entries(n.m).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, e]) => [k, typeof e === 'string' ? e : e.length > 1 ? [e[0], canonBook(e[1] as BookNode | 0)] : [e[0]]])),
  };
}
