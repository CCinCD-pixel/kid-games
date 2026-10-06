/**
 * Zobrist key of a position (spec §8.1) for the AI's transposition table: piece (side, type, face) on
 * each station + side to move. Two independent 32-bit halves folded into one safe integer. Fixed
 * seed (mulberry32), so keys are reproducible across Node / browsers.
 */
import type { GameState } from './state';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}
const R = mulberry32(0x6d2c5a17);
/** [side 0/1][type 0..11 + 12 = face down][station] */
const KEY_LO = new Uint32Array(2 * 13 * 60);
const KEY_HI = new Uint32Array(2 * 13 * 60);
for (let i = 0; i < KEY_LO.length; i++) {
  KEY_LO[i] = R();
  KEY_HI[i] = R() & 0x1fffff;
}
const TURN_LO = R(), TURN_HI = R() & 0x1fffff;

export function zobrist(s: GameState): number {
  let lo = 0, hi = 0;
  for (let p = 0; p < s.np; p++) {
    if (!s.palive[p]) continue;
    const t = s.mode === 'fan' && !s.pup[p] ? 12 : s.ptype[p];
    const k = (s.pside[p] * 13 + t) * 60 + s.ppos[p];
    lo ^= KEY_LO[k];
    hi ^= KEY_HI[k];
  }
  if (s.turn === 1) {
    lo ^= TURN_LO;
    hi ^= TURN_HI;
  }
  return hi * 4294967296 + (lo >>> 0);
}
