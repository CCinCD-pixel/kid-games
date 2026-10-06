/**
 * 参谋提醒 C1–C5 (spec §5.1, §9.5, §8.10 coach.test): ≥ 3 positive and ≥ 3 negative positions for
 * each; C1 is not limited by the per-game cap; C5 shows even when the alerts are switched off.
 */
import { describe, expect, test } from 'vitest';
import { BLUE, RED, parseSq, type Side } from '../src/core/board';
import { newKnowledge } from '../src/core/belief';
import { coachCheck, flagDangerNow, type CoachCode } from '../src/core/coach';
import { parseNote } from '../src/core/notation';
import { typeFromCode } from '../src/core/pieces';
import { addPiece, newState, type GameState, type Mode } from '../src/core/state';

/** { sq: 'r7' } face up; 翻翻棋: 'r7~' = face down */
function pos(p: Record<string, string>, mode: Mode = 'ming', turn: Side = RED): GameState {
  const s = newState(mode);
  for (const [k, v] of Object.entries(p)) addPiece(s, v[0] === 'r' ? RED : BLUE, typeFromCode(v[1]), parseSq(k), !v.endsWith('~'));
  s.turn = turn;
  if (mode === 'fan') s.colorOf = [RED, BLUE];
  return s;
}
function hiddenOf(s: GameState): number[] {
  const h = new Array(24).fill(0);
  for (let p = 0; p < s.np; p++) if (s.palive[p] && !s.pup[p]) h[s.pside[p] * 12 + s.ptype[p]]++;
  return h;
}
function check(s: GameState, note: string, o: { used?: number; enabled?: boolean } = {}): CoachCode | null {
  const a = parseNote(s, note);
  expect(a, note).not.toBeNull();
  const k = s.mode === 'an' ? newKnowledge(s, RED) : null;
  const r = coachCheck(s, a!, { me: RED, knowledge: k, hidden: s.mode === 'fan' ? hiddenOf(s) : null, used: o.used ?? 0, enabled: o.enabled ?? true });
  return r?.code ?? null;
}

describe('coach C1: the flag can be taken next move', () => {
  test('positives (明 / 暗 / 翻 face-up flag) — and C1 ignores the per-game cap', () => {
    expect(check(pos({ b1: 'rF', c3: 'r5', a1: 'b2', d12: 'bF' }), 'c3-c4')).toBe('C1');
    expect(check(pos({ d1: 'rF', a6: 'r7', e1: 'b9', b12: 'bF' }), 'a6-a5')).toBe('C1');
    expect(check(pos({ b1: 'rF', c3: 'r5', b2: 'b3', d12: 'bF' }, 'an'), 'c3-c4')).toBe('C1');
    expect(check(pos({ b1: 'rF', c3: 'r5', c1: 'b3', d12: 'bF', a12: 'bM' }, 'fan'), 'c3-c4')).toBe('C1');
    expect(check(pos({ b1: 'rF', c3: 'r5', a1: 'b2', d12: 'bF' }), 'c3-c4', { used: 3 })).toBe('C1');
  });
  test('negatives: no attacker reaches the flag; the move removes the attacker; a face-down flag', () => {
    expect(check(pos({ b1: 'rF', c3: 'r5', a4: 'b2', d12: 'bF' }), 'c3-c4')).toBeNull();
    expect(check(pos({ b1: 'rF', a2: 'r5', a1: 'b2', d12: 'bF' }), 'a2xa1')).toBeNull();
    expect(check(pos({ b1: 'rF~', c3: 'r5', c1: 'b3', d12: 'bF', a12: 'bM' }, 'fan'), 'c3-c4')).toBeNull();
    expect(check(pos({ b1: 'rF', c6: 'r5', e9: 'b7', d12: 'bF' }), 'c6-c5')).toBeNull();
  });
  test('flagDangerNow marks the threats and the flag (hint level 1)', () => {
    const s = pos({ b1: 'rF', c3: 'r5', a1: 'b2', d12: 'bF' });
    expect(flagDangerNow(s, RED, null).sort()).toEqual([parseSq('a1'), parseSq('b1')].sort());
    expect(flagDangerNow(pos({ b1: 'rF', c3: 'r5', a4: 'b2', d12: 'bF' }), RED, null)).toEqual([]);
  });
});

