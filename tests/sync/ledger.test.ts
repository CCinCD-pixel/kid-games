// Ledger contract properties (union semilattice, clamped fold, visible-balance bounds, natural ids, id shapes, compaction, seeded Lamport).
import { describe, expect, it } from 'vitest';
import * as L from '@kit/sync/ledger';
import { runLedger } from './support/suites/ledger';

describe('ledger contract', () => {
  const res = runLedger(L, 20000);
  it('all ledger properties hold', () => { expect(res.failures).toEqual([]); });
  it('keeps >= 300 000 checks', () => { expect(res.n).toBeGreaterThanOrEqual(300_000); });
  it('lcSeed is capped and finite for any clock', () => {
    expect(L.lcSeed(Number.NaN)).toBe(0);
    expect(L.lcSeed(Infinity)).toBe(0);
    expect(L.lcSeed(1e300)).toBe(2 ** 33);
    expect(L.lcSeed(-5)).toBe(0);
  });
});
