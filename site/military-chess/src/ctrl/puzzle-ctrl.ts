/**
 * Puzzle controller (spec §8.3, §3.9, §5.1): 学堂 board items and 残局. No search on the device:
 *  - static (BLUE never moves): BLUE passes; hints come from the item's optimal-continuation tree;
 *    failure = R9.4 ①③④ (staticHopeless);
 *  - best (BLUE defends): BLUE's reply, the failure verdict and the hints come from the reply book;
 *    off the book (second deviation) BLUE plays the 1-ply heuristic and only ①③ end the puzzle;
 *  - survive (one round): BLUE's single reply is the policy itself (1 ply, ≈1 ms).
 * Mirror twins (H3) play the mirrored puzzle with the same book (moves mirrored for lookup).
 * The whole puzzle state is the child's move list, so resuming = replaying it (E29).
 */
import { RED } from '../core/board';
import { lookup, type BookNode } from '../core/book';
import { isFlip, isMove, isPass, type Action, type Move } from '../core/movegen';
import { mirrorNote, parseNote, toNote } from '../core/notation';
import { bluePolicy, offBookReply } from '../core/policy';
import {
  PASS, budgetOf, buildPuzzleState, failed, goalReached, mirrorPuzzle, puzzleFailed, staticHopeless,
  type FailReason, type PuzzleDef,
} from '../core/puzzle';
import { apply, type MoveEvent } from '../core/rules';
import type { GameState } from '../core/state';
import type { OptNode } from '../content';

export interface PuzzleSpec extends PuzzleDef {
  id: string;
  par: number;
  first: string[];
  line: string[];
  opt?: OptNode;
  book?: string;
}

export interface PuzzleCtx {
  spec: PuzzleSpec;
  /** the puzzle as played (the mirrored one for a twin) */
  pz: PuzzleDef & { par: number };
  twin: boolean;
  s0: GameState;
  state: GameState;
  /** RED's moves so far, in the played puzzle's notation */
  red: string[];
  /** the position before each RED move (undo) */
  before: GameState[];
  /** RED-to-move tree node for hints (book or opt tree), null when off the tree */
  node: BookNode | OptNode | null;
  /** off the reply book (second deviation) */
  off: boolean;
  /** the last position that was still on the tree (退回去) */
  lastOnTree: number;
  budget: number;
  done: boolean;
  /** the reply book's root (best puzzles) */
  root: BookNode | null;
}

export type StepResult =
  | { kind: 'continue'; red: MoveEvent; reply: MoveEvent | null; afterRed: GameState; after: GameState }
  | { kind: 'done'; red: MoveEvent; reply: MoveEvent | null; afterRed: GameState; after: GameState; noMoves: boolean }
  | { kind: 'fail'; red: MoveEvent; reply: MoveEvent | null; afterRed: GameState; after: GameState; reason: FailReason };

export function startPuzzle(spec: PuzzleSpec, twin: boolean, bookRoot: BookNode | null): PuzzleCtx {
  const pz = (twin ? mirrorPuzzle(spec) : spec) as PuzzleDef & { par: number };
  const s0 = buildPuzzleState(pz);
  const node = spec.blue_moves === 'best' ? bookRoot : spec.opt ?? null;
  return { spec, pz, twin, s0, state: s0, red: [], before: [], node, off: false, lastOnTree: 0, budget: budgetOf(spec), done: false, root: bookRoot };
}

/** the current node's optimal moves in the played puzzle's notation (hint order); [] off the tree */
export function bestNow(c: PuzzleCtx): string[] {
  if (!c.node) return [];
  return c.twin ? c.node.b.map(mirrorNote) : c.node.b.slice();
}

/** a static item's opt tree and the book are built for the ORIGINAL puzzle: map notes for twins */
const toTree = (c: PuzzleCtx, note: string): string => (c.twin ? mirrorNote(note) : note);

