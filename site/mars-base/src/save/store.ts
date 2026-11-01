/** Versioned store of the game (kit/progress) + the backup rule of spec §8.5: the ORIGINAL string of an old/corrupt save is copied away before anything else. */
import { createStore, type Store } from '@kit/progress';
import { randomSeed } from '@kit/rng';
import { defaultSave, SAVE_VERSION, type MarsSaveV5 } from './schema';
import { migrateTo6 } from './migrate';
import { META } from '../families';
import { NODE_BY_ID } from '../app/content';
import { repairSave } from './repair';

export const GAME = 'mars-base';
export const KEY = `kg:v1:${GAME}`;
const KEEP_BACKUPS = 2;

function tryStorage(): Storage | undefined { try { return globalThis.localStorage; } catch { return undefined; } }

/** Back up the raw string when the save is older than v6 or unreadable. Returns the backup key (if any). */
export function backupBeforeLoad(storage: Storage | undefined, now: number): string | null {
  if (!storage) return null;
  let raw: string | null = null;
  try { raw = storage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  let kind: 'pre-v6' | 'corrupt' | null = null;
  try { const env = JSON.parse(raw); if (!env || typeof env !== 'object' || typeof env.v !== 'number') kind = 'corrupt'; else if (env.v < SAVE_VERSION) kind = 'pre-v6'; else if (env.v > SAVE_VERSION) kind = null; } catch { kind = 'corrupt'; }
  if (!kind) return null;
  const k = `${KEY}:${kind}-${now}`;
  try {
    storage.setItem(k, raw);
    const mine: string[] = []; for (let i = 0; i < storage.length; i++) { const x = storage.key(i); if (x && x.startsWith(`${KEY}:${kind}-`)) mine.push(x); }
    mine.sort();
    for (const old of mine.slice(0, Math.max(0, mine.length - KEEP_BACKUPS))) storage.removeItem(old);
    return k;
  } catch { return null; }
}
/** A saved mission that names an unknown family / band / node is dropped (the node simply restarts). */
export function sanitize(s: MarsSaveV5): MarsSaveV5 {
  const m = s.mission;
  if (m) {
    const bad = m.items.some((i) => !META[i.fam] || i.band > META[i.fam].bands) || (m.kind === 'node' && !NODE_BY_ID[m.node]) || m.idx > (m.plan?.slots?.length ?? 0) + 4;
    if (bad || !m.plan) s.mission = null;
  }
  return s;
}
export interface SaveHandle { store: Store<MarsSaveV5>; load(): MarsSaveV5; save(s: MarsSaveV5): boolean; backup: string | null; /** the key the raw string of a structurally broken v5 save was kept under (or null) */ quarantined: string | null }
/** Keep the raw string of a save we had to repair or reset under `<key>:corrupt-<ts>` (the newest two stay). */
function quarantine(storage: Storage | undefined, raw: string | null, now: number): string | null {
  if (!storage || !raw) return null;
  const k = `${KEY}:corrupt-${now}`;
  try {
    storage.setItem(k, raw);
    const mine: string[] = []; for (let i = 0; i < storage.length; i++) { const x = storage.key(i); if (x && x.startsWith(`${KEY}:corrupt-`)) mine.push(x); }
    mine.sort(); for (const old of mine.slice(0, Math.max(0, mine.length - KEEP_BACKUPS))) storage.removeItem(old);
    return k;
  } catch { return null; }
}
export function openSave(opts: { storage?: Storage; now?: () => number; salt?: number } = {}): SaveHandle {
  const storage = opts.storage ?? tryStorage();
  const now = opts.now ?? Date.now;
  const salt = opts.salt ?? randomSeed() % 1_000_000;
  const backup = backupBeforeLoad(storage, now());
  const store = createStore<MarsSaveV5>(GAME, { version: SAVE_VERSION, defaults: () => defaultSave(salt), migrate: (old, from) => migrateTo6(old, from, salt), storage, now });
  const h: SaveHandle = {
    store, backup, quarantined: null,
    // load() never throws and never returns a half-save: structurally broken data is repaired field by field (raw string kept under :corrupt-<ts>), the rest of the progress survives
    load: () => {
      let raw: string | null = null; try { raw = storage?.getItem(KEY) ?? null; } catch { raw = null; }
      let loaded: unknown; try { loaded = store.load(); } catch { loaded = null; }
      const r = repairSave(loaded, salt);
      if (r.changed) { const wasCurrent = (() => { try { return JSON.parse(raw ?? 'null')?.v === SAVE_VERSION; } catch { return false; } })(); if (wasCurrent) h.quarantined = quarantine(storage, raw, now()); store.save(r.save); }
      return sanitize(r.save);
    },
    save: (s) => store.save(s),
  };
  return h;
}
