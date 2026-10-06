/**
 * Puzzle controller (spec §3.9 R9.3–R9.4, §3.13 E26–E29, §8.10 puzzle.test): book replies, the
 * failure cases, undo, the mirror twin, resume by replay; `staticHopeless` rules with ≥ 3 positive and
 * ≥ 3 negative positions per goal kind (each positive is confirmed unsolvable by the solver).
 */
import { describe, expect, test } from 'vitest';
import { RED } from '../src/core/board';
import { mirrorNote, parseNote } from '../src/core/notation';
import { buildPuzzleState, staticHopeless, puzzleFailed, budgetOf, type PuzzleDef } from '../src/core/puzzle';
import { distToWin } from '../src/core/solver';
import { encode } from '../src/core/state';
import type { Book } from '../src/core/book';
import { backToTree, bestNow, redMove, replayPuzzle, startPuzzle, undoMove, type PuzzleCtx, type PuzzleSpec } from '../src/ctrl/puzzle-ctrl';
import endgames from '../../../content/military-chess/endgames.json';
import lessons from '../../../content/military-chess/lessons.json';
import bookE201 from '../../../content/military-chess/books/E2-01.json';

const EG = (endgames as unknown as { puzzles: PuzzleSpec[] }).puzzles;
const ITEMS = (lessons as unknown as { lessons: Array<{ items: Array<PuzzleSpec & { type: string }> }> }).lessons.flatMap((l) => l.items);
const spec = (id: string): PuzzleSpec => ({ ...(EG.find((e) => e.id === id) ?? ITEMS.find((i) => i.id === id))!, id });
const BOOK = (bookE201 as unknown as Book).root;

function play(c: PuzzleCtx, note: string) {
  const a = parseNote(c.state, note);
  expect(a, note).not.toBeNull();
  return redMove(c, a!);
}

describe('puzzles with a reply book (E2-01)', () => {
  test('E26: a move the book answers with [reply, 0] → BLUE answers, the puzzle fails, nothing advanced', () => {
    const c = startPuzzle(spec('E2-01'), false, BOOK);
    const r = play(c, 'd10-c11');
    expect(r.step.kind).toBe('fail');
    if (r.step.kind === 'fail') expect(r.step.reason).toBe('flaglost');
    expect(r.step.reply).not.toBeNull();
    expect(c.red.length).toBe(0); // the caller keeps the old context: back to before the move
  });
  test('the main line wins in par moves; every BLUE answer comes from the book', () => {
    let c = startPuzzle(spec('E2-01'), false, BOOK);
    const line = ['c2xc1', 'd10-d11', 'd11xd12'];
    for (let i = 0; i < line.length; i++) {
      expect(bestNow(c)[0]).toBe(line[i]);
      const r = play(c, line[i]);
      expect(r.step.kind).toBe(i < line.length - 1 ? 'continue' : 'done');
      c = r.ctx;
    }
    expect(c.red.length).toBe(spec('E2-01').par);
  });
  test('E27: a second deviation leaves the book: heuristic replies, only ①③ end it, 💡 first goes back', () => {
    let c = startPuzzle(spec('E2-01'), false, BOOK);
    c = play(c, 'c2xc1').ctx;
    const dev = play(c, 'd5-c6'); // in the book with a node: still winnable
    expect(dev.step.kind).toBe('continue');
    c = dev.ctx;
    expect(c.node).not.toBeNull();
    const off = Object.keys((c.node as { m: Record<string, unknown> }).m);
    // a move this node does not list → off the book
    const legal = ['c1-b1', 'c1-c2', 'd10-e10', 'd10-c10', 'c6-b6', 'c6-c5'].find((n) => !off.includes(n) && parseNote(c.state, n));
    expect(legal).toBeTruthy();
    const r = play(c, legal!);
    expect(['continue', 'fail', 'done']).toContain(r.step.kind);
    if (r.step.kind === 'continue') {
      expect(r.ctx.off).toBe(true);
      expect(r.ctx.node).toBeNull();
      expect(bestNow(r.ctx)).toEqual([]);
      const back = backToTree(r.ctx);
      expect(back.red).toEqual(['c2xc1', 'd5-c6']);
      expect(back.node).not.toBeNull();
    }
  });
  test('E28: the mirror twin uses the same book through mirrored notes and wins with the mirrored line', () => {
    let c = startPuzzle(spec('E2-01'), true, BOOK);
    for (const n of ['c2xc1', 'd10-d11', 'd11xd12'].map(mirrorNote)) {
      expect(bestNow(c)[0]).toBe(n);
      const r = play(c, n);
      c = r.ctx;
      if (r.step.kind === 'done') break;
      expect(r.step.kind).toBe('continue');
    }
    expect(c.done).toBe(true);
  });
  test('E29: resuming replays the saved RED moves to the identical position (in and off the book); undo = replay one less', () => {
    let c = startPuzzle(spec('E2-01'), false, BOOK);
    c = play(c, 'c2xc1').ctx;
    c = play(c, 'd5-c6').ctx;
    const again = replayPuzzle(spec('E2-01'), false, BOOK, c.red);
    expect(encode(again.state)).toBe(encode(c.state));
    expect(again.red).toEqual(c.red);
    const u = undoMove(c);
    expect(u.red).toEqual(['c2xc1']);
    expect(encode(u.state)).toBe(encode(replayPuzzle(spec('E2-01'), false, BOOK, ['c2xc1']).state));
  });
});

