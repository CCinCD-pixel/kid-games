/**
 * Save v1 (spec §8.7): createStore('emoji-match', …) at kg:v1:emoji-match, legacy import (any solved
 * level in the old ladders → the veteran pack), resume snapshot (seed + ops, content hash + engine
 * version), read-only guard against a newer envelope, reset that never re-imports the legacy key.
 */
import { createStore, readLegacyLadders, storeKey, type LegacyLadders, type Store } from '@kit/progress';
import type { BoosterUse, Move } from './core/types';

export interface LevelRec { stars: 0 | 1 | 2 | 3; bestLeft: number; attempts: number; wins: number; failStreak: number; firstWinAt?: number }
export type Op = { m: Move } | { b: BoosterUse };
export interface Resume { id: string; seed: number; assistTier: 0 | 1 | 2 | 3; toolUses: number; ops: Op[]; contentHash: string; engine: number; counted: boolean }
export interface EmSaveV1 {
  levels: Record<string, LevelRec>;
  puzzles: Record<string, { solved: boolean; attempts: number; maxHint: 0 | 1 | 2 | 3 }>;
  boosters: { drill: number; tractor: number; ion: number };
  grants: string[];
  intros: string[];
  arrivals: number[];
  cosmetics: Record<string, string>;
  /** free mode; `bg` = chosen background episode; `seed` = last board seed used (advanced when a session
   *  starts, so leaving by 🏠 / 航线 never reopens the same board) */
  free: { plays: number; bestCascade: number; energy: number; bg?: number; seed?: number };
  /** `tools` = times each tool was used (drives the how-to line on the first uses) */
  stats: { combos: Record<string, number>; specials: Record<string, number>; maxCascade: number; minutes: number; tools?: Partial<Record<'drill' | 'tractor' | 'ion', number>> };
  /** `sound` = game sound effects (narration has its own switch on the parent page) */
  settings: { lessFx: boolean; music: boolean; sound?: boolean };
  /** next 讲给爸爸听 card (em.talk.1–4, rotating, spec §5.7) */
  talk?: number;
  /** constellation cards already shown (lit by the cumulative star total, spec §4.7) */
  sky?: string[];
  attemptSeq: number;
  resume: Resume | null;
  lastLevel: string | null;
  firstRunDone: boolean;
  veteranToast?: boolean;
}

export const LEGACY_KEY = 'kid_games_emoji_match_v1';
export const SNAPSHOT_KEY = 'kg:v1:legacy-emoji-match';

export function defaults(): EmSaveV1 {
  return {
    levels: {}, puzzles: {}, boosters: { drill: 0, tractor: 0, ion: 0 }, grants: [], intros: [], arrivals: [], cosmetics: {},
    free: { plays: 0, bestCascade: 0, energy: 0 },
    stats: { combos: {}, specials: {}, maxCascade: 0, minutes: 0 },
    settings: { lessFx: false, music: true },
    attemptSeq: 0, resume: null, lastLevel: null, firstRunDone: false,
  };
}

export function veteranFrom(l: LegacyLadders | null): EmSaveV1 | null {
  return l && Object.values(l.ladders).some((x) => Object.keys(x.solved).length)
    ? { ...defaults(), boosters: { drill: 1, tractor: 1, ion: 1 }, grants: ['veteran'], veteranToast: true } : null;
}

export function openStore(storage?: Storage): Store<EmSaveV1> {
  return createStore<EmSaveV1>('emoji-match', {
    version: 1,
    defaults,
    storage,
    legacy: [
      { key: LEGACY_KEY, read: (raw) => veteranFrom(readLegacyLadders(raw)) },
      { key: SNAPSHOT_KEY, read: (raw) => veteranFrom(readLegacyLadders((raw as { data?: unknown } | null)?.data)) },
    ],
  });
}

/** fill fields a hand-edited / partial save may lack (never throws) */
export function normalize(s: Partial<EmSaveV1> | null | undefined): EmSaveV1 {
  const d = defaults();
  if (!s || typeof s !== 'object') return d;
  return {
    ...d, ...s,
    boosters: { ...d.boosters, ...(s.boosters ?? {}) },
    free: { ...d.free, ...(s.free ?? {}) },
    stats: { ...d.stats, ...(s.stats ?? {}), combos: { ...(s.stats?.combos ?? {}) }, specials: { ...(s.stats?.specials ?? {}) }, tools: { ...(s.stats?.tools ?? {}) } },
    settings: { ...d.settings, ...(s.settings ?? {}) },
    levels: { ...(s.levels ?? {}) }, puzzles: { ...(s.puzzles ?? {}) },
    grants: [...(s.grants ?? [])], intros: [...(s.intros ?? [])], arrivals: [...(s.arrivals ?? [])], cosmetics: { ...(s.cosmetics ?? {}) },
    ...(s.sky ? { sky: [...s.sky] } : {}),
  };
}

