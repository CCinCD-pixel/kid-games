/** boosters (no move cost) — spec §3.14 (core.mjs 1:1). */
import { movable, swapCells } from './moves';
import { colCells, fire, hitCell, resolve, rowCells } from './resolve';
import { settle } from './gravity';
import { endOfMove } from './rules';
import { isWon, log } from './state';
import { EMPTY, POD, isSpecial, PIECE, type Act, type BoosterUse, type GameState, type MoveResult } from './types';

export function boosterTargets(st: GameState, t: BoosterUse['t']): number[] {
  const out: number[] = [];
  for (let i = 0; i < st.N; i += 1) {
    if (!st.mask[i]) continue;
    const k = st.kind[i];
    if (t === 'drill' && k !== EMPTY && k !== POD) out.push(i);
    if (t === 'ion') out.push(i);
    if (t === 'tractor' && movable(st, i)) out.push(i);
  }
  return out;
}

export function applyBooster(st: GameState, use: BoosterUse): MoveResult {
  st.gooHit = false;
  const queue: Act[] = [], taken = new Set<number>();
  if (use.t === 'drill') {
    if (!boosterTargets(st, 'drill').includes(use.a)) return { ok: false };
    log(st, { e: 'booster', t: 'drill', a: use.a });
    log(st, { e: 'step', step: 0 });
    const idx = st.log ? st.blastSeq++ : -1;
    log(st, { e: 'blast', k: 'drill', at: use.a, cells: [use.a], idx, trig: null, carried: false, col: -1, flights: [], converts: [] });
    if (st.log) st.trig = { blast: idx };
    hitCell(st, use.a, queue);
  } else if (use.t === 'ion') {
    const r = (use.a / st.W) | 0, c = use.a % st.W;
    log(st, { e: 'booster', t: 'ion', a: use.a, dir: use.dir });
    log(st, { e: 'step', step: 0 });
    const cells = (use.dir === 'V' ? colCells(st, c) : rowCells(st, r)).filter((i) => st.mask[i]);
    const idx = st.log ? st.blastSeq++ : -1;
    log(st, { e: 'blast', k: use.dir === 'V' ? 'ionV' : 'ionH', at: use.a, cells, idx, trig: null, carried: false, col: -1, flights: [], converts: [] });
    if (st.log) st.trig = { blast: idx };
    for (const i of (use.dir === 'V' ? colCells(st, c) : rowCells(st, r))) if (st.mask[i]) hitCell(st, i, queue);
  } else if (use.t === 'tractor') {
    const { a, b } = use;
    const adj = Math.abs(a - b) === st.W || (Math.abs(a - b) === 1 && ((a / st.W) | 0) === ((b / st.W) | 0));
    if (!adj || !movable(st, a) || !movable(st, b)) return { ok: false };
    // v1.1 (D16): two specials, or two pieces of the same colour, would be a tool-wasting no-op
    if (isSpecial(st.kind[a]) && isSpecial(st.kind[b])) return { ok: false };
    if (st.kind[a] === PIECE && st.kind[b] === PIECE && st.color[a] === st.color[b]) return { ok: false };
    log(st, { e: 'booster', t: 'tractor', a, b });
    swapCells(st, a, b);
    log(st, { e: 'swap', a, b });
    const steps = resolve(st, [], [b, a]);
    endOfMove(st, true);
    return { ok: true, won: isWon(st), steps };
  } else return { ok: false };
  st.trig = null;
  while (queue.length) fire(st, queue.shift()!, queue, taken);
  log(st, { e: 'settle' });
  settle(st);
  const steps = resolve(st, [], null);
  endOfMove(st, true);
  return { ok: true, won: isWon(st), steps };
}
