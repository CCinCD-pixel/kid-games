/** end-of-move rules: goo spread, dead-board shuffle, assists (core.mjs 1:1). */
import { colorConflict, findGroups } from './match';
import { countMoves } from './moves';
import { resolve } from './resolve';
import { rngBelow, rngNew } from './rng';
import { isWon, log } from './state';
import { BOMB, GOO, ORB, PIECE, RH, RV, type GameState } from './types';

function spreadGoo(st: GameState): void {
  const cand: number[] = [];
  for (let i = 0; i < st.N; i += 1) {
    if (st.kind[i] !== GOO) continue;
    const r = (i / st.W) | 0, c = i % st.W;
    const nb: number[] = [];
    if (r > 0) nb.push(i - st.W); if (r < st.H - 1) nb.push(i + st.W); if (c > 0) nb.push(i - 1); if (c < st.W - 1) nb.push(i + 1);
    for (const j of nb) if (st.mask[j] && st.kind[j] === PIECE && st.ice[j] === 0 && !cand.includes(j)) cand.push(j);
  }
  if (!cand.length) return;
  cand.sort((a, b) => a - b);
  const j = cand[rngBelow(st.rGoo, cand.length)];
  let u = 0; if (st.uid) { u = st.uid[j]; st.uid[j] = 0; }
  st.kind[j] = GOO; st.hp[j] = 1; st.color[j] = -1;
  log(st, { e: 'gooSpread', i: j, uid: u });
}

export function shuffle(st: GameState): void {
  st.stats.shuffles += 1;
  const cells: number[] = [];
  for (let i = 0; i < st.N; i += 1) if (st.kind[i] === PIECE && st.ice[i] === 0) cells.push(i);
  const cols = cells.map((i) => st.color[i]);
  const recolors = () => (st.log ? cells.map((i) => ({ i, uid: st.uid ? st.uid[i] : 0, col: st.color[i] })) : []);
  for (let t = 0; t < 60; t += 1) {
    const perm = cols.slice();
    for (let k = perm.length - 1; k > 0; k -= 1) { const j = rngBelow(st.rShuf, k + 1); const x = perm[k]; perm[k] = perm[j]; perm[j] = x; }
    cells.forEach((i, k) => { st.color[i] = perm[k]; });
    if (findGroups(st).length === 0 && countMoves(st) > 0) { log(st, { e: 'shuffle', cells: recolors() }); return; }
  }
  for (let t = 0; t < 60; t += 1) {
    for (const i of cells) st.color[i] = -1;
    for (const i of cells) { const o = st.L.colors.filter((col) => !colorConflict(st, i, col)); const p = o.length ? o : st.L.colors; st.color[i] = p[rngBelow(st.rShuf, p.length)]; }
    if (findGroups(st).length === 0 && countMoves(st) > 0) { log(st, { e: 'shuffle', recolor: true, cells: recolors() }); return; }
  }
  // last resort: gift a rocket (always a legal tap); resolve any standing match (v1.1, B22).
  if (cells.length) {
    log(st, { e: 'shuffle', recolor: true, cells: recolors() });
    const i = cells[rngBelow(st.rShuf, cells.length)]; st.kind[i] = RH; st.color[i] = -1; st.stats.gifts += 1; log(st, { e: 'gift', i, uid: st.uid ? st.uid[i] : 0 });
    if (findGroups(st).length) resolve(st, [], null);
  }
}

// byBooster (v1.1, D16): a free tool never makes goo grow — help must not punish. Shuffle still runs.
export function endOfMove(st: GameState, byBooster = false): void {
  if (!st.evalMode && !st.gooHit && !byBooster) spreadGoo(st);
  if (!st.evalMode && st.refill && !isWon(st) && countMoves(st) === 0) shuffle(st);
}

/**
 * assists ("起飞加成", spec §3.15). tier 1: rocket; 2: + bomb; 3: + orb. Call right after newGame.
 * opts.avoid: cells never replaced (lesson cells). opts.allow: which of BOMB / ORB were introduced.
 */
export function placeAssist(st: GameState, tier: number, seedStr: string, opts: { avoid?: number[]; allow?: Set<number> } = {}): number[] {
  const r = rngNew(seedStr);
  const ban = new Set(opts.avoid ?? []);
  for (let i = 0; i < st.N; i += 1) if (st.exit[i]) { ban.add(i); if (i - st.W >= 0) ban.add(i - st.W); }
  const cand: number[] = [];
  for (let i = 0; i < st.N; i += 1) if (st.kind[i] === PIECE && st.ice[i] === 0 && !ban.has(i)) cand.push(i);
  const allow = opts.allow ?? new Set([BOMB, ORB]);
  const rocket = rngBelow(r, 2) ? RV : RH, other = rocket === RH ? RV : RH;
  const kinds = [rocket, allow.has(BOMB) ? BOMB : other, allow.has(ORB) ? ORB : allow.has(BOMB) ? BOMB : rocket].slice(0, tier);
  const placed: number[] = [];
  for (const k of kinds) {
    if (!cand.length) break;
    const j = rngBelow(r, cand.length);
    const i = cand.splice(j, 1)[0];
    st.kind[i] = k; st.color[i] = -1; placed.push(i);
  }
  return placed;
}
