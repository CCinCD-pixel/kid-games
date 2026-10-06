/**
 * Save schema v1 (spec §8.7) on kit/progress (`kg:v1:sokoban`), with
 *  - read-only protection: a save written by a NEWER build (envelope v > 1, e.g. a stale cached
 *    page) is never overwritten — this page plays on defaults and every write is a no-op
 *    (kit's createStore only protects load(); platform request §8.12 #1);
 *  - legacy import from the hub snapshot `kg:v1:legacy-sokoban` (an envelope) first, else the old
 *    game's `sokoban_save`: old level i → 经典仓库 C(i+1) "passed (旧记录)"; the old `unlocked` opens
 *    the classic track up to that level; old levels 1–7 all passed → veteran. Old keys are never
 *    deleted (kit rule).
 */
import { createStore, LEGACY_KEYS, readLegacySokoban, type LegacySokoban, type Store } from '@kit/progress';
import type { RandomSpec } from './random';

export type DeadKind = 'corner' | 'wall' | 'pair' | 'square';
export type Stars = 0 | 1 | 2 | 3;

export interface LevelRec {
  /** fewest pushes (null for imported legacy records: the old game counted steps) */
  best: number | null;
  stars: Stars;
  clean: boolean;
  firstClean: boolean;
  plays: number;
  hintMax: 0 | 1 | 2 | 3;
  legacy?: true;
  cert?: true;
  twinStars?: Stars;
}

export interface SaveV1 {
  tutorialDone: boolean;
  levels: Record<string, LevelRec>;
  quiz: Record<string, { stars: number; firstTry: number }>;
  cert: { offered: boolean; passed: boolean; at?: number };
  chaptersSeen: number[];
  taught: DeadKind[];
  named: (DeadKind | 'generic')[];
  onceLines: string[];
  arrows: 'locked' | 'celebrate' | 'on';
  launched: { total: number; byDest: { tiangong: number; moon: number; mars: number }; random: number };
  random: { nextSeed: number; recent: number[]; byTier: [number, number, number, number]; poolIdx: [number, number, number, number] };
  cosmetics: { owned: string[]; equipped: Partial<Record<'plate' | 'hat' | 'lamp' | 'badge' | 'paint' | 'antenna' | 'tool' | 'tread', string>> };
  cards: string[];
  settings: { swipe: 'auto' | 'on' | 'off'; autoRoute: boolean };
  finale: { v1At?: number; v2At?: number };
  /** a level left half-way; a random order keeps its whole warehouse (`rnd`) so it can be rebuilt exactly */
  inProgress?: { id: string; hist: string; at: number; tier?: 1 | 2 | 3 | 4; seed?: number; poolIdx?: number; rnd?: RandomSpec };
  stats: { pushes: number; undos: number; redos: number; restarts: number; deadEvents: number; deadDelayed: number; selfRescues: number; activeMs: number };
  wrapShownAt?: number;
  /** legacy import: classic track open up to this index (0-based), and the veteran flag */
  classicUnlocked?: number;
  veteran?: boolean;
}

export const SAVE_KEY = 'kg:v1:sokoban';
export const LEGACY_SNAPSHOT_KEY = 'kg:v1:legacy-sokoban';

export function defaults(): SaveV1 {
  return {
    tutorialDone: false,
    levels: {},
    quiz: {},
    cert: { offered: false, passed: false },
    chaptersSeen: [],
    taught: [],
    named: [],
    onceLines: [],
    arrows: 'locked',
    launched: { total: 0, byDest: { tiangong: 0, moon: 0, mars: 0 }, random: 0 },
    random: { nextSeed: 1, recent: [], byTier: [0, 0, 0, 0], poolIdx: [0, 0, 0, 0] },
    cosmetics: { owned: [], equipped: {} },
    cards: [],
    settings: { swipe: 'auto', autoRoute: true },
    finale: {},
    stats: { pushes: 0, undos: 0, redos: 0, restarts: 0, deadEvents: 0, deadDelayed: 0, selfRescues: 0, activeMs: 0 },
  };
}

/** Old progress → classic records ("passed", legacy badge), frontier and veteran flag. */
export function importLegacy(legacy: LegacySokoban | null): SaveV1 | null {
  if (!legacy) return null;
  const save = defaults();
  for (const k of Object.keys(legacy.best)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i > 9) continue;
    save.levels[`C${i + 1}`] = { best: null, stars: 1, clean: false, firstClean: false, plays: 0, hintMax: 0, legacy: true };
  }
  if (Number.isFinite(legacy.unlocked) && legacy.unlocked > 0) save.classicUnlocked = Math.min(9, Math.max(0, Math.floor(legacy.unlocked)));
  save.veteran = [0, 1, 2, 3, 4, 5, 6].every((i) => legacy.best[i] !== undefined);
  return save;
}

function safeParseLocal(storage: Storage | undefined, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Fill missing fields (forward-compatible reads of partially written saves). */
export function normalizeSave(data: Partial<SaveV1> | null | undefined): SaveV1 {
  const d = defaults();
  if (!data || typeof data !== 'object') return d;
  return {
    ...d,
    ...data,
    cert: { ...d.cert, ...(data.cert ?? {}) },
    launched: { ...d.launched, ...(data.launched ?? {}), byDest: { ...d.launched.byDest, ...(data.launched?.byDest ?? {}) } },
    random: { ...d.random, ...(data.random ?? {}) },
    cosmetics: { ...d.cosmetics, ...(data.cosmetics ?? {}) },
    settings: { ...d.settings, ...(data.settings ?? {}) },
    finale: { ...d.finale, ...(data.finale ?? {}) },
    stats: { ...d.stats, ...(data.stats ?? {}) },
    levels: { ...(data.levels ?? {}) },
    quiz: { ...(data.quiz ?? {}) },
  };
}

export interface SaveHandle {
  readonly readOnly: boolean;
  data: SaveV1;
  /** persist now (no-op in read-only mode) */
  save(): void;
  /** mutate + persist */
  update(fn: (s: SaveV1) => void): void;
  /** debounced persist (1 s) for in-progress history */
  saveSoon(): void;
  flush(): void;
}

export function openSave(storage?: Storage): SaveHandle {
  const store: Store<SaveV1> = createStore<SaveV1>('sokoban', {
    version: 1,
    defaults,
    storage,
    legacy: [
      { key: LEGACY_SNAPSHOT_KEY, read: (env) => importLegacy(readLegacySokoban((env as { data?: unknown } | null)?.data)) },
      { key: LEGACY_KEYS.sokoban, read: (raw) => importLegacy(readLegacySokoban(raw)) },
    ],
  });
  const st = storage ?? (() => {
    try {
      return globalThis.localStorage;
    } catch {
      return undefined;
    }
  })();
  const raw = safeParseLocal(st, SAVE_KEY) as { v?: unknown } | null;
  const readOnly = !!raw && typeof raw === 'object' && typeof raw.v === 'number' && raw.v > 1;
  const data = readOnly ? defaults() : normalizeSave(store.load());
  let timer: ReturnType<typeof setTimeout> | null = null;
  const handle: SaveHandle = {
    readOnly,
    data,
    save() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (readOnly) return;
      store.save(handle.data);
    },
    update(fn) {
      fn(handle.data);
      handle.save();
    },
    saveSoon() {
      if (readOnly) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        store.save(handle.data);
      }, 1000);
    },
    flush() {
      if (timer) handle.save();
    },
  };
  return handle;
}
