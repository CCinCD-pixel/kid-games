// Self-merge neutrality: after every game-style write (including the ones that LOWER a value) one sync round must leave the state unchanged, and a passive device must converge.
import { describe, expect, it } from 'vitest';
import * as M from '@kit/sync/merge';
import { runNeutral } from './support/suites/neutral';

describe('self-merge neutrality', () => {
  it('8 stores, 300 writes each, a sync round after every write: 0 violations', () => {
    const r = runNeutral(M);
    expect(r.failures).toEqual([]);
    expect(r.ops).toBeGreaterThanOrEqual(2400);
    expect(r.checks).toBeGreaterThanOrEqual(2400);
  });
  it('negative control: re-opening a mars node WITHOUT g++ is caught', () => { expect(runNeutral(M, { negative: true, stores: ['mars-base'] }).total).toBeGreaterThan(0); });
  it('negative control: the v1.0 rule puzzles.tier = max is caught', () => { expect(runNeutral(M, { legacyTier: true, stores: ['xiangqi'] }).total).toBeGreaterThan(0); });
});
