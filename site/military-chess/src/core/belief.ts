/**
 * 暗棋 knowledge and belief (spec §3.11, R11.2): one 12-bit mask per enemy piece ("which identities are
 * still possible"), updated only from public events. The child's 参谋笔记 (badges), the intel board's
 * "certainly down" strikes, the AI's PIMC sampler and the hint level all use this one module.
 * Pure; no DOM.
 */
import { BLUE, RED, indexToSlot, isHQ, parseSq, type Side } from './board';
import type { Outcome } from './combat';
import { isFlip, isMove, isPass, needsEngineer, type Action } from './movegen';
import { BOMB, COUNTS, ENG, FLAG, MARSHAL, MINE, rankOf, typeFromCode } from './pieces';
import type { MoveEvent } from './rules';
import { newState, type GameState } from './state';

export const ALL = (1 << 12) - 1;
export const bit = (t: number): number => 1 << t;
export const RANKED = (() => {
  let m = 0;
  for (let t = 3; t < 12; t++) m |= bit(t);
  return m;
})();
export function ranksAbove(r: number): number {
  let m = 0;
  for (let t = 3; t < 12; t++) if (rankOf(t) > r) m |= bit(t);
  return m;
}
export function ranksBelow(r: number): number {
  let m = 0;
  for (let t = 3; t < 12; t++) if (rankOf(t) < r) m |= bit(t);
  return m;
}
export function popcount(m: number): number {
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}
/** the single type of a one-bit mask, or −1 */
export const onlyType = (m: number): number => (m && (m & (m - 1)) === 0 ? 31 - Math.clz32(m) : -1);
export const typesOf = (m: number): number[] => {
  const out: number[] = [];
  for (let t = 0; t < 12; t++) if (m & bit(t)) out.push(t);
  return out;
};

/** the strongest public constraint learned about a piece (for the 参谋笔记 badge) */
export type NoteKind = 'moved' | 'eng' | 'smaller' | 'bigger' | 'bigger.eng' | 'equal' | 'mine' | 'flag';
export interface PieceNote {
  kind: NoteKind;
  /** rank of my piece in the collision (smaller / bigger / equal) */
  r: number;
}

export interface Knowledge {
  me: Side;
  enemy: Side;
  /** per piece id (enemy pieces only; others ALL) */
  mask: number[];
  /** last collision constraint per piece */
  note: Array<PieceNote | null>;
  moved: boolean[];
}

/** initial knowledge from the deployment rules (R3): only known from where a piece started */
export function newKnowledge(s: GameState, me: Side): Knowledge {
  const enemy = (1 - me) as Side;
  const mask: number[] = [];
  for (let p = 0; p < s.np; p++) {
    if (s.pside[p] !== enemy) {
      mask.push(ALL);
      continue;
    }
    let m = ALL;
    const { r } = indexToSlot(s.pinit[p]);
    if (!isHQ(s.pinit[p])) m &= ~bit(FLAG);
    if (r < 5) m &= ~bit(MINE);
    if (r === 1) m &= ~bit(BOMB);
    mask.push(m);
  }
  return { me, enemy, mask, note: new Array(s.np).fill(null), moved: new Array(s.np).fill(false) };
}

export function cloneKnowledge(k: Knowledge): Knowledge {
  return { me: k.me, enemy: k.enemy, mask: k.mask.slice(), note: k.note.slice(), moved: k.moved.slice() };
}

/**
 * Update side `k.me`'s knowledge from one event (pre-move state s0). Only public facts are used: the
 * enemy's from/to squares, the referee's verdict, my own piece types and shown flags.
 */
