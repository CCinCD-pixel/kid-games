// V7 (spec §9.1): quick band check — every level × R/K/C × 20 seeds; asserts only the obvious misses (K more than 12
// points outside its band, C < 90 %, R above its band by > 12). The design solutions (D) replay in src/lane/fixtures.test.ts.
// Not part of the shared check: GF_QUICK=1 npx vitest run site/gear-fort/tools/bands.quick.test.ts  (≤ 60 s)
import { describe, expect, it } from 'vitest';
import { batch, pct } from '../src/bots/evaluate';
import { LEVELS, CAMPAIGN } from '../src/content';
import BANDS from '../../../content/gear-fort/bands.json';
import { TYPE2 } from './bands-v2';

const ON = !!(process.env.GF_QUICK || process.env.GF_FULL); const VOL = +(process.env.GF_VOL || 1);
const B = BANDS as unknown as { TYPE: Record<string, Record<string, unknown>>; OVERRIDE: Record<string, Record<string, unknown>> };

describe.runIf(ON)(`V7 quick bands, volume ${VOL}`, () => {
  it('R / K / C × 20 seeds stay near their bands', () => {
    const bad: string[] = [];
    for (const id of CAMPAIGN.volumes[VOL - 1].levels) {
      const lv = LEVELS[id]; const band = { ...B.TYPE[lv.type!], ...(B.OVERRIDE[id] || {}) } as { R: [number, number]; K: [number, number]; C: number };
      const R = pct(batch(lv, 'R', 20)), K = pct(batch(lv, 'K', 20)), C = pct(batch(lv, 'C', 20));
      if (VOL === 2) { // volume 2: K2h in its band + the wide K band (tools/bands-v2.ts, as V8 judges it)
        const b2 = TYPE2[lv.type!]; const K2h = pct(batch(lv, 'K2h', 20));
        if (K2h < b2.K2h[0] - 12 || K2h > b2.K2h[1] + 12) bad.push(`${id} K2h ${K2h}% vs [${b2.K2h}]`);
        if (K < b2.K[0] - 12 || K > b2.K[1] + 12) bad.push(`${id} K ${K}% vs [${b2.K}]`);
      } else if (K < band.K[0] - 12 || K > band.K[1] + 12) bad.push(`${id} K ${K}% vs [${band.K}]`);
      if (C < 90) bad.push(`${id} C ${C}%`);
      if (R > band.R[1] + 12) bad.push(`${id} R ${R}% vs [${band.R}]`);
    }
    expect(bad).toEqual([]);
  }, 120_000);
});
