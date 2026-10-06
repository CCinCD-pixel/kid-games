/** newGame / cloneState / initialFill / objectives / helpers (core.mjs 1:1). */
import { findGroups, colorConflict } from './match';
import { countMoves } from './moves';
import { rngBelow, rngClone, rngFork, rngNew } from './rng';
import { CRATE, GOO, PIECE, POD, isSpecial, type Ev, type GameState, type Level, type Objective } from './types';

export function newGame(L: Level, seed: number | string, opts: { log?: boolean; record?: boolean } = {}): GameState {
  const base = rngNew(`em:${L.id}:${L.refill ? seed : 0}`); // puzzles (no refill) are fully deterministic
  // tutorial / puzzle levels: the START board is the same on every attempt; refills still vary
  const initSeed = L.def.fixedBoard ? rngNew(`em:${L.id}:board`) : null;
  const st: GameState = {
    L, W: L.W, H: L.H, N: L.N,
    mask: L.mask, spawner: L.spawner, exit: L.exit,
    kind: L.kind.slice(), color: L.color.slice(), hp: L.hp.slice(), ice: L.ice.slice(), dust: L.dust.slice(),
    refill: L.refill,
    rFill: rngFork(base, 'refill'), rInit: initSeed ? rngFork(initSeed, 'init') : rngFork(base, 'init'), rProp: rngFork(base, 'prop'),
    rGoo: rngFork(base, 'goo'), rShuf: rngFork(base, 'shuffle'),
    movesUsed: 0,
    collected: new Int32Array(6), crates: 0, iceFreed: 0, dustCleared: 0, gooCleared: 0, delivered: 0, energy: 0,
    podsReleased: 0, lastPodMove: -99,
    gooHit: false, evalMode: false, log: opts.log || opts.record ? [] : null,
    stats: { created: [0, 0, 0, 0, 0, 0, 0], fired: 0, cascades: 0, maxStep: 0, shuffles: 0, gifts: 0, slides: 0 },
    uid: null, nextUid: 1, trig: null, blastSeq: 0,
  };
  for (let i = 0; i < st.N; i += 1) if (st.kind[i] === POD) st.podsReleased += 1;
  initialFill(st);
  if (opts.record) assignUids(st);
  if (st.log) st.log.length = 0;
  return st;
}

/** recorder: give every piece/special/pod on the board a fresh uid (after newGame, a resume replay …) */
export function assignUids(st: GameState): void {
  st.uid = new Int32Array(st.N);
  for (let i = 0; i < st.N; i += 1) {
    const k = st.kind[i];
    if (k === PIECE || k === POD || isSpecial(k)) st.uid[i] = st.nextUid++;
  }
}

export function cloneState(st: GameState, noRefill = false): GameState {
  return {
    ...st,
    kind: st.kind.slice(), color: st.color.slice(), hp: st.hp.slice(), ice: st.ice.slice(), dust: st.dust.slice(),
    rFill: rngClone(st.rFill), rInit: rngClone(st.rInit), rProp: rngClone(st.rProp), rGoo: rngClone(st.rGoo), rShuf: rngClone(st.rShuf),
    collected: st.collected.slice(), refill: noRefill ? false : st.refill, evalMode: noRefill ? true : st.evalMode, log: null,
    stats: { ...st.stats, created: st.stats.created.slice() },
    uid: null, trig: null,
  };
}

function initialFill(st: GameState): void {
  const L = st.L;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    for (let i = 0; i < st.N; i += 1) if (L.randomCell[i]) { st.color[i] = -1; }
    for (let i = 0; i < st.N; i += 1) {
      if (!L.randomCell[i]) continue;
      const opts = L.colors.filter((col) => !colorConflict(st, i, col));
      const pool = opts.length ? opts : L.colors;
      st.color[i] = pool[rngBelow(st.rInit, pool.length)];
    }
    if (findGroups(st).length === 0 && countMoves(st) > 0) { st.initAttempts = attempt + 1; return; }
  }
  throw new Error(`${L.id}: could not build a stable start board with a move`);
}

export function remaining(st: GameState, o: Objective): number {
  switch (o.t) {
    case 'collect': return Math.max(0, o.n - st.collected[o.c]);
    case 'crate': { let n = 0; for (let i = 0; i < st.N; i += 1) if (st.kind[i] === CRATE) n += 1; return n; }
    case 'dust': { let n = 0; for (let i = 0; i < st.N; i += 1) n += st.dust[i]; return n; }
    case 'ice': { let n = 0; for (let i = 0; i < st.N; i += 1) if (st.kind[i] === PIECE && st.ice[i] > 0) n += 1; return n; }
    case 'goo': { let n = 0; for (let i = 0; i < st.N; i += 1) if (st.kind[i] === GOO) n += 1; return n; }
    case 'pod': return Math.max(0, o.n - st.delivered);
    case 'energy': return Math.max(0, o.n - st.energy);
    default: throw new Error((o as { t: string }).t);
  }
}
export const isWon = (st: GameState): boolean => st.L.objectives.every((o) => remaining(st, o) === 0);

export function log(st: GameState, ev: Ev): void { if (st.log) st.log.push(ev); }

export function boardString(st: GameState): string {
  const ch = (i: number) => {
    if (!st.mask[i]) return '-';
    const k = st.kind[i];
    if (k === PIECE) return st.ice[i] ? 'roygbp'[st.color[i]].toUpperCase() : 'roygbp'[st.color[i]];
    return ['_', '?', '>', '^', '*', '+', '&', String(st.hp[i]), '@', 'x'][k];
  };
  const rows: string[] = [];
  for (let r = 0; r < st.H; r += 1) { let s = ''; for (let c = 0; c < st.W; c += 1) s += ch(r * st.W + c); rows.push(s); }
  return rows.join('\n');
}
export function snapshot(st: GameState): number[] { return st.L.objectives.map((o) => remaining(st, o)); }

/** spec §3.12: 1★ = won; 2★ = movesLeft ≥ stars[0]; 3★ = movesLeft ≥ stars[1] */
export function starsFor(def: { stars?: [number, number] }, movesLeft: number): 1 | 2 | 3 {
  const [s2, s3] = def.stars ?? [0, 0];
  return movesLeft >= s3 ? 3 : movesLeft >= s2 ? 2 : 1;
}
