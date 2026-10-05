/**
 * Versioned, per-game save data in localStorage, plus export/import and persistence.
 *
 * Keys: `kg:v1:<game>` → { "v": <schema version>, "updatedAt": <epoch ms>, "data": <T> }
 *
 *   interface MarsSave { chapter: number; stars: Record<string, number> }
 *   const store = createStore<MarsSave>('mars-base', {
 *     version: 2,
 *     defaults: () => ({ chapter: 1, stars: {} }),
 *     migrate: (old, from) => from === 1 ? { ...(old as MarsSave), stars: {} } : (old as MarsSave),
 *   });
 *   const save = store.load();            // never throws; defaults on any problem
 *   store.update((s) => { s.chapter = 2; });
 *
 * Rules: one store per game id; bump `version` + add a migration whenever the shape changes;
 * never delete a legacy key (old pages still read them). Big blobs (drawings, recordings) go to
 * IndexedDB, not here.
 */

export const NAMESPACE = 'kg:v1:';

export interface StoredEnvelope<T> {
  v: number;
  updatedAt: number;
  data: T;
}

export interface StoreOptions<T> {
  /** Current schema version (integer ≥ 1). */
  version: number;
  defaults: () => T;
  /** Upgrade data saved by an older schema version. */
  migrate?: (old: unknown, fromVersion: number) => T;
  /** Import from pre-kit keys the first time this store is empty. */
  legacy?: { key: string; read: (raw: unknown) => T | null }[];
  /** Injected for tests; defaults to localStorage. */
  storage?: Storage;
  /** Clock injection for tests. */
  now?: () => number;
}

