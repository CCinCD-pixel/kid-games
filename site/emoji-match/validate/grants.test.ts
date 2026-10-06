/**
 * Booster grants (spec §5.5): deterministic, idempotent, capped — walked through a whole v1 journey.
 * The table is the shipped one (src/save.ts INTRO_GRANTS / ARRIVAL_GRANTS / grantFor), the same code the
 * intro card, the arrival screen and the puzzle result call.
 */
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../../tests/helpers/memory-storage';
import { ARRIVAL_GRANTS, GRANT_CAP, INTRO_GRANTS, LEGACY_KEY, grantFor, openSave, type EmSaveV1 } from '../src/save';
import { INTROS, PUZZLES } from '../src/content';

const fresh = (): EmSaveV1 => openSave(new MemoryStorage()).data;

describe('grants (spec §5.5)', () => {
  it('the table matches the spec: intro ×3 per tool, arrivals 2/3/4, every booster intro exists', () => {
    expect(Object.values(INTRO_GRANTS).map((g) => [g.grant, g.tool, g.n])).toEqual([['drill-intro', 'drill', 3], ['tractor-intro', 'tractor', 3], ['ion-intro', 'ion', 3]]);
    for (const id of Object.keys(INTRO_GRANTS)) expect(INTROS.some((x) => x.id === id), id).toBe(true);
    expect(ARRIVAL_GRANTS).toEqual({ 2: { drill: 2 }, 3: { drill: 1, tractor: 2 }, 4: { drill: 2, tractor: 2, ion: 2 } });
  });
  it('a full v1 journey (story order) gives the same inventory every time, never more on replays', () => {
    const journey = (s: EmSaveV1) => {
      const log: string[] = [];
      const ev = (e: Parameters<typeof grantFor>[1]) => { const g = grantFor(s, e); log.push(`${JSON.stringify(e)}→${JSON.stringify(g)}`); };
      ev({ k: 'puzzle', id: 'p1' });                     // unlocked after 1-05
      ev({ k: 'arrival', ep: 1 });                       // ep 1: the module only, no tools
      ev({ k: 'intro', id: 'boosterDrill' });            // 2-02
      ev({ k: 'puzzle', id: 'p2' });                     // after 2-05
      ev({ k: 'arrival', ep: 2 });
      ev({ k: 'intro', id: 'boosterTractor' });          // 3-02
      ev({ k: 'puzzle', id: 'p3' });
      ev({ k: 'arrival', ep: 3 });
      ev({ k: 'intro', id: 'boosterIon' });              // 4-02
      ev({ k: 'puzzle', id: 'p4' });
      ev({ k: 'arrival', ep: 4 });
      return log;
    };
    const a = fresh(), b = fresh();
    expect(journey(a)).toEqual(journey(b));
    // p1 {0,0,0} → drill · drill card +3 · p2 → tractor · ep2 drill +2 · tractor card +3 · p3 → ion ·
    // ep3 drill +1 tractor +2 · ion card +3 · p4 → ion · ep4 +2 each  ⇒  drill 9 (= cap), tractor 8, ion 7
    expect(a.boosters).toEqual({ drill: 9, tractor: 8, ion: 7 });
    expect(a.grants).toEqual(['p1', 'drill-intro', 'p2', 'ep2', 'tractor-intro', 'p3', 'ep3', 'ion-intro', 'p4', 'ep4']);
    const before = JSON.stringify(a);
    journey(a); // replaying everything (re-opened cards, replayed puzzles, re-won bosses) adds nothing
    expect(JSON.stringify(a)).toBe(before);
  });
  it('puzzle gift = the tool the child has fewest of, ties → drill', () => {
    const s = fresh();
    expect(grantFor(s, { k: 'puzzle', id: 'p1' })).toEqual({ drill: 1 });
    s.boosters = { drill: 2, tractor: 1, ion: 1 };
    expect(grantFor(s, { k: 'puzzle', id: 'p2' })).toEqual({ tractor: 1 });
    s.boosters = { drill: 5, tractor: 5, ion: 0 };
    expect(grantFor(s, { k: 'puzzle', id: 'p3' })).toEqual({ ion: 1 });
    expect(PUZZLES.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
  it('cap 9 per tool (no "full" message: the number just stops)', () => {
    const s = fresh();
    s.boosters = { drill: 8, tractor: 9, ion: 0 };
    grantFor(s, { k: 'arrival', ep: 4 });
    expect(s.boosters).toEqual({ drill: GRANT_CAP, tractor: GRANT_CAP, ion: 2 });
  });
  it('unknown events grant nothing; the veteran pack comes only from a legacy save', () => {
    const s = fresh();
    expect(grantFor(s, { k: 'intro', id: 'rocket' })).toBeNull();
    expect(grantFor(s, { k: 'arrival', ep: 1 })).toBeNull();
    expect(s.grants).toEqual([]);
    const st = new MemoryStorage(); st.setItem(LEGACY_KEY, JSON.stringify({ ladders: { fruit: { unlocked: 2, solved: { 1: { stars: 3 } } } } }));
    expect(openSave(st).data.boosters).toEqual({ drill: 1, tractor: 1, ion: 1 });
  });
});
