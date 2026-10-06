/**
 * Puzzle solver (spec §3.9, §4.2): AND-OR iterative deepening with a shared transposition table and a
 * node budget; `distToWin`, `optimalMoves`, `solve`, single-agent `staticDist`. Port of the reference
 * `solver.mjs` — the same move order and the same results, so reply books rebuilt by the TS code are
 * byte-identical with the canonical ones (tools/military-chess/books.heavy.test.ts).
 *
 * The page never searches (R9.4): it reads reply books / optimal-continuation trees. These functions
 * run in validators and tools.
 */
import { apply } from './rules';
import { isPass, type Action, type Move } from './movegen';
import { toNote } from './notation';
import { FLAG } from './pieces';
import type { GameState } from './state';
import {
  PASS, blueFlagPos, blueReplies, buildPuzzleState, failed, frameOf, goalReached, posKey, redMoves, relIdx, roadDistFrom, VALS,
  type PuzzleDef,
} from './puzzle';

export const budget = { nodes: 0, limit: Infinity };
export class BudgetError extends Error {
  constructor() {
    super('budget');
  }
}
export type Memo = Map<string, boolean>;

/**
 * RED move order (solver efficiency + hint choice): flag capture > other captures (by victim value) >
 * moves ending closer to the BLUE flag > flag-relative index. Mirror-symmetric.
 */
export function orderRed(s: GameState, ms: Move[], flip: number = frameOf(s)): Move[] {
  const f = blueFlagPos(s);
  const df = f >= 0 ? roadDistFrom(f) : null;
  const sc = (m: Move): number => {
    let v = 0;
    if (m.kind === 'attack') {
      const t = s.ptype[s.board[m.to]];
      v = t === FLAG ? 1e6 : 1e5 + VALS[t] * 100;
    }
    if (df) v -= df[m.to] * 1000;
    return v - (relIdx(m.from, flip) * 60 + relIdx(m.to, flip)) / 4000;
  };
  return ms.map((m) => [sc(m), m] as const).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

/** can RED force the goal within n RED moves? (AND-OR, memo shared by the caller) */
export function forcedWin(pz: PuzzleDef, s0: GameState, s: GameState, n: number, memo: Memo = new Map()): boolean {
  const k = posKey(s) + '|' + n;
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  if (++budget.nodes > budget.limit) throw new BudgetError();
  let res = false;
  if (n > 0 && !s.result) {
    for (const m of orderRed(s, redMoves(s))) {
      const a = apply(s, m).state;
      if (failed(pz, s0, a)) continue;
      if (pz.goal.kind !== 'survive' && goalReached(pz, s0, a, false)) {
        res = true;
        break;
      }
      if (a.result) continue;
      let all = true;
      for (const b of blueReplies(a)) {
        const bb = apply(a, b).state;
        if (failed(pz, s0, bb)) {
          all = false;
          break;
        }
        if (pz.goal.kind !== 'survive' && goalReached(pz, s0, bb, true)) continue;
        if (!forcedWin(pz, s0, bb, n - 1, memo)) {
          all = false;
          break;
        }
      }
      if (all) {
        res = true;
        break;
      }
    }
  }
  memo.set(k, res);
  return res;
}

/** smallest n ≤ cap with a forced win from a RED-to-move state; cap + 1 when none */
export function distToWin(pz: PuzzleDef, s0: GameState, s: GameState, cap: number, memo?: Memo): number {
  if (failed(pz, s0, s)) return cap + 1;
  for (let n = 1; n <= cap; n++) if (forcedWin(pz, s0, s, n, memo)) return n;
  return cap + 1;
}

/** survive puzzles: RED moves after which every BLUE reply leaves the guard / flag intact (1 round) */
export function surviveMoves(pz: PuzzleDef, s0: GameState, s: GameState): Move[] {
  const good: Move[] = [];
  for (const m of redMoves(s)) {
    const a = apply(s, m).state;
    if (failed(pz, s0, a)) continue;
    let ok = true;
    for (const b of blueReplies(a)) {
      const bb = apply(a, b).state;
      if (failed(pz, s0, bb)) {
        ok = false;
        break;
      }
    }
    if (ok) good.push(m);
  }
  return good;
}

/** optimal RED moves (each forces the goal within n) from a RED-to-move state, hint order */
export function optimalMoves(pz: PuzzleDef, s0: GameState, s: GameState, n: number, memo?: Memo): Move[] {
  const out: Move[] = [];
  for (const m of orderRed(s, redMoves(s))) {
    const a = apply(s, m).state;
    if (failed(pz, s0, a)) continue;
    let ok = goalReached(pz, s0, a, false);
    if (!ok && !a.result) {
      ok = blueReplies(a).every((b) => {
        const bb = apply(a, b).state;
        return !failed(pz, s0, bb) && (goalReached(pz, s0, bb, true) || forcedWin(pz, s0, bb, n - 1, memo));
      });
    }
    if (ok) out.push(m);
  }
  return out;
}

export const note = (m: Action): string => toNote(m);

export interface Solution {
  par: number | null;
  firstMoves: string[];
  total: number;
}
/** minimal number of RED moves to force the goal (≤ maxN), plus the optimal first moves (hint order) */
export function solve(pz: PuzzleDef, maxN = 6, memo: Memo = new Map()): Solution {
  const s0 = buildPuzzleState(pz);
  if (pz.goal.kind === 'survive') {
    const good = surviveMoves(pz, s0, s0);
    return { par: good.length ? 1 : null, firstMoves: orderRed(s0, good).map(note), total: redMoves(s0).length };
  }
  for (let n = 1; n <= maxN; n++) {
    if (forcedWin(pz, s0, s0, n, memo)) return { par: n, firstMoves: optimalMoves(pz, s0, s0, n, memo).map(note), total: redMoves(s0).length };
  }
  return { par: null, firstMoves: [], total: redMoves(s0).length };
}

/**
 * Static puzzles (BLUE never moves): single-agent shortest path over RED moves (BFS, depth ≤ limit).
 * Tools only (heavy soundness check of staticHopeless); the page uses the precomputed `opt` tree.
 */
export function staticDist(pz: PuzzleDef, s0: GameState, s: GameState, limit: number): { dist: number; first: Move[] } {
  if (goalReached(pz, s0, s, true)) return { dist: 0, first: [] };
  const seen = new Set([posKey(s)]);
  let frontier: Array<[GameState, Move | null]> = [[s, null]];
  for (let d = 1; d <= limit; d++) {
    const next: Array<[GameState, Move | null]> = [];
    const firsts: Move[] = [];
    for (const [st, first] of frontier) {
      for (const m of redMoves(st)) {
        const a = apply(st, m).state;
        if (failed(pz, s0, a)) continue;
        const f = first ?? m;
        if (goalReached(pz, s0, a, false)) {
          if (!firsts.includes(f)) firsts.push(f);
          continue;
        }
        if (a.result) continue;
        const b = apply(a, PASS).state;
        const k = posKey(b);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push([b, f]);
      }
    }
    if (firsts.length) return { dist: d, first: orderRed(s, firsts) };
    frontier = next;
    if (!frontier.length) break;
  }
  return { dist: limit + 1, first: [] };
}

export { isPass };