export interface Store<T> {
  readonly key: string;
  load(): T;
  save(data: T): boolean;
  /** Mutate in place (return nothing) or return a new value. Saves and returns the result. */
  update(fn: (data: T) => T | void): T;
  reset(): void;
  /** Raw envelope (or null) — for debugging and the parent page. */
  envelope(): StoredEnvelope<T> | null;
}

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function safeParse(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function storeKey(game: string): string {
  if (!/^[a-z0-9][a-z0-9:-]*$/.test(game)) throw new Error(`progress: bad game id "${game}"`);
  return NAMESPACE + game;
}

export function createStore<T>(game: string, opts: StoreOptions<T>): Store<T> {
  if (!Number.isInteger(opts.version) || opts.version < 1) throw new Error('progress: version must be an integer ≥ 1');
  const key = storeKey(game);
  const storage = () => opts.storage ?? defaultStorage();
  const now = opts.now ?? Date.now;

  const write = (data: T): boolean => {
    const s = storage();
    if (!s) return false;
    try {
      s.setItem(key, JSON.stringify({ v: opts.version, updatedAt: now(), data } satisfies StoredEnvelope<T>));
      return true;
    } catch {
      return false; // quota / private mode
    }
  };

  const readEnvelope = (): StoredEnvelope<unknown> | null => {
    const env = safeParse(storage()?.getItem(key) ?? null) as StoredEnvelope<unknown> | null;
    if (!env || typeof env !== 'object' || typeof env.v !== 'number' || !('data' in env)) return null;
    return env;
  };

  const load = (): T => {
    const env = readEnvelope();
    if (env) {
      if (env.v === opts.version) return env.data as T;
      if (env.v < opts.version && opts.migrate) {
        try {
          const upgraded = opts.migrate(env.data, env.v);
          write(upgraded);
          return upgraded;
        } catch (err) {
          console.warn(`[progress] migration of ${key} from v${env.v} failed`, err);
        }
      }
      if (env.v > opts.version) {
        // Saved by a newer build (e.g. a stale cached page): keep it untouched, play on defaults.
        console.warn(`[progress] ${key} is v${env.v}, this page understands v${opts.version}`);
        return opts.defaults();
      }
    }
    for (const legacy of opts.legacy ?? []) {
      const raw = safeParse(storage()?.getItem(legacy.key) ?? null);
      if (raw == null) continue;
      try {
        const data = legacy.read(raw);
        if (data != null) {
          write(data);
          return data;
        }
      } catch (err) {
        console.warn(`[progress] legacy import from ${legacy.key} failed`, err);
      }
    }
    return opts.defaults();
  };

  return {
    key,
    load,
    save: write,
    update(fn) {
      const current = load();
      const result = fn(current);
      const next = (result === undefined ? current : result) as T;
      write(next);
      return next;
    },
    reset() {
      try {
        storage()?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
    envelope() {
      const env = readEnvelope();
      return env && env.v === opts.version ? (env as StoredEnvelope<T>) : null;
    },
  };
}

// ---------------------------------------------------------------- persistence

let persistAsked: Promise<boolean> | null = null;

/** Ask the browser not to evict our storage (granted more readily to home-screen apps). Once per page. */
export function requestPersistence(): Promise<boolean> {
  if (persistAsked) return persistAsked;
  const sm = (globalThis.navigator as Navigator | undefined)?.storage;
  persistAsked = sm?.persist ? sm.persist().catch(() => false) : Promise.resolve(false);
  return persistAsked;
}

// ---------------------------------------------------------------- hub card progress

/** `kg:hub:v1` → { [gameId]: HubProgress } — the one line of progress the hub card shows. */
export const HUB_PROGRESS_KEY = 'kg:hub:v1';

export interface HubProgress {
  /** fantasy-progress label for the card foot, e.g. "第 2 章" or "B 区 · 第 7 关" (≤ 12 chars) */
  label: string;
  /** 0..1 fill of the card's progress bar; omit for no bar */
  value?: number;
  updatedAt: number;
}

/**
 * Games call this when the child reaches a milestone, so the hub card reads e.g. "第 2 章" with a
 * progress bar. Keep the label a place in the story, never a skill or a score.
 *
 *   setHubProgress('mars-base', { label: '第 2 章', value: 0.45 });
 */
export function setHubProgress(game: string, p: { label: string; value?: number }, storage: Storage | undefined = defaultStorage()): void {
  if (!storage) return;
  storeKey(game); // validates the id
  const all = readHubProgress(storage);
  const value = typeof p.value === 'number' && Number.isFinite(p.value) ? Math.max(0, Math.min(1, p.value)) : undefined;
  all[game] = { label: String(p.label).slice(0, 24), ...(value === undefined ? {} : { value }), updatedAt: Date.now() };
  try {
    storage.setItem(HUB_PROGRESS_KEY, JSON.stringify(all));
  } catch {
    /* quota */
  }
}

export function readHubProgress(storage: Storage | undefined = defaultStorage()): Record<string, HubProgress> {
  const raw = safeParse(storage?.getItem(HUB_PROGRESS_KEY) ?? null);
  const out: Record<string, HubProgress> = {};
  if (!isObj(raw)) return out;
  for (const [game, v] of Object.entries(raw)) {
    if (!isObj(v) || typeof v.label !== 'string') continue;
    out[game] = { label: v.label, ...(typeof v.value === 'number' ? { value: v.value } : {}), updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : 0 };
  }
  return out;
}

// ---------------------------------------------------------------- legacy keys (pre-2026-10 games)

/** localStorage keys written by the old single-file games. Never deleted (old pages still read them). */
export const LEGACY_KEYS = {
  sokoban: 'sokoban_save',
  'memory-matrix': 'kid_games_memory_matrix_v2',
  'emoji-match': 'kid_games_emoji_match_v1',
} as const;

export interface LegacySokoban {
  /** best steps by level index (0-based, classic 10 levels) */
  best: Record<number, number>;
  /** highest unlocked level index */
  unlocked: number;
}

export interface LegacyLadderProgress {
  unlocked: number;
  solved: Record<number, { stars?: number; bestScore?: number; bestTimeMs?: number }>;
}

export interface LegacyLadders {
  ladders: Record<string, LegacyLadderProgress>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function readLegacySokoban(raw: unknown): LegacySokoban | null {
  if (!isObj(raw)) return null;
  const best: Record<number, number> = {};
  if (isObj(raw.best)) for (const [k, v] of Object.entries(raw.best)) if (Number.isFinite(Number(k)) && typeof v === 'number') best[Number(k)] = v;
  const unlocked = typeof raw.unlocked === 'number' ? raw.unlocked : 0;
  return { best, unlocked };
}

export function readLegacyLadders(raw: unknown): LegacyLadders | null {
  if (!isObj(raw) || !isObj(raw.ladders)) return null;
  const ladders: Record<string, LegacyLadderProgress> = {};
  for (const [id, lp] of Object.entries(raw.ladders)) {
    if (!isObj(lp)) continue;
    const solved: LegacyLadderProgress['solved'] = {};
    if (isObj(lp.solved)) for (const [n, rec] of Object.entries(lp.solved)) if (isObj(rec)) solved[Number(n)] = rec as LegacyLadderProgress['solved'][number];
    ladders[id] = { unlocked: typeof lp.unlocked === 'number' ? lp.unlocked : 1, solved };
  }
  return { ladders };
}

/**
 * Copy every legacy save into its kit namespace (`kg:v1:legacy-<game>`), non-destructively, so the
 * rebuilt games (星港搬运工, 月宫建造师, …) can import the child's history even after the old pages
 * are gone. Idempotent; called by the hub on start. Returns the games imported this time.
 */
export function snapshotLegacyProgress(storage: Storage | undefined = defaultStorage()): string[] {
  if (!storage) return [];
  const imported: string[] = [];
  const readers: Record<keyof typeof LEGACY_KEYS, (raw: unknown) => unknown> = {
    sokoban: readLegacySokoban,
    'memory-matrix': readLegacyLadders,
    'emoji-match': readLegacyLadders,
  };
  for (const game of Object.keys(LEGACY_KEYS) as (keyof typeof LEGACY_KEYS)[]) {
    const raw = safeParse(storage.getItem(LEGACY_KEYS[game]));
    if (raw == null) continue;
    const data = readers[game](raw);
    if (data == null) continue;
    const target = storeKey(`legacy-${game}`);
    const prev = safeParse(storage.getItem(target)) as StoredEnvelope<unknown> | null;
    const serialized = JSON.stringify(data);
    if (prev && JSON.stringify(prev.data) === serialized) continue;
    try {
      storage.setItem(target, JSON.stringify({ v: 1, updatedAt: Date.now(), data }));
      imported.push(game);
    } catch {
      /* quota */
    }
  }
  return imported;
}

// ---------------------------------------------------------------- export / import

export interface ProgressExport {
  format: 'kg-progress';
  version: 1;
  exportedAt: string;
  /** every kg:* key plus the legacy keys, raw string values */
  entries: Record<string, string>;
}

const exportable = (key: string) => key.startsWith('kg:') || (Object.values(LEGACY_KEYS) as string[]).includes(key);

export function exportProgress(storage: Storage | undefined = defaultStorage()): ProgressExport {
  const entries: Record<string, string> = {};
  if (storage) {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && exportable(key)) entries[key] = storage.getItem(key) ?? '';
    }
  }
  return { format: 'kg-progress', version: 1, exportedAt: new Date().toISOString(), entries };
}

/** Restore an export. `overwrite: false` keeps existing keys. Returns the number of keys written. */
export function importProgress(bundle: unknown, opts: { overwrite?: boolean; storage?: Storage } = {}): number {
  const storage = opts.storage ?? defaultStorage();
  if (!storage) return 0;
  if (!isObj(bundle) || bundle.format !== 'kg-progress' || !isObj(bundle.entries)) throw new Error('不是有效的进度备份文件');
  let n = 0;
  for (const [key, value] of Object.entries(bundle.entries)) {
    if (!exportable(key) || typeof value !== 'string') continue;
    if (opts.overwrite === false && storage.getItem(key) !== null) continue;
    storage.setItem(key, value);
    n += 1;
  }
  return n;
}

/** Trigger a JSON download of the export (parent page). */
export function downloadProgress(filename = `kid-games-progress-${new Date().toISOString().slice(0, 10)}.json`): void {
  const blob = new Blob([JSON.stringify(exportProgress(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
