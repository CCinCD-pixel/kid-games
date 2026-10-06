import { describe, expect, test } from 'vitest';
import * as B from '../src/core/board';
import { P, sq } from './helpers';

describe('board geometry (spec §3.2 R1)', () => {
  test('counts: 10 camps, 4 HQs, 32 rail stations, 32 diagonals, 35 rail edges, 133 lines', () => {
    let camps = 0, hqs = 0, rails = 0, edges = 0, railEdges = 0, diag = 0;
    for (let i = 0; i < B.N; i++) {
      if (B.isCamp(i)) camps++;
      if (B.isHQ(i)) hqs++;
      if (B.isRail(i)) rails++;
      for (const j of B.adj[i]) {
        if (j <= i) continue;
        edges++;
        if (B.isRailEdge(i, j)) railEdges++;
        if (B.X(i) !== B.X(j) && B.Y(i) !== B.Y(j)) diag++;
      }
    }
    expect([camps, hqs, rails]).toEqual([10, 4, 32]);
    expect(diag).toBe(32);
    expect(railEdges).toBe(35);
    expect(edges).toBe(133);
    expect(B.edges().length).toBe(133);
  });

  test('adjacency is symmetric and every diagonal touches a camp', () => {
    for (let i = 0; i < B.N; i++) {
      for (const j of B.adj[i]) {
        expect(B.adj[j]).toContain(i);
        expect(B.isAdj(i, j)).toBe(true);
        if (B.X(i) !== B.X(j) && B.Y(i) !== B.Y(j)) expect(B.isCamp(i) || B.isCamp(j)).toBe(true);
      }
    }
  });

  test('three crossings a/c/e are rail; mountain at b and d', () => {
    expect(['a6', 'c6', 'e6'].map((s) => B.adj[P(s)].map(sq).filter((t) => t.endsWith('7')))).toEqual([['a7'], ['c7'], ['e7']]);
    expect(B.adj[P('b6')].map(sq).filter((t) => t.endsWith('7'))).toEqual([]);
    expect(B.adj[P('d6')].map(sq).filter((t) => t.endsWith('7'))).toEqual([]);
    for (const [a, b] of [['a6', 'a7'], ['c6', 'c7'], ['e6', 'e7']]) {
      expect(B.isRailEdge(P(a), P(b))).toBe(true);
      expect(B.isCrossing(P(a), P(b))).toBe(true);
    }
  });

  test('spot links: c4 has 8, b1 HQ, a6, c6', () => {
    expect(B.adj[P('c4')].map(sq).sort()).toEqual(['b3', 'b4', 'b5', 'c3', 'c5', 'd3', 'd4', 'd5']);
    expect(B.adj[P('b1')].map(sq).sort()).toEqual(['a1', 'b2', 'c1']);
    expect(B.adj[P('a6')].map(sq).sort()).toEqual(['a5', 'a7', 'b5', 'b6']);
    expect(B.adj[P('c6')].map(sq).sort()).toEqual(['b5', 'b6', 'c5', 'c7', 'd5', 'd6']);
    expect(B.adj[P('c9')].length).toBe(8);
  });

  test('camp and HQ squares match the notation in the spec', () => {
    const camps = [...Array(B.N).keys()].filter(B.isCamp).map(sq).sort();
    expect(camps).toEqual(['b10', 'b3', 'b5', 'b8', 'c4', 'c9', 'd10', 'd3', 'd5', 'd8'].sort());
    const hqs = [...Array(B.N).keys()].filter(B.isHQ).map(sq).sort();
    expect(hqs).toEqual(['b1', 'b12', 'd1', 'd12']);
  });

  test('rail stations: rows 2, 6, 7, 11 and files a, e rows 2–11', () => {
    for (let i = 0; i < B.N; i++) {
      const row = 12 - B.Y(i), file = 'abcde'[B.X(i)];
      const want = [2, 6, 7, 11].includes(row) || ((file === 'a' || file === 'e') && row >= 2 && row <= 11);
      expect(B.isRail(i), sq(i)).toBe(want);
    }
  });

  test('railNext only follows rail edges; c column rail is only c6–c7', () => {
    for (let i = 0; i < B.N; i++) for (const j of B.railNext[i]) if (j >= 0) expect(B.isRailEdge(i, j)).toBe(true);
    expect(B.isRailEdge(P('c7'), P('c8'))).toBe(false);
    expect(B.isRailEdge(P('c5'), P('c6'))).toBe(false);
  });

  test('25 slots; slot mapping round-trips and BLUE is RED rotated 180°', () => {
    expect(B.SLOTS.length).toBe(25);
    for (const [r, c] of B.SLOTS) {
      const a = B.slotToIndex(B.RED, r, c), b = B.slotToIndex(B.BLUE, r, c);
      expect(B.indexToSlot(a)).toEqual({ side: B.RED, r, c });
      expect(B.indexToSlot(b)).toEqual({ side: B.BLUE, r, c });
      expect(B.X(a) + B.X(b)).toBe(4);
      expect(B.Y(a) + B.Y(b)).toBe(11);
    }
    for (let k = 0; k < 25; k++) {
      expect(B.stationSlot(B.slotStation(B.RED, k))).toBe(k);
      expect(B.stationSlot(B.slotStation(B.BLUE, k))).toBe(k);
    }
  });

  test('notation round trip', () => {
    for (let i = 0; i < B.N; i++) expect(B.parseSq(B.sq(i))).toBe(i);
    expect(sq(B.idx(0, 0))).toBe('a12');
    expect(sq(B.idx(4, 11))).toBe('e1');
    expect(() => B.parseSq('f3')).toThrow();
  });

  test('road distance is symmetric and respects the mountain', () => {
    expect(B.roadDist(P('b6'), P('b7'))).toBe(3);
    expect(B.roadDist(P('a6'), P('a7'))).toBe(1);
    for (let i = 0; i < B.N; i++) for (let j = 0; j < B.N; j++) expect(B.roadDist(i, j)).toBe(B.roadDist(j, i));
  });
});
