/**
 * 残局挑战 generator (spec §4.2, §8.10, §11 V1/V2), ported from the prototype
 * `~/kid-games-work/specs/military-chess-tools/gen-endgames.mjs` onto the game's real core (solver, policy, book).
 *
 *   random sparse 明棋 positions → AND-OR solver (BLUE = natural-defence policy) → hard rejections →
 *   main line (same policy and caps as the reply book) → idea classification → curated pick: every tier's
 *   8 puzzles have 8 DIFFERENT main ideas (hard constraint, review D4).
 *
 * Titles and "这关教什么" are hand-written per puzzle after review; this module only PROPOSES candidates.
 * Adding a tier = a TIERS row (tier 3 "将军残局" is prepared for v2: `need: ['blueThreat']`), run
 * `gen-endgames.heavy.test.ts` (MC_HEAVY=1), review the pool in ~/kid-games-work/military-chess/, then curate.
 * Deterministic: candidates come from the kit's seeded RNG (`mc-endgame:<tier>:<seed>`).
 */
import { createRng, type Rng } from '../../kit/rng';
import { BLUE, N, RED, Y, adj, isCamp, isHQ, parseSq, sq } from '../../site/military-chess/src/core/board';
import { buildBook, lineFromBook, SLACK } from '../../site/military-chess/src/core/book';
import { resolve } from '../../site/military-chess/src/core/combat';
import { isMove, legalMoves, pieceCanMove } from '../../site/military-chess/src/core/movegen';
import { parseNote, toNote } from '../../site/military-chess/src/core/notation';
import { BOMB, COUNTS, ENG, FLAG, MINE, isMobileType, typeFromCode } from '../../site/military-chess/src/core/pieces';
import { bluePolicy } from '../../site/military-chess/src/core/policy';
import { buildPuzzleState, goalReached, type PuzzleDef } from '../../site/military-chess/src/core/puzzle';
import { apply } from '../../site/military-chess/src/core/rules';
import { BudgetError, budget, distToWin, optimalMoves, solve, type Memo } from '../../site/military-chess/src/core/solver';
import { clone, type GameState } from '../../site/military-chess/src/core/state';

export interface Tier {
  name: string;
  par: number;
  blueMob: [number, number];
  redMob: [number, number];
  mines: [number, number];
  redFlag: boolean;
  maxFirst: number;
  /** features the main line must have (tier 3: BLUE threatens the RED flag during the line) */
  need?: string[];
}
export const TIERS: Record<string, Tier> = {
  1: { name: '新兵残局', par: 2, blueMob: [1, 2], redMob: [2, 3], mines: [1, 3], redFlag: false, maxFirst: 2 },
  2: { name: '攻守残局', par: 3, blueMob: [1, 3], redMob: [2, 3], mines: [1, 3], redFlag: true, maxFirst: 2 },
  '1b': { name: '新兵残局（3 步）', par: 3, blueMob: [1, 2], redMob: [2, 3], mines: [1, 3], redFlag: false, maxFirst: 2 },
  3: { name: '将军残局', par: 4, blueMob: [2, 3], redMob: [3, 4], mines: [2, 3], redFlag: true, maxFirst: 2, need: ['blueThreat'] }, // v2
};
/** idea priority (first match = the puzzle's main idea) */
export const IDEAS = ['defend', 'nomoves', 'bomb-guard', 'bomb-mine', 'dig-turn', 'dig', 'camp', 'capture', 'eng-run', 'rail', 'quiet'] as const;
export type Idea = (typeof IDEAS)[number];
export const IDEA_NAMES: Record<Idea, string> = {
  defend: '先守后攻', nomoves: '让它没棋走', 'bomb-guard': '炸掉守卫', 'bomb-mine': '炸弹开雷', 'dig-turn': '工兵绕路挖雷',
  dig: '工兵挖雷', camp: '借道行营', capture: '吃掉守卫', 'eng-run': '工兵奔袭', rail: '铁路突袭', quiet: '先走一步',
};
/** candidate flavours (the prototype's CLI presets) */
export interface CandOpts {
  noEngineer?: boolean; bomb?: number; guard?: boolean; guardRank?: [number, number]; allMines?: boolean;
  bombFirst?: boolean; redMaxRank?: number; raider?: boolean;
}
export const FLAVOURS: Record<string, CandOpts> = {
  mixed: {},
  bomb: { noEngineer: true, bomb: 0.9 },
  plain: { noEngineer: true, bomb: 0 },
  guard: { guard: true, bomb: 0.5 },
  guardbomb: { guard: true, noEngineer: true, bomb: 0.95 },
  bombguard: { guard: true, guardRank: [8, 9], allMines: true, noEngineer: true, bomb: 1, bombFirst: true, redMaxRank: 7 },
  bombmine: { allMines: true, noEngineer: true, bomb: 1, bombFirst: true },
  raider: { raider: true },
};
const RANK_CODES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export type Cand = PuzzleDef & { red: Record<string, string>; blue: Record<string, string> };