export function observe(k: Knowledge, s0: GameState, ev: MoveEvent): void {
  const m: Action = ev.action;
  if (isPass(m) || isFlip(m) || !isMove(m)) return;
  const narrow = (p: number, allowed: number): void => {
    k.mask[p] &= allowed;
  };
  const setNote = (p: number, n: PieceNote): void => {
    k.note[p] = n;
  };
  const moverIsEnemy = s0.pside[m.pid] === k.enemy;
  if (moverIsEnemy) {
    narrow(m.pid, ~(bit(FLAG) | bit(MINE)));
    k.moved[m.pid] = true;
    if (needsEngineer(s0, m.from, m.to)) {
      narrow(m.pid, bit(ENG));
      setNote(m.pid, { kind: 'eng', r: 1 });
    }
  }
  if (ev.outcome) {
    const att = ev.att!, def = ev.def!;
    const o: Outcome = ev.outcome;
    if (moverIsEnemy) {
      // the enemy attacked my piece of known type t
      const t = s0.ptype[def];
      if (t === MINE) {
        narrow(att, o === 'A' ? bit(ENG) : o === 'B' ? bit(BOMB) : RANKED & ~bit(ENG));
        setNote(att, o === 'A' ? { kind: 'eng', r: 1 } : o === 'B' ? { kind: 'equal', r: 0 } : { kind: 'bigger.eng', r: 1 });
      } else if (t !== BOMB && t !== FLAG) {
        const r = rankOf(t);
        if (o === 'A') {
          narrow(att, ranksAbove(r));
          setNote(att, { kind: 'bigger', r });
        } else if (o === 'B') {
          narrow(att, bit(t) | bit(BOMB));
          setNote(att, { kind: 'equal', r });
        } else {
          narrow(att, ranksBelow(r));
          setNote(att, { kind: 'smaller', r });
        }
      }
    } else {
      // I attacked enemy piece `def` with my type t
      const t = s0.ptype[att];
      if (t !== BOMB) {
        const r = rankOf(t);
        if (o === 'A') {
          narrow(def, t === ENG ? bit(MINE) : ranksBelow(r));
          setNote(def, t === ENG ? { kind: 'mine', r: 1 } : { kind: 'smaller', r });
        } else if (o === 'B') {
          narrow(def, bit(t) | bit(BOMB));
          setNote(def, { kind: 'equal', r });
        } else if (o === 'D') {
          narrow(def, ranksAbove(r) | (t === ENG ? 0 : bit(MINE)));
          setNote(def, { kind: t === ENG ? 'bigger.eng' : 'bigger', r });
        } else if (o === 'F') narrow(def, bit(FLAG));
      }
    }
  }
  for (const side of ev.flagShown) {
    if (side !== k.enemy) continue;
    // the enemy 司令 went down in this collision: the removed enemy piece was the 司令; its flag is public
    for (const p of ev.removed) if (s0.pside[p] === k.enemy) narrow(p, bit(MARSHAL));
    for (let p = 0; p < s0.np; p++) {
      if (s0.pside[p] !== k.enemy) continue;
      if (s0.ptype[p] === FLAG) {
        k.mask[p] = bit(FLAG);
        setNote(p, { kind: 'flag', r: 0 });
      } else if (k.mask[p] !== bit(FLAG)) k.mask[p] &= ~bit(FLAG);
    }
  }
}

/** every constraint contains the true identity (self-play invariant) */
export function knowledgeConsistent(k: Knowledge, s: GameState): boolean {
  for (let p = 0; p < s.np; p++) if (s.pside[p] === k.enemy && !(k.mask[p] & bit(s.ptype[p]))) return false;
  return true;
}

/** an enemy piece that went down and whose identity is certain (intel board strike-out) */
export function certainType(k: Knowledge, pid: number): number {
  return onlyType(k.mask[pid]);
}
/** how many of each type are certainly down (for the intel list) */
export function certainDead(k: Knowledge, s: GameState): number[] {
  const out = new Array(12).fill(0);
  for (let p = 0; p < s.np; p++) {
    if (s.pside[p] !== k.enemy || s.palive[p]) continue;
    const t = onlyType(k.mask[p]);
    if (t >= 0) out[t]++;
  }
  return out;
}