/** play RED's move; returns what happened (BLUE's answer included) and the new context */
export function redMove(c0: PuzzleCtx, a: Action): { ctx: PuzzleCtx; step: StepResult } {
  const c: PuzzleCtx = { ...c0, red: [...c0.red, toNote(a)], before: [...c0.before, c0.state] };
  const s = c0.state;
  const r1 = apply(s, a);
  const afterRed = r1.state;
  const used = c.red.length;
  const pz = c.pz;
  const s0 = c.s0;
  const fin = (step: StepResult, node: PuzzleCtx['node'], off = c.off): { ctx: PuzzleCtx; step: StepResult } => {
    const onTree = node !== null;
    const ctx: PuzzleCtx = { ...c, state: step.after, node, off, lastOnTree: onTree ? c.red.length : c.lastOnTree, done: step.kind === 'done' };
    return { ctx, step };
  };
  // RED's own move fails (guarded piece into a mine, last piece gone …)
  if (failed(pz, s0, afterRed)) return fin({ kind: 'fail', red: r1.event, reply: null, afterRed, after: afterRed, reason: afterRed.result?.winner === 1 ? 'flaglost' : 'piece' }, c0.node);
  if (pz.goal.kind !== 'survive' && goalReached(pz, s0, afterRed, false)) {
    return fin({ kind: 'done', red: r1.event, reply: null, afterRed, after: afterRed, noMoves: pz.goal.kind === 'flag' && !afterRed.result }, null);
  }
  if (afterRed.result) return fin({ kind: 'fail', red: r1.event, reply: null, afterRed, after: afterRed, reason: 'nomoves' }, c0.node);

  // ---- static puzzles: BLUE passes
  if (pz.blue_moves !== 'best') {
    const after = apply(afterRed, PASS).state;
    const nextNode = c0.node && c0.node.m[toTree(c, toNote(a))];
    const node = nextNode && nextNode !== 'W' ? (nextNode as OptNode) : null;
    const why = puzzleFailed(pz, s0, after, used, c.budget);
    if (why) return fin({ kind: 'fail', red: r1.event, reply: null, afterRed, after, reason: why }, node);
    return fin({ kind: 'continue', red: r1.event, reply: null, afterRed, after }, node);
  }

  // ---- survive: one round, BLUE answers with the policy (1 ply)
  if (pz.goal.kind === 'survive') {
    const { reply } = bluePolicy(pz, s0, afterRed, 1);
    const r2 = apply(afterRed, reply);
    if (failed(pz, s0, r2.state)) return fin({ kind: 'fail', red: r1.event, reply: r2.event, afterRed, after: r2.state, reason: r2.state.result ? 'flaglost' : 'piece' }, null);
    return fin({ kind: 'done', red: r1.event, reply: r2.event, afterRed, after: r2.state, noMoves: false }, null);
  }

  // ---- best puzzles: the reply book
  if (!c0.off && c0.node !== null) {
    const look = lookup(c0.node as BookNode, [toTree(c, toNote(a))]);
    if (look.kind === 'end') {
      if (look.end === 'W') return fin({ kind: 'done', red: r1.event, reply: null, afterRed, after: afterRed, noMoves: false }, null);
      return fin({ kind: 'fail', red: r1.event, reply: null, afterRed, after: afterRed, reason: 'piece' }, c0.node);
    }
    if (look.kind === 'fail' || look.kind === 'reply') {
      const replyNote = c.twin ? mirrorNote(look.reply) : look.reply;
      const rep = parseNote(afterRed, replyNote);
      if (!rep) throw new Error(`book reply ${replyNote} illegal in ${c.spec.id}`);
      const r2 = apply(afterRed, rep);
      if (look.kind === 'fail') return fin({ kind: 'fail', red: r1.event, reply: r2.event, afterRed, after: r2.state, reason: failed(pz, s0, r2.state) ? 'flaglost' : 'held' }, c0.node);
      if (goalReached(pz, s0, r2.state, true)) return fin({ kind: 'done', red: r1.event, reply: r2.event, afterRed, after: r2.state, noMoves: false }, null);
      const why = puzzleFailed(pz, s0, r2.state, used, c.budget);
      if (why) return fin({ kind: 'fail', red: r1.event, reply: r2.event, afterRed, after: r2.state, reason: why }, look.node);
      return fin({ kind: 'continue', red: r1.event, reply: r2.event, afterRed, after: r2.state }, look.node);
    }
  }
  // off the book: 1-ply heuristic reply; only R9.4 ①③ end the puzzle
  const { reply } = offBookReply(pz, s0, afterRed);
  const r2 = apply(afterRed, reply);
  if (failed(pz, s0, r2.state)) return fin({ kind: 'fail', red: r1.event, reply: r2.event, afterRed, after: r2.state, reason: 'flaglost' }, null, true);
  if (goalReached(pz, s0, r2.state, true)) return fin({ kind: 'done', red: r1.event, reply: r2.event, afterRed, after: r2.state, noMoves: false }, null, true);
  if (used >= c.budget) return fin({ kind: 'fail', red: r1.event, reply: r2.event, afterRed, after: r2.state, reason: 'budget' }, null, true);
  return fin({ kind: 'continue', red: r1.event, reply: r2.event, afterRed, after: r2.state }, null, true);
}

/** take back the last RED move (and BLUE's answer) */
export function undoMove(c: PuzzleCtx): PuzzleCtx {
  if (!c.red.length) return c;
  return replayPuzzle(c.spec, c.twin, c.root, c.red.slice(0, -1));
}

/** back to the last position that was still on the hint tree (💡 "我们退回去") */
export function backToTree(c: PuzzleCtx): PuzzleCtx {
  return replayPuzzle(c.spec, c.twin, c.root, c.red.slice(0, c.lastOnTree));
}

/** replay a list of RED moves from the start (resume, undo, back to the last on-tree position) */
export function replayPuzzle(spec: PuzzleSpec, twin: boolean, bookRoot: BookNode | null, red: readonly string[]): PuzzleCtx {
  let c = startPuzzle(spec, twin, bookRoot);
  for (const n of red) {
    const a = parseNote(c.state, n);
    if (!a) break;
    const r = redMove(c, a);
    if (r.step.kind !== 'continue') break;
    c = r.ctx;
  }
  return c;
}

/** the main line from the current position (H3 demo): RED's best move, BLUE's answer, … to the goal */
export function demoLine(c0: PuzzleCtx): Array<{ red: Action; result: StepResult }> {
  const out: Array<{ red: Action; result: StepResult }> = [];
  let c = c0;
  for (let k = 0; k < 12; k++) {
    const b = bestNow(c);
    if (!b.length) break;
    const a = parseNote(c.state, b[0]);
    if (!a) break;
    const r = redMove(c, a);
    out.push({ red: a, result: r.step });
    c = r.ctx;
    if (r.step.kind !== 'continue') break;
  }
  return out;
}

/** is a static puzzle already lost for good? (for tests / the controller) */
export const hopeless = (c: PuzzleCtx): boolean => c.pz.blue_moves !== 'best' && staticHopeless(c.pz, c.s0, c.state);

export function moveOf(a: Action): Move | null {
  return isMove(a) ? a : null;
}
export { isFlip, isPass, RED };
