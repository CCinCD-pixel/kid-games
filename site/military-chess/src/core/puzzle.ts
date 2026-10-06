/**
 * Puzzle model (spec §3.9, R9): 学堂 board items, 翻翻棋 primer boards, 残局. Same goal semantics and
 * failure rule for the page (puzzle controller) and the validators / book builder. Port of the
 * reference `solver.mjs` (puzzle half); RED always moves first and must move; BLUE either passes
 * (`static`) or answers from the reply book (`best`).
 */
import { BLUE, RED, X, Y, adj, idx, parseSq, sq, type Side } from './board';
import { resolve } from './combat';
import { hasAnyAction, isFlip, isPass, legalMoves, pieceCanMove, type Action, type Move } from './movegen';
import { BOMB, ENG, FLAG, MINE, typeFromCode } from './pieces';
import { addPiece, newState, type GameState, type Mode } from './state';

export type GoalKind = 'flag' | 'capture' | 'reach' | 'survive' | 'nomoves';
export interface Goal {
  kind: GoalKind;
  /** capture: squares of the BLUE pieces to remove; reach: target squares */
  targets?: string[];
  /** reach: only the RED piece initially on this square counts */
  piece?: string;
  /** survive: the RED piece (square) or 'flag' that must still stand after BLUE's reply */
  guard?: string;
  rounds?: number;
}

/** puzzle position: { red: { c6: '5' }, blue: { c7: '4', b12: 'F' }, hidden?: squares shown as backs } */
export interface PuzzleDef {
  id?: string;
  mode?: Mode;
  red: Record<string, string>;
  blue: Record<string, string>;
  hidden?: string[];
  flagShown?: boolean;
  goal: Goal;
  blue_moves?: 'static' | 'best';
  par?: number;
}

export function buildPuzzleState(pz: PuzzleDef): GameState {
  const mode: Mode = pz.mode === 'an' ? 'an' : pz.mode === 'fan' ? 'fan' : 'ming';
  const s = newState(mode, { puzzle: pz.blue_moves ?? 'static', quietLimit: 1000, plyCap: 1000 });
  for (const [k, v] of Object.entries(pz.red || {})) addPiece(s, RED, typeFromCode(v), parseSq(k), true);
  for (const [k, v] of Object.entries(pz.blue || {})) addPiece(s, BLUE, typeFromCode(v), parseSq(k), true);
  s.turn = RED;
  if (mode === 'fan') {
    s.colorOf = [RED, BLUE];
    s.toAct = 0;
  }
  // L8-8: the BLUE flag is already public (a view concern only; rules never read flagShown)
  if (pz.flagShown) s.flagShown[BLUE] = true;
  return s;
}

const pidAt0 = (s0: GameState, square: string): number => s0.board[parseSq(square)];
const blueBest = (s: GameState): boolean => s.rules.puzzle === 'best';

export function goalReached(pz: PuzzleDef, s0: GameState, s: GameState, afterBlue: boolean): boolean {
  const g = pz.goal;
  if (s.result && s.result.winner === BLUE) return false;
  if (g.kind === 'flag') {
    if (s.result && s.result.winner === RED) return true;
    // standard rule in 'best' puzzles: BLUE left without any legal move after RED's move = RED wins
    if (blueBest(s) && !afterBlue) return !hasAnyAction(s, BLUE);
    return false;
  }
  if (g.kind === 'capture') return g.targets!.every((t) => !s.palive[pidAt0(s0, t)]);
  if (g.kind === 'reach') {
    const ids: number[] = [];
    if (g.piece) ids.push(pidAt0(s0, g.piece));
    else for (let p = 0; p < s.np; p++) if (s.pside[p] === RED) ids.push(p);
    return ids.some((p) => s.palive[p] && g.targets!.includes(sq(s.ppos[p])));
  }
  if (g.kind === 'nomoves') {
    if (s.result && s.result.winner === RED) return true;
    return !hasAnyAction(s, BLUE);
  }
  return false; // 'survive' is decided by the search directly
}

