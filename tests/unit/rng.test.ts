import { describe, expect, it } from 'vitest';
import { createRng, hashString } from '@kit/rng';

describe('rng', () => {
  it('is deterministic for a seed (number or string)', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(createRng('mars:1').next()).toBe(createRng('mars:1').next());
    expect(createRng('mars:1').next()).not.toBe(createRng('mars:2').next());
  });

  it('matches the reference mulberry32 sequence (stable across releases)', () => {
    const r = createRng(1);
    expect(r.next()).toBeCloseTo(0.6270739405881613, 12);
    expect(r.next()).toBeCloseTo(0.002735721180215478, 12);
  });

  it('int stays in range and hits both ends', () => {
    const r = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => r.int(3, 1)).toThrow(RangeError);
  });

  it('shuffle returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = createRng(3).shuffle(input);
    expect(out).not.toBe(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('weighted never picks zero-weight items', () => {
    const r = createRng(9);
    for (let i = 0; i < 500; i += 1) expect(r.weighted(['a', 'b', 'c'], [1, 0, 3])).not.toBe('b');
    expect(() => r.weighted(['a'], [0])).toThrow();
    expect(() => r.pick([])).toThrow();
  });

  it('fork is independent of how much the parent was used', () => {
    const p1 = createRng(5);
    const p2 = createRng(5);
    p2.next();
    p2.next();
    expect(p1.fork('enemies').next()).toBe(p2.fork('enemies').next());
    expect(p1.fork('enemies').next()).not.toBe(p1.fork('items').next());
  });

  it('state can be saved and restored', () => {
    const r = createRng(11);
    r.next();
    const s = r.getState();
    const x = r.next();
    r.setState(s);
    expect(r.next()).toBe(x);
  });

  it('hashString is FNV-1a', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
  });
});
