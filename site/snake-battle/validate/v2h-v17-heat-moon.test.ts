/** V2h + V17 for moon (spec §3.17, §9.2; one file per venue so the full tier runs them in parallel). Full tier only. */
import { describe, expect, it } from 'vitest';
import { FULL, N_OVERRIDE, writeReport } from './bots';
import { heatSuite } from './quality';

describe.skipIf(!FULL)('V2h + V17 heat (moon)', () => {
  it('top-3 does not rise with heat; the closed loop settles in the band', () => {
    const t0 = Date.now(); const { gates, summary } = heatSuite('moon', N_OVERRIDE || 120, N_OVERRIDE ? Math.ceil(N_OVERRIDE / 2) : 60);
    writeReport('v2h-v17-moon', { sec: Math.round((Date.now() - t0) / 1000), summary, gates: gates.map(([ok, s]) => `${ok ? '✓' : '✗'} ${s}`) });
    const bad = gates.filter(([ok]) => !ok).map(([, s]) => s);
    expect(bad, bad.join('\n')).toEqual([]);
  }, 6 * 3600_000);
});
