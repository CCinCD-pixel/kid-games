import { describe, expect, test } from 'vitest';
import { resolve } from '../src/core/combat';
import { BOMB, ENG, FLAG, MINE, NAMES, rankOf, typeFromCode } from '../src/core/pieces';

describe('combat matrix (spec §3.6 R6.2)', () => {
  test('all 10 × 12 attacker/defender combinations', () => {
    let n = 0;
    for (let a = 2; a < 12; a++) {
      for (let d = 0; d < 12; d++) {
        let want: string;
        if (d === FLAG) want = 'F';
        else if (a === BOMB || d === BOMB) want = 'B';
        else if (d === MINE) want = a === ENG ? 'A' : 'D';
        else want = rankOf(a) > rankOf(d) ? 'A' : rankOf(a) < rankOf(d) ? 'D' : 'B';
        expect(resolve(a, d), `${NAMES[a]} → ${NAMES[d]}`).toBe(want);
        n++;
      }
    }
    expect(n).toBe(120);
  });
  test('spot checks', () => {
    const T = typeFromCode;
    expect([resolve(T('9'), T('M')), resolve(T('1'), T('M')), resolve(T('B'), T('M')), resolve(T('B'), T('F')), resolve(T('1'), T('F')), resolve(T('9'), T('9'))]).toEqual(['D', 'A', 'B', 'F', 'F', 'B']);
    expect(resolve(T('1'), T('9'))).toBe('D');
    expect(resolve(T('9'), T('B'))).toBe('B');
    expect(resolve(T('2'), T('1'))).toBe('A');
  });
  test('mines and flags never attack', () => {
    expect(() => resolve(MINE, 5)).toThrow();
    expect(() => resolve(FLAG, 5)).toThrow();
  });
});