export function countsOk(pz: Cand): boolean {
  for (const side of [pz.red, pz.blue]) {
    const n: Record<string, number> = {};
    for (const v of Object.values(side)) n[v] = (n[v] || 0) + 1;
    for (const [code, k] of Object.entries(n)) if (k > COUNTS[typeFromCode(code)]) return false;
  }
  return true;
}

export function candidate(rng: Rng, tier: string | number, o: CandOpts = {}): Cand {
  const T = TIERS[tier];
  const ri = (a: number, b: number) => rng.int(a, b);
  const used = new Set<number>();
  const red: Record<string, string> = {}, blue: Record<string, string> = {};
  const take = (pred: (i: number) => boolean): string | null => {
    for (let k = 0; k < 300; k++) {
      const i = rng.int(0, N - 1);
      if (used.has(i) || !pred(i)) continue;
      used.add(i);
      return sq(i);
    }
    return null;
  };
  const flag = rng.chance(0.5) ? 'b12' : 'd12';
  used.add(parseSq(flag));
  blue[flag] = 'F';
  const nb = rng.shuffle(adj[parseSq(flag)]);
  const nm = o.allMines ? nb.length - (o.guard ? 1 : 0) : Math.min(ri(T.mines[0], T.mines[1]), 3);
  for (let k = 0; k < nm && k < nb.length; k++) {
    used.add(nb[k]);
    blue[sq(nb[k])] = 'M';
  }
  if (o.guard) {
    const door = adj[parseSq(flag)].filter((i) => !used.has(i));
    if (door.length) {
      const d = rng.pick(door);
      used.add(d);
      blue[sq(d)] = o.guardRank ? RANK_CODES[ri(o.guardRank[0], o.guardRank[1]) - 1] : RANK_CODES[ri(1, 8)];
    }
  }
  for (let k = o.guard ? 1 : 0, n = ri(T.blueMob[0], T.blueMob[1]); k < n; k++) {
    const s = take((i) => Y(i) <= 5 && !isHQ(i));
    if (s) blue[s] = RANK_CODES[ri(1, 8)];
  }
  const allMined = nm === nb.length;
  const nr = ri(T.redMob[0], T.redMob[1]);
  const wantBomb = rng.chance(o.bomb ?? 0.45);
  for (let k = 0; k < nr; k++) {
    const s = take((i) => Y(i) >= 2 && Y(i) <= 8 && !isHQ(i));
    if (!s) continue;
    red[s] = !o.noEngineer && k === 0 && (allMined || rng.chance(0.35)) ? '1'
      : k === (o.bombFirst ? 0 : 1) && wantBomb ? 'B'
      : RANK_CODES[ri(o.noEngineer ? 2 : 1, o.redMaxRank ?? 9) - 1];
  }
  if (T.redFlag) {
    const f = rng.chance(0.5) ? 'b1' : 'd1';
    if (!used.has(parseSq(f))) {
      used.add(parseSq(f));
      red[f] = 'F';
      // a share of candidates: a BLUE raider already next to the RED flag (defend-first ideas)
      if (o.raider ?? rng.chance(0.4)) {
        const door = adj[parseSq(f)].filter((i) => !used.has(i));
        if (door.length) {
          const d = rng.pick(door);
          used.add(d);
          blue[sq(d)] = RANK_CODES[ri(2, 8)];
        }
      }
    }
  }
  return { red, blue, goal: { kind: 'flag' }, blue_moves: 'best' };
}

