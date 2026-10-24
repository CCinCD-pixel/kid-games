/** A current-version save with damaged fields never blanks the app; its raw string is quarantined. */
import { describe, expect, it } from 'vitest';
import { createRng } from '@kit/rng';
import { KEY, openSave } from '../src/save/store';
import { repairSave } from '../src/save/repair';
import { defaultSave } from '../src/save/schema';
import { simulate } from './lib/sim';

class Mem implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; } clear() { this.m.clear(); } getItem(k: string) { return this.m.get(k) ?? null; } key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); } setItem(k: string, v: string) { this.m.set(k, v); }
}
const put = (st: Storage, data: unknown, v = 6) => st.setItem(KEY, JSON.stringify({ v, updatedAt: 1, data }));
const usable = (s: any) => {   // everything App.start touches
  expect(typeof s.onboarded).toBe('boolean'); expect(typeof s.session.index).toBe('number'); expect(typeof s.nodes).toBe('object'); expect(s.nodes).not.toBeNull();
  expect(Array.isArray(s.recent)).toBe(true); expect(Array.isArray(s.visited)).toBe(true); expect(['none', 'lit', 'half']).toContain(s.cert.C1.state);
  expect(typeof s.probes.vault.done).toBe('boolean'); expect(Array.isArray(s.orbit.tests)).toBe(true); expect(typeof s.settings.music).toBe('boolean'); expect(Array.isArray(s.direct.pending)).toBe(true);
};

describe('T3 save repair', () => {
  it.each([['{}', {}], ['nodes null', { nodes: null }], ['string', 'hello'], ['array', []], ['null', null], ['numbers for objects', { session: 5, cert: 3, nodes: 7, tags: 'x', orbit: [], probes: true, settings: 0, direct: 1 }],
    ['wrong leaf types', { onboarded: 'yes', session: { index: 'a', missions: null }, visited: 'orbit', recent: { a: 1 }, cert: { C1: { state: 'purple' } } }]])('%s', (_n, data) => {
    const st = new Mem(); put(st, data);
    const h = openSave({ storage: st, now: () => 777, salt: 9 }); const s = h.load();
    usable(s);
    expect(h.quarantined).toBe(`${KEY}:corrupt-777`); expect(st.getItem(`${KEY}:corrupt-777`)).toContain('"v":6');
    // the repaired save is what is stored now: loading again is clean and does not quarantine again
    const h2 = openSave({ storage: st, now: () => 888, salt: 9 }); usable(h2.load()); expect(h2.quarantined).toBeNull();
  });
  it('keeps the good parts: bad entries are dropped, valid progress survives', () => {
    const st = new Mem(); const good = defaultSave(3); good.nodes['orbit.O1.1'] = { st: 'done', stars: 3, plays: 2, ft: [1] }; good.onboarded = true; good.cards = ['p1'];
    put(st, { ...good, nodes: { ...good.nodes, 'orbit.O1.2': null, 'orbit.O1.3': { st: 'weird' }, 'orbit.O1.4': 'x' }, tags: { a: 5 } });
    const s = openSave({ storage: st, now: () => 1, salt: 3 }).load();
    expect(s.nodes['orbit.O1.1']).toMatchObject({ st: 'done', stars: 3 }); expect(Object.keys(s.nodes)).toEqual(['orbit.O1.1']); expect(s.onboarded).toBe(true); expect(s.cards).toEqual(['p1']); expect(s.tags).toEqual({});
  });
  it('a clean save is untouched (no false positive, no quarantine)', () => {
    const { save } = simulate('repair-clean', 'strong', { visits: 6 }) as unknown as { save: ReturnType<typeof defaultSave> };
    const st = new Mem(); put(st, save);
    const h = openSave({ storage: st, now: () => 5, salt: 1 }); const s = h.load();
    expect(h.quarantined).toBeNull(); expect(JSON.stringify(s)).toBe(JSON.stringify(save));
    expect(repairSave(save, 1).changed).toBe(false);
  });
  it('fuzz: 400 random structural mutations of a real save never throw and always give a playable save', () => {
    const rng = createRng('fuzz-save');
    const base = defaultSave(2); base.nodes['vault.K1.1'] = { st: 'done', stars: 2, plays: 1, ft: [1, 0] }; base.recent = ['a|b|1|1|0|0|0|m|1|n|']; base.visited = ['orbit'];
    const junk = [null, 0, 'x', [], {}, true, -1, NaN, [1, 2], { a: 1 }];
    const walk = (o: any, depth: number): void => {
      if (!o || typeof o !== 'object' || depth > 3) return;
      const keys = Object.keys(o); if (!keys.length) return; const k = keys[rng.int(0, keys.length - 1)];
      if (rng.chance(0.5)) o[k] = junk[rng.int(0, junk.length - 1)]; else if (rng.chance(0.4)) delete o[k]; else walk(o[k], depth + 1);
    };
    for (let i = 0; i < 400; i++) {
      const copy = JSON.parse(JSON.stringify(base)); for (let m = 0; m < 1 + (i % 4); m++) walk(copy, 0);
      const st = new Mem(); put(st, copy);
      let s: any; expect(() => { s = openSave({ storage: st, now: () => i, salt: 2 }).load(); }).not.toThrow();
      usable(s);
    }
  });
  it('localStorage that throws on every call still gives a fresh playable save', () => {
    const boom = { get length(): number { throw new Error('x'); }, getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); }, key() { throw new Error('x'); }, clear() { throw new Error('x'); } } as unknown as Storage;
    usable(openSave({ storage: boom, now: () => 1, salt: 1 }).load());
  });
});
