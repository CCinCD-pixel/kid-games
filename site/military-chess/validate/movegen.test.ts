import { describe, expect, test } from 'vitest';
import { BLUE, N, RED } from '../src/core/board';
import { findMove, hasAnyAction, legalMoves, needsEngineer, pieceMoves } from '../src/core/movegen';
import { apply } from '../src/core/rules';
import { typeFromCode } from '../src/core/pieces';
import { addPiece, newState } from '../src/core/state';
import golden from './golden.json';
import { P, dests, moveTo, movesOf, pos, sq } from './helpers';

describe('empty-board destinations (golden, byte-identical)', () => {
  test('non-engineer and engineer destination counts for all 60 stations', () => {
    const got = { general: [] as number[], engineer: [] as number[] };
    for (let i = 0; i < N; i++) {
      for (const [k, code] of [['general', '7'], ['engineer', '1']] as const) {
        const s = newState('ming');
        addPiece(s, RED, typeFromCode(code), i);
        s.turn = RED;
        got[k].push(pieceMoves(s, 0).length);
      }
    }
    expect(got.general).toEqual(golden.emptyBoardDestinations.general);
    expect(got.engineer).toEqual(golden.emptyBoardDestinations.engineer);
  });
});

describe('road steps (R5.2)', () => {
  test('off-rail piece: orthogonal steps and the camp diagonals', () => {
    expect(dests(pos({ c5: 'r5' }), 'c5')).toEqual(['b5', 'c4', 'c6', 'd5']);
  });
  test('diagonal into an empty camp; camp piece attacks out', () => {
    expect(dests(pos({ a6: 'r5' }), 'a6')).toContain('b5');
    expect(dests(pos({ b5: 'r5', c5: 'b9' }), 'b5')).toContain('c5');
  });
  test('no diagonal between two ordinary stations', () => {
    expect(dests(pos({ c5: 'r5' }), 'c5')).not.toContain('b6');
    expect(dests(pos({ c5: 'r5' }), 'c5')).not.toContain('d4');
  });
  test('road crossing at the three bridges only', () => {
    expect(dests(pos({ b6: 'r7' }), 'b6').some((t) => t.endsWith('7'))).toBe(false); // mountain
    expect(dests(pos({ d6: 'r7' }), 'd6').some((t) => t.endsWith('7'))).toBe(false);
  });
});