/** R9.4 ①: RED lost (flag taken / no moves), the guarded piece or the reach piece went down */
export function failed(pz: PuzzleDef, s0: GameState, s: GameState): boolean {
  if (s.result && s.result.winner === BLUE) return true;
  const g = pz.goal;
  if (g.kind === 'survive' && g.guard !== 'flag' && !s.palive[pidAt0(s0, g.guard!)]) return true;
  if (g.kind === 'reach' && g.piece && !s.palive[pidAt0(s0, g.piece)]) return true;
  return false;
}

export function redMoves(s: GameState): Move[] {
  return legalMoves(s).filter((m) => !isPass(m) && !isFlip(m)) as Move[];
}
export const PASS: Action = { pass: true };
export function blueReplies(s: GameState): Action[] {
  if (s.rules.puzzle === 'static') return [PASS];
  const ms = legalMoves(s).filter((m) => !isPass(m) && !isFlip(m));
  return ms.length ? ms : [PASS];
}

export function posKey(s: GameState): string {
  let k = s.turn ? 'b' : 'r';
  for (let p = 0; p < s.np; p++) k += s.palive[p] ? String.fromCharCode(48 + s.ppos[p]) : '~';
  return k;
}

// ---- flag-relative frame: squares are read with x mirrored when the BLUE flag stands on the right
// half, so a puzzle and its mirror twin make identical choices (mirror symmetry of every tie-break)
export function blueFlagPos(s: GameState): number {
  for (let p = 0; p < s.np; p++) if (s.palive[p] && s.pside[p] === BLUE && s.ptype[p] === FLAG) return s.ppos[p];
  return -1;
}
export function frameOf(s0: GameState): 0 | 1 {
  const f = blueFlagPos(s0);
  return f >= 0 && X(f) > 2 ? 1 : 0;
}
export const relIdx = (i: number, flip: number): number => (flip ? idx(4 - X(i), Y(i)) : i);

const DIST = new Map<number, Int8Array>();
/** road distance (any drawn line, pieces ignored) from a station; 99 = unreachable */
export function roadDistFrom(from: number): Int8Array {
  let d = DIST.get(from);
  if (d) return d;
  d = new Int8Array(60).fill(99);
  d[from] = 0;
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    for (const n of adj[c]) if (d[n] === 99) {
      d[n] = d[c] + 1;
      q.push(n);
    }
  }
  DIST.set(from, d);
  return d;
}

/** §8.5 piece values (also the puzzle policy's material term) */
export const VALS: readonly number[] = [0, 10, 30, 14, 6, 9, 13, 18, 25, 35, 50, 70];
export function material(s: GameState): number {
  let v = 0;
  for (let p = 0; p < s.np; p++) if (s.palive[p]) v += (s.pside[p] === BLUE ? 1 : -1) * VALS[s.ptype[p]];
  return v;
}

/** lexicographic comparison of policy keys (larger is better) */
export function cmpKey(x: readonly number[], y: readonly number[]): number {
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

// ---- mirror twin (x → 4 − x): pieces, hidden squares, goal targets / piece / guard (R9.6)
export const mirrorSquare = (q: string): string => 'edcba'['abcde'.indexOf(q[0])] + q.slice(1);
const mirrorMap = (o: Record<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [mirrorSquare(k), v]));
export function mirrorPuzzle<T extends PuzzleDef>(pz: T): T {
  const g: Goal = { ...pz.goal };
  if (g.targets) g.targets = g.targets.map(mirrorSquare);
  if (g.piece) g.piece = mirrorSquare(g.piece);
  if (g.guard && g.guard !== 'flag') g.guard = mirrorSquare(g.guard);
  const out: T = { ...pz, red: mirrorMap(pz.red), blue: mirrorMap(pz.blue), goal: g };
  if (pz.hidden) out.hidden = pz.hidden.map(mirrorSquare);
  return out;
}

