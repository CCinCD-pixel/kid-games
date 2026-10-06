/**
 * Bots for difficulty validation (spec §9; bots.mjs 1:1). They play through the real rules and never
 * peek at the refill stream: a candidate move is scored on a clone with refill switched off.
 *   R random · K kid proxy (35 % random, 65 % greedy) · G greedy · L 2-ply lookahead
 *   KH hint follower (p = 0.5 plays the H1 move) · K:<feature> (V14 ablation)
 */
import { applyMove, listMoves } from './moves';
import { rngBelow, rngNew, rngNext } from './rng';
import { cloneState, isWon, newGame, remaining } from './state';
import { hint1Move } from './hints';
import { BOMB, CRATE, GOO, ORB, PIECE, POD, PROP, RH, RV, isSpecial, type GameState, type Level, type Move, type RngState } from './types';

const SPECIAL_VALUE: Record<number, number> = { [RH]: 14, [RV]: 14, [PROP]: 12, [BOMB]: 20, [ORB]: 32 };

export interface Measure { crateHp: number; ice: number; dust: number; goo: number; podDepth: number; spec: number; rem: number[]; cleared: number; rem0?: number[]; rv?: number; firedV?: number }

export function measure(st: GameState): Measure {
  let crateHp = 0, ice = 0, dust = 0, goo = 0, podDepth = 0, spec = 0;
  for (let i = 0; i < st.N; i += 1) {
    const k = st.kind[i];
    if (k === CRATE) crateHp += st.hp[i];
    else if (k === GOO) goo += 1;
    else if (k === PIECE) ice += st.ice[i];
    else if (k === POD) podDepth += (i / st.W) | 0;
    else if (isSpecial(k)) spec += SPECIAL_VALUE[k];
    dust += st.dust[i];
  }
  return { crateHp, ice, dust, goo, podDepth, spec, rem: st.L.objectives.map((o) => remaining(st, o)), cleared: st.collected.reduce((a, b) => a + b, 0) };
}

export function scoreTransition(st: GameState, a: Measure, b: Measure, won: boolean, feature: string | null = null): number {
  if (won) return 100000;
  let s = 0;
  const objs = st.L.objectives;
  let open = false;
  const w = (k: number) => (feature === 'priority' && a.rem[k] > 0 ? 0.5 + 1.5 * (a.rem[k] / (a.rem0?.[k] || a.rem[k])) : 1);
  objs.forEach((o, k) => {
    const gained = Math.max(0, a.rem[k] - b.rem[k]);
    if (b.rem[k] > 0) open = true;
    switch (o.t) {
      case 'collect': s += 10 * gained * w(k); break;
      case 'crate': s += 12 * Math.max(0, a.crateHp - b.crateHp) + 10 * gained; break;
      case 'ice': s += 15 * Math.max(0, a.ice - b.ice); break;
      case 'dust': s += 12 * Math.max(0, a.dust - b.dust); break;
      case 'goo': s += 20 * Math.max(0, a.goo - b.goo); break;
      case 'pod': s += 80 * gained + 10 * Math.max(0, b.podDepth - a.podDepth); break;
      case 'energy': s += 3 * gained; break;
      default: break;
    }
  });
  if (open) s += b.spec - a.spec;
  s += 0.5 * (b.cleared - a.cleared);
  if (feature === 'vrocket') s += 25 * Math.max(0, (b.rv ?? 0) - (a.rv ?? 0)) + ((b.firedV ?? 0) > (a.firedV ?? 0) ? 25 : 0);
  if (feature === 'crate') s += 20 * Math.max(0, a.crateHp - b.crateHp);
  return s;
}

function countKind(st: GameState, k: number): number { let n = 0; for (let i = 0; i < st.N; i += 1) if (st.kind[i] === k) n += 1; return n; }