// ------------------------------------------------------------------ badges (spec §3.11 table, §6.4)
export interface Badge {
  /** up to 3 glyphs: digits, ↑ ↓ =, '工' */
  text: string;
  icon: 'mine' | 'bomb' | 'flag' | 'foot' | null;
  line: string;
}
/** the badge for an enemy piece, or null (no constraint and never moved) */
export function badgeOf(k: Knowledge, pid: number): Badge | null {
  const m = k.mask[pid];
  const only = onlyType(m);
  if (only === FLAG) return { text: '', icon: 'flag', line: 'mc.note.flag' };
  if (only === MINE) return { text: '', icon: 'mine', line: 'mc.note.mine' };
  if (only === BOMB) return { text: '', icon: 'bomb', line: 'mc.note.equal' };
  if (only === ENG) return { text: '工', icon: null, line: k.note[pid]?.kind === 'eng' ? 'mc.note.eng' : 'mc.note.smaller' };
  if (only >= 3) {
    const n = k.note[pid];
    return { text: String(rankOf(only)), icon: null, line: n?.kind === 'equal' ? 'mc.note.equal' : n?.kind === 'bigger' ? 'mc.note.bigger' : 'mc.note.smaller' };
  }
  const n = k.note[pid];
  if (n) {
    switch (n.kind) {
      case 'smaller':
        return { text: `${n.r}↓`, icon: null, line: 'mc.note.smaller' };
      case 'bigger':
        return { text: `${n.r}↑`, icon: m & bit(MINE) ? 'mine' : null, line: 'mc.note.bigger' };
      case 'bigger.eng':
        return { text: '1↑', icon: null, line: 'mc.note.bigger.eng' };
      case 'equal':
        return n.r ? { text: `${n.r}=`, icon: m & bit(BOMB) ? 'bomb' : null, line: 'mc.note.equal' } : { text: '', icon: 'bomb', line: 'mc.note.equal' };
      case 'eng':
        return { text: '工', icon: null, line: 'mc.note.eng' };
      case 'mine':
        return { text: '', icon: 'mine', line: 'mc.note.mine' };
      case 'flag':
        return { text: '', icon: 'flag', line: 'mc.note.flag' };
      case 'moved':
        break;
    }
  }
  if (k.moved[pid]) return { text: '', icon: 'foot', line: 'mc.note.moved' };
  return null;
}

// ------------------------------------------------------------------ 学堂 L8 infer cards
export interface InferEventLike {
  my?: string;
  act?: string;
  outcome?: string;
  flagShown?: boolean;
  moved?: boolean;
  from?: string;
  to?: string;
  unmoved?: boolean;
  backRow?: boolean;
}
/** mask of identities consistent with a list of infer-card events (same logic as `observe`) */
export function inferMask(events: readonly InferEventLike[]): number {
  let m = ALL;
  for (const e of events) {
    if (e.moved) {
      m &= ~(bit(FLAG) | bit(MINE));
      if (e.from && e.to && needsEngineer(newState('ming'), parseSq(e.from), parseSq(e.to))) m &= bit(ENG);
    }
    if (e.act === 'attack') {
      const t = typeFromCode(e.my!);
      const r = rankOf(t);
      if (t !== BOMB) {
        if (e.outcome === 'A') m &= t === ENG ? bit(MINE) : ranksBelow(r);
        if (e.outcome === 'B') m &= bit(t) | bit(BOMB);
        if (e.outcome === 'D') m &= ranksAbove(r) | (t === ENG ? 0 : bit(MINE));
      }
    }
    if (e.flagShown) m &= bit(MARSHAL);
  }
  return m;
}

// ------------------------------------------------------------------ belief sampling (PIMC, spec §8.5)
export type Rand = () => number;

/** bipartite matching: can every piece get a type within its mask and the type capacities? */
export function feasible(masks: readonly number[], cap: readonly number[]): boolean {
  const owner: number[][] = Array.from({ length: 12 }, () => []);
  const capL = cap.slice();
  const tryAssign = (pi: number, seen: boolean[]): boolean => {
    const m = masks[pi];
    for (let t = 0; t < 12; t++) {
      if (!(m & bit(t)) || seen[t]) continue;
      seen[t] = true;
      if (owner[t].length < capL[t]) {
        owner[t].push(pi);
        return true;
      }
      for (let j = 0; j < owner[t].length; j++) {
        const other = owner[t][j];
        if (tryAssign(other, seen)) {
          owner[t][j] = pi;
          return true;
        }
      }
    }
    return false;
  };
  for (let i = 0; i < masks.length; i++) if (!tryAssign(i, new Array(12).fill(false))) return false;
  return true;
}

