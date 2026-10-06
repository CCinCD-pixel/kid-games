// 机关守城 · lane core — rule constants (theme-agnostic, integers only), read from content/gear-fort/rules.json
// (exported from the prototype's rules.mjs; rules.test.ts checks every value). Spec §3.1.
import R from '../../../../content/gear-fort/rules.json';

export const TPS: number = R.TPS;                 // fixed logic rate: 1 tick = 50 ms
export const T: number = R.T;                     // fixed-point distance: 1 tile = 10000 ut
export const COLS: number = R.COLS;               // board columns 0..7 (0 = next to the city wall)
export const LANES: number = R.LANES;             // lanes 0..4 (top to bottom)
export const BOARD_X: number = R.BOARD_X;         // an enemy is on the board (targetable) when x < BOARD_X
export const SPAWN_X: number = R.SPAWN_X;         // enemies appear with their front at this x
export const FACE: number = R.FACE;               // a standing unit at column c blocks at x = c*T + FACE
export const PASS: number = R.PASS;               // an enemy whose front is < c*T + PASS has passed column c
export const BODY: number = R.BODY;               // enemy body length behind its front
export const FEET: number = R.FEET;               // tile under an enemy = floor((x + FEET) / T)
export const AUTO_COLLECT: number = R.AUTO_COLLECT; // dropped grain flies to the bin by itself after 7 s
export const BITE_EVERY: number = R.BITE_EVERY;   // melee damage every 0.5 s
export const GRACE: number = R.GRACE;             // the level ends 40 s after the last scripted spawn
export const PARTS_PER_TOKEN: number = R.PARTS_PER_TOKEN;
export const TOKEN_MAX: number = R.TOKEN_MAX;
export const PARTS: Record<string, number> = R.PARTS;
export const SKY: { amt: number; first: number; period: number; jitter: number } = R.SKY;
export const FIRE: { woodNum: number; woodDen: number; shieldMul: number; burnPerHalfSec: number; burnTicks: number } = R.FIRE;
export const LOG: { bossDmg: number; bossPush: number } = R.LOG;
export const ASSIST: { startGrain: number; speedPct: number } = R.ASSIST;
/** Assist tier 2 (after the 3rd loss): +200 grain, 0.75×, two 檑木 per gate (spec §3.20). */
export const ASSIST2 = { startGrain: 200, speedPct: 75, logs: 2 } as const;
export const SWARM_N: number = R.SWARM_N;          // script kind 'swarm' = 8 ants 2500 ut apart

/** seconds → ticks (integer). */
export const sec = (s: number): number => Math.round(s * TPS);
