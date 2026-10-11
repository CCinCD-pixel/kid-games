import { describe, expect, it } from 'vitest';
import { ADDITION_NODES, makeAdditionItems } from './model';

describe('addition missions', () => {
  it('generates each C2 mission reproducibly with distinct, valid problems', () => {
    expect(ADDITION_NODES).toHaveLength(8);
    for (const node of ADDITION_NODES) {
      for (let seed = 0; seed < 80; seed++) {
        const items = makeAdditionItems(node, seed);
        expect(items).toEqual(makeAdditionItems(node, seed));
        expect(items).toHaveLength(node.kind === 'boss' ? 8 : 6);
        expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
        for (const item of items) {
          expect(item.a).toBeGreaterThan(0);
          expect(item.b).toBeGreaterThan(0);
          expect(item.answer).toBe(item.a + item.b);
          expect(item.answer).toBeLessThan(100);
          expect(item.carry).toBe(Number(item.a % 10 + item.b % 10 >= 10));
          if (item.strategy === 'makeTen') {
            expect(item.firstPart).toBe(10 - item.a % 10);
            expect(item.secondPart).toBe(item.b - item.firstPart!);
            expect(item.secondPart).toBeGreaterThan(0);
          }
          if (item.strategy === 'compensate') expect(item.firstPart).toBe(1 + (item.a % 10 === 8 ? 1 : 0));
        }
      }
    }
  });

  it('mixes carry and no-carry in the two-digit workshop', () => {
    const items = makeAdditionItems(ADDITION_NODES[3], 17);
    expect(items.slice(0, 3).every((item) => item.carry === 0)).toBe(true);
    expect(items.slice(3).every((item) => item.carry === 1)).toBe(true);
  });
});