/** deployment-shaped prior: where do people put things? (shapes sampling; never contradicts masks) */
export function deploymentPrior(pinit: number, moved: boolean, t: number): number {
  const { r, c } = indexToSlot(pinit);
  let w = 1;
  if (t === MINE) w = r === 6 ? 2.0 : 1.4;
  if (t === BOMB) w = r === 2 || r === 3 ? 1.6 : 1;
  if (t >= 10) w = c === 1 || c === 5 || r <= 2 ? 1.4 : 0.9;
  if (!moved && (t === MINE || t === FLAG)) w *= 1.3;
  return w;
}

export interface BeliefInput {
  /** enemy piece ids (alive and down: counts constrain both) */
  pieces: number[];
  masks: number[];
  pinit: number[];
  moved: boolean[];
  /** per-type totals for the enemy (COUNTS minus handicap) */
  counts?: readonly number[];
}

/**
 * Sample one full assignment piece → type consistent with masks and counts (Kuhn-matching
 * feasibility, most constrained first, deployment prior as weights). Throws 'belief infeasible' when
 * the masks contradict the counts (R6 in §10.2: caller falls back to counts only).
 */
export function sampleAssignment(b: BeliefInput, rng: Rand, usePrior = true): Map<number, number> {
  const cap = (b.counts ?? COUNTS).slice();
  const idxOf = new Map(b.pieces.map((p, i) => [p, i]));
  const order = b.pieces.map((p, i) => [p, popcount(b.masks[i]) + rng() * 0.5] as const).sort((x, y) => x[1] - y[1]).map((x) => x[0]);
  const out = new Map<number, number>();
  let rest = order.slice();
  while (rest.length) {
    const p = rest.shift()!;
    const i = idxOf.get(p)!;
    const m = b.masks[i];
    const cands: Array<[number, number]> = [];
    let tot = 0;
    const restMasks = rest.map((q) => b.masks[idxOf.get(q)!]);
    for (let t = 0; t < 12; t++) {
      if (!(m & bit(t)) || cap[t] === 0) continue;
      cap[t]--;
      const ok = feasible(restMasks, cap);
      cap[t]++;
      if (!ok) continue;
      const w = cap[t] * (usePrior ? deploymentPrior(b.pinit[i], b.moved[i], t) : 1);
      cands.push([t, w]);
      tot += w;
    }
    if (!cands.length) throw new Error('belief infeasible');
    let r = rng() * tot;
    let pick = cands[cands.length - 1][0];
    for (const [t, w] of cands) {
      r -= w;
      if (r <= 0) {
        pick = t;
        break;
      }
    }
    cap[pick]--;
    out.set(p, pick);
    rest = rest.filter((q) => q !== p);
  }
  return out;
}

/** belief input of side k.me about the enemy from a state's public parts */
export function beliefInput(k: Knowledge, s: GameState, counts?: readonly number[]): BeliefInput {
  const pieces: number[] = [];
  for (let p = 0; p < s.np; p++) if (s.pside[p] === k.enemy) pieces.push(p);
  return { pieces, masks: pieces.map((p) => k.mask[p]), pinit: pieces.map((p) => s.pinit[p]), moved: pieces.map((p) => !!s.pmoved[p]), counts };
}

/** an infer-card option ('6|B' = 旅长或炸弹) is consistent with a mask */
export const optionConsistent = (opt: string, m: number): boolean => opt.split('|').some((c) => (m & bit(typeFromCode(c))) !== 0);

/** enemy totals per type for a side that gave a handicap (让子 removes pieces before the game) */
export function countsWithout(handicap: string): number[] {
  const c = COUNTS.slice();
  for (const ch of handicap) {
    const t = typeFromCode(ch);
    if (t >= 0) c[t]--;
  }
  return c;
}

export { RED, BLUE };
