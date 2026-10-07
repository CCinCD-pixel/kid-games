/** V2 visibility (spec §9.2, review B3): ≤10 % of KID deaths come from something off his portrait screen 0.8 s before. Full tier only. */
import { describe, expect, it } from 'vitest';
import { FULL, N_OVERRIDE, writeReport } from './bots';
import { v2offscreen } from './quality';

describe.skipIf(!FULL)('V2 off-screen deaths', () => {
  it('lethal things were on his screen', () => {
    const t0 = Date.now(); const { gates, raw } = v2offscreen(['moon', 'mars', 'jupiter', 'blackhole'], N_OVERRIDE || 40);
    writeReport('v2-offscreen', { sec: Math.round((Date.now() - t0) / 1000), raw, gates: gates.map(([ok, s]) => `${ok ? '✓' : '✗'} ${s}`) });
    const bad = gates.filter(([ok]) => !ok).map(([, s]) => s);
    expect(bad, bad.join('\n')).toEqual([]);
  }, 6 * 3600_000);
});
