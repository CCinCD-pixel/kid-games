import { describe, expect, test } from 'vitest';
import { pickDistinct, type Moment } from '../src/core/report';

const m = (ply: number, line: string, score: number): Moment => ({ ply, note: '', line, state: null as never, path: [], score });

describe('战报 key moments never repeat a caption (spec §5.6, QA r3)', () => {
  test('two bomb losses → one of them plus the child\'s biggest gain', () => {
    const r = pickDistinct([m(10, 'mc.rep.bomb', 17), m(20, 'mc.rep.bomb', 16), m(5, 'mc.rep.trade', 4), m(30, 'mc.rep.bigwin', 8)], 2);
    expect(r.map((x) => x.line)).toEqual(['mc.rep.bomb', 'mc.rep.bigwin']);
  });
  test('no gain → the next different caption; only duplicates → a single moment', () => {
    expect(pickDistinct([m(1, 'mc.rep.lostbig', 15), m(2, 'mc.rep.lostbig', 14), m(3, 'mc.rep.trade', 3)], 2).map((x) => x.line)).toEqual(['mc.rep.lostbig', 'mc.rep.trade']);
    expect(pickDistinct([m(1, 'mc.rep.lostbig', 15), m(2, 'mc.rep.lostbig', 14)], 2)).toHaveLength(1);
  });
});
