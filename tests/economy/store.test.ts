import { describe, expect, it } from 'vitest';
import { DeviceClock } from '@kit/clock';
import { Economy, ECONOMY_KEY, decor, foods } from '@kit/economy';
import { MemoryStorage } from '../helpers/memory-storage';

const open = (storage: MemoryStorage, dev = 'deviceA') => new Economy({ storage, now: () => 0, clock: new DeviceClock({ storage, now: () => 0, device: () => dev }) });

describe('star-coin ledger', () => {
  it('matches the priced v1 catalog and fixed earning amounts', () => {
    expect(decor).toHaveLength(24);
    expect(decor.reduce((sum, item) => sum + item.price, 0)).toBe(1520);
    expect(foods.map((f) => f.price)).toEqual([10, 20, 20, 30, 50]);
    const e = open(new MemoryStorage());
    expect(e.earn('mission.new', { id: 'mn:orbit.O1.1:1:deviceA', ref: 'orbit.O1.1' })?.amount).toBe(26);
    expect(e.earn('check.run', { id: 'ck:deviceA.1', ref: '1' })?.amount).toBe(16);
    expect(e.balance()).toBe(42);
  });
  it('awards a completed order once across reload and two tabs; a repeated purchase costs once', () => {
    const storage = new MemoryStorage(); const a = open(storage); const b = open(storage, 'deviceB');
    const id = 'mn:orbit.O1.1:1:deviceA';
    expect(a.earn('mission.new', { id, ref: 'orbit.O1.1' })?.amount).toBe(26);
    expect(b.earn('mission.new', { id, ref: 'orbit.O1.1' })?.id).toBe(id);
    expect(b.balance()).toBe(26);
    expect(a.spend('buy', 'wall.poster')?.amount).toBe(20);
    expect(b.spend('buy', 'wall.poster')?.id).toBe('b:wall.poster');
    expect(open(storage).balance()).toBe(6);
    expect(open(storage).owned()).toContain('wall.poster');
  });
  it('keeps an event written before a tab overwrites the summary', () => {
    const storage = new MemoryStorage(); const a = open(storage); const b = open(storage);
    a.earn('mission.new', { id: 'mn:orbit.O1.1:1:deviceA', ref: 'orbit.O1.1' });
    b.earn('mission.new', { id: 'mn:orbit.O1.2:1:deviceA', ref: 'orbit.O1.2' });
    storage.setItem(ECONOMY_KEY, JSON.stringify({ v: 1, ledger: [], pet: {}, seen: [] }));
    expect(open(storage).balance()).toBe(52);
  });
  it('does not spend coins when storage refuses writes, and retries an award from pending', () => {
    const storage = new MemoryStorage(); const e = open(storage);
    const award = { id: 'mn:orbit.O1.1:1:deviceA', kind: 'earn' as const, amount: 26, src: 'mission.new', ref: 'orbit.O1.1' };
    storage.failWrites = true;
    expect(e.flush([award])).toEqual([]);
    expect(e.balance()).toBe(0);
    expect(e.spend('buy', 'wall.poster')).toBeNull();
    storage.failWrites = false;
    expect(e.flush([award])).toEqual([award.id]);
    expect(e.flush([award])).toEqual([award.id]);
    expect(e.balance()).toBe(26);
  });
  it('records pet growth in events, so later price changes cannot undo it', () => {
    const e = open(new MemoryStorage());
    e.earn('mission.new', { id: 'mn:orbit.O1.1:1:deviceA', ref: 'orbit.O1.1' });
    e.earn('mission.new', { id: 'mn:orbit.O1.2:1:deviceA', ref: 'orbit.O1.2' });
    e.grant('egg', 'rover');
    const meal = e.spend('feed', 'rover:bolt');
    expect(meal?.ref).toBe('rover:bolt:33');
    expect(e.growth('rover')).toBe(33);
    expect(e.balance()).toBe(32);
  });
  it('never charges for an item already received as a gift', () => {
    const e = open(new MemoryStorage());
    e.earn('mission.new', { id: 'mn:orbit.O1.1:1:deviceA', ref: 'orbit.O1.1' });
    e.grant('gift', 'item:wall.poster');
    expect(e.spend('buy', 'wall.poster')).toBeNull();
    expect(e.balance()).toBe(26);
  });
  it('preserves another tab\'s pet edit and applies a room move in one write', () => {
    const storage = new MemoryStorage(); const a = open(storage); const b = open(storage, 'deviceB');
    expect(a.setPet('name:rover', '小探')).toBe(true);
    expect(b.setPet('slot:hab:wall0', 'wall.poster')).toBe(true);
    expect(a.setPets({ 'slot:hab:wall0': null, 'slot:hab:wall1': 'wall.poster' })).toBe(true);
    expect(b.getPet('name:rover')).toBe('小探');
    expect(b.getPet('slot:hab:wall0')).toBeNull();
    expect(b.getPet('slot:hab:wall1')).toBe('wall.poster');
    storage.failWrites = true;
    expect(a.setPets({ 'slot:hab:wall1': null, 'slot:hab:wall2': 'wall.poster' })).toBe(false);
    storage.failWrites = false;
    expect(open(storage).getPet('slot:hab:wall1')).toBe('wall.poster');
    expect(open(storage).getPet('slot:hab:wall2')).toBeNull();
  });
});
