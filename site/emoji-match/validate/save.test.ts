/** save.test (spec §8.7): legacy import cases, reset without re-import, read-only guard, grants. */
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../../tests/helpers/memory-storage';
import { LEGACY_KEY, SNAPSHOT_KEY, assistTier, grant, openSave } from '../src/save';

const ladders = (solved: boolean) => JSON.stringify({ ladders: { fruit: { unlocked: 3, solved: solved ? { 1: { stars: 2 } } : {} } } });

describe('save', () => {
  it('legacy key with progress → veteran pack once', () => {
    const s = new MemoryStorage(); s.setItem(LEGACY_KEY, ladders(true));
    const h = openSave(s);
    expect(h.data.grants).toEqual(['veteran']);
    expect(h.data.boosters).toEqual({ drill: 1, tractor: 1, ion: 1 });
    expect(h.data.veteranToast).toBe(true);
    expect(s.getItem(LEGACY_KEY)).not.toBeNull(); // never deleted
  });
  it('only the hub snapshot (envelope) → veteran', () => {
    const s = new MemoryStorage(); s.setItem(SNAPSHOT_KEY, JSON.stringify({ v: 1, updatedAt: 1, data: JSON.parse(ladders(true)) }));
    expect(openSave(s).data.grants).toEqual(['veteran']);
  });
  it('neither / no solved levels / broken legacy → fresh defaults', () => {
    expect(openSave(new MemoryStorage()).data.grants).toEqual([]);
    const s = new MemoryStorage(); s.setItem(LEGACY_KEY, ladders(false));
    expect(openSave(s).data.grants).toEqual([]);
    const b = new MemoryStorage(); b.setItem(LEGACY_KEY, '{oops');
    expect(openSave(b).data.boosters.drill).toBe(0);
  });
  it('reset keeps the veteran grant and does not re-import the legacy pack', () => {
    const s = new MemoryStorage(); s.setItem(LEGACY_KEY, ladders(true));
    const h = openSave(s);
    h.data.levels['1-01'] = { stars: 3, bestLeft: 5, attempts: 1, wins: 1, failStreak: 0 };
    h.commit();
    h.resetProgress();
    const again = openSave(s);
    expect(again.data.levels).toEqual({});
    expect(again.data.grants).toEqual(['veteran']);
    expect(again.data.boosters).toEqual({ drill: 0, tractor: 0, ion: 0 });
  });
  it('read-only when a newer page wrote the save', () => {
    const s = new MemoryStorage(); s.setItem('kg:v1:emoji-match', JSON.stringify({ v: 2, updatedAt: 1, data: { future: true, firstRunDone: true, levels: { '1-01': { stars: 3, bestLeft: 4, attempts: 1, wins: 1, failStreak: 0 } } } }));
    const h = openSave(s);
    expect(h.readOnly).toBe(true);
    // plays with the data that was read, not defaults (no cutscene, progress visible)
    expect(h.data.firstRunDone).toBe(true);
    expect(h.data.levels['1-01']?.stars).toBe(3);
    expect(h.data.boosters).toEqual({ drill: 0, tractor: 0, ion: 0 });
    h.data.attemptSeq = 9; h.commit();
    expect(JSON.parse(s.getItem('kg:v1:emoji-match')!).v).toBe(2);
  });
  it('grants are idempotent and capped at 9; assist tiers 2/4/6', () => {
    const h = openSave(new MemoryStorage());
    expect(grant(h.data, 'drill-intro', { drill: 3 })).toBe(true);
    expect(grant(h.data, 'drill-intro', { drill: 3 })).toBe(false);
    for (let k = 0; k < 5; k += 1) grant(h.data, `x${k}`, { drill: 3 });
    expect(h.data.boosters.drill).toBe(9);
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(assistTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});
