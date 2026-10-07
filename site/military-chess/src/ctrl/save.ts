/**
 * Save (spec §8.7): createStore('military-chess', { version: 1 }). The old single-file 军棋 never
 * used localStorage (audit), so there is no legacy key to import. Matches are saved as replays
 * (setup + notes), so a resumed game is identical to the original by construction.
 */
import { createStore, type Store } from '@kit/progress';
import type { Side } from '../core/board';
import type { Mode } from '../core/state';

export interface SavedMatch {
  v: 1;
  id: string;
  mode: Mode;
  setup: { red?: string; blue?: string; handicap?: { red: string; blue: string }; fanSeed?: string; firstMover: Side; firstPlayer?: 0 | 1 };
  actions: string[];
  opponent: { kind: 'ai'; level: 1 | 2 | 3 | 4 } | { kind: 'family'; seating: 'side' | 'face'; names: [string, string] };
  kidSide: Side;
  kidSeat: 'near' | 'far';
  tags: Record<number, 'big' | 'small' | 'bomb' | 'mine' | 'flag'>;
  hints: number;
  coachWarnings: number;
  coachOverrides: number;
  undos: number;
  startedAt: number;
  /** ladder rules (清点兵力) vs family rules (draw) */
  ladder: boolean;
  /** Dad vs the computer (和电脑下): ladder rules, but nothing is booked for the child */
  free?: boolean;
  /** 家规 fixed when a family game starts (so resume / replay / review use the same rules) */
  house?: { fanFlagLock: boolean; quietLimit?: number; shuttleMax: number };
}

export interface SavedPuzzle {
  id: string;
  twin: boolean;
  red: string[];
  hintMax: 0 | 1 | 2 | 3;
  fails: number;
}

type LadderMode = 'fan' | 'ming' | 'an';
export interface LadderTrack {
  wins: number[];
  cleanWins: number[];
  handicapWins: number[];
  undoWins: number[];
  losses: number[];
  draws: number[];
  streakLoss: number[];
  unlocked: number;
  handicapOffer: 0 | 1 | 2;
  recent: number[][];
}

export interface SaveV1 {
  firstRun: { ft: boolean; seenHqTip: boolean; seenRefereeIntro: boolean; fanCoach: string[]; /** the compare-card buttons were read out once (S4) */ seenCmpButtons: boolean };
  rank: number;
  items: Record<string, { stars: 0 | 1 | 2 | 3; best: number; tries: number; hintMax: 0 | 1 | 2 | 3; at: number; last?: 0 | 1 | 2 | 3; lastHint?: 0 | 1 | 2 | 3 }>;
  ladder: Record<LadderMode, LadderTrack>;
  deployments: (null | { name: string; layout: string })[];
  lastTemplate: string;
  /** the last layout the child used (S5 opens with it) */
  lastLayout: string | null;
  cards: string[];
  family: {
    games: number;
    kidWins: number;
    dadWins: number;
    draws: number;
    physicalGames: number;
    physicalVerdicts: number;
    lastMode: 'ming' | 'fan';
    seating: 'side' | 'face';
    dadName: string;
    firstMover: 'kid' | 'dad';
    lastAttacker: Side;
    /** finish times of family games (parent metric: games in the last 30 days) */
    log: number[];
  };
  tagStats: { games: number; correct: number; total: number };
  settings: {
    numberBadges: boolean;
    coachNotes: boolean;
    coachAlerts: 'auto' | 'on' | 'off';
    music: boolean;
    fanFlagRule: 'standard' | 'easy';
    unlockAll: boolean;
    refereeSpeed: 'normal' | 'fast';
    aiOverride: null | 1 | 2 | 3 | 4;
    /** 家规 for family games (puzzles and the ladder always use the standard rules) */
    familyQuiet: 40 | 80 | 120;
    shuttleMax: 3 | 4 | 5;
  };
  resume: SavedMatch | null;
  puzzleResume: SavedPuzzle | null;
  stats: { matches: number; minutes: number };
}

const track = (): LadderTrack => ({
  wins: [0, 0, 0, 0],
  cleanWins: [0, 0, 0, 0],
  handicapWins: [0, 0, 0, 0],
  undoWins: [0, 0, 0, 0],
  losses: [0, 0, 0, 0],
  draws: [0, 0, 0, 0],
  streakLoss: [0, 0, 0, 0],
  unlocked: 1,
  handicapOffer: 0,
  recent: [[], [], [], []],
});

