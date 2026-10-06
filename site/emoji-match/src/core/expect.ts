/**
 * Lesson / intro-script expectations (spec §5.1a, V7): did a step produce what the script promises?
 * Same semantics as the prototype's tune.mjs lesson check and intros.src.mjs `expect` table. Used by
 * the validators now and by the teaching logic (lesson `expect` reached → stop the demo).
 */
import { applyBooster } from './boosters';
import { applyMove, listMoves } from './moves';
import { BOMB, CRATE, GOO, ORB, PROP, RH, RV, type BoosterUse, type GameState, type Move, type MoveResult, type StepDef } from './types';

export interface Snap { collected: number; created: number[]; fired: number; dustCleared: number; dust: number; crateHp: number; crates: number; ice: number; iced: number; goo: number; pieces: Int32Array; delivered: number; moves: number; log: number }
export function snap(st: GameState): Snap {
  let crateHp = 0, crates = 0, ice = 0, iced = 0, goo = 0, dust = 0; const pieces = new Int32Array(6);
  for (let i = 0; i < st.N; i += 1) {
    if (st.kind[i] === CRATE) { crateHp += st.hp[i]; crates += 1; }
    if (st.kind[i] === GOO) goo += 1;
    ice += st.ice[i]; if (st.ice[i] > 0) iced += 1;
    if (st.kind[i] === 1) pieces[st.color[i]] += 1;
    dust += st.dust[i];
  }
  return { collected: st.collected.reduce((a, b) => a + b, 0), created: st.stats.created.slice(), fired: st.stats.fired, dustCleared: st.dustCleared, dust, crateHp, crates, ice, iced, goo, pieces, delivered: st.delivered, moves: st.movesUsed, log: (st.log ?? []).length };
}
const K: Record<string, number> = { RH, RV, PROP, BOMB, ORB };

export function stepToOp(st: GameState, s: StepDef): { move?: Move; booster?: BoosterUse } {
  const at = (rc: [number, number]) => rc[0] * st.W + rc[1];
  if ('booster' in s) {
    const b = s.booster;
    if (b.t === 'drill') return { booster: { t: 'drill', a: at(b.a) } };
    if (b.t === 'ion') return { booster: { t: 'ion', a: at(b.a), dir: b.dir ?? 'H' } };
    return { booster: { t: 'tractor', a: at(b.a), b: at(b.b!) } };
  }
  if ('tap' in s) return { move: { t: 'tap', a: at(s.tap) } };
  return { move: { t: 'swap', a: at(s.from), b: at(s.to) } };
}

/** intro-script expectation (intros.src.mjs). `st.log` must be on. */
export function expectMet(e: string, st: GameState, res: MoveResult, a: Snap, b: Snap): boolean {
  const ev = (st.log ?? []).slice(a.log);
  const blasts = ev.filter((x) => x.e === 'blast');
  if (e === 'ok') return res.ok;
  if (e === 'refused') return res.ok === false;
  if (!res.ok) return false;
  if (e === 'match') return b.collected > a.collected;
  if (e in K) return b.created[K[e]] > a.created[K[e]];
  switch (e) {
    case 'fire': return b.fired > a.fired;
    case 'rowBlast': return blasts.some((x) => x.k === RH && x.cells.length >= st.W);
    case 'colBlast': return b.collected - a.collected >= st.H;
    case 'bigBlast': return blasts.some((x) => x.cells.length >= 9);
    case 'fly': return ev.some((x) => x.e === 'fly');
    case 'fly3': return ev.filter((x) => x.e === 'fly').length >= 3;
    case 'colorClear': return blasts.some((x) => x.k === ORB) && [...b.pieces].some((n, c) => a.pieces[c] >= 2 && n === 0);
    case 'combo': return ev.some((x) => x.e === 'combo');
    case 'dust': return b.dustCleared > a.dustCleared;
    case 'dustClean': return b.dust === 0;
    case 'crate': return b.crates < a.crates;
    case 'crateHit': return b.crateHp < a.crateHp && b.crates === a.crates;
    case 'ice': return b.ice < a.ice;
    case 'iceFree': return b.iced < a.iced;
    case 'pod': return b.delivered > a.delivered;
    case 'gooSpread': return b.goo > a.goo;
    case 'noMove': return b.moves === a.moves;
    default: return false;
  }
}

export function runStep(st: GameState, s: StepDef): { res: MoveResult; a: Snap; b: Snap } {
  const a = snap(st);
  const op = stepToOp(st, s);
  const res = op.booster ? applyBooster(st, op.booster) : applyMove(st, op.move!);
  return { res, a, b: snap(st) };
}

/** level lesson (tune.mjs): legal on the fixed start board and produces `expect` */
export function lessonMet(expect: string, st: GameState, mv: Move): { ok: boolean; made: string[] } {
  const created = st.stats.created.slice();
  const legal = listMoves(st).some((m) => m.t === mv.t && (mv.t === 'tap' ? m.a === mv.a : m.t === 'swap' && ((m.a === mv.a && m.b === mv.b) || (m.a === mv.b && m.b === mv.a))));
  const fired0 = st.stats.fired;
  const res = applyMove(st, mv);
  const names: Record<number, string> = { [RH]: 'RH', [RV]: 'RV', [PROP]: 'PROP', [BOMB]: 'BOMB', [ORB]: 'ORB' };
  const made = [RH, RV, PROP, BOMB, ORB].filter((k) => st.stats.created[k] > created[k]).map((k) => names[k]);
  let ok = res.ok && legal;
  if (['RH', 'RV', 'PROP', 'BOMB', 'ORB'].includes(expect)) ok = ok && made.includes(expect);
  if (expect === 'combo' || expect === 'fire') ok = ok && st.stats.fired > fired0;
  return { ok, made };
}
