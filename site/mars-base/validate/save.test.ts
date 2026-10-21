/** V13 save v5: v4 → v5 migration × {full, mid-mission, corrupt}, backups, size on a 300-mission fixture, sanity of a dropped mission. Spec §8.5. */
import { describe, expect, it } from 'vitest';
import { KEY, backupBeforeLoad, openSave } from '../src/save/store';
import { SAVE_BUDGET_BYTES } from '../src/app/tuning';
import { simulate } from './lib/sim';
import type { SaveV4 } from '../src/save/migrate';

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
const v4Full = (): SaveV4 => ({
  onboardingDone: true, activeArea: 'orbit',
  completed: ['orbit.O1.0', 'orbit.O1.1', 'orbit.O1.2'], skipped: ['orbit.O1.3', 'orbit.O1.4'],
  calibrations: [{ nodeId: 'orbit.O1.0', at: 100, score: { r2: 0.95, slope: 1, pae: 0.05, pass: true } }],
  cert: { completed: ['cert.C1.1', 'cert.C1.2'] }, addition: { completed: ['cert.C2.1'] }, subtraction: { completed: [] },
});
const put = (st: Storage, v: number, data: unknown) => st.setItem(KEY, JSON.stringify({ v, updatedAt: 1, data }));

describe('V13 save v5', () => {
  it('v4 full: completed nodes survive; calibration nodes re-open as voided; onboarding replays; tests are invalid; new salt; backup exists', () => {
    const st = new MemStorage(); put(st, 4, v4Full());
    const h = openSave({ storage: st, now: () => 5000, salt: 777 });
    const s = h.load();
    expect(h.backup).toBe(`${KEY}:pre-v5-5000`); expect(st.getItem(`${KEY}:pre-v5-5000`)).toContain('"orbit.O1.0"');
    for (const id of ['orbit.O1.1', 'orbit.O1.2', 'cert.C1.1', 'cert.C1.2', 'cert.C2.1']) expect(s.nodes[id].st, id).toBe('done');
    expect(s.nodes['orbit.O1.0']).toMatchObject({ st: 'open', why: 'voided' });
    expect(s.nodes['orbit.O1.4']).toMatchObject({ st: 'open', why: 'voided' });
    expect(s.nodes['orbit.O1.3'].st).toBe('open');            // skipped by the (voided) calibration → open again
    expect(s.onboarded).toBe(false); expect(s.tutorials).toEqual({}); expect(s.mission).toBeNull();
    expect(s.orbit.tests).toHaveLength(1); expect(s.orbit.tests[0].valid).toBe(false); expect(s.orbit.tests[0].targets).toEqual([]);
    expect(s.salt).toBe(777); expect(s.cert.C1.state).toBe('none'); expect(s.buildings).toEqual({});
    // idempotent: loading again (now v5) gives the same thing; the migration re-run on the backup gives the same save
    const again = openSave({ storage: st, now: () => 6000, salt: 1 }).load();
    expect(again).toEqual(s);
    const st2 = new MemStorage(); st2.setItem(KEY, st.getItem(`${KEY}:pre-v5-5000`)!);
    expect(openSave({ storage: st2, now: () => 5000, salt: 777 }).load()).toEqual(s);
  });
  it('v4 mid-mission: active* cannot be restored → no mission, same node still open, plays not increased', () => {
    const st = new MemStorage(); const d: SaveV4 = { ...v4Full(), active: { nodeId: 'orbit.O2.1', seed: 3, index: 2, attempts: 0, estimates: [], firstTry: [] }, cert: { completed: [], active: { nodeId: 'cert.C1.3', seed: 1, index: 1, attempts: 1, firstTry: [true] } } };
    put(st, 4, d);
    const s = openSave({ storage: st, now: () => 1, salt: 9 }).load();
    expect(s.mission).toBeNull(); expect(s.nodes['orbit.O2.1']?.st ?? 'open').toBe('open'); expect(s.nodes['orbit.O2.1']?.plays ?? 0).toBe(0); expect(s.nodes['cert.C1.3']?.st ?? 'open').toBe('open');
  });
  it('corrupt save: raw string kept under :corrupt-<ts>, game starts on defaults; an unknown newer version is never overwritten', () => {
    const st = new MemStorage(); st.setItem(KEY, '{not json');
    const h = openSave({ storage: st, now: () => 42, salt: 5 }); const s = h.load();
    expect(h.backup).toBe(`${KEY}:corrupt-42`); expect(st.getItem(`${KEY}:corrupt-42`)).toBe('{not json');
    expect(s.nodes).toEqual({}); expect(s.salt).toBe(5);
    const st3 = new MemStorage(); put(st3, 9, { whatever: true });
    const h3 = openSave({ storage: st3, salt: 5 }); h3.load(); expect(h3.save(h3.load())).toBe(false);
    expect(JSON.parse(st3.getItem(KEY)!).v).toBe(9);
  });
  it('a migration that throws still leaves the original string in a backup and starts fresh', () => {
    const st = new MemStorage(); put(st, 3, { weird: 1 });
    const h = openSave({ storage: st, now: () => 7, salt: 5 }); const s = h.load();
    expect(st.getItem(`${KEY}:pre-v5-7`)).toContain('weird'); expect(s.session.index).toBe(0);
  });
  it('only the 2 newest backups are kept', () => {
    const st = new MemStorage();
    for (const t of [1, 2, 3, 4]) { st.setItem(KEY, JSON.stringify({ v: 4, updatedAt: t, data: v4Full() })); backupBeforeLoad(st, t); }
    const keys = Array.from({ length: st.length }, (_, i) => st.key(i)!).filter((k) => k.includes('pre-v5')).sort();
    expect(keys).toEqual([`${KEY}:pre-v5-3`, `${KEY}:pre-v5-4`]);
  });
  it('v5 round trip is exact; a saved mission naming an unknown family is dropped', () => {
    const st = new MemStorage(); const h = openSave({ storage: st, salt: 3 }); const s = h.load();
    s.onboarded = true; s.nodes['orbit.O1.0'] = { st: 'done', stars: 0, plays: 1, ft: [1] };
    s.mission = { node: 'orbit.O1.1', kind: 'node', idx: 1, items: [{ key: 'k', fam: 'nope.fam', tag: null, band: 1, level: 1, rep: 'A', mode: 'normal', params: {}, seed: 1 }], results: [], startedAt: 1, activeMs: 1, facts: [], seedBase: 'x', plan: { node: 'orbit.O1.1', kind: 'node', slots: [], seedBase: 'x' } };
    expect(h.save(s)).toBe(true);
    expect(openSave({ storage: st, salt: 4 }).load().mission).toBeNull();
    s.mission = null; h.save(s);
    expect(openSave({ storage: st, salt: 4 }).load()).toEqual(s);
  });
  it(`a worst-case 300-mission fixture (full ring, every node, 20 calibrations, a mission in progress) stays ≤ ${SAVE_BUDGET_BYTES / 1024} KB (hard limit 64 KB)`, () => {
    const r = simulate('size:1', 'strong', { visits: 100, per: () => 3 });
    const save = r.save;
    expect(save.session.missions).toBeGreaterThan(30);
    while (save.recent.length < 300) save.recent.push(save.recent[save.recent.length % Math.max(1, save.recent.length)] ?? 'a1b2c3d4|nl.place|3|1|0|0|0|m|12|orbit.O2.1|');
    for (let i = 0; i < 20; i++) save.orbit.tests.push({ node: 'orbit.O2.6', L: 1000, at: 1_700_000_000_000 + i, targets: [6, 18, 34, 78, 122, 163, 246, 366, 486, 606, 754, 938], est: [9, 20, 30, 90, 130, 170, 250, 340, 500, 640, 700, 900], r2: 0.97, slope: 1.01, pae: 0.04, pass: true, valid: true });
    save.mission = { node: 'orbit.O2.1', kind: 'node', idx: 5, startedAt: 1, activeMs: 99, facts: Array.from({ length: 12 }, (_, i) => `nl.place:{"L":1000,"target":${100 + i}}`), seedBase: 'mars-base:1:2:3', results: [], twins: 1, visit: 9,
      items: Array.from({ length: 12 }, (_, i) => ({ key: `orbit.O2.1#${i}`, fam: 'nl.place', tag: 'nl.est', band: 2, level: 3, rep: 'P' as const, mode: 'normal' as const, params: { L: 1000, target: 100 + i, anchors: 'every100', mode: 'every10', tol: 30, tolPct: 3 }, seed: 123456789, slot: 'main' as const, node: 'orbit.O2.1', typed: false, buildFirst: false })),
      plan: { node: 'orbit.O2.1', kind: 'node', seedBase: 'x', slots: Array.from({ length: 14 }, () => ({ kind: 'main' as const, fam: 'nl.place', band: 2, knobs: { L: 1000, anchors: 'every100', near: { min: 30, max: 50 } }, mode: 'normal' as const, node: 'orbit.O2.1', force: { target: 123 }, typed: false })) } };
    const bytes = JSON.stringify({ v: 5, updatedAt: 1, data: save }).length;
    expect(bytes, `${bytes} bytes`).toBeLessThanOrEqual(SAVE_BUDGET_BYTES);
    expect(save.recent.length).toBe(300);
  });
});
