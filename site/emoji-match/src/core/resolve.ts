/** hits, blasts, propeller targeting and the cascade loop (core.mjs 1:1). */
import { settle } from './gravity';
import { findGroups } from './match';
import { dropUid, takeSpecial } from './moves';
import { rngBelow } from './rng';
import { log, remaining } from './state';
import { BOMB, CRATE, EMPTY, GOO, ORB, PIECE, POD, PROP, RH, RV, isSpecial, type Act, type GameState, type Group } from './types';

// floor hit: dust under a cell loses one layer
export function hitFloor(st: GameState, i: number): void {
  if (st.dust[i] > 0) { st.dust[i] -= 1; st.dustCleared += 1; st.energy += 1; log(st, { e: 'dust', i, left: st.dust[i] }); }
}
// a hit from a match or a blast. Top layer absorbs it.
export function hitCell(st: GameState, i: number, queue: Act[]): void {
  if (!st.mask[i]) return;
  const k = st.kind[i];
  if (k === CRATE) {
    st.hp[i] -= 1; st.energy += 1;
    if (st.hp[i] === 0) { st.kind[i] = EMPTY; st.crates += 1; }
    log(st, { e: 'crate', i, left: st.hp[i] });
    return;
  }
  if (k === GOO) { st.kind[i] = EMPTY; st.hp[i] = 0; st.gooCleared += 1; st.gooHit = true; st.energy += 1; log(st, { e: 'goo', i }); return; }
  if (k === PIECE) {
    if (st.ice[i] > 0) { st.ice[i] -= 1; st.energy += 1; if (st.ice[i] === 0) st.iceFreed += 1; log(st, { e: 'ice', i, left: st.ice[i] }); return; }
    st.collected[st.color[i]] += 1; st.energy += 1;
    log(st, { e: 'clear', i, col: st.color[i], uid: st.uid ? st.uid[i] : 0 });
    dropUid(st, i);
    st.kind[i] = EMPTY; st.color[i] = -1;
    hitFloor(st, i);
    return;
  }
  if (isSpecial(k)) {
    const act = takeSpecial(st, i);
    if (st.log) act.trig = st.trig;
    queue.push(act); log(st, { e: 'chain', i, k });
    return;
  }
  hitFloor(st, i); // POD or EMPTY
}
function sideHit(st: GameState, i: number): void {
  const k = st.kind[i];
  if (k === CRATE) { st.hp[i] -= 1; st.energy += 1; if (st.hp[i] === 0) { st.kind[i] = EMPTY; st.crates += 1; } log(st, { e: 'crate', i, left: st.hp[i], side: true }); }
  else if (k === GOO) { st.kind[i] = EMPTY; st.hp[i] = 0; st.gooCleared += 1; st.gooHit = true; st.energy += 1; log(st, { e: 'goo', i, side: true }); }
}

export function mostCommonColor(st: GameState): number {
  const cnt = new Int32Array(6);
  for (let i = 0; i < st.N; i += 1) if (st.kind[i] === PIECE && st.ice[i] === 0) cnt[st.color[i]] += 1;
  let best = -1, bc = 0;
  for (const col of st.L.colors) if (cnt[col] > bc) { bc = cnt[col]; best = col; }
  return best;
}
export function rowCells(st: GameState, r: number): number[] { const out: number[] = []; for (let c = 0; c < st.W; c += 1) out.push(r * st.W + c); return out; }
export function colCells(st: GameState, c: number): number[] { const out: number[] = []; for (let r = 0; r < st.H; r += 1) out.push(r * st.W + c); return out; }
export function areaCells(st: GameState, at: number, rad: number, cheb: boolean): number[] {
  const r0 = (at / st.W) | 0, c0 = at % st.W, out: number[] = [];
  for (let r = r0 - rad; r <= r0 + rad; r += 1) for (let c = c0 - rad; c <= c0 + rad; c += 1) {
    if (r < 0 || r >= st.H || c < 0 || c >= st.W) continue;
    if (!cheb && Math.abs(r - r0) + Math.abs(c - c0) > rad) continue;
    out.push(r * st.W + c);
  }
  return out;
}
export function crossCells(st: GameState, at: number): number[] { return areaCells(st, at, 1, false); }

