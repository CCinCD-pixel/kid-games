/**
 * Hints (spec §5.1; bots.mjs 1:1): H1 = a random legal move that advances an unfinished non-energy
 * objective (NOT the optimum); H2 / bestMove = the G bot's choice, ties → first in listMoves order.
 */
import { evalMove, measure } from './bots';
import { applyMove, listMoves } from './moves';
import { rngBelow } from './rng';
import { cloneState, remaining } from './state';
import { CRATE, PIECE, type GameState, type Move, type RngState } from './types';

export function hint1Candidates(st: GameState): Move[] {
  const moves = listMoves(st);
  const objs = st.L.objectives;
  const real = objs.some((o) => o.t !== 'energy');
  if (!real) return moves;
  const before = objs.map((o) => remaining(st, o));
  const crateHp = (x: GameState) => { let n = 0; for (let i = 0; i < x.N; i += 1) if (x.kind[i] === CRATE) n += x.hp[i]; return n; };
  const iceL = (x: GameState) => { let n = 0; for (let i = 0; i < x.N; i += 1) if (x.kind[i] === PIECE) n += x.ice[i]; return n; };
  const out: Move[] = [];
  for (const mv of moves) {
    const sim = cloneState(st, true);
    if (!applyMove(sim, mv).ok) continue;
    let ok = objs.some((o, k) => o.t !== 'energy' && before[k] > 0 && remaining(sim, o) < before[k]);
    if (!ok && objs.some((o) => o.t === 'crate')) ok = crateHp(sim) < crateHp(st);
    if (!ok && objs.some((o) => o.t === 'ice')) ok = iceL(sim) < iceL(st);
    if (ok) out.push(mv);
  }
  return out.length ? out : moves;
}
export function hint1Move(st: GameState, hrng: RngState): Move | null { const c = hint1Candidates(st); return c.length ? c[rngBelow(hrng, c.length)] : null; }
export function bestMove(st: GameState): Move | null {
  const moves = listMoves(st); if (!moves.length) return null;
  const before = measure(st); let best = -Infinity, pick: Move | null = null;
  for (const mv of moves) { const { score } = evalMove(st, mv, before); if (score > best + 1e-9) { best = score; pick = mv; } }
  return pick;
}
