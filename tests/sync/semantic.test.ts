// Semantic oracle tests: expected merged values written down by hand on real-game-shaped saves (the lattice laws cannot see a lawful-but-wrong merge).
import { describe, expect, it } from 'vitest';
import * as M from '@kit/sync/merge';
import { runSemantic } from './support/suites/semantic';

describe('semantic oracle on real-game-shaped saves', () => {
  const res = runSemantic(M);
  it('every hand-written expectation holds', () => { expect(res.failures).toEqual([]); });
  it('keeps at least the 78 assertions of the v1.1 prototype', () => { expect(res.n).toBeGreaterThanOrEqual(78); });
});
