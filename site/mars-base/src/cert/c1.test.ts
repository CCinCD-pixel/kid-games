import { describe, expect, it } from 'vitest';
import { C1_NODES, c1AnswerIsCorrect, makeC1Items } from './c1';

describe('C1 value-place missions', () => {
  it('generates the full six-node chapter reproducibly with unique tasks', () => {
    expect(C1_NODES).toHaveLength(6);
    for (const node of C1_NODES) {
      for (let seed = 0; seed < 100; seed++) {
        const items = makeC1Items(node, seed);
        expect(items).toEqual(makeC1Items(node, seed));
        expect(items).toHaveLength(node.kind === 'boss' ? 8 : 6);
        expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
        for (const item of items) {
          if (item.family === 'pv2.read') expect(item.answer).toBe(item.rods * 10 + item.crystals);
          if (item.family === 'pv2.build') expect(item.answer).toBe(item.target);
          if (item.family === 'pv2.step') expect(item.answer).toBe(item.from + item.delta);
          if (item.family === 'pv2.split') expect(item.answer).toBe(item.total - item.rods * 10);
        }
      }
    }
  });

  it('requires both comparison steps and rejects empty input', () => {
    const compare = makeC1Items(C1_NODES[1], 88).find((item) => item.family === 'pv2.compare')!;
    expect(c1AnswerIsCorrect(compare, compare.answer)).toBe(false);
    expect(c1AnswerIsCorrect(compare, compare.answer, compare.decisive)).toBe(true);
    const read = makeC1Items(C1_NODES[0], 88)[0];
    expect(c1AnswerIsCorrect(read, '')).toBe(false);
  });
});
