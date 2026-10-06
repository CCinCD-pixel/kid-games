import { describe, expect, test } from 'vitest';
import { createRng } from '@kit/rng';
import { RED } from '../src/core/board';
import { randomLayout } from '../src/core/layout';
import { legalMoves } from '../src/core/movegen';
import { apply } from '../src/core/rules';
import { setupFan, setupStandard } from '../src/core/state';
import golden from './golden.json';

describe('engine golden numbers (spec §9.1, byte-identical with the reference prototype)', () => {
  const pairs = Object.entries(golden).filter(([k]) => k.includes('|')) as Array<[string, { layouts: string[]; perft1: number; perft2: number; perft3: number }]>;
  for (const [name, g] of pairs) {
    test(`perft 1/2/3 ${name}`, { timeout: 20_000 }, () => {
      const s = setupStandard('ming', { red: g.layouts[0], blue: g.layouts[1], firstMover: RED });
      const ms = legalMoves(s);
      let p2 = 0, p3 = 0;
      for (const m of ms) {
        const s1 = apply(s, m).state;
        const m2 = legalMoves(s1);
        p2 += m2.length;
        for (const mm of m2) p3 += legalMoves(apply(s1, mm).state).length;
      }
      expect([ms.length, p2, p3]).toEqual([g.perft1, g.perft2, g.perft3]);
    });
  }
  test('翻翻棋 opening permutations for seeds 1, 42, 20261005 (kit createRng = mulberry32)', () => {
    for (const [seed, want] of Object.entries(golden.fanSeeds)) {
      const s = setupFan(createRng(Number(seed)).next);
      const got = [...s.board].map((p) => (p === -1 ? '..' : (s.pside[p] ? 'b' : 'r') + 'FMB123456789'[s.ptype[p]])).join('');
      expect(got).toBe(want);
    }
  });
  test('randomLayout for seeds 1–3', () => {
    for (const [seed, want] of Object.entries(golden.randomLayouts)) expect(randomLayout(createRng(Number(seed)).next)).toBe(want);
  });
});