// propeller target: first objective (level order) that still has candidates; rng among them.
// `exclude` = the firing propeller's own blast cross (v1.1, B0).
export function propTarget(st: GameState, taken: Set<number>, exclude: Set<number> | null = null): number {
  const cand: number[] = [];
  const ok = (i: number) => st.mask[i] && !taken.has(i) && !(exclude && exclude.has(i));
  for (const o of st.L.objectives) {
    if (remaining(st, o) === 0) continue;
    cand.length = 0;
    for (let i = 0; i < st.N; i += 1) {
      if (!ok(i)) continue;
      const k = st.kind[i];
      if (o.t === 'crate' && k === CRATE) cand.push(i);
      else if (o.t === 'ice' && k === PIECE && st.ice[i] > 0) cand.push(i);
      else if (o.t === 'goo' && k === GOO) cand.push(i);
      else if (o.t === 'dust' && st.dust[i] > 0 && (k === PIECE && st.ice[i] === 0)) cand.push(i);
      else if (o.t === 'collect' && k === PIECE && st.ice[i] === 0 && st.color[i] === o.c) cand.push(i);
      else if (o.t === 'pod' && k === POD) { const j = i + st.W; if (j < st.N && st.mask[j] && st.kind[j] === PIECE && st.ice[j] === 0 && !taken.has(j) && !(exclude && exclude.has(j))) cand.push(j); }
    }
    if (cand.length) return cand[rngBelow(st.rProp, cand.length)];
  }
  cand.length = 0;
  for (let i = 0; i < st.N; i += 1) if (ok(i) && st.kind[i] === PIECE) cand.push(i);
  return cand.length ? cand[rngBelow(st.rProp, cand.length)] : -1;
}

export function fire(st: GameState, act: Act, queue: Act[], taken: Set<number>): void {
  const hits: number[] = [];
  const idx = st.log ? st.blastSeq++ : -1;
  const flights: { to: number; carry?: number }[] = [];
  const converts: { i: number; k: number }[] = [];
  const add = (cells: number[]) => { for (const i of cells) if (st.mask[i]) hits.push(i); };
  const r = (act.at / st.W) | 0, c = act.at % st.W;
  let orbCol = -1;
  switch (act.k) {
    case RH: add(rowCells(st, r)); break;
    case RV: add(colCells(st, c)); break;
    case BOMB: add(areaCells(st, act.at, 2, false)); break;
    case PROP: {
      const cross = crossCells(st, act.at);
      add(cross);
      const t = propTarget(st, taken, new Set(cross)); if (t >= 0) { taken.add(t); hits.push(t); log(st, { e: 'fly', from: act.at, to: t }); flights.push({ to: t }); }
      break;
    }
    case ORB: {
      const col = act.col ?? mostCommonColor(st);
      orbCol = col;
      if (col >= 0) for (let i = 0; i < st.N; i += 1) if (st.kind[i] === PIECE && st.color[i] === col) hits.push(i);
      break;
    }
    case 'RR': add(rowCells(st, r)); add(colCells(st, c).filter((i) => i !== act.at)); break;
    case 'RB': for (let d = -1; d <= 1; d += 1) { if (r + d >= 0 && r + d < st.H) add(rowCells(st, r + d)); }
      for (let d = -1; d <= 1; d += 1) { if (c + d >= 0 && c + d < st.W) add(colCells(st, c + d).filter((i) => { const rr = (i / st.W) | 0; return rr < r - 1 || rr > r + 1; })); }
      break;
    case 'BB': add(areaCells(st, act.at, 3, true)); break;
    case 'PP': {
      const cross = crossCells(st, act.at);
      add(cross);
      const ex = new Set(cross);
      for (let n = 0; n < 3; n += 1) { const t = propTarget(st, taken, ex); if (t >= 0) { taken.add(t); hits.push(t); log(st, { e: 'fly', from: act.at, to: t }); flights.push({ to: t }); } }
      break;
    }
    case 'P+': {
      const cross = crossCells(st, act.at);
      add(cross);
      const t = propTarget(st, taken, new Set(cross));
      if (t >= 0) {
        taken.add(t); log(st, { e: 'fly', from: act.at, to: t, carry: act.carry }); flights.push({ to: t, carry: act.carry });
        const carried: Act = { k: act.carry!, at: t, col: null, carried: true };
        if (st.log) carried.trig = { flight: idx };
        queue.push(carried);
      }
      break;
    }
    case 'OO': for (let i = 0; i < st.N; i += 1) if (st.mask[i]) hits.push(i); break;
    case 'OR': case 'OB': case 'OP': {
      const col = mostCommonColor(st);
      orbCol = col;
      if (col < 0) break;
      let n = 0;
      for (let i = 0; i < st.N; i += 1) {
        if (st.kind[i] !== PIECE || st.color[i] !== col) continue;
        if (st.ice[i] > 0) { hits.push(i); continue; }
        const k = act.k === 'OR' ? (n % 2 === 0 ? RH : RV) : act.k === 'OB' ? BOMB : PROP;
        n += 1;
        st.collected[col] += 1; st.energy += 1;
        const u = dropUid(st, i);
        st.kind[i] = EMPTY; st.color[i] = -1; hitFloor(st, i);
        st.stats.fired += 1; st.energy += 3;
        log(st, { e: 'convert', i, k, uid: u, col });
        converts.push({ i, k });
        const q: Act = { k, at: i, col: null };
        if (st.log) q.trig = { blast: idx };
        queue.push(q);
      }
      break;
    }
    default: throw new Error(`bad act ${act.k}`);
  }
  log(st, { e: 'blast', k: act.k, at: act.at, cells: hits.slice(), idx, trig: act.trig ?? null, carried: !!act.carried, col: orbCol, flights, converts });
  // carried rocket/bomb fires where the propeller landed: its own cell is the landing cell
  const prevTrig = st.trig;
  if (st.log) st.trig = { blast: idx };
  for (const i of hits) hitCell(st, i, queue);
  st.trig = prevTrig;
}

