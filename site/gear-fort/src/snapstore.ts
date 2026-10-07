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
const idle = (f: () => void): void => { if (typeof window === 'undefined') { setTimeout(f, 0); return; } const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }; if (w.requestIdleCallback) w.requestIdleCallback(f, { timeout: 500 }); else setTimeout(f, 0); };

// ── compact storage form (spec §8.8 snap ≤ 18 KB): every array of records (enemies, units, bolts …) is stored column-wise —
// the field names once, then one row of values per record; a field a record lacks is stored as ABSENT. Lossless (the
// round trip is deep-equal and the kernel's own hash check still runs on resume); the kernel's snapshot() is unchanged.
const ABSENT = '\u0000';
type Packed = { $k: string[]; $r: unknown[][] };
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function packSnap(snap: Snapshot): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(snap as unknown as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length >= 2 && v.every(isRec)) {
      const keys: string[] = []; for (const o of v) for (const f of Object.keys(o)) if (!keys.includes(f)) keys.push(f);
      out[k] = { $k: keys, $r: v.map((o) => keys.map((f) => (f in o ? o[f] : ABSENT))) } satisfies Packed;
    } else out[k] = v;
  }
  return out;
}
export function unpackSnap(p: Record<string, unknown>): Snapshot {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (isRec(v) && Array.isArray(v.$k) && Array.isArray(v.$r)) { const keys = v.$k as string[]; out[k] = (v.$r as unknown[][]).map((row) => { const o: Record<string, unknown> = {}; keys.forEach((f, i) => { if (row[i] !== ABSENT) o[f] = row[i]; }); return o; }); }
    else out[k] = v;
  }
  return out as unknown as Snapshot;
}
const SNAP_PACKED = 2; // SnapRec.packed: the IndexedDB copy holds packSnap(snap)

/** keep the record in memory now; write it to IndexedDB on the next idle moment */
/** a durable snapshot resumes only on the kernel that wrote it, for the level the save points at (spec §8.4, V14):
 *  anything else is discarded (the map then offers no 接着推演 and logs gf-desync) */
export function usableSnap(rec: Pick<SnapRec, 'kernelVersion' | 'level'> | null | undefined, level: string, kernel: string): boolean { return !!rec && rec.kernelVersion === kernel && rec.level === level; }
export function putSnap(rec: SnapRec, now = false): Promise<void> {
  mem.set(rec.key, rec);
  return new Promise((res) => {
    const go = (): void => { void db().then((d) => { if (!d) return res(); try { const tx = d.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').put({ ...rec, snap: packSnap(rec.snap), packed: SNAP_PACKED }); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch { res(); } }); };
    if (now) go(); else idle(go);
  });
}
export async function getSnap(key: SnapRec['key']): Promise<SnapRec | null> {
  if (mem.has(key)) return mem.get(key)!;
  const d = await db(); if (!d) return null;
  return new Promise((res) => { try { const q = d.transaction('snapshots').objectStore('snapshots').get(key); q.onsuccess = () => { const r = (q.result as (SnapRec & { packed?: number }) | undefined) ?? null; if (r && r.packed === SNAP_PACKED) { r.snap = unpackSnap(r.snap as unknown as Record<string, unknown>); delete r.packed; } res(r); }; q.onerror = () => res(null); } catch { res(null); } });
}
export async function delSnap(key: SnapRec['key']): Promise<void> {
  mem.delete(key); const d = await db(); if (!d) return;
  await new Promise<void>((res) => { try { const tx = d.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').delete(key); tx.oncomplete = () => res(); tx.onerror = () => res(); } catch { res(); } });
}

// ── replays (spec §8.8 / §9.11): the last 8 games {level, seed, loadout, assist, result, stars, actions, at}, each ≤ 8 KB —
// the input of tools/gear-fort/calibrate.mjs (the K model is fitted to his real first tries). Exported from ?dev=export.
export interface ReplayRec { level: string; seed: number; from: number; loadout: string[]; assist: number; result: 'win' | 'lose' | 'abandon'; stars: number; tick: number; actions: [number, unknown[]][]; at: string; kernelVersion: string; truncated?: boolean }
export const REPLAY_KEEP = 8, REPLAY_MAX_BYTES = 8 * 1024;
const memReplays: ReplayRec[] = [];
/** cap one record at 8 KB: drop the latest actions first and say so (a truncated log still calibrates its first minutes) */
export function capReplay(rec: ReplayRec): ReplayRec {
  const r: ReplayRec = { ...rec, actions: rec.actions.slice() };
  while (r.actions.length && JSON.stringify(r).length > REPLAY_MAX_BYTES) { r.actions.splice(Math.max(1, Math.floor(r.actions.length * 0.9))); r.truncated = true; }
  return r;
}
export function putReplay(rec: ReplayRec): Promise<void> {
  const r = capReplay(rec); memReplays.push(r); if (memReplays.length > REPLAY_KEEP) memReplays.splice(0, memReplays.length - REPLAY_KEEP);
  return new Promise((res) => {
    idle(() => { void db().then((d) => {
      if (!d) return res();
      try {
        const tx = d.transaction('replays', 'readwrite'); const st = tx.objectStore('replays'); st.add(r);
        const k = st.getAllKeys(); k.onsuccess = () => { const keys = k.result as IDBValidKey[]; for (const old of keys.slice(0, Math.max(0, keys.length + 1 - REPLAY_KEEP - 1))) st.delete(old); };
        tx.oncomplete = () => res(); tx.onerror = () => res();
      } catch { res(); }
    }); });
  });
}
/** oldest first */
export async function getReplays(): Promise<ReplayRec[]> {
  const d = await db(); if (!d) return memReplays.slice();
  return new Promise((res) => { try { const q = d.transaction('replays').objectStore('replays').getAll(); q.onsuccess = () => res(((q.result as ReplayRec[]) || []).slice(-REPLAY_KEEP)); q.onerror = () => res(memReplays.slice()); } catch { res(memReplays.slice()); } });
}
