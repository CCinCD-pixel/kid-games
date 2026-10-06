/** legal moves and applyMove (core.mjs 1:1). Recorder hooks only touch st.uid / st.log. */
import { matchAt } from './match';
import { resolve, hitFloor } from './resolve';
import { endOfMove } from './rules';
import { isWon, log } from './state';
import { BOMB, EMPTY, ORB, PIECE, POD, PROP, RH, RV, isSpecial, type Act, type GameState, type Move, type MoveResult } from './types';

// swappable: free pieces and specials. Pods are NOT swappable and never slide diagonally.
export const movable = (st: GameState, i: number): boolean => { const k = st.kind[i]; return (k === PIECE && st.ice[i] === 0) || isSpecial(k); };
export const falls = (st: GameState, i: number): boolean => movable(st, i) || st.kind[i] === POD;
export const solid = (st: GameState, i: number): boolean => { const k = st.kind[i]; return k === 7 /* CRATE */ || k === 9 /* GOO */ || (k === PIECE && st.ice[i] > 0); };

export function swapCells(st: GameState, a: number, b: number): void {
  const t1 = st.kind[a]; st.kind[a] = st.kind[b]; st.kind[b] = t1;
  const t2 = st.color[a]; st.color[a] = st.color[b]; st.color[b] = t2;
  if (st.uid) { const u = st.uid[a]; st.uid[a] = st.uid[b]; st.uid[b] = u; }
  // ice/dust/hp stay with the cell; only movable things (ice == 0, hp == 0) are ever swapped
}

/** recorder: take the uid off a cell (0 when not recording) */
export function dropUid(st: GameState, i: number): number {
  if (!st.uid) return 0;
  const u = st.uid[i]; st.uid[i] = 0; return u;
}

// move = { t: 'swap', a, b } (a = cell the finger started on, b = neighbour it moved to) | { t: 'tap', a }
export function listMoves(st: GameState, withTaps = true): Move[] {
  const out: Move[] = [];
  const { W, H } = st;
  for (let i = 0; i < st.N; i += 1) {
    if (!st.mask[i] || !movable(st, i)) continue;
    const r = (i / W) | 0, c = i % W;
    // special+special: the combo fires at b, so both directions are distinct moves (v1.1, B13).
    if (c + 1 < W) { const j = i + 1; if (st.mask[j] && movable(st, j) && swapValid(st, i, j)) { out.push({ t: 'swap', a: i, b: j }); if (isSpecial(st.kind[i]) && isSpecial(st.kind[j])) out.push({ t: 'swap', a: j, b: i }); } }
    if (r + 1 < H) { const j = i + W; if (st.mask[j] && movable(st, j) && swapValid(st, i, j)) { out.push({ t: 'swap', a: i, b: j }); if (isSpecial(st.kind[i]) && isSpecial(st.kind[j])) out.push({ t: 'swap', a: j, b: i }); } }
    if (withTaps && isSpecial(st.kind[i])) out.push({ t: 'tap', a: i });
  }
  return out;
}
export function countMoves(st: GameState): number {
  const { W, H } = st; let n = 0;
  for (let i = 0; i < st.N; i += 1) {
    if (!st.mask[i] || !movable(st, i)) continue;
    if (isSpecial(st.kind[i])) return 1;
    const r = (i / W) | 0, c = i % W;
    if (c + 1 < W && st.mask[i + 1] && movable(st, i + 1) && swapValid(st, i, i + 1)) n += 1;
    if (r + 1 < H && st.mask[i + W] && movable(st, i + W) && swapValid(st, i, i + W)) n += 1;
    if (n) return n;
  }
  return n;
}
export function swapValid(st: GameState, a: number, b: number): boolean {
  const ka = st.kind[a], kb = st.kind[b];
  if (isSpecial(ka) || isSpecial(kb)) return true;
  if (ka === POD && kb === POD) return false;
  if (ka === PIECE && kb === PIECE && st.color[a] === st.color[b]) return false;
  // pure probe: swap kind/colour only (never the uids)
  let t1 = st.kind[a]; st.kind[a] = st.kind[b]; st.kind[b] = t1;
  let t2 = st.color[a]; st.color[a] = st.color[b]; st.color[b] = t2;
  const ok = matchAt(st, a) || matchAt(st, b);
  t1 = st.kind[a]; st.kind[a] = st.kind[b]; st.kind[b] = t1;
  t2 = st.color[a]; st.color[a] = st.color[b]; st.color[b] = t2;
  return ok;
}

