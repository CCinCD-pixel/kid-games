import { describe, expect, it } from 'vitest';
import { LEVELS, PLAYABLE_VOLUMES, CAMPAIGN } from '../src/content';
import { batch, pct } from '../src/bots/evaluate';

describe.runIf(!!process.env.GF_BALANCE)('live campaign balance', () => {
  it('reports pressure points for child play', () => {
    for (const id of ['1-5', '1-10', '1-11', '2-3', '2-7', '2-11']) {
      const rows = (['K', 'K+', 'C'] as const).map((bot) => {
        const o = batch(LEVELS[id], bot, 40, { campaign: true }, true);
        if (id === '1-11' && bot === 'K+') {
          expect(pct(o)).toBeGreaterThanOrEqual(90);
          expect(o.dur / o.n).toBeLessThanOrEqual(240);
        }
        return `${bot} ${pct(o)}% ${Math.round(o.dur / o.n)}s, logs ${(o.logs / o.n).toFixed(1)}, causes ${JSON.stringify(o.causes)}`;
      });
      console.log(`${id}: ${rows.join(' | ')}`);
    }
  }, 180_000);

  it('measures child and expert wins against the authored rules', () => {
    const rows: string[] = [];
    let before = 0; let after = 0; let expert = 0;
    for (const vol of CAMPAIGN.volumes.filter((v) => PLAYABLE_VOLUMES.includes(v.id))) {
      for (const id of vol.levels) {
        const lv = LEVELS[id];
        const oldK = pct(batch(lv, 'K', 20));
        const newK = pct(batch(lv, 'K', 20, { campaign: true }));
        const newC = pct(batch(lv, 'C', 20, { campaign: true }));
        expect(newK, id).toBeGreaterThanOrEqual(oldK);
        rows.push(`${id} ${oldK}% -> ${newK}% child; ${newC}% expert`);
        before += oldK; after += newK; expert += newC;
      }
    }
    console.log(rows.join('\n'));
    console.log(`average child ${Math.round(before / rows.length)}% -> ${Math.round(after / rows.length)}%; expert ${Math.round(expert / rows.length)}%`);
    expect(rows).toHaveLength(22);
    expect(after - before).toBeGreaterThanOrEqual(rows.length * 10);
    expect(expert).toBeGreaterThanOrEqual(rows.length * 95);
  }, 180_000);
});