const flagTakeable = (s: GameState): boolean => {
  const t = clone(s);
  t.turn = BLUE;
  return legalMoves(t).some((m) => isMove(m) && m.kind === 'attack' && t.ptype[t.board[m.to]] === FLAG);
};

export interface Classified { feats: string[]; idea: Idea; reject: string[] }

/** classify a solved puzzle from its main line; feats are facts, `idea` is the first matching IDEAS entry */
export function classify(pz: PuzzleDef, line: readonly string[]): Classified {
  const s0 = buildPuzzleState(pz);
  let s = s0;
  const feats = new Set<string>();
  // defend: in the start position BLUE (to move) could take the RED flag at once
  if (flagTakeable(s0)) feats.add('defend');
  for (let i = 0; i < line.length; i++) {
    const a = parseNote(s, line[i]);
    if (!a) throw new Error(`line does not replay at ${i}: ${line[i]}`);
    if (isMove(a) && s.pside[a.pid] === RED) {
      const att = s.ptype[a.pid], def = a.kind === 'attack' ? s.ptype[s.board[a.to]] : -1;
      if (att === BOMB && def === FLAG) feats.add('x-bomb-flag'); // depends on the house rule bombTakesFlag
      if (a.kind === 'attack' && resolve(att, def) === 'D') feats.add('x-red-suicide');
      if (att === BOMB && def >= 3) feats.add('bomb-guard');
      if (att === BOMB && def === MINE) feats.add('bomb-mine');
      if (att === ENG && def === MINE) {
        feats.add('dig');
        if (a.eng) feats.add('dig-turn');
      }
      if (isCamp(a.to)) feats.add('camp');
      if (def >= 3 && att >= 3 && resolve(att, def) === 'A') feats.add('capture');
      if (a.path && a.path.length >= 4) feats.add(att === ENG ? (a.eng ? 'eng-run' : 'rail') : 'rail');
      if (a.kind === 'move' && i < line.length - 1) feats.add('quiet');
      if (a.eng) feats.add('engineer-turn');
    }
    if (isMove(a) && s.pside[a.pid] === BLUE) {
      if (isHQ(a.to)) feats.add('x-blue-hq');
      if (a.kind === 'attack' && ['D', 'B'].includes(resolve(s.ptype[a.pid], s.ptype[s.board[a.to]]))) feats.add('x-blue-suicide');
      // BLUE threat: after this reply BLUE could take the RED flag next turn (tier-3 requirement)
      if (flagTakeable(apply(s, a).state)) feats.add('blueThreat');
    }
    s = apply(s, a).state;
  }
  if (!(s.result && s.result.winner === RED)) feats.add('nomoves');
  const idea = IDEAS.find((x) => feats.has(x)) ?? 'quiet';
  return { feats: [...feats], idea, reject: [...feats].filter((f) => f.startsWith('x-')) };
}

export interface Solved extends Cand { tier: string | number; seed: number; par: number; first: string[] }

