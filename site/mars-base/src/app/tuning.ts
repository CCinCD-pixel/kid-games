/** Every tunable constant of the 火星基地 core in one place (spec §3.4, §3.5, §3.8.1). Never scatter numbers. */

/** Idle seconds before the neutral "你可以点提示" nudge (no hint level, no counter). */
export const IDLE_NUDGE_S = 45;
/** Minimum seconds between hint-key escalations. */
export const HINT_GAP_S = 4;
/** More than 3 taps on the hint key within this many seconds → a frustration signal in the log. */
export const FRUSTRATION_WINDOW_S = 10;

/** Ladder-level offset added to the item's difficulty (L1…L6), spec §3.4. */
export const LEVEL_OFF = [-0.35, -0.2, 0, 0.2, 0.35, 0.6] as const;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 6;
/** Streak of first-try-correct answers on a tag that raises its level by one. */
export const STREAK_UP = 3;
/** Tags whose ladder starts at L3 (prerequisite mastered) / L2 (otherwise). A weak recent window starts new tags at L1. */
export const START_LEVEL_MASTERED = 3;
export const START_LEVEL_FRESH = 2;
export const WEAK_RECENT_N = 12;
export const WEAK_RECENT_FROM = 24;
export const WEAK_RECENT_BELOW = 0.7;
/** Two consecutive first-try misses on a tag → the next REP_DOWN_ITEMS items drop one representation level. */
export const REP_DOWN_ITEMS = 3;
export const REP_DOWN_MISSES = 2;

/** Transition rule: mission first-try below this → the node does not advance (replay once, ≤L3, first 2 items hands-on). */
export const TRANSITION_BELOW = 0.6;
export const REPLAY_LEVEL_CAP = 3;
export const MAX_NODE_PLAYS = 2;
/** 直达 (skip ahead) — only ONE non-boss node; offered when the mission ends at ≥L5 with ≥5/6, or two ≥95 % missions in a zone. */
export const DIRECT_LEVEL = 5;
export const DIRECT_FIRST_TRY = 5 / 6;
export const DIRECT_TWICE = 0.95;

/** Mastery: last min(10,n) first tries ≥ MASTERY_FRAC and n ≥ MASTERY_MIN, last 3 without a hint. */
export const MASTERY_WINDOW = 10;
export const MASTERY_MIN = 6;
export const MASTERY_FRAC = 0.8;
/** Review visits after mastery (visit offsets), spec §3.5. */
export const REVIEW_OFFSETS = [1, 3, 6, 10] as const;

/** A new visit starts when the last activity is older than this (ms). */
export const SESSION_GAP_MS = 20 * 60 * 1000;
/** After this many ms of active play, ask once whether to hand the load in. */
export const LONG_PLAY_MS = 15 * 60 * 1000;

/** Warm-up slots per mission and the zone-recommendation weights (§3.7). */
export const WARM_SLOTS = 3;
export const PUZZLE_AFTER_MISSIONS = 6;

/** Number line (spec §3.8.1): tolerance in % of L per anchor mode × ladder level L1…L6. The difficulty lever of the orbit zone. */
export const NL_TOL = {
  every10: [4.5, 3.8, 3.0, 2.4, 1.9, 1.6],
  half: [8.0, 6.7, 5.5, 4.5, 3.9, 3.5],
  ends: [10.0, 8.5, 7.0, 5.5, 4.7, 4.0],
} as const;
export type AnchorMode = keyof typeof NL_TOL;
/** Calibration pass rule. */
export const CALIB_RULE = { R2: 0.9, SLOPE_LO: 0.9, SLOPE_HI: 1.1, PAE_100: 0.1, PAE_1000: 0.15, DEGENERATE_SD: 0.1 } as const;
/** ◀▶ nudge caps (owned by the number-line engine): per placement, step by L. */
export { NUDGE_CAP, NUDGE_STEP } from '@engines/manip/numberline';
/** Noise model (assumed child model, shared by V4 and V6(g)): sd = σ·L·g(d/L), g(x) = clamp(G0 + GS·x, G0, 1). */
export const NOISE = { G0: 0.3, GS: 2.8 } as const;

/** Embedded certification (spec §3.6). */
export const CERT = { items: 4, extraOnOneError: 2, provisionalItems: 4, provisionalPerMission: 2, reopenWrong: 2, remedialMissionsToRecheck: 3 } as const;

/** Recommendation score weights (§3.7). */
export const RECOMMEND = { gapCap: 6, gapW: 2, remedialW: 1.5, aheadW: 1, freshW: 3, freshVisits: 4, playedPenalty: 5 } as const;

/** Save size guard (bytes) for the 300-mission fixture. */
export const SAVE_BUDGET_BYTES = 48 * 1024;
export const RECENT_RING = 300;

/** Zones whose content ships in this build (the others show the 建设中 plot). Spec §0A.1 minus the later round (balance, puzzle, race). */
export const BUILT_ZONES = ['orbit', 'cert', 'vault', 'factory'] as const;
/** Main-line chapters per zone (v1 scope, spec §4.2) and the remedial chapters of the 徽章站. */
export const MAIN_CHAPTERS = ['O1', 'O2', 'K1', 'K2', 'P1', 'P2', 'B1', 'Z1'] as const;
export const REMEDIAL_CHAPTERS = ['C1', 'C2', 'C3'] as const;
