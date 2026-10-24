import { describe, expect, it } from 'vitest';
import { createStore } from '../../kit/progress';
import { inboxKey, readSide, sideKey, type SlotInbox } from '../../kit/sync/sidecar';
import { R } from '../../kit/sync/rules';
import { MemoryStorage } from '../helpers/memory-storage';

interface Save { stars: number; sessions: number; tier: number; control: string }
const rule = R.obj<Save>({ stars: R.max, sessions: R.sum, tier: R.lww, control: R.local });
const defaults = (): Save => ({ stars: 0, sessions: 0, tier: 1, control: 'left' });
const valid = (x: unknown): x is Save => !!x && typeof x === 'object' && typeof (x as Save).stars === 'number' && typeof (x as Save).sessions === 'number' && typeof (x as Save).tier === 'number' && typeof (x as Save).control === 'string';
const make = (storage: MemoryStorage) => createStore('sync-fixture', { version: 1, defaults, storage, sync: { merge: rule, validate: valid, migrateFrom: (x) => x as Save } });
const inbox = (storage: MemoryStorage, data: SlotInbox) => storage.setItem(inboxKey('sync-fixture'), JSON.stringify(data));
const remote = (stars: number): SlotInbox => ({ sv: 1, v: 1, rev: 3, wire: { d: { stars, sessions: { remote: 3 }, tier: 4 }, st: { '/tier': [40_000_000_000, 'remote'] } } });

describe('sync sidecar load boundary', () => {
  it('joins remote and local values before the first screen reads a save', () => {
    const storage = new MemoryStorage(), store = make(storage);
    expect(store.save({ stars: 3, sessions: 2, tier: 1, control: 'right' })).toBe(true);
    inbox(storage, remote(7));
    expect(store.load()).toEqual({ stars: 7, sessions: 5, tier: 4, control: 'right' });
    expect(readSide(storage, 'sync-fixture')?.rev).toBe(3);
    expect(storage.getItem(inboxKey('sync-fixture'))).toBeNull();
    expect(store.load().sessions).toBe(5);
  });

  it('retries an inbox after the game data write fails', () => {
    class FailData extends MemoryStorage {
      failOnce = true;
      override setItem(key: string, value: string): void {
        if (key === 'kg:v1:sync-fixture' && this.failOnce) { this.failOnce = false; throw new DOMException('quota', 'QuotaExceededError'); }
        super.setItem(key, value);
      }
    }
    const storage = new FailData(), store = make(storage);
    storage.failOnce = false; store.save(defaults()); storage.failOnce = true;
    inbox(storage, remote(9));
    expect(store.load().stars).toBe(0);
    expect(storage.getItem(inboxKey('sync-fixture'))).not.toBeNull();
    expect(store.load().stars).toBe(9);
    expect(storage.getItem(inboxKey('sync-fixture'))).toBeNull();
  });

  it('finishes a sidecar after data landed but the final sidecar write failed', () => {
    class FailFinish extends MemoryStorage {
      sideWrites = 0;
      override setItem(key: string, value: string): void {
        if (key === sideKey('sync-fixture') && ++this.sideWrites === 2) throw new DOMException('quota', 'QuotaExceededError');
        super.setItem(key, value);
      }
    }
    const storage = new FailFinish(), store = make(storage);
    store.save(defaults()); inbox(storage, remote(8));
    expect(store.load().stars).toBe(8);
    expect(readSide(storage, 'sync-fixture')?.pending).toBeDefined();
    expect(store.load().stars).toBe(8);
    expect(readSide(storage, 'sync-fixture')?.pending).toBeUndefined();
    expect(storage.getItem(inboxKey('sync-fixture'))).toBeNull();
  });

  it('finishes a torn inbox before a subsequent save, without counting sessions twice', () => {
    class FailFinish extends MemoryStorage {
      sideWrites = 0;
      override setItem(key: string, value: string): void {
        if (key === sideKey('sync-fixture') && ++this.sideWrites === 2) throw new DOMException('quota', 'QuotaExceededError');
        super.setItem(key, value);
      }
    }
    const storage = new FailFinish(), store = make(storage);
    store.save({ ...defaults(), sessions: 2 });
    inbox(storage, remote(8));
    const merged = store.load();
    expect(merged.sessions).toBe(5);
    expect(readSide(storage, 'sync-fixture')?.pending).toBeDefined();
    store.save({ ...merged, sessions: 6 });
    expect(readSide(storage, 'sync-fixture')?.pending).toBeUndefined();
    inbox(storage, remote(8));
    expect(store.load().sessions).toBe(6);
  });

  it('a reset generation rejects a stale remote copy', () => {
    const storage = new MemoryStorage(), store = make(storage);
    store.save({ stars: 6, sessions: 4, tier: 3, control: 'right' });
    store.reset();
    expect(store.load()).toEqual(defaults());
    expect(readSide(storage, 'sync-fixture')?.g).toBeDefined();
    inbox(storage, remote(10));
    expect(store.load()).toEqual(defaults());
  });

  it('raises reset generation above a pending remote reset', () => {
    const storage = new MemoryStorage(), store = make(storage);
    store.save({ ...defaults(), stars: 6 });
    const old = remote(10);
    old.wire.g = [50_000_000_000, 'remote'];
    inbox(storage, old);
    store.reset();
    expect(readSide(storage, 'sync-fixture')!.g![0]).toBeGreaterThan(old.wire.g[0]);
    expect(store.load()).toEqual(defaults());
  });
});