/** apply a player move; returns { ok, won, steps } */
export function applyMove(st: GameState, mv: Move): MoveResult {
  st.gooHit = false;
  const acts: Act[] = [];
  let pref: number[] | null = null;
  if (mv.t === 'tap') {
    const k = st.kind[mv.a];
    if (!isSpecial(k)) return { ok: false };
    log(st, { e: 'tap', a: mv.a });
    acts.push(takeSpecial(st, mv.a));
  } else {
    const { a, b } = mv;
    if (!st.mask[a] || !st.mask[b] || !movable(st, a) || !movable(st, b)) return { ok: false };
    const ka = st.kind[a], kb = st.kind[b];
    if (isSpecial(ka) && isSpecial(kb)) {
      const ua = dropUid(st, a), ub = dropUid(st, b);
      st.kind[a] = EMPTY; hitFloor(st, a);
      st.kind[b] = EMPTY; hitFloor(st, b);
      st.stats.fired += 2;
      const act = combo(ka, kb, b);
      if (st.log) act.trig = null;
      acts.push(act);
      log(st, { e: 'combo', a, b, ka, kb, k: act.k, ua, ub });
    } else if (isSpecial(ka) || isSpecial(kb)) {
      swapCells(st, a, b);
      const p = isSpecial(ka) ? b : a; // where the special now sits
      const other = p === a ? b : a;
      log(st, { e: 'swap', a, b });
      const act = takeSpecial(st, p);
      if (act.k === ORB && st.kind[other] === PIECE) act.col = st.color[other];
      acts.push(act);
      pref = [other];
    } else {
      if (!swapValid(st, a, b)) { log(st, { e: 'swapBack', a, b }); return { ok: false }; }
      swapCells(st, a, b);
      log(st, { e: 'swap', a, b });
      pref = [b, a];
    }
  }
  st.movesUsed += 1;
  const steps = resolve(st, acts, pref);
  // evalMode (bot look-ahead clones): no goo spread, no shuffle. Puzzles (refill:false): goo
  // spreads, but no shuffle — a puzzle with no move left is simply over.
  endOfMove(st);
  return { ok: true, won: isWon(st), steps };
}

export function takeSpecial(st: GameState, i: number): Act {
  const k = st.kind[i];
  const u = dropUid(st, i);
  st.kind[i] = EMPTY; st.color[i] = -1; hitFloor(st, i);
  st.stats.fired += 1; st.energy += 3;
  if (st.log) log(st, { e: 'fire', i, k, uid: u });
  return { k, at: i, col: null };
}
function combo(ka: number, kb: number, at: number): Act {
  const set = new Set([ka, kb]);
  const has = (k: number) => set.has(k);
  const rocket = (k: number) => k === RH || k === RV;
  if (has(ORB)) {
    const other = ka === ORB ? kb : ka;
    if (other === ORB) return { k: 'OO', at, col: null };
    if (rocket(other)) return { k: 'OR', at, col: null };
    if (other === BOMB) return { k: 'OB', at, col: null };
    return { k: 'OP', at, col: null };
  }
  if (rocket(ka) && rocket(kb)) return { k: 'RR', at, col: null };
  if ((rocket(ka) && kb === BOMB) || (rocket(kb) && ka === BOMB)) return { k: 'RB', at, col: null };
  if (ka === BOMB && kb === BOMB) return { k: 'BB', at, col: null };
  if (ka === PROP && kb === PROP) return { k: 'PP', at, col: null };
  const other = ka === PROP ? kb : ka;
  return { k: 'P+', at, col: null, carry: other };
}
