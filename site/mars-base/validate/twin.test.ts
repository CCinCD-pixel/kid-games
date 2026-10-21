/** QA fix-mars-r1 (tech minor): a twin is an EQUIVALENT item — same carry / cross / zero flags and size band as the item that needed the H3 (spec §8.2). */
import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/save/schema';
import { NODES } from '../src/app/content';
import { isBuilt, family } from '../src/families';
import { dealItem, dealTwin, featuresMatch, planMission } from '../src/app/planMission';

describe('twin items are feature-matched', () => {
  it('over 20 salts x every ready node x every main slot: ≥ 97 % of twins match the original (was 43-90 % per family), never the same facts', () => {
    let n = 0; let ok = 0; const perFam: Record<string, [number, number]> = {};
    for (let salt = 1; salt <= 20; salt++) for (const node of NODES.filter((x) => x.kind !== 'calib' && x.items.every((i) => isBuilt(i.fam)))) {
      const save = defaultSave(salt); save.session.index = 2;
      const plan = planMission(save, node.id, 2, { noWarm: true }); const facts = new Set<string>();
      plan.slots.forEach((slot, idx) => {
        if (slot.kind !== 'main') return;
        const item = dealItem(save, plan, idx, facts); const f = family(item.fam);
        const twin = dealTwin(save, plan, item, facts, 1);
        const m = featuresMatch(f.features(twin.params as never, twin.ask), f.features(item.params as never, item.ask));
        n++; if (m) ok++; const e = (perFam[item.fam] ??= [0, 0]); e[0]++; if (m) e[1]++;
        if (!item.fam.startsWith('open.')) expect(JSON.stringify(twin.params), `${node.id} twin must differ`).not.toBe(JSON.stringify(item.params));
      });
    }
    expect(n).toBeGreaterThan(2000); expect(ok / n).toBeGreaterThanOrEqual(0.97);
    for (const [fam, [a, b]] of Object.entries(perFam)) if (a >= 20) expect(b / a, fam).toBeGreaterThanOrEqual(0.8);
  });
});