describe('railway (R5.3 straight, R5.4 engineer)', () => {
  test('E7: non-engineer slides along file a through the crossing to a11, and along row 2 to e2', () => {
    const d = dests(pos({ a2: 'r7' }), 'a2');
    for (const t of ['a3', 'a6', 'a7', 'a11', 'b2', 'e2']) expect(d).toContain(t);
    expect(d).not.toContain('a12'); // a11–a12 is road, not rail
    expect(d).not.toContain('e11');
    expect(d).not.toContain('b11');
  });
  test('slide path is the straight line of stations', () => {
    const m = moveTo(pos({ a2: 'r7' }), 'a2', 'a11');
    expect(m.path.map(sq)).toEqual(['a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11']);
    expect(m.eng).toBe(false);
  });
  test('own piece blocks the rail; the first enemy can be hit, nothing beyond it', () => {
    const s = pos({ a2: 'r7', a5: 'r3', e2: 'b4', c2: 'b6' });
    const d = dests(s, 'a2');
    expect(d).toContain('a4');
    expect(d).not.toContain('a5');
    expect(d).not.toContain('a6');
    expect(d).toContain('b2');
    expect(d).toContain('c2');
    expect(d).not.toContain('d2');
    expect(d).not.toContain('e2');
    expect(moveTo(s, 'a2', 'c2').kind).toBe('attack');
  });
  test('E8: non-engineer on c6 crosses only to c7 (c7–c8 is road)', () => {
    const d = dests(pos({ c6: 'r7' }), 'c6');
    expect(d).toContain('c7');
    expect(d).not.toContain('c8');
    expect(d).toContain('a6');
    expect(d).toContain('e6');
  });
  test('non-engineer cannot turn at a corner (a6 → b6 ok by road, a6 → e6 ok straight, a6 → a2 ok, not c2)', () => {
    const d = dests(pos({ a6: 'r8' }), 'a6');
    expect(d).toContain('e6');
    expect(d).toContain('a2');
    expect(d).not.toContain('c2');
    expect(d).not.toContain('e7');
  });
  test('engineer turns any number of corners on an empty board', () => {
    const d = dests(pos({ a2: 'r1' }), 'a2');
    for (const t of ['e11', 'c11', 'e6', 'c7', 'e2', 'a11']) expect(d).toContain(t);
    expect(d.length).toBe(31 + 2); // 31 other rail stations + a1 road step + b3 camp diagonal
  });
  test('engineer path via the middle crossing a6 → b6 → c6 → c7 is marked eng', () => {
    const s = pos({ a6: 'r1', b7: 'b5' });
    const m = moveTo(s, 'a6', 'c7');
    expect(m.path.map(sq)).toEqual(['a6', 'b6', 'c6', 'c7']);
    expect(m.eng).toBe(true);
    expect(dests(s, 'a6')).toContain('b7'); // attack along row 7 after crossing at a
  });
  test('engineer BFS takes the shortest rail path', () => {
    const m = moveTo(pos({ a2: 'r1' }), 'a2', 'e11');
    expect(m.path.length).toBe(14); // a2..a11 (10) + b11..e11 (4)
    expect(m.eng).toBe(true);
  });
  test('engineer straight rail move is not marked eng', () => {
    expect(moveTo(pos({ a2: 'r1' }), 'a2', 'a10').eng).toBe(false);
    expect(moveTo(pos({ a2: 'r1' }), 'a2', 'e2').eng).toBe(false);
  });
  test('E6: engineer cannot pass through any piece (own or enemy)', () => {
    const s = pos({ a2: 'r1', b2: 'r5', a3: 'r6' });
    const d = dests(s, 'a2');
    expect(d).toEqual(['a1', 'b3']); // boxed in: only the road step and the camp diagonal
    const s2 = pos({ a2: 'r1', b2: 'b5', a3: 'b6' });
    expect(dests(s2, 'a2').sort()).toEqual(['a1', 'a3', 'b2', 'b3']);
  });
  test('engineer can hit an enemy at the end of a turning path', () => {
    const s = pos({ a2: 'r1', e11: 'b4' });
    const m = moveTo(s, 'a2', 'e11');
    expect(m.kind).toBe('attack');
    expect(m.eng).toBe(true);
  });
  test('engineer on a non-rail station only makes road steps', () => {
    expect(dests(pos({ c3: 'r1' }), 'c3')).toEqual(['b3', 'c2', 'c4', 'd3']);
  });
  test('a non-rail start cannot use the rail even next to it (R5.5)', () => {
    expect(dests(pos({ b3: 'r7' }), 'b3')).toEqual(['a2', 'a3', 'a4', 'b2', 'b4', 'c2', 'c3', 'c4']);
  });
  test('rail station on file e row 2 corner: both directions', () => {
    const d = dests(pos({ e2: 'r7' }), 'e2');
    expect(d).toContain('a2');
    expect(d).toContain('e11');
    expect(d).not.toContain('a11');
  });
  test('needsEngineer (observer inference, R11.1)', () => {
    const s = pos({ a2: 'r1', b7: 'b5' });
    expect(needsEngineer(s, P('a2'), P('e11'))).toBe(true);
    expect(needsEngineer(s, P('a2'), P('a10'))).toBe(false);
    expect(needsEngineer(s, P('a2'), P('a1'))).toBe(false);
    expect(needsEngineer(s, P('a2'), P('c4'))).toBe(false); // not rail at all
  });
});

describe('camps, HQs, immobile pieces', () => {
  test('E9: a piece in a camp cannot be attacked (not even by a bomb); own piece blocks', () => {
    const s = pos({ c4: 'b6', b3: 'r9', b2: 'r1', d3: 'rB' });
    expect(dests(s, 'b3')).not.toContain('c4');
    expect(dests(s, 'd3')).not.toContain('c4');
    expect(dests(s, 'b2')).not.toContain('b3');
  });
  test('a piece in an HQ is frozen; mines and flags never move', () => {
    const s = pos({ b1: 'r9', c2: 'rM', d1: 'rF' });
    expect(dests(s, 'b1')).toEqual([]);
    expect(dests(s, 'c2')).toEqual([]);
    expect(dests(s, 'd1')).toEqual([]);
  });
  test('E4/E5: own piece may enter own HQ; enemy may enter an empty HQ, is then frozen, and can be hit', () => {
    expect(dests(pos({ b2: 'r5' }), 'b2')).toContain('b1');
    let s = pos({ b2: 'b5', a1: 'r7', e7: 'r3', b12: 'bF', e12: 'b4' }, { turn: BLUE });
    expect(dests(s, 'b2')).toContain('b1');
    s = apply(s, moveTo(s, 'b2', 'b1')).state;
    expect(dests(s, 'b1')).toEqual([]);
    expect(s.turn).toBe(RED);
    expect(moveTo(s, 'a1', 'b1').kind).toBe('attack');
  });
  test('legalMoves of a side never contain enemy-camp targets or own-piece targets', () => {
    const s = pos({ a6: 'r9', b5: 'r1', c7: 'b3', b8: 'b8' });
    for (const a of legalMoves(s)) {
      if (!('to' in a)) continue;
      const occ = s.board[a.to];
      if (occ >= 0) {
        expect(s.pside[occ]).toBe(BLUE);
        expect(sq(a.to)).not.toBe('b8');
      }
    }
  });
});

