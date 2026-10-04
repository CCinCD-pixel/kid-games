import { describe, expect, it } from 'vitest';
import { createStore, exportProgress, importProgress, LEGACY_KEYS, readLegacyLadders, readLegacySokoban, snapshotLegacyProgress, storeKey } from '@kit/progress';
import { MemoryStorage } from '../helpers/memory-storage';

interface V1 { level: number }
interface V2 { level: number; stars: Record<string, number> }

describe('progress store', () => {
  it('returns defaults when empty or corrupted, and round-trips saves', () => {
    const storage = new MemoryStorage();
    const store = createStore<V1>('mars-base', { version: 1, defaults: () => ({ level: 1 }), storage, now: () => 1000 });
    expect(store.key).toBe('kg:v1:mars-base');
    expect(store.load()).toEqual({ level: 1 });
    store.update((s) => {
      s.level = 3;
    });
    expect(JSON.parse(storage.getItem('kg:v1:mars-base')!)).toEqual({ v: 1, updatedAt: 1000, data: { level: 3 } });
    expect(store.load()).toEqual({ level: 3 });
    storage.setItem('kg:v1:mars-base', '{not json');
    expect(store.load()).toEqual({ level: 1 });
  });

  it('migrates older versions and persists the upgrade', () => {
    const storage = new MemoryStorage();
    storage.setItem('kg:v1:mars-base', JSON.stringify({ v: 1, updatedAt: 1, data: { level: 4 } }));
    const store = createStore<V2>('mars-base', {
      version: 2,
      defaults: () => ({ level: 1, stars: {} }),
      migrate: (old, from) => (from === 1 ? { ...(old as V1), stars: {} } : (old as V2)),
      storage,
    });
    expect(store.load()).toEqual({ level: 4, stars: {} });
    expect(JSON.parse(storage.getItem('kg:v1:mars-base')!).v).toBe(2);
  });

  it('never overwrites data saved by a newer build', () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ v: 9, updatedAt: 1, data: { future: true } });
    storage.setItem('kg:v1:mars-base', raw);
    const store = createStore<V1>('mars-base', { version: 1, defaults: () => ({ level: 1 }), storage });
    expect(store.load()).toEqual({ level: 1 });
    expect(storage.getItem('kg:v1:mars-base')).toBe(raw);
  });

  it('imports a legacy key once when the store is empty', () => {
    const storage = new MemoryStorage();
    storage.setItem('sokoban_save', JSON.stringify({ best: { 0: 12, 3: 40 }, unlocked: 4 }));
    const store = createStore('sokoban', {
      version: 1,
      defaults: () => ({ best: {}, unlocked: 0 }),
      legacy: [{ key: LEGACY_KEYS.sokoban, read: readLegacySokoban }],
      storage,
    });
    expect(store.load()).toEqual({ best: { 0: 12, 3: 40 }, unlocked: 4 });
    expect(storage.getItem('sokoban_save')).not.toBeNull(); // legacy key is never deleted
    expect(store.envelope()?.data).toEqual({ best: { 0: 12, 3: 40 }, unlocked: 4 });
  });

  it('survives a full quota', () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const store = createStore<V1>('mars-base', { version: 1, defaults: () => ({ level: 1 }), storage });
    expect(store.save({ level: 2 })).toBe(false);
    expect(store.update((s) => ({ level: s.level + 1 }))).toEqual({ level: 2 });
  });

  it('rejects bad ids and versions', () => {
    expect(() => storeKey('Mars Base')).toThrow();
    expect(() => createStore('x', { version: 0, defaults: () => 1 })).toThrow();
  });
});

describe('legacy saves', () => {
  it('reads the real shapes of the old games', () => {
    expect(readLegacySokoban({ best: { '2': 30, x: 'y' }, unlocked: 2 })).toEqual({ best: { 2: 30 }, unlocked: 2 });
    expect(readLegacySokoban('nope')).toBeNull();
    const ladders = { ladders: { easy: { unlocked: 3, solved: { 1: { stars: 3, bestTimeMs: 9000 } } }, bad: 5 } };
    expect(readLegacyLadders(ladders)).toEqual({ ladders: { easy: { unlocked: 3, solved: { 1: { stars: 3, bestTimeMs: 9000 } } } } });
    expect(readLegacyLadders({})).toBeNull();
  });

  it('snapshotLegacyProgress copies into kg:v1:legacy-* idempotently', () => {
    const storage = new MemoryStorage();
    storage.setItem('kid_games_memory_matrix_v2', JSON.stringify({ ladders: { a: { unlocked: 2, solved: {} } } }));
    storage.setItem('sokoban_save', JSON.stringify({ best: {}, unlocked: 1 }));
    expect(snapshotLegacyProgress(storage).sort()).toEqual(['memory-matrix', 'sokoban']);
    expect(snapshotLegacyProgress(storage)).toEqual([]);
    expect(JSON.parse(storage.getItem('kg:v1:legacy-memory-matrix')!).data).toEqual({ ladders: { a: { unlocked: 2, solved: {} } } });
  });
});

describe('export / import', () => {
  it('round-trips kg:* and legacy keys only', () => {
    const a = new MemoryStorage();
    a.setItem('kg:v1:mars-base', '{"v":1,"updatedAt":1,"data":{}}');
    a.setItem('kg:log:v1', '[]');
    a.setItem('sokoban_save', '{"best":{},"unlocked":0}');
    a.setItem('unrelated', 'x');
    const bundle = exportProgress(a);
    expect(Object.keys(bundle.entries).sort()).toEqual(['kg:log:v1', 'kg:v1:mars-base', 'sokoban_save']);
    const b = new MemoryStorage();
    b.setItem('kg:log:v1', '["keep"]');
    expect(importProgress(JSON.parse(JSON.stringify(bundle)), { storage: b, overwrite: false })).toBe(2);
    expect(b.getItem('kg:log:v1')).toBe('["keep"]');
    expect(importProgress(bundle, { storage: b })).toBe(3);
    expect(b.getItem('kg:log:v1')).toBe('[]');
    expect(() => importProgress({ format: 'other' }, { storage: b })).toThrow();
  });
});
