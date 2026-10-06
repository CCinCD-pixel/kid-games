/**
 * BLUE's reply policy in 'best' puzzles (spec §3.9 R9.2) and the off-book 1-ply heuristic (R9.4).
 * Key, compared lexicographically, larger is better for BLUE:
 *  1. dist: RED's forced-win distance after the reply (cap + 1 = RED cannot finish within the budget;
 *     100 = the reply itself makes RED fail, e.g. takes the RED flag or the guarded piece)
 *  2. BLUE material minus RED material (never a pointless sacrifice; captures preferred)
 *  3. a real move over a pass
 *  4. natural defence (review D3): never into a 大本营 unless forced; close in on the most advanced
 *     RED attacker; come back toward the own flag; stand on a door square of the flag; keep a threat
 *  5. flag-relative index (lowest from·60+to in the flag frame) — deterministic and mirror-symmetric
 * Port of the reference `solver.mjs` / `book.mjs`.
 */
import { RED, adj, isCamp, isHQ } from './board';
import { resolve } from './combat';
import { isPass, type Action, type Move } from './movegen';
import { isMobileType } from './pieces';
import { apply } from './rules';
import type { GameState } from './state';
import { distToWin, type Memo } from './solver';
import { blueFlagPos, blueReplies, cmpKey, failed, frameOf, goalReached, material, relIdx, roadDistFrom, type PuzzleDef } from './puzzle';

export function natural(a: GameState, b: Action, flip: number): number {
  if (isPass(b)) return -1e9;
  const m = b as Move;
  let v = 0;
  if (isHQ(m.to)) v -= 1000;
  const f = blueFlagPos(a);
  // most advanced RED attacker = mobile RED piece closest to the BLUE flag (ties: flag-relative index)
  let tgt = -1, td = 99;
  if (f >= 0) {
    const df = roadDistFrom(f);
    for (let p = 0; p < a.np; p++) {
      if (!(a.palive[p] && a.pside[p] === RED && isMobileType(a.ptype[p]))) continue;
      const d = df[a.ppos[p]];
      if (d < td || (d === td && relIdx(a.ppos[p], flip) < relIdx(tgt, flip))) {
        td = d;
        tgt = a.ppos[p];
      }
    }
    v += 2 * (df[m.from] - df[m.to]); // come back toward the own flag
    if (adj[f].includes(m.to) && !isHQ(m.to)) v += 4; // stand on a door square of the flag
  }
  if (tgt >= 0 && m.to !== tgt) {
    const dt = roadDistFrom(tgt);
    v += 3 * (dt[m.from] - dt[m.to]);
  }
  // capture threat next turn: the moved piece would beat a RED piece standing next to it
  const t = a.ptype[m.pid];
  for (const n of adj[m.to]) {
    const q = a.board[n];
    if (q >= 0 && a.palive[q] && a.pside[q] === RED && !isCamp(n) && isMobileType(t)) {
      if (resolve(t, a.ptype[q]) === 'A') v += 2;
    }
  }
  return v;
}

const tieIndex = (b: Action, flip: number): number => (isPass(b) ? 0 : -(relIdx((b as Move).from, flip) * 60 + relIdx((b as Move).to, flip)));

export function bluePolicy(pz: PuzzleDef, s0: GameState, a: GameState, cap: number, memo: Memo = new Map(), flip: number = frameOf(s0)): { reply: Action; key: number[] } {
  let best: Action | null = null, bestKey: number[] | null = null;
  for (const b of blueReplies(a)) {
    const bb = apply(a, b).state;
    let dist: number;
    if (pz.goal.kind === 'survive') dist = failed(pz, s0, bb) ? 100 : 0;
    else if (failed(pz, s0, bb)) dist = 100;
    else if (goalReached(pz, s0, bb, true)) dist = 0;
    else dist = distToWin(pz, s0, bb, cap, memo);
    const k = [dist, material(bb), isPass(b) ? 0 : 1, natural(a, b, flip), tieIndex(b, flip)];
    if (!bestKey || cmpKey(k, bestKey) > 0) {
      bestKey = k;
      best = b;
    }
  }
  return { reply: best!, key: bestKey! };
}

/**
 * Off-book (≥2 deviations) BLUE plays this 1-ply heuristic (≈1 ms): take the RED flag / guarded piece
 * if possible, else best material, else natural defence, else flag-relative index. Off-book there is
 * no proof of failure: the puzzle ends on success, on a failure event or when the budget is used up.
 * `survive` puzzles use it on device too (one reply, no book).
 */
export function offBookReply(pz: PuzzleDef, s0: GameState, a: GameState): { reply: Action; key: number[] } {
  const flip = frameOf(s0);
  let best: Action | null = null, bk: number[] | null = null;
  for (const b of blueReplies(a)) {
    const bb = apply(a, b).state;
    const k = [failed(pz, s0, bb) ? 1 : 0, material(bb), isPass(b) ? 0 : 1, natural(a, b, flip), tieIndex(b, flip)];
    if (!bk || cmpKey(k, bk) > 0) {
      bk = k;
      best = b;
    }
  }
  return { reply: best!, key: bk! };
}