describe('coach C2: a big piece walks into a sure capture', () => {
  test('positives', () => {
    expect(check(pos({ a1: 'rF', c5: 'r6', c7: 'b8', e12: 'bF' }), 'c5-c6')).toBe('C2');
    expect(check(pos({ a1: 'rF', a5: 'r7', a8: 'b9', e12: 'bF', a12: 'bM' }), 'a5-a6')).toBe('C2');
    expect(check(pos({ a1: 'rF', e5: 'r8', e7: 'bB', a12: 'bF' }), 'e5-e6')).toBe('C2'); // a bomb trade
  });
  test('negatives: into a camp; a small piece; the move takes something as valuable', () => {
    expect(check(pos({ a1: 'rF', a5: 'r6', a7: 'b9', e12: 'bF' }), 'a5-b5')).toBeNull(); // camp
    expect(check(pos({ a1: 'rF', c5: 'r3', c7: 'b8', e12: 'bF' }), 'c5-c6')).toBeNull(); // 连长
    expect(check(pos({ a1: 'rF', c6: 'r9', c7: 'b8', d7: 'b9', e12: 'bF' }), 'c6xc7')).toBeNull(); // took a 军长 (not a sure loss next? still ≥ value)
    expect(check(pos({ a1: 'rF', c5: 'r6', a9: 'b8', e12: 'bF' }), 'c5-c6')).toBeNull(); // nobody can reach c6
  });
});

describe('coach C3: a big piece pokes an unmoved back-row piece (暗棋)', () => {
  test('positives', () => {
    expect(check(pos({ a1: 'rF', c11: 'r7', c12: 'bM', b12: 'bF' }, 'an'), 'c11xc12')).toBe('C3');
    expect(check(pos({ a1: 'rF', a10: 'r8', a11: 'b3', b12: 'bF' }, 'an'), 'a10xa11')).toBe('C3');
    expect(check(pos({ a1: 'rF', e10: 'r9', e11: 'b5', d12: 'bF' }, 'an'), 'e10xe11')).toBe('C3');
  });
  test('negatives: not big enough; not a back-row piece; a piece that has moved', () => {
    expect(check(pos({ a1: 'rF', c11: 'r6', c12: 'bM', b12: 'bF' }, 'an'), 'c11xc12')).toBeNull();
    expect(check(pos({ a1: 'rF', c6: 'r8', c7: 'b3', b12: 'bF' }, 'an'), 'c6xc7')).toBeNull();
    const s = pos({ a1: 'rF', a10: 'r8', a11: 'b3', b12: 'bF' }, 'an');
    s.pmoved[s.board[parseSq('a11')]] = 1;
    expect(check(s, 'a10xa11')).toBeNull();
  });
});

describe('coach C4: flipping next to my big piece while a bigger enemy is still face down (翻翻棋)', () => {
  test('positives (with the bead counts)', () => {
    expect(check(pos({ c6: 'r8', c7: 'b9~', a12: 'bF', b1: 'rF' }, 'fan'), '*c7')).toBe('C4');
    expect(check(pos({ c6: 'r6', c5: 'b4~', e9: 'bB~', a12: 'bF', b1: 'rF' }, 'fan'), '*c5')).toBe('C4');
    expect(check(pos({ b5: 'r7', b6: 'r2~', a8: 'b8~', a12: 'bF', b1: 'rF' }, 'fan'), '*b6')).toBe('C4');
  });
  test('negatives: no big piece next to the tile; no bigger enemy left face down; not my piece', () => {
    expect(check(pos({ c3: 'r8', c7: 'b9~', a12: 'bF', b1: 'rF' }, 'fan'), '*c7')).toBeNull();
    expect(check(pos({ c6: 'r9', c7: 'b4~', a12: 'bF', b1: 'rF' }, 'fan'), '*c7')).toBeNull();
    expect(check(pos({ c6: 'b9', c7: 'b9~', a12: 'bF', b1: 'rF', a1: 'r3' }, 'fan'), '*c7')).toBeNull();
  });
});

describe('coach C5: the last mobile piece walks into a 大本营 (E4)', () => {
  test('positives — shown even with alerts off', () => {
    expect(check(pos({ a1: 'rM', b2: 'r5', c1: 'rM', e12: 'bF', a12: 'b3' }), 'b2-b1')).toBe('C5');
    expect(check(pos({ c1: 'rM', d2: 'r9', e1: 'rM', a12: 'bF', b12: 'b3' }), 'd2-d1', { enabled: false })).toBe('C5');
    expect(check(pos({ a1: 'rF', d11: 'r4', e12: 'bF', a12: 'b3' }), 'd11-d12')).toBe('C5');
  });
  test('negatives: another piece can still move; not a 大本营; a capture into it', () => {
    expect(check(pos({ a1: 'rM', b2: 'r5', e5: 'r2', c1: 'rM', e12: 'bF', a12: 'b3' }), 'b2-b1')).toBeNull();
    expect(check(pos({ a1: 'rM', b2: 'r5', c1: 'rM', e12: 'bF', a12: 'b3' }), 'b2-b3')).not.toBe('C5');
    expect(check(pos({ a1: 'rF', d11: 'r4', d12: 'b2', e12: 'bF', a12: 'b3' }), 'd11xd12')).not.toBe('C5');
  });
});
