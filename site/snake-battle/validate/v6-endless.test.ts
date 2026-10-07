/** V6 无尽 (spec §4.3, §9.2) on the production setup with player-model brains; 24 runs per venue × model. Full tier only. */
import { describe, expect, it } from 'vitest';
import { FULL, N_OVERRIDE, writeReport } from './bots';
import { v6endless } from './quality';

describe.skipIf(!FULL)('V6 endless', () => {
  it('lives last, always end naturally, length 800 is reachable', () => {
    const t0 = Date.now(); const { gates, res } = v6endless(N_OVERRIDE || 24);
    writeReport('v6-endless', { sec: Math.round((Date.now() - t0) / 1000), res, gates: gates.map(([ok, s]) => `${ok ? '✓' : '✗'} ${s}`) });
    const bad = gates.filter(([ok]) => !ok).map(([, s]) => s);
    expect(bad, bad.join('\n')).toEqual([]);
  }, 6 * 3600_000);
});
