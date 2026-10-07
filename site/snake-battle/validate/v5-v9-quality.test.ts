/** V5 spawn fairness, V7 render load, V8 no focus on him, V9 no blind AI deaths (spec §9.2). Full tier only. */
import { describe, expect, it } from 'vitest';
import { FULL, writeReport } from './bots';
import { v5spawn, v7load, v8v9, type Gate } from './quality';

describe.skipIf(!FULL)('V5 + V7 + V8 + V9', () => {
  it('spawns are safe, the screen stays in budget, AIs play fair and see what they hit', () => {
    const t0 = Date.now(); const gates: Gate[] = [v5spawn('idle'), v5spawn('kid'), v7load(), ...v8v9(6)];
    writeReport('v5-v9-quality', { sec: Math.round((Date.now() - t0) / 1000), gates: gates.map(([ok, s]) => `${ok ? '✓' : '✗'} ${s}`) });
    const bad = gates.filter(([ok]) => !ok).map(([, s]) => s);
    expect(bad, bad.join('\n')).toEqual([]);
  }, 6 * 3600_000);
});