export function defaultSave(): SaveV1 {
  return {
    firstRun: { ft: false, seenHqTip: false, seenRefereeIntro: false, fanCoach: [], seenCmpButtons: false },
    /** −1 until the first-time flow gives the first shoulder board (工兵 = 0) */
    rank: -1,
    items: {},
    ladder: { fan: track(), ming: track(), an: track() },
    deployments: [null, null, null],
    lastTemplate: 'balanced',
    lastLayout: null,
    cards: [],
    family: {
      games: 0,
      kidWins: 0,
      dadWins: 0,
      draws: 0,
      physicalGames: 0,
      physicalVerdicts: 0,
      lastMode: 'ming',
      seating: 'side',
      dadName: '爸爸',
      firstMover: 'kid',
      lastAttacker: 0,
      log: [],
    },
    tagStats: { games: 0, correct: 0, total: 0 },
    settings: {
      numberBadges: true,
      coachNotes: true,
      coachAlerts: 'auto',
      music: true,
      fanFlagRule: 'standard',
      unlockAll: false,
      refereeSpeed: 'normal',
      aiOverride: null,
      familyQuiet: 80,
      shuttleMax: 4,
    },
    resume: null,
    puzzleResume: null,
    stats: { matches: 0, minutes: 0 },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Coerce `val` to the shape of `def` (QA r3): a present field of the wrong type falls back to its
 * default instead of crashing boot (items: null, cards: null, a string where a number belongs, …).
 * Objects keep extra keys (records such as `items`); fixed-length default arrays keep their length.
 */
export function fit(def: unknown, val: unknown): unknown {
  if (val === undefined) return def;
  if (def === null) return val === null || typeof val === 'object' || typeof val === 'string' || typeof val === 'number' ? val : null;
  if (Array.isArray(def)) {
    if (!Array.isArray(val)) return def;
    if (!def.length) return val;
    if (val.length !== def.length) return def;
    return def.map((x, i) => fit(x, val[i]));
  }
  if (isObj(def)) {
    if (!isObj(val)) return def;
    const out: Record<string, unknown> = { ...val };
    for (const k of Object.keys(def)) out[k] = fit(def[k], val[k]);
    return out;
  }
  if (typeof def === 'number') return typeof val === 'number' && Number.isFinite(val) ? val : def;
  return typeof val === typeof def ? val : def;
}

/** Fill any field missing from an older/partial save with its default (forward-compatible load). */
export function normalizeSave(raw: unknown): SaveV1 {
  const d = defaultSave();
  if (!isObj(raw)) return d;
  const r = fit(d, raw) as SaveV1;
  const firstRunFt = !!r.firstRun.ft;
  const rawRank = (raw as Partial<SaveV1>).rank;
  const items: SaveV1['items'] = {};
  for (const [k, v] of Object.entries(r.items)) if (isObj(v)) items[k] = v as SaveV1['items'][string];
  const resume = isObj(r.resume) && Array.isArray(r.resume.actions) && isObj(r.resume.setup) && isObj(r.resume.opponent) ? r.resume : null;
  const puzzleResume = isObj(r.puzzleResume) ? r.puzzleResume : null;
  return {
    ...r,
    // stage-1 saves stored rank 0 before the first-time flow existed: that means "no rank yet"
    rank: typeof rawRank === 'number' && Number.isFinite(rawRank) && (firstRunFt || rawRank > 0) ? Math.max(firstRunFt ? 0 : -1, rawRank) : -1,
    items,
    cards: r.cards.filter((c) => typeof c === 'string'),
    resume,
    puzzleResume,
    deployments: r.deployments.map((x) => (isObj(x) && typeof x.layout === 'string' ? x : null)) as SaveV1['deployments'],
  };
}

export const SAVE_VERSION = 1;

export function openStore(storage?: Storage): Store<SaveV1> {
  const store = createStore<SaveV1>('military-chess', {
    version: SAVE_VERSION,
    defaults: defaultSave,
    migrate: (old) => normalizeSave(old),
    storage,
  });
  // the kit hands a same-version save back untouched (migrate only runs for older versions), so a
  // partial / earlier-build v1 save is normalized here on every load (QA r1)
  const rawLoad = store.load.bind(store);
  store.load = () => normalizeSave(rawLoad());
  return store;
}

/** matchId = timestamp base36 (+ a counter so two matches in one ms differ) */
let seq = 0;
export const newMatchId = (now = Date.now()): string => now.toString(36) + (seq++ % 36).toString(36);
