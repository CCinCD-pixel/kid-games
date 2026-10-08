/**
 * 参谋提醒 C1–C5 (spec §5.1): checked when the child is about to commit a move. Pure; only public
 * information (明棋 everything; 翻翻棋 face-up pieces + the hidden multiset; 暗棋 the child's knowledge).
 *  C1 after this move the opponent can take my flag next move (no per-game cap)
 *  C2 明/翻: my ≥ 团长 lands where a certainly bigger enemy (or a bomb) can take it, and the move did
 *     not take something at least as valuable
 *  C3 暗: a ≥ 师长 attacks a never-moved enemy piece that started in the enemy's back two rows
 *  C4 翻: flipping next to my face-up ≥ 旅长 while a bigger enemy (or a bomb) is still face down
 *  C5 the last mobile piece walks into a 大本营 (E4)
 *  C6 (Dad, 2026-10-08) a piece that is neither 工兵 nor 炸弹 attacks a mine it can see (明棋 / a face-up
 *     翻翻棋 mine / a 暗棋 piece the mover's notes pin down as a mine). The rules stay standard (the
 *     attacker is lost), but nobody walks into a mine they know is there: ask first. Like C5 it shows
 *     even with the alerts switched off, for whoever is moving (family games too), and is not capped.
 */
import { adj, half, indexToSlot, isCamp, isHQ, type Side } from './board';
import { bit, type Knowledge } from './belief';
import { resolve } from './combat';
import { isFlip, isMove, pieceCanMove, pieceMoves, type Action, type Move } from './movegen';
import { BOMB, ENG, FLAG, MINE, isMobileType, rankOf } from './pieces';
import { apply } from './rules';
import type { GameState } from './state';

export type CoachCode = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';
export interface CoachAlert {
  code: CoachCode;
  line: string;
  /** stations to highlight (threat / flag / the risky square) */
  marks: number[];
  /** C4: [possibly bigger enemies, still face down] */
  beads?: [number, number];
}

const VAL = [0, 10, 30, 14, 6, 9, 13, 18, 25, 35, 50, 70];

function flagOf(s: GameState, side: number): number {
  for (let p = 0; p < s.np; p++) if (s.palive[p] && s.pside[p] === side && s.ptype[p] === FLAG) return p;
  return -1;
}

/** enemy pieces that could attack station `at` in one move, from `me`'s knowledge (supersets in 暗棋) */
export function threatsTo(s: GameState, me: Side, at: number, k: Knowledge | null): number[] {
  const out: number[] = [];
  const enemy = 1 - me;
  // in 暗棋 an unknown enemy piece is treated as an engineer if it may be one (engineer moves ⊇ straight
  // rail moves), else as any mobile piece; certainly-immobile pieces (mask ⊆ mine|flag) never threaten
  let t: GameState = s;
  if (s.mode === 'an' && k) {
    t = { ...s, ptype: s.ptype.slice() };
    for (let p = 0; p < s.np; p++) {
      if (s.pside[p] !== enemy || !s.palive[p]) continue;
      const m = k.mask[p];
      t.ptype[p] = m & bit(ENG) ? ENG : (m & ~(bit(MINE) | bit(FLAG))) ? 4 : MINE;
    }
  }
  const probe: GameState = { ...t, turn: enemy as Side };
  for (let p = 0; p < probe.np; p++) {
    if (probe.pside[p] !== enemy || !pieceCanMove(probe, p)) continue;
    if (pieceMoves(probe, p).some((m) => m.to === at && m.kind === 'attack')) out.push(p);
  }
  return out;
}

/**
 * C1: would the opponent be able to take my flag right after `m`? Never peeks: a flip is not judged
 * (what is under the tile is unknown), and a 暗棋 attack is judged by its worst case (my piece lost,
 * the defender still standing) — the real verdict is unknown before the referee speaks.
 */
export function flagDangerAfter(s: GameState, m: Action, me: Side, k: Knowledge | null): number[] {
  if (isFlip(m) || !isMove(m)) return [];
  let after: GameState;
  if (s.mode === 'an' && m.kind === 'attack') {
    after = { ...s, board: s.board.slice(), palive: s.palive.slice(), turn: (1 - me) as Side, ply: s.ply + 1 };
    after.palive[m.pid] = 0;
    after.board[m.from] = -1;
  } else after = apply(s, m).state;
  if (after.result) return [];
  const f = flagOf(after, me);
  if (f < 0) return [];
  if (after.mode === 'fan' && !after.pup[f]) return []; // a face-down flag is not known to be a flag
  const th = threatsTo(after, me, after.ppos[f], k);
  return th.length ? th.map((p) => after.ppos[p]).concat(after.ppos[f]) : [];
}

/** is my flag in danger right now (opponent to move could take it)? (hint level 1) */
export function flagDangerNow(s: GameState, me: Side, k: Knowledge | null): number[] {
  const f = flagOf(s, me);
  if (f < 0 || (s.mode === 'fan' && !s.pup[f])) return [];
  const th = threatsTo(s, me, s.ppos[f], k);
  return th.length ? th.map((p) => s.ppos[p]).concat(s.ppos[f]) : [];
}

