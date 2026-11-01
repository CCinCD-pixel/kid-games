/**
 * QA fix-mars-r2: five stage signatures were listed by the test hook but are never dealt by any real mission (nl.calib lo, open.pv3 / open.pv3cmp / open.groups / open.arrays hands|lo).
 * They belong to TAGLESS families (no difficulty ladder): such a family is always dealt at the fixed level 3 (a cert / probe / warm slot may pin 3 or 4), so `level <= 2` — what makes
 * a signature `lo` / `hands` — cannot occur. The test hook no longer samples level 1 for them (src/dev/test-hook.ts); this proves the claim from the planner, not from the sampler.
 */
import { describe, expect, it } from 'vitest';
import { family } from '../src/families';
import { levelFor } from '../src/app/adaptive';
import { NODES } from '../src/app/content';
import { planMission, planProbe, planCertWall } from '../src/app/planMission';
import { defaultSave } from '../src/save/schema';
import { START_LEVEL_MASTERED } from '../src/app/tuning';
// @ts-expect-error -- plain ESM helper with no declaration file
import { DEAD_SIGS as DEAD } from '../../../tools/mars-base/touch-sweep-sigs.mjs';
const DEAD_SIGS = DEAD as string[];

describe('dead stage signatures', () => {
  const fams = [...new Set(DEAD_SIGS.map((s) => s.split('|')[0]))];
  it('five documented signatures, all of tagless families', () => {
    expect(DEAD_SIGS).toHaveLength(5);
    for (const f of fams) expect(family(f).tag, `${f} has a ladder tag`).toBeNull();
    expect(levelFor(defaultSave(0), null)).toBe(START_LEVEL_MASTERED); expect(START_LEVEL_MASTERED).toBeGreaterThanOrEqual(3);
  });
  it('no planned slot of any node / probe / wall pins such a family to level 1 or 2 (so nothing real can deal `lo` / `hands`)', () => {
    const save = defaultSave(0); const bad: string[] = [];
    const check = (plan: ReturnType<typeof planMission>, where: string) => { for (const s of plan.slots) if (fams.includes(s.fam) && s.level !== undefined && s.level <= 2) bad.push(`${where}: ${s.fam} level ${s.level}`); };
    for (const n of NODES) for (const visit of [1, 2, 5]) for (const noWarm of [true, false]) { try { check(planMission(save, n.id, visit, { noWarm }), `${n.id}@${visit}`); } catch { /* an unbuilt node */ } }
    for (const z of ['vault', 'factory', 'balance'] as const) check(planProbe(save, z, 1), `probe.${z}`);
    check(planCertWall(save, ['C1', 'C2', 'C3'], 1), 'wall');
    expect(bad, bad.join('\n')).toEqual([]);
  });
  it('a ladder family is different: its level-1 signature exists (so the sampler still covers lo / hands for them)', () => { expect(family('col.add').tag).not.toBeNull(); expect(family('pv3.build').tag).not.toBeNull(); });
});