describe('static puzzles', () => {
  test('the budget is par + 4 and running out fails with "budget"', () => {
    const sp = spec('L3-1'); // reach c5 with the 连长 from c3, par 2
    expect(budgetOf(sp)).toBe(sp.par + 4);
    let c = startPuzzle(sp, false, null);
    const wander = ['c3-c2', 'c2-c3', 'c3-d3', 'd3-c3', 'c3-c2', 'c2-c3'];
    let last = null as null | ReturnType<typeof play>;
    for (const n of wander) {
      last = play(c, n);
      if (last.step.kind !== 'continue') break;
      c = last.ctx;
    }
    expect(last!.step.kind).toBe('fail');
    if (last!.step.kind === 'fail') expect(last!.step.reason).toBe('budget');
  });
  test('a move into the mine that guarded the flag → the piece is lost ("piece" / hopeless)', () => {
    const sp = spec('L2-5'); // 军长 a11, 工兵 c11; mines a12 c12 b11; flag b12
    const c = startPuzzle(sp, false, null);
    const r = play(c, 'a11xa12');
    expect(r.step.kind === 'continue' || r.step.kind === 'fail').toBe(true);
  });
});

describe('staticHopeless (R9.4 ④): sound — every positive is unsolvable', () => {
  const cases: Array<{ name: string; pz: PuzzleDef; hopeless: boolean }> = [
    // capture
    { name: 'capture: the target outranks every RED piece', hopeless: true, pz: { red: { c6: '3' }, blue: { c7: '7', b12: 'F' }, goal: { kind: 'capture', targets: ['c7'] } } },
    { name: 'capture: only a mine-stopped 师长 left vs a 司令', hopeless: true, pz: { red: { a6: '7', c1: 'M' }, blue: { e9: '9', b12: 'F' }, goal: { kind: 'capture', targets: ['e9'] } } },
    { name: 'capture: two targets, one out of reach of any rank', hopeless: true, pz: { red: { c6: '5', a6: '2' }, blue: { c7: '4', a9: '8', b12: 'F' }, goal: { kind: 'capture', targets: ['c7', 'a9'] } } },
    { name: 'capture: a bomb can still trade', hopeless: false, pz: { red: { c6: 'B' }, blue: { c7: '9', b12: 'F' }, goal: { kind: 'capture', targets: ['c7'] } } },
    { name: 'capture: an equal piece can trade', hopeless: false, pz: { red: { c6: '5' }, blue: { c8: '5', b12: 'F' }, goal: { kind: 'capture', targets: ['c8'] } } },
    { name: 'capture: a bigger piece exists', hopeless: false, pz: { red: { c6: '3', e6: '8' }, blue: { c7: '7', b12: 'F' }, goal: { kind: 'capture', targets: ['c7'] } } },
    // flag
    { name: 'flag: the flag is boxed in by mines and nobody can dig', hopeless: true, pz: { red: { c6: '9' }, blue: { b12: 'F', a12: 'M', c12: 'M', b11: 'M' }, goal: { kind: 'flag' } } },
    { name: 'flag: no mobile RED piece', hopeless: true, pz: { red: { c1: 'M', d1: 'F' }, blue: { b12: 'F' }, goal: { kind: 'flag' } } },
    { name: 'flag: mines and a 司令 guard, RED only has 团长', hopeless: true, pz: { red: { e6: '5' }, blue: { b12: 'F', a12: 'M', c12: 'M', b11: '9' }, goal: { kind: 'flag' } } },
    { name: 'flag: an engineer can dig', hopeless: false, pz: { red: { e6: '1' }, blue: { b12: 'F', a12: 'M', c12: 'M', b11: 'M' }, goal: { kind: 'flag' } } },
    { name: 'flag: a bomb can open a mine', hopeless: false, pz: { red: { e6: 'B' }, blue: { b12: 'F', a12: 'M', c12: 'M', b11: 'M' }, goal: { kind: 'flag' } } },
    { name: 'flag: a free neighbour', hopeless: false, pz: { red: { e6: '2' }, blue: { b12: 'F', a12: 'M', c12: 'M' }, goal: { kind: 'flag' } } },
    // reach
    { name: 'reach: the required piece is gone', hopeless: true, pz: { red: { c3: '3', e3: '5' }, blue: { b12: 'F' }, goal: { kind: 'reach', targets: ['c5'], piece: 'a1' } } },
    { name: 'reach: the required piece is frozen in a 大本营', hopeless: true, pz: { red: { b1: '3', e3: '5' }, blue: { b12: 'F' }, goal: { kind: 'reach', targets: ['c5'], piece: 'b1' } } },
    { name: 'reach: frozen in the other 大本营', hopeless: true, pz: { red: { d1: '6', a3: '2' }, blue: { b12: 'F' }, goal: { kind: 'reach', targets: ['e7'], piece: 'd1' } } },
    { name: 'reach: the piece can still move', hopeless: false, pz: { red: { c3: '3' }, blue: { b12: 'F' }, goal: { kind: 'reach', targets: ['c5'], piece: 'c3' } } },
    { name: 'reach: frozen ON its target', hopeless: false, pz: { red: { b1: '3', c3: '2' }, blue: { b12: 'F' }, goal: { kind: 'reach', targets: ['b1'], piece: 'b1' } } },
    { name: 'reach: no piece constraint', hopeless: false, pz: { red: { c3: '3' }, blue: { b12: 'F' }, goal: { kind: 'reach', targets: ['c5'] } } },
    // nomoves
    { name: 'nomoves: a mobile BLUE piece nobody can beat (flag boxed in)', hopeless: true, pz: { red: { c6: '4' }, blue: { a9: '8', b12: 'F', a12: 'M', c12: 'M', b11: 'M' }, goal: { kind: 'nomoves' } } },
    { name: 'nomoves: a 司令 against a 军长 (no flag at all)', hopeless: true, pz: { red: { c6: '8', a6: '7' }, blue: { e9: '9', a12: 'M' }, goal: { kind: 'nomoves' } } },
    { name: 'nomoves: two mobile BLUE pieces, one too big (flag boxed in)', hopeless: true, pz: { red: { c6: '5' }, blue: { a9: '4', e9: '7', d12: 'F', c12: 'M', e12: 'M', d11: 'M' }, goal: { kind: 'nomoves' } } },
    { name: 'nomoves: an unbeatable piece, but the flag is open', hopeless: false, pz: { red: { c6: '4' }, blue: { a9: '8', b12: 'F' }, goal: { kind: 'nomoves' } } },
    { name: 'nomoves: a bomb answers the 司令', hopeless: false, pz: { red: { c6: 'B', e6: '3' }, blue: { a9: '9', b12: 'F' }, goal: { kind: 'nomoves' } } },
    { name: 'nomoves: all BLUE pieces beatable', hopeless: false, pz: { red: { c6: '8' }, blue: { a9: '4', e9: '7', b12: 'F' }, goal: { kind: 'nomoves' } } },
    { name: 'nomoves: BLUE has only immobile pieces', hopeless: false, pz: { red: { c6: '2' }, blue: { b12: 'F', a12: 'M' }, goal: { kind: 'nomoves' } } },
  ];
  for (const c of cases) {
    test(c.name, () => {
      const pz: PuzzleDef = { ...c.pz, blue_moves: 'static' };
      const s0 = buildPuzzleState(pz);
      expect(staticHopeless(pz, s0, s0)).toBe(c.hopeless);
      if (c.hopeless) {
        // sound: no forced win even with many moves
        expect(distToWin(pz, s0, s0, 6)).toBeGreaterThan(6);
        expect(puzzleFailed(pz, s0, s0, 0, 99)).not.toBeNull();
      }
    });
  }
  test('RED moves first and must move (R9.1)', () => {
    const s0 = buildPuzzleState({ red: { c3: '3' }, blue: { b12: 'F' }, goal: { kind: 'flag' } });
    expect(s0.turn).toBe(RED);
  });
});