export interface SaveHandle {
  data: EmSaveV1;
  readOnly: boolean;
  commit(): void;
  /** S12 reset: never store.reset() — that would re-import the legacy key (review B9) */
  resetProgress(): void;
}

export function openSave(storage?: Storage): SaveHandle {
  const s = storage ?? (() => { try { return localStorage; } catch { return undefined; } })();
  const store = openStore(s);
  // read-only guard (spec §8.7, kit request #8): a newer page wrote this key → play, never save
  let readOnly = false;
  let newer: Partial<EmSaveV1> | null = null;
  try {
    const env = JSON.parse(s?.getItem(storeKey('emoji-match')) ?? 'null') as { v?: number; data?: Partial<EmSaveV1> } | null;
    if (env && typeof env.v === 'number' && env.v > 1) { readOnly = true; newer = env.data ?? null; }
  } catch { /* corrupt → defaults */ }
  // read-only: play with the data that was read (best effort, normalised) — the kit's load() would hand
  // back defaults() for a newer envelope, and the child would see all progress gone for the session
  const data = readOnly ? normalize(newer) : normalize(store.load());
  const h: SaveHandle = {
    data, readOnly,
    commit() { if (!h.readOnly) store.save(h.data); },
    resetProgress() {
      const hadLegacy = !!(s?.getItem(LEGACY_KEY) || s?.getItem(SNAPSHOT_KEY));
      h.data = { ...defaults(), grants: hadLegacy ? ['veteran'] : [] };
      h.commit();
    },
  };
  return h;
}

/** unlocks (spec §8.7): in-episode order (previous ≥ 1★); episode k+1 opens after k-10 */
export function isUnlocked(save: EmSaveV1, id: string, order: string[]): boolean {
  const i = order.indexOf(id);
  if (i <= 0) return i === 0;
  return (save.levels[order[i - 1]]?.stars ?? 0) >= 1;
}

/** assist tier from the fail streak (spec §3.15): 2 → 1, 4 → 2, 6+ → 3 */
export const assistTier = (failStreak: number): 0 | 1 | 2 | 3 => (failStreak >= 6 ? 3 : failStreak >= 4 ? 2 : failStreak >= 2 ? 1 : 0);

export type Tool = keyof EmSaveV1['boosters'];
export const TOOLS: readonly Tool[] = ['drill', 'tractor', 'ion'];
export const GRANT_CAP = 9;
/** spec §5.5 — a booster intro card grants ×3 the first time it is shown (teaching and gift are one moment) */
export const INTRO_GRANTS: Record<string, { grant: string; tool: Tool; n: number }> = {
  boosterDrill: { grant: 'drill-intro', tool: 'drill', n: 3 },
  boosterTractor: { grant: 'tractor-intro', tool: 'tractor', n: 3 },
  boosterIon: { grant: 'ion-intro', tool: 'ion', n: 3 },
};
/** spec §5.5 — arriving at an episode (its 10th level won the first time) */
export const ARRIVAL_GRANTS: Record<number, Partial<Record<Tool, number>>> = { 2: { drill: 2 }, 3: { drill: 1, tractor: 2 }, 4: { drill: 2, tractor: 2, ion: 2 } };
export type GrantEvent = { k: 'intro'; id: string } | { k: 'arrival'; ep: number } | { k: 'puzzle'; id: string };
/**
 * The one place boosters are earned (spec §5.5): deterministic (no randomness, no purchase, no daily
 * claim) and idempotent (`grants[]` remembers every id). Returns what was added now, or null.
 *   intro   — booster intro card first shown → ×3 of that tool
 *   arrival — episode 2/3/4 arrival → the ARRIVAL_GRANTS row
 *   puzzle  — a star-map puzzle solved the first time → +1 of the tool the child has fewest of (ties → drill)
 * (the veteran pack is applied by the legacy import, see veteranFrom)
 */
export function grantFor(save: EmSaveV1, ev: GrantEvent): Partial<Record<Tool, number>> | null {
  let id: string; let add: Partial<Record<Tool, number>>;
  if (ev.k === 'intro') { const g = INTRO_GRANTS[ev.id]; if (!g) return null; id = g.grant; add = { [g.tool]: g.n }; }
  else if (ev.k === 'arrival') { const g = ARRIVAL_GRANTS[ev.ep]; if (!g) return null; id = `ep${ev.ep}`; add = g; }
  else { const least = TOOLS.reduce((m, t) => (save.boosters[t] < save.boosters[m] ? t : m), 'drill' as Tool); id = ev.id; add = { [least]: 1 }; }
  return grant(save, id, add) ? add : null;
}
/** deterministic, idempotent booster grants (spec §5.5) */
export function grant(save: EmSaveV1, id: string, add: Partial<EmSaveV1['boosters']>): boolean {
  if (save.grants.includes(id)) return false;
  save.grants.push(id);
  for (const k of ['drill', 'tractor', 'ion'] as const) if (add[k]) save.boosters[k] = Math.min(GRANT_CAP, save.boosters[k] + add[k]!);
  return true;
}