export function evalMove(st: GameState, mv: Move, before: Measure = measure(st), feature: string | null = null): { score: number; sim: GameState } {
  const sim = cloneState(st, true);
  const firedVBefore = countKind(st, RV);
  const res = applyMove(sim, mv);
  if (!res.ok) return { score: -1e9, sim };
  const after = measure(sim);
  if (feature === 'vrocket') { before = { ...before, rv: firedVBefore, firedV: 0 }; after.rv = countKind(sim, RV); after.firedV = (mv.t === 'tap' && st.kind[mv.a] === RV) || (mv.t === 'swap' && (st.kind[mv.a] === RV || st.kind[mv.b] === RV)) ? 1 : 0; }
  if (feature === 'priority') before = { ...before, rem0: st.L.objectives.map((o) => (o.t === 'collect' ? o.n : before.rem[st.L.objectives.indexOf(o)])) };
  return { score: scoreTransition(st, before, after, isWon(sim), feature), sim };
}

function greedyPick(st: GameState, moves: Move[], brng: RngState, feature: string | null = null): Move {
  const before = measure(st);
  let best = -Infinity, pick: Move[] = [];
  for (const mv of moves) {
    const { score } = evalMove(st, mv, before, feature);
    if (score > best + 1e-9) { best = score; pick = [mv]; } else if (Math.abs(score - best) <= 1e-9) pick.push(mv);
  }
  return pick[rngBelow(brng, pick.length)];
}

function lookaheadPick(st: GameState, moves: Move[], brng: RngState): Move {
  const before = measure(st);
  const scored = moves.map((mv) => ({ mv, ...evalMove(st, mv, before) })).sort((x, y) => y.score - x.score);
  const top = scored.slice(0, 5);
  let best = -Infinity, pick: Move[] = [];
  for (const t of top) {
    let total = t.score;
    if (t.score < 100000) {
      const replies = listMoves(t.sim).slice(0, 60);
      const b2 = measure(t.sim);
      let r = 0;
      for (const mv of replies) { const e = evalMove(t.sim, mv, b2); if (e.score > r) r = e.score; }
      total += 0.7 * r;
    }
    if (total > best + 1e-9) { best = total; pick = [t.mv]; } else if (Math.abs(total - best) <= 1e-9) pick.push(t.mv);
  }
  return pick[rngBelow(brng, pick.length)];
}

export type BotName = 'R' | 'K' | 'G' | 'L' | 'KH' | `K:${string}`;
export function chooseMove(bot: BotName, st: GameState, brng: RngState): Move | null {
  const moves = listMoves(st);
  if (!moves.length) return null;
  if (bot === 'R') return moves[rngBelow(brng, moves.length)];
  if (bot === 'K') return rngNext(brng) < 0.35 ? moves[rngBelow(brng, moves.length)] : greedyPick(st, moves, brng);
  if (bot === 'KH') return rngNext(brng) < 0.5 ? hint1Move(st, brng) : (rngNext(brng) < 0.35 ? moves[rngBelow(brng, moves.length)] : greedyPick(st, moves, brng));
  if (bot.startsWith('K:')) return rngNext(brng) < 0.35 ? moves[rngBelow(brng, moves.length)] : greedyPick(st, moves, brng, bot.slice(2));
  if (bot === 'G') return greedyPick(st, moves, brng);
  if (bot === 'L') return lookaheadPick(st, moves, brng);
  throw new Error(bot);
}

/** play one game with no move limit (up to cap); returns moves needed to win or Infinity. */
export function playOut(L: Level, seed: number, bot: BotName, cap = 70): { needed: number; st: GameState } {
  const st = newGame(L, seed);
  const brng = rngNew(`bot:${bot}:${seed}`);
  for (let m = 1; m <= cap; m += 1) {
    const mv = chooseMove(bot, st, brng);
    if (!mv) return { needed: Infinity, st };
    applyMove(st, mv);
    if (isWon(st)) return { needed: m, st };
  }
  return { needed: Infinity, st };
}