describe('anti-shuttle (R5.8)', () => {
  test('the 5th consecutive back-and-forth is refused; other moves fine', () => {
    let s = pos({ a6: 'r5', e7: 'b5', b1: 'rF', b12: 'bF' });
    const go = (from: string, to: string): void => {
      s = apply(s, moveTo(s, from, to)).state;
    };
    go('a6', 'a5'); go('e7', 'e8');
    go('a5', 'a6'); go('e8', 'e7');
    go('a6', 'a5'); go('e7', 'e8');
    go('a5', 'a6'); go('e8', 'e7');
    expect(dests(s, 'a6')).not.toContain('a5');
    expect(dests(s, 'a6')).toContain('b6');
    expect(findMove(s, s.board[P('a6')], P('a5'))).toBeNull();
  });
  test('moving a different piece resets the count', () => {
    let s = pos({ a6: 'r5', e6: 'r4', e7: 'b5', b1: 'rF', b12: 'bF' });
    const go = (from: string, to: string): void => {
      s = apply(s, moveTo(s, from, to)).state;
    };
    go('a6', 'a5'); go('e7', 'e8');
    go('a5', 'a6'); go('e8', 'e7');
    go('a6', 'a5'); go('e7', 'e8');
    go('e6', 'd6'); go('e8', 'e9');
    go('a5', 'a6'); go('e9', 'e8');
    expect(dests(s, 'a6')).toContain('a5');
  });
  test('E16: shuttle makes the only move illegal → no moves → loss', () => {
    // red 团长 boxed in by its own mines: only a6 ↔ a5 is possible
    let s = pos({ a6: 'r5', b6: 'rM', b5: 'rM', a4: 'rM', a7: 'rM', b1: 'rF', e7: 'b5', b12: 'bF' });
    const go = (from: string, to: string): void => {
      s = apply(s, moveTo(s, from, to)).state;
    };
    expect(dests(s, 'a6')).toEqual(['a5']);
    go('a6', 'a5'); go('e7', 'e8');
    go('a5', 'a6'); go('e8', 'e7');
    go('a6', 'a5'); go('e7', 'e8');
    go('a5', 'a6');
    expect(s.result).toBeNull();
    go('e8', 'e7');
    expect(s.result).toEqual({ winner: BLUE, reason: 'no-moves' });
  });
});

describe('翻翻棋 movegen (R8.3)', () => {
  test('E12: face-down pieces block rails for both sides and cannot be attacked', () => {
    const s = pos({ a6: 'r7^', a5: 'b3', b6: 'bF^', c12: 'bM', b1: 'rF^' }, { mode: 'fan' });
    const d = dests(s, 'a6');
    expect(d).not.toContain('a5');
    expect(d).not.toContain('a4');
    expect(d).not.toContain('b6'); // flag locked while a blue mine is alive (even face down)
  });
  test('flag lock lifts when all mines are gone; rule switch fanFlagLock=false', () => {
    const s = pos({ a6: 'r7^', b6: 'bF^', b1: 'rF^' }, { mode: 'fan' });
    expect(dests(s, 'a6')).toContain('b6');
    const s2 = pos({ a6: 'r7^', b6: 'bF^', c12: 'bM^', b1: 'rF^' }, { mode: 'fan', rules: { fanFlagLock: false } });
    expect(dests(s2, 'a6')).toContain('b6');
  });
  test('face-down own piece cannot move; flips are listed first', () => {
    const s = pos({ a6: 'r7', a5: 'b3^', b1: 'rF' }, { mode: 'fan' });
    expect(dests(s, 'a6')).toEqual([]);
    const lm = legalMoves(s);
    expect(lm.filter((a) => 'flip' in a).length).toBe(2);
  });
  test('hasAnyAction counts flips', () => {
    const s = pos({ a6: 'r9', c12: 'bM' }, { mode: 'fan' });
    expect(hasAnyAction(s, RED)).toBe(true);
  });
});

describe('movesOf helper sanity', () => {
  test('every generated move starts at the piece and ends at its destination', () => {
    const s = pos({ a2: 'r1', e2: 'r9', c7: 'b5', a11: 'b6' });
    for (const at of ['a2', 'e2']) {
      for (const m of movesOf(s, at)) {
        expect(m.path[0]).toBe(m.from);
        expect(m.path[m.path.length - 1]).toBe(m.to);
      }
    }
  });
});
