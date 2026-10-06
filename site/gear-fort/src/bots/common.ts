// Shared bot helpers — port of proto/bots/common.mjs. Bots run outside the deterministic core and may use floats;
// they are deterministic for a given seed (own PRNG). Validators only: the page bundle never imports src/bots/**.
import { COLS, BOARD_X, T } from '../lane/rules';
import { UNITS, ENEMIES } from '../lane/tables';
import { canPlace, occupant } from '../lane/sim';
import { litByBeam, ATTACK, MUST, dpsVs, counterFor } from '../lane/tags';
import { prng } from '../lane/rng';
import type { Action, Enemy, SimState, Unit } from '../lane/types';

export { prng, ATTACK, MUST, dpsVs, counterFor };
export type Bot = ((S: SimState) => Action[]) & { coachMem?: unknown };

export function lognormal(r: () => number, mean: number, sd: number): number {
  const s2 = Math.log(1 + (sd / mean) ** 2); const mu = Math.log(mean) - s2 / 2;
  const u1 = Math.max(1e-9, r()), u2 = r(); const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(mu + Math.sqrt(s2) * z);
}

export const ECON = ['farm', 'bank', 'salvage'];
export const FLAT = new Set(['spikes', 'pit', 'listener']);

export function visible(S: SimState, e: Enemy, opt: { omni?: boolean } = {}): boolean {
  if (e.hp <= 0 || e.gone) return false;
  if (e.x >= BOARD_X) return false;
  const fog = S.L.env?.fogCol; if (fog != null && !opt.omni && e.x >= fog * T && !litByBeam(S, e)) return false;
  if (e.layer === 'under' && !e.revealed && !opt.omni) return false;
  return true;
}
export function laneUnits(S: SimState, lane: number): Unit[] { return S.units.filter((u) => !u.dead && u.lane === lane && u.k !== 'raft'); }
export function attackersIn(S: SimState, lane: number): Unit[] { return laneUnits(S, lane).filter((u) => ATTACK.includes(u.k)); }
export function frontAttackerCol(S: SimState, lane: number): number { let c = -1; for (const u of attackersIn(S, lane)) c = Math.max(c, u.col); return c; }
export function free(S: SimState, card: string, lane: number, col: number): boolean { return canPlace(S, card, lane, col) === null; }
export function boardFree(S: SimState, card: string, lane: number, col: number): boolean { const r = canPlace(S, card, lane, col); return r === null || r === 'grain' || r === 'cd'; }
export function inLoadout(S: SimState, card: string): boolean { return S.L.belt ? S.belt.includes(card) : (S.loadout || S.L.loadout || []).includes(card); }
export function ready(S: SimState, card: string): boolean { if (S.L.belt) return S.belt.includes(card); return inLoadout(S, card) && S.tick >= (S.cdReady[card] ?? 0); }
export function affordable(S: SimState, card: string): boolean { if (S.L.belt) return S.belt.includes(card); return ready(S, card) && S.grain >= UNITS[card].cost; }
export const activeLanes = (S: SimState): number[] => [0, 1, 2, 3, 4].filter((l) => S.L.lanes[l]);
export function needsRaft(S: SimState, lane: number, col: number): boolean { return !!S.waterNow[lane] && !(occupant(S, lane, col)?.k === 'raft'); }

export function pickCol(S: SimState, card: string, lane: number, cols: number[]): number {
  for (const c of cols) { if (c < 0 || c >= COLS) continue; if (canPlace(S, card, lane, c) === null) return c; }
  return -1;
}
/** place on water: raft first (returns the action list or []) */
export function placeActs(S: SimState, card: string, lane: number, col: number): Action[] {
  if (S.waterNow[lane] && card !== 'raft' && card !== 'strike') {
    const o = occupant(S, lane, col);
    if (!o) return affordable(S, 'raft') && S.grain >= UNITS.raft.cost + UNITS[card].cost ? [{ t: 'place', card: 'raft', lane, col }] : [];
    if (o.k !== 'raft' || o.top) return [];
  }
  return [{ t: 'place', card, lane, col }];
}
export function threatOf(e: Enemy): number { return e.k === 'ant' ? 4 : (ENEMIES[e.k]?.threat || 80); }
export function cards(S: SimState): string[] { return S.L.belt ? [...new Set(S.belt)] : (S.loadout || S.L.loadout || []); }
