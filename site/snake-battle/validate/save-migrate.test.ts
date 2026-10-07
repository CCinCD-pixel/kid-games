/**
 * Save robustness (spec §8.9): nested defaults are deep-merged on load (a later build that adds a counter or
 * setting never sees undefined / NaN), the migrate hook is wired, and a v1 envelope survives a future v2 store.
 */
import { describe, expect, it } from 'vitest';
import { createStore, storeKey } from '@kit/progress';
import { SaveCtl, defaults, fillDefaults, migrateSave, SAVE_VERSION, type SbSaveV1 } from '../src/save';
import { zeroCounters } from '../src/match';

class Mem implements Storage {
  m = new Map<string, string>(); get length() { return this.m.size; }
  clear() { this.m.clear(); } getItem(k: string) { return this.m.get(k) ?? null; } key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); } setItem(k: string, v: string) { this.m.set(k, v); }
}
const KEY = storeKey('snake-battle');

describe('save load / migrate (spec §8.9)', () => {
  it('an older-shaped v1 save (missing nested fields) loads with every default filled in', () => {
    const st = new Mem();
    const old: Record<string, unknown> = JSON.parse(JSON.stringify(defaults()));
    delete (old.settings as Record<string, unknown>).crown; delete (old.life as Record<string, unknown>).kills; delete (old.session as Record<string, unknown>).lastEndAt;
    (old.venues as Record<string, Record<string, unknown>>).moon = { played: 4 }; old.missions = { c1m1: { attempts: 2, clears: 1 } };
    st.setItem(KEY, JSON.stringify({ v: 1, updatedAt: 0, data: old }));
    const s = new SaveCtl(st);
    expect(s.data.settings.crown).toBe(true); expect(s.data.life.kills).toBe(0); expect(s.data.session.lastEndAt).toBe(0);
    expect(s.data.venues.moon.played).toBe(4); expect(s.data.venues.moon.endless.bestPeak).toBe(0); expect(s.data.missions.c1m1.clears).toBe(1);
    // an incremental commit over the filled save never produces NaN
    s.startMatch('timed', 'moon'); s.commitProgress({ ...zeroCounters(), kills: 2, eaten: 30 });
    expect(Number.isFinite(s.data.life.kills)).toBe(true); expect(s.data.life.kills).toBe(2);
  });
  it('QA r4: null / non-object record entries never crash the boot; the game still plays', () => {
    const st = new Mem();
    st.setItem(KEY, JSON.stringify({ v: 1, updatedAt: 0, data: { missions: { c1m1: null, c1m2: 'x', c1m3: [1], c1m4: { clears: 2 } }, venues: { moon: null, mars: { played: 'x' } }, twinLevel: 'x' } }));
    const s = new SaveCtl(st);
    expect(Object.keys(s.data.missions)).toEqual(['c1m4']);
    expect(s.data.missions.c1m4.attempts).toBe(0); expect(s.data.missions.c1m4.clears).toBe(2);
    expect(s.data.venues.moon.played).toBe(0); expect(s.data.venues.mars.played).toBe(0);
    expect(s.data.twinLevel).toBeUndefined();
    expect(() => { s.currentMission(); s.canSkip('c1m2'); s.missionOpen('c1m5'); }).not.toThrow();
  });
  it('fillDefaults keeps saved scalars / arrays, ignores wrong types, fills nested objects', () => {
    const d = { a: 1, b: { c: 'x', d: [1] }, e: null as number | null };
    expect(fillDefaults(d, { a: 5, b: { d: [2, 3] }, e: 7, extra: 1 })).toEqual({ a: 5, b: { c: 'x', d: [2, 3] }, e: 7, extra: 1 });
    expect(fillDefaults(d, { a: 'bad', b: 3 })).toEqual(d);
    expect(fillDefaults(d, undefined)).toEqual(d);
  });
  it('migrate hook: a v1 envelope read by a future v2 store comes out complete', () => {
    expect(SAVE_VERSION).toBe(1);
    const st = new Mem();
    const v1 = defaults(); v1.firstRunDone = true; v1.owned.push('skin:mars');
    st.setItem(KEY, JSON.stringify({ v: 1, updatedAt: 0, data: { firstRunDone: true, owned: v1.owned } }));
    const v2 = createStore<SbSaveV1>('snake-battle', { version: 2, defaults, storage: st, migrate: migrateSave });
    const d = v2.load();
    expect(d.firstRunDone).toBe(true); expect(d.owned).toContain('skin:mars'); expect(d.settings.control).toBe('follow'); expect(d.life.wins).toBe(0);
    expect(JSON.parse(st.getItem(KEY)!).v).toBe(2);
  });
});