function c2(s: GameState, m: Move, me: Side): CoachAlert | null {
  const t = s.ptype[m.pid];
  if (rankOf(t) < 5) return null;
  const after = apply(s, m).state;
  if (after.result || !after.palive[m.pid] || isCamp(m.to)) return null;
  // did this move take something at least as valuable?
  if (m.kind === 'attack') {
    const def = s.board[m.to];
    if (VAL[s.ptype[def]] >= VAL[t]) return null;
  }
  const enemy = 1 - me;
  const probe: GameState = { ...after, turn: enemy as Side };
  for (let q = 0; q < probe.np; q++) {
    if (probe.pside[q] !== enemy || !pieceCanMove(probe, q)) continue;
    if (s.mode === 'fan' && !probe.pup[q]) continue;
    const r = resolve(probe.ptype[q], t);
    const sure = r === 'A' || (r === 'B' && probe.ptype[q] === BOMB);
    if (!sure) continue;
    if (pieceMoves(probe, q).some((mm) => mm.to === m.to)) return { code: 'C2', line: 'mc.coach.hang', marks: [probe.ppos[q], m.to] };
  }
  return null;
}

function c3(s: GameState, m: Move, me: Side): CoachAlert | null {
  if (s.mode !== 'an' || m.kind !== 'attack' || rankOf(s.ptype[m.pid]) < 7) return null;
  const d = s.board[m.to];
  if (d < 0 || s.pside[d] === me || s.pmoved[d]) return null;
  if (indexToSlot(s.pinit[d]).r < 5) return null;
  return { code: 'C3', line: 'mc.coach.mine', marks: [m.to] };
}

/** C4 needs the hidden multiset: counts by side·12 + type of the face-down pieces (public) */
function c4(s: GameState, at: number, me: Side, hidden: number[]): CoachAlert | null {
  if (s.mode !== 'fan') return null;
  let mine = -1;
  for (const n of adj[at]) {
    const q = s.board[n];
    if (q >= 0 && s.pup[q] && s.pside[q] === me && rankOf(s.ptype[q]) >= 6) {
      if (mine < 0 || rankOf(s.ptype[q]) > rankOf(s.ptype[mine])) mine = q;
    }
  }
  if (mine < 0) return null;
  const enemy = 1 - me;
  let bigger = 0, total = 0;
  for (let t = 0; t < 12; t++) {
    const n = hidden[enemy * 12 + t] ?? 0;
    total += n + (hidden[me * 12 + t] ?? 0);
    if (!n) continue;
    if (!isMobileType(t)) continue;
    const r = resolve(t, s.ptype[mine]);
    if (r === 'A' || t === BOMB) bigger += n;
  }
  if (!bigger) return null;
  return { code: 'C4', line: 'mc.coach.flip', marks: [at, s.ppos[mine]], beads: [bigger, total] };
}

function c5(s: GameState, m: Move): CoachAlert | null {
  if (!isHQ(m.to) || m.kind !== 'move') return null;
  const side = s.pside[m.pid];
  for (let p = 0; p < s.np; p++) {
    if (p === m.pid || s.pside[p] !== side) continue;
    if (pieceCanMove(s, p) && pieceMoves(s, p).length) return null;
  }
  return { code: 'C5', line: 'mc.ref.enterhq', marks: [m.to] };
}

/** C6: a known mine in front of an attacker that would be lost on it (see the header) */
export function knownMineAttack(s: GameState, m: Move, me: Side, k: Knowledge | null): CoachAlert | null {
  if (m.kind !== 'attack') return null;
  const att = s.ptype[m.pid];
  if (att === ENG || att === BOMB) return null;
  const d = s.board[m.to];
  if (d < 0 || s.pside[d] === me) return null;
  // 暗棋: only what the mover's own notes prove (never the true identity); 翻翻棋: face-up pieces only
  const known = s.mode === 'an' ? !!k && k.mask[d] === bit(MINE) : s.ptype[d] === MINE && (s.mode !== 'fan' || !!s.pup[d]);
  return known ? { code: 'C6', line: 'mc.coach.knownmine', marks: [m.to] } : null;
}

export interface CoachOpts {
  me: Side;
  knowledge: Knowledge | null;
  hidden: number[] | null;
  /** C2–C5 already shown this game (cap 3) */
  used: number;
  enabled: boolean;
}

/** the alert for a move the child is about to commit, or null. C1 ignores the cap; C5 and C6 always show. */
export function coachCheck(s: GameState, a: Action, o: CoachOpts): CoachAlert | null {
  if (isMove(a)) {
    const m5 = c5(s, a);
    if (m5) return m5;
    const m6 = knownMineAttack(s, a, o.me, o.knowledge);
    if (m6) return m6;
  }
  if (!o.enabled) return null;
  const danger = flagDangerAfter(s, a, o.me, o.knowledge);

  if (danger.length) return { code: 'C1', line: 'mc.coach.flag', marks: danger };
  if (o.used >= 3) return null;
  if (isFlip(a)) return o.hidden ? c4(s, a.flip, o.me, o.hidden) : null;
  if (!isMove(a)) return null;
  return c2(s, a, o.me) ?? c3(s, a, o.me);
}

export { half };
