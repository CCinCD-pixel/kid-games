// Dimension/law tests: 17 rule trees x 3000 random triples x (5 lattice laws + 2 dominance checks), garbage/prototype-pollution fuzz, overlay round trip on real-shaped fixtures.
// Randomised with a seeded RNG (no fast-check, zero new dependencies); the numbers are asserted so a silently shrinking suite fails.
import { describe, expect, it } from 'vitest';
import * as M from '@kit/sync/merge';
import { runProps } from './support/suites/props';
import { PROP_TREES } from './support/schemas';

describe('merge laws + dominance over randomised histories', () => {
  const res = runProps(M, { N: 3000 });
  it('every tree: idempotent, commutative, associative, identity, absorb, dominance', () => {
    expect(res.failures).toEqual([]);
    expect(res.passed).toBe(res.total);
  });
  it('covers 17 trees and >= 357 000 checks', () => {
    expect(Object.keys(PROP_TREES).length).toBe(17);
    expect(res.total).toBeGreaterThanOrEqual(357_000);
  });
  it('garbage JSON and __proto__/constructor keys never throw, never pollute, always merge idempotently', () => {
    expect(res.fuzzOk).toBe(res.fuzzTotal);
    expect(res.fuzzTotal).toBe(17 * 300);
  });
});