// ---------------------------------------------------------------- resolution (cascade loop)
export function resolve(st: GameState, acts: Act[], pref: number[] | null): number {
  let step = 0;
  const side = new Uint8Array(st.N);
  for (;;) {
    const groups = findGroups(st);
    const queue = step === 0 ? acts.slice() : [];
    if (!groups.length && !queue.length) break;
    log(st, { e: 'step', step });
    if (groups.length) st.stats.cascades += step > 0 ? 1 : 0;
    side.fill(0);
    const creations: { cell: number; type: number; g: number }[] = [];
    groups.forEach((g: Group, gi: number) => {
      if (g.type) {
        let cell = -1;
        if (pref && step === 0) for (const p of pref) if (g.cells.includes(p) && st.ice[p] === 0) { cell = p; break; }
        if (cell < 0) cell = creationCell(st, g);
        if (cell >= 0) creations.push({ cell, type: g.type, g: gi });
      }
      log(st, { e: 'match', step, color: g.color, cells: g.cells, type: g.type, g: gi });
    });
    const inGroup = new Uint8Array(st.N);
    for (const g of groups) for (const i of g.cells) inGroup[i] = 1;
    groups.forEach((g: Group, gi: number) => {
      if (st.log) st.trig = { match: gi };
      for (const i of g.cells) hitCell(st, i, queue);
      for (const i of g.cells) {
        const r = (i / st.W) | 0, c = i % st.W;
        const nb: number[] = [];
        if (r > 0) nb.push(i - st.W); if (r < st.H - 1) nb.push(i + st.W); if (c > 0) nb.push(i - 1); if (c < st.W - 1) nb.push(i + 1);
        for (const j of nb) if (!inGroup[j] && !side[j] && (st.kind[j] === CRATE || st.kind[j] === GOO)) { side[j] = 1; sideHit(st, j); }
      }
    });
    st.trig = null;
    const taken = new Set<number>();
    while (queue.length) fire(st, queue.shift()!, queue, taken);
    for (const cr of creations) {
      if (st.kind[cr.cell] === EMPTY) {
        st.kind[cr.cell] = cr.type; st.color[cr.cell] = -1; st.stats.created[cr.type] += 1;
        let u = 0; if (st.uid) { u = st.nextUid++; st.uid[cr.cell] = u; }
        log(st, { e: 'create', i: cr.cell, k: cr.type, g: cr.g, uid: u });
      }
    }
    log(st, { e: 'settle' });
    settle(st);
    step += 1;
    if (step > 60) break;
  }
  st.stats.maxStep = Math.max(st.stats.maxStep, step);
  return step;
}

function creationCell(st: GameState, g: Group): number {
  const ok = (i: number) => st.ice[i] === 0;
  const lowest = (cells: number[]) => { let best = -1; for (const i of cells) if (ok(i) && (best < 0 || ((i / st.W) | 0) > ((best / st.W) | 0) || (((i / st.W) | 0) === ((best / st.W) | 0) && i % st.W < best % st.W))) best = i; return best; };
  if (g.type === BOMB) { for (const i of g.inter) if (ok(i)) return i; return lowest(g.cells); }
  if (g.type === PROP) return lowest(g.squares[0]) >= 0 ? lowest(g.squares[0]) : lowest(g.cells);
  if (g.longest) { const x = lowest(g.longest.cells); if (x >= 0) return x; }
  return lowest(g.cells);
}
