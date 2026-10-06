// Snapshots in IndexedDB 'kg-gear-fort' (spec §8.8): one pause/suspend snapshot + one checkpoint, never in
// localStorage. Writes are queued to an idle callback (never on the 战鼓 tick). Falls back to memory when IndexedDB
// is missing or blocked (private mode, tests) — the game then simply resumes within the session only.
import type { Snapshot } from './lane/sim';

export interface SnapRec { key: 'suspend' | 'checkpoint'; level: string; kind: 'suspend' | 'checkpoint'; seed: number; loadout: string[]; snap: Snapshot; h: string; kernelVersion: string; restored: number; assist: number; flag: number; at: string }

const mem = new Map<string, SnapRec>();
let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') return res(null);
      const r = indexedDB.open('kg-gear-fort', 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('snapshots')) d.createObjectStore('snapshots', { keyPath: 'key' }); if (!d.objectStoreNames.contains('replays')) d.createObjectStore('replays', { autoIncrement: true }); };
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}
const idle = (f: () => void): void => { const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }; if (w.requestIdleCallback) w.requestIdleCallback(f, { timeout: 500 }); else setTimeout(f, 0); };

/** keep the record in memory now; write it to IndexedDB on the next idle moment */
export function putSnap(rec: SnapRec, now = false): Promise<void> {
  mem.set(rec.key, rec);
  return new Promise((res) => {
    const go = (): void => { void db().then((d) => { if (!d) return res(); try { const tx = d.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').put(rec); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch { res(); } }); };
    if (now) go(); else idle(go);
  });
}
export async function getSnap(key: SnapRec['key']): Promise<SnapRec | null> {
  if (mem.has(key)) return mem.get(key)!;
  const d = await db(); if (!d) return null;
  return new Promise((res) => { try { const q = d.transaction('snapshots').objectStore('snapshots').get(key); q.onsuccess = () => res((q.result as SnapRec) ?? null); q.onerror = () => res(null); } catch { res(null); } });
}
export async function delSnap(key: SnapRec['key']): Promise<void> {
  mem.delete(key); const d = await db(); if (!d) return;
  await new Promise<void>((res) => { try { const tx = d.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').delete(key); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch { res(); } });
}
