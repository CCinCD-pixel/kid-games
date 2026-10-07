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

describe('QA r5: a left / killed run keeps its peak (spec §3.18, DoD 12)', () => {
  const peak = (n: number) => ({ ...zeroCounters(), peakGrown: n, eaten: 40 });
  it('endless leave keeps the record and unlocks 磁悬浮蛇 (800) + 火车头蛇 (600) + length badges', () => {
    const s = new SaveCtl(new Mem());
    s.startMatch('endless', 'moon'); const items = s.leaveMatch(peak(900), 150);
    const e = s.data.venues.moon.endless;
    expect(e.bestPeak).toBe(900); expect(e.bestLife).toBe(150); expect(e.runs).toBe(0);
    for (const k of ['skin:maglev', 'skin:loco', 'skin:digger', 'badge:len-100', 'badge:len-500']) { expect(s.data.owned).toContain(k); expect(items).toContain(k); expect(s.data.cardQueue).toContain(k); }
    expect(s.data.inProgress).toBeUndefined();
  });
  it('timed leave keeps the peak and unlocks 火车头蛇 at once (no rank, no played)', () => {
    const s = new SaveCtl(new Mem());
    s.startMatch('timed', 'moon'); s.leaveMatch(peak(650));
    expect(s.data.venues.moon.bestPeak).toBe(650); expect(s.data.venues.moon.played).toBe(0); expect(s.data.venues.moon.bestRank).toBeNull();
    expect(s.data.owned).toContain('skin:loco'); expect(s.data.owned).not.toContain('skin:maglev');
  });
  it('background → app killed → boot: the stored peak lands in the records and unlocks', () => {
    for (const mode of ['timed', 'endless'] as const) {
      const st = new Mem();
      const a = new SaveCtl(st); a.startMatch(mode, 'mars'); a.commitProgress(peak(900), 130);
      const b = new SaveCtl(st);   // reboot
      expect(b.data.inProgress).toBeUndefined();
      if (mode === 'timed') expect(b.data.venues.mars.bestPeak).toBe(900);
      else { expect(b.data.venues.mars.endless.bestPeak).toBe(900); expect(b.data.venues.mars.endless.bestLife).toBe(130); expect(b.data.owned).toContain('skin:maglev'); }
      expect(b.data.owned).toContain('skin:loco'); expect(b.data.cardQueue).toContain('skin:loco');
      expect(JSON.parse(st.getItem(KEY)!).data.inProgress).toBeUndefined();
    }
  });
});

describe('QA r5: challenge levels open in order (spec §4.8)', () => {
  it('2-2 / 3-2 / 4-2 wait for the level before them; a chapter opens after the previous boss', () => {
    const s = new SaveCtl(new Mem());
    const clear = (id: string) => { s.mission(id).clears = 1; s.mission(id).stars = 1; };
    for (let i = 1; i <= 8; i++) clear(`c1m${i}`);
    expect(s.missionOpen('c2m1')).toBe(true); expect(s.missionOpen('c2m2')).toBe(false);
    clear('c2m1'); expect(s.missionOpen('c2m2')).toBe(true); expect(s.missionOpen('c2m3')).toBe(false);
    expect(s.missionOpen('c3m1')).toBe(false);
    for (let i = 2; i <= 7; i++) clear(`c2m${i}`);
    expect(s.missionOpen('c3m1')).toBe(true); expect(s.missionOpen('c3m2')).toBe(false); expect(s.missionOpen('c4m2')).toBe(false);
    s.skip('c3m1'); expect(s.missionOpen('c3m2')).toBe(true);
  });
});
