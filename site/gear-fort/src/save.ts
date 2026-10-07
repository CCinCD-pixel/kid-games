// Versioned save (spec §8.8): createStore('gear-fort', { version: 1 }) → kg:v1:gear-fort (≤ 20 KB, small and
// synchronous). Snapshots (pause / checkpoint) live in IndexedDB via snapstore.ts, never in localStorage.
import { createStore } from '@kit/progress';
import type { Counters } from './lane/learn';

export type Stars = 0 | 1 | 2 | 3;
export interface LevelRec { best: Stars; attempts: number; firstTry: 'win' | 'lose' | null; wins: number; lastAt: string }
export interface SaveV1 {
  levels: Record<string, LevelRec>;
  current: string;
  resume: null | { level: string; kind: 'suspend' | 'checkpoint'; key: string; at: string };
  lossStreak: Record<string, number>;
  counters: Counters;
  learned: string[];
  jinnang: Record<string, { seen: boolean; mastered: null | string }>;
  almanac: Record<string, 'unseen' | 'shown' | 'seen'>;
  coach: { followed: Record<string, number> };
  fastTrack: boolean;
  puzzles: Record<string, { stars: Stars; bestSpent: number | null; tries: number }>;
  infer: { firstSeenAt: string | null; solvedUnaided: boolean };
  story: string[];
  decks: Record<string, string[]>;
  settings: { music: boolean; musicInLevel: boolean; shake: boolean; numbers: boolean; speed: 0.75 | 1 | 1.5 };
  kernelVersion: string;
}

export const defaults = (): SaveV1 => ({
  levels: {}, current: '1-1', resume: null, lossStreak: {}, counters: {}, learned: [], jinnang: {}, almanac: {},
  coach: { followed: {} }, fastTrack: false, puzzles: {}, infer: { firstSeenAt: null, solvedUnaided: false }, story: [], decks: {},
  settings: { music: true, musicInLevel: false, shake: true, numbers: false, speed: 1 }, kernelVersion: '',
});

/** fill every missing field (forward-compatible: later versions only add fields) and drop any field whose type is wrong
 *  (a damaged save must start fresh on that field, never leave a blank screen — QA r3) */
export function migrate(old: unknown): SaveV1 {
  const d = defaults(); const o = (old && typeof old === 'object' && !Array.isArray(old) ? old : {}) as Record<string, unknown>;
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const out = { ...d } as unknown as Record<string, unknown>;
  for (const [k, dv] of Object.entries(d)) {
    const v = o[k];
    if (v === undefined) continue;
    if (k === 'resume') { if (v === null || (isObj(v) && typeof v.level === 'string' && (v.kind === 'suspend' || v.kind === 'checkpoint'))) out[k] = v; continue; }
    if (Array.isArray(dv)) { if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string'); continue; }
    if (isObj(dv)) { if (isObj(v)) out[k] = k === 'coach' || k === 'infer' || k === 'settings' ? mergeTyped(dv, v) : v; continue; }
    if (typeof v === typeof dv) out[k] = v;
  }
  return out as unknown as SaveV1;
}
/** field-by-field merge for the small nested records (settings / coach / infer): keep a stored field only when its type matches */
function mergeTyped(d: Record<string, unknown>, v: Record<string, unknown>): Record<string, unknown> {
  const r = { ...d };
  for (const [k, dv] of Object.entries(d)) { const x = v[k]; if (x === undefined) continue; if (dv === null ? x === null || typeof x === 'string' : typeof x === typeof dv && (typeof dv !== 'object' || !Array.isArray(x))) r[k] = x; }
  return r;
}

export const store = createStore<SaveV1>('gear-fort', { version: 1, defaults, migrate: (old) => migrate(old) });
export function loadSave(): SaveV1 { return migrate(store.load()); }