/**
 * Static puzzles: cheap, sound "no hope left" rules (R9.4 ④). They ignore move counts, so hopeless ⇒
 * the goal is unreachable for ever (verified by BFS on every 1-/2-move lesson position, heavy test).
 *  capture: a remaining target that no alive mobile RED piece can beat or trade with
 *  flag:    no alive mobile RED piece; or every flag neighbour is a mine/blocked and no engineer or bomb
 *  reach:   the required piece is gone or frozen in a 大本营 (and the target is not that square)
 *  nomoves: a remaining mobile BLUE piece that no alive RED piece can beat or trade with
 */
export function staticHopeless(pz: PuzzleDef, s0: GameState, s: GameState): boolean {
  const red: number[] = [];
  for (let p = 0; p < s.np; p++) if (s.palive[p] && s.pside[p] === RED && pieceCanMove(s, p)) red.push(p);
  const canTake = (q: number): boolean => red.some((p) => {
    const r = resolve(s.ptype[p], s.ptype[q]);
    return r === 'A' || r === 'B' || r === 'F';
  });
  const g = pz.goal;
  if (!red.length) return !goalReached(pz, s0, s, true);
  if (g.kind === 'capture') return g.targets!.some((t) => {
    const q = s0.board[parseSq(t)];
    return !!s.palive[q] && !canTake(q);
  });
  if (g.kind === 'reach') {
    if (!g.piece) return false;
    const q = s0.board[parseSq(g.piece)];
    return !s.palive[q] || (!pieceCanMove(s, q) && !g.targets!.includes(sq(s.ppos[q])));
  }
  /** BLUE's flag can never be taken: none left, or boxed in by mines and nothing can open them */
  const flagShut = (): boolean => {
    let f = -1;
    for (let q = 0; q < s.np; q++) if (s.palive[q] && s.pside[q] === BLUE && s.ptype[q] === FLAG) f = s.ppos[q];
    if (f < 0) return true;
    const open = adj[f].some((n) => {
      const q = s.board[n];
      return q < 0 || s.pside[q] === RED || (s.ptype[q] !== MINE && canTake(q));
    });
    if (open) return false;
    return !red.some((p) => s.ptype[p] === ENG || s.ptype[p] === BOMB);
  };
  if (g.kind === 'nomoves') {
    // a BLUE piece RED can never beat keeps BLUE moving — unless taking the flag ends it first
    for (let q = 0; q < s.np; q++) if (s.palive[q] && s.pside[q] === BLUE && pieceCanMove(s, q) && !canTake(q)) return flagShut();
    return false;
  }
  if (g.kind === 'flag') {
    let f = -1;
    for (let q = 0; q < s.np; q++) if (s.palive[q] && s.pside[q] === BLUE && s.ptype[q] === FLAG) f = s.ppos[q];
    if (f < 0) return false;
    return flagShut();
  }
  return false;
}

export type FailReason = 'flaglost' | 'piece' | 'nomoves' | 'held' | 'budget' | 'hopeless';
/**
 * The one failure function of the page and the validators (R9.4): ① RED lost something essential,
 * ② the book says RED can no longer finish ([reply, 0], passed in as `bookFail`), ③ the move budget
 * is used up, ④ static puzzles: staticHopeless. Returns null while the puzzle is still open.
 */
export function puzzleFailed(pz: PuzzleDef, s0: GameState, s: GameState, redMovesUsed: number, budgetMoves: number, bookFail = false): FailReason | null {
  if (failed(pz, s0, s)) {
    if (s.result && s.result.winner === BLUE) return s.result.reason === 'no-moves' ? 'nomoves' : 'flaglost';
    return 'piece';
  }
  if (bookFail) return 'held';
  if (goalReached(pz, s0, s, true)) return null;
  if (redMovesUsed >= budgetMoves) return 'budget';
  if (pz.blue_moves !== 'best' && staticHopeless(pz, s0, s)) return 'hopeless';
  return null;
}

/** move budget (R9.4): best puzzles par + 2, static puzzles par + 4 */
export const budgetOf = (pz: PuzzleDef): number => (pz.par ?? 1) + (pz.blue_moves === 'best' ? 2 : 4);

export type { Side };
