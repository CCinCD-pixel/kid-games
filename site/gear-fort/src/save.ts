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
  almanac: Record<string, 'unseen' | 'seen'>;
  coach: { followed: Record<string, number> };
  fastTrack: boolean;
  puzzles: Record<string, { stars: Stars; bestSpent: number | null; tries: number }>;
  infer: { firstSeenAt: string | null; solvedUnaided: boolean };
  story: string[];
  decks: Record<string, string[]>;
  settings: { musicInLevel: boolean; shake: boolean; numbers: boolean; speed: 0.75 | 1 | 1.5 };
  kernelVersion: string;
}

export const defaults = (): SaveV1 => ({
  levels: {}, current: '1-1', resume: null, lossStreak: {}, counters: {}, learned: [], jinnang: {}, almanac: {},
  coach: { followed: {} }, fastTrack: false, puzzles: {}, infer: { firstSeenAt: null, solvedUnaided: false }, story: [], decks: {},
  settings: { musicInLevel: false, shake: true, numbers: false, speed: 1 }, kernelVersion: '',
});

/** fill every missing field (forward-compatible: later versions only add fields) */
export function migrate(old: unknown): SaveV1 {
  const d = defaults(); const o = (old && typeof old === 'object' ? old : {}) as Partial<SaveV1>;
  return { ...d, ...o, coach: { ...d.coach, ...(o.coach || {}) }, infer: { ...d.infer, ...(o.infer || {}) }, settings: { ...d.settings, ...(o.settings || {}) } };
}

export const store = createStore<SaveV1>('gear-fort', { version: 1, defaults, migrate: (old) => migrate(old) });
export function loadSave(): SaveV1 { return migrate(store.load()); }