/** solve `tries` seeded candidates; hard rejections are counted in `why` */
export function generate(tier: string | number, tries: number, seedBase = 1, o: { flavour?: CandOpts; nodeLimit?: number } = {}): { got: Solved[]; why: Record<string, number> } {
  const T = TIERS[tier];
  const got: Solved[] = [];
  const seen = new Set<string>();
  const why: Record<string, number> = {};
  const rej = (k: string) => void (why[k] = (why[k] || 0) + 1);
  for (let seed = seedBase; seed < seedBase + tries; seed++) {
    const pz = candidate(createRng(`mc-endgame:${tier}:${seed}`), tier, o.flavour);
    if (!countsOk(pz)) { rej('counts'); continue; }
    const sig = JSON.stringify([pz.red, pz.blue]);
    if (seen.has(sig)) { rej('dup'); continue; }
    seen.add(sig);
    const s0 = buildPuzzleState(pz);
    if (legalMoves(s0).some((m) => isMove(m) && m.kind === 'attack' && s0.ptype[s0.board[m.to]] === FLAG)) { rej('flag-at-once'); continue; }
    if (!s0.ptype.some((t, p) => s0.pside[p] === BLUE && isMobileType(t) && pieceCanMove(s0, p))) { rej('blue-static'); continue; }
    let r;
    budget.nodes = 0;
    budget.limit = o.nodeLimit ?? 60000;
    try {
      r = solve(pz, T.par);
    } catch (e) {
      if (e instanceof BudgetError) { rej('budget'); continue; }
      throw e;
    } finally {
      budget.limit = Infinity;
    }
    if (r.par !== T.par) { rej('par'); continue; }
    if (r.firstMoves.length > T.maxFirst) { rej('first>max'); continue; }
    got.push({ ...pz, tier, seed, par: r.par, first: r.firstMoves });
  }
  return { got, why };
}

/** main line without building the whole book (same policy and caps as buildBook → identical to lineFromBook) */
export function mainLine(pz: PuzzleDef, par: number): string[] | null {
  const s0 = buildPuzzleState(pz);
  const memo: Memo = new Map();
  const total = par + SLACK;
  let s = s0;
  const line: string[] = [];
  for (let used = 0; used < total; used++) {
    const d = distToWin(pz, s0, s, total - used, memo);
    if (d > total - used) return null;
    const m = optimalMoves(pz, s0, s, d, memo)[0];
    line.push(toNote(m));
    const a = apply(s, m).state;
    if (goalReached(pz, s0, a, false)) return line;
    const { reply } = bluePolicy(pz, s0, a, total - used - 1, memo);
    line.push(toNote(reply));
    s = apply(a, reply).state;
    if (goalReached(pz, s0, s, true)) return line;
  }
  return null;
}

export type Pooled = Solved & Classified & { line: string[] };
/** cheap classification of a solved candidate (null when the line cannot be found); tier `need` enforced */
export function quickClassify(e: Solved): Pooled | null {
  const line = mainLine(e, e.par);
  if (!line) return null;
  const c = classify(e, line);
  const need = TIERS[e.tier].need ?? [];
  if (need.some((f) => !c.feats.includes(f))) c.reject.push(...need.filter((f) => !c.feats.includes(f)).map((f) => `need-${f}`));
  return { ...e, line, ...c };
}

/** the expensive part, for the shortlist only: reply book + book line + idea */
export function finish(e: Solved): Pooled & { root: unknown; bookStats: unknown } {
  const { root, stats } = buildBook(e, e.par);
  const line = lineFromBook(root);
  return { ...e, line, ...classify(e, line), bookStats: stats, root };
}

/** curated pick: distinct ideas first, then fewer pieces, a unique first move */
export function pickDistinct<T extends { idea: Idea; red: object; blue: object; first: string[] }>(pool: T[], k = 8): T[] {
  const score = (e: T) => Object.keys(e.red).length + Object.keys(e.blue).length + (e.first.length > 1 ? 2 : 0);
  const byIdea = new Map<Idea, T>();
  for (const e of pool.slice().sort((a, b) => score(a) - score(b))) if (!byIdea.has(e.idea)) byIdea.set(e.idea, e);
  return IDEAS.filter((i) => byIdea.has(i)).map((i) => byIdea.get(i)!).slice(0, k);
}
