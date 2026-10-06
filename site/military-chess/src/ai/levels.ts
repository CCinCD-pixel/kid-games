/**
 * The four opponents per mode + the hint level (spec §8.5 table, §4.4). Starting values from the
 * spec; changes are calibrated by tools/military-chess/calibrate.heavy.test.ts (§9.4) and each change
 * comes with a calibration table in ~/kid-games-work/military-chess/calib-<date>.txt.
 */
import type { Mode } from '../core/state';

export type Level = 1 | 2 | 3 | 4;
export const LEVELS_LIST: readonly Level[] = [1, 2, 3, 4];

export interface Weights {
  flagGuard: number;
  flagPull: number;
  hunt: number;
  contempt: number;
  /** 翻翻棋: value of each enemy mine dug (and 3× when all are gone) */
  minesFan: number;
  /** a mobile piece standing in the enemy half */
  advance: number;
  /** style 铁蛋: own mobile piece on an enemy-half rail station */
  railAdvance: number;
  /** style 雷达: engineer next to an unmoved back-row enemy piece (暗) / a known enemy mine (翻) */
  probe: number;
  /** style 老将: move bonus for a bomb trading with a (known / masked) ≥ 师长 */
  bombTrade: number;
}

export interface LevelCfg {
  name: string;
  /** 暗棋 PIMC worlds */
  samples: number;
  depth: number;
  qdepth: number;
  topK: number;
  temp: number;
  /** probability that this move ignores the opponent's answers (novice "didn't see the threat") */
  overlook: number;
  /**
   * probability of an aimless novice move: uniform among the hard-filtered moves (never into its own
   * 大本营, never a certain-loss attack). Calibration knob added in the build (§9.4 could not reach
   * the bands with topK / temp / overlook alone — see calib-*.txt); the v1.0 prototype's
   * `randomMove`, now behind the novice filter so it never looks broken.
   */
  wander: number;
  /** of the aimless moves, the share that only shuffles pieces (no attack, no flip) */
  wanderQuiet: number;
  /** of the aimless moves, the share that charges into an enemy piece when it can (豆豆 bumps into things) */
  wanderCharge: number;
  w: Weights;
  /** AI layout style (core/layout LAYOUT_STYLES) */
  layout: 'plain' | 'rail' | 'hunter' | 'veteran';
  /** node budget (reproducible); `ms` is only a safety cap */
  nodes: number;
  /** 翻翻棋: look at the opponent's capture replies after a move / flip */
  replyDepth: 0 | 1;
  /** 翻翻棋 3–4: everything face up and ≤ endgameN mobile pieces → search this deep */
  endgameDepth: number;
  endgameN: number;
}

const W = (o: Partial<Weights>): Weights => ({ flagGuard: 0, flagPull: 2, hunt: 0, contempt: 0, minesFan: 2, advance: 1.5, railAdvance: 0, probe: 0, bombTrade: 0, ...o });

const AN: Record<Level, LevelCfg> = {
  1: { name: '豆豆', samples: 1, depth: 1, qdepth: 0, topK: 6, temp: 30, overlook: 0.4, wander: 0.75, wanderQuiet: 0, wanderCharge: 0, w: W({ flagGuard: 0, flagPull: 2, hunt: 0, contempt: 0 }), layout: 'plain', nodes: 2000, replyDepth: 0, endgameDepth: 1, endgameN: 0 },
  2: { name: '铁蛋', samples: 2, depth: 1, qdepth: 0, topK: 4, temp: 15, overlook: 0.25, wander: 0.15, wanderQuiet: 0, wanderCharge: 0, w: W({ flagGuard: 20, flagPull: 4, hunt: 3, contempt: 20, railAdvance: 2 }), layout: 'rail', nodes: 10000, replyDepth: 0, endgameDepth: 1, endgameN: 0 },
  3: { name: '雷达', samples: 4, depth: 1, qdepth: 0, topK: 3, temp: 8, overlook: 0.1, wander: 0.06, wanderQuiet: 0, wanderCharge: 0, w: W({ flagGuard: 40, flagPull: 6, hunt: 4, contempt: 30, probe: 6 }), layout: 'hunter', nodes: 30000, replyDepth: 0, endgameDepth: 1, endgameN: 0 },
  4: { name: '老将', samples: 6, depth: 1, qdepth: 1, topK: 2, temp: 5, overlook: 0.04, wander: 0.08, wanderQuiet: 0, wanderCharge: 0, w: W({ flagGuard: 80, flagPull: 8, hunt: 5, contempt: 40, bombTrade: 15 }), layout: 'veteran', nodes: 80000, replyDepth: 0, endgameDepth: 1, endgameN: 0 },
};
const MING: Record<Level, LevelCfg> = {
  1: { ...AN[1], samples: 1, temp: 15, overlook: 0.3, wander: 0.6, wanderQuiet: 0, w: W({ flagGuard: 10, flagPull: 3, hunt: 2 }) },
  2: { ...AN[2], samples: 1, temp: 8, overlook: 0.2, wander: 0.5 },
  3: { ...AN[3], samples: 1, qdepth: 1, temp: 10, overlook: 0.1, wander: 0.3 },
  4: { ...AN[4], samples: 1, wander: 0.05 },
};
const FAN: Record<Level, LevelCfg> = {
  1: { ...AN[1], samples: 1, wander: 0.8, wanderQuiet: 0, w: { ...AN[1].w, minesFan: 2 }, replyDepth: 0 },
  2: { ...AN[2], samples: 1, wander: 0.7, w: { ...AN[2].w, minesFan: 6 }, replyDepth: 1 },
  3: { ...AN[3], samples: 1, wander: 0.65, w: { ...AN[3].w, minesFan: 8, probe: 4 }, replyDepth: 1, endgameDepth: 3, endgameN: 10 },
  4: { ...AN[4], samples: 1, qdepth: 2, wander: 0.42, w: { ...AN[4].w, minesFan: 10 }, replyDepth: 1, endgameDepth: 3, endgameN: 10 },
};

export const LEVELS: Record<Mode, Record<Level, LevelCfg>> = { an: AN, ming: MING, fan: FAN };

/** the hint level (spec §8.5): 4档 search, no randomness, 8 worlds from the child's own belief in 暗棋 */
export function hintCfg(mode: Mode): LevelCfg {
  const base = LEVELS[mode][4];
  return { ...base, name: 'hint', samples: mode === 'an' ? 8 : 1, topK: 1, temp: 0, overlook: 0, wander: 0, wanderQuiet: 0, wanderCharge: 0, w: { ...base.w, bombTrade: 0, probe: 0, railAdvance: 0 } };
}

/** test / calibration hook: patch a level's knobs in place (never used by the page) */
export function patchLevel(mode: Mode, level: Level, patch: Partial<LevelCfg> & { w?: Partial<Weights> }): void {
  const cur = LEVELS[mode][level];
  LEVELS[mode][level] = { ...cur, ...patch, w: { ...cur.w, ...(patch.w ?? {}) } };
}
