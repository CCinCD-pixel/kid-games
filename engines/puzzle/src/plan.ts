/**
 * Plan probes shared by the validators and the random-warehouse generator (they run in the Worker
 * too, so they live outside analyze.ts): the sequential (no-parking) solver, the greedy bot and the
 * crate-switch / turn counts of a solution line. Ports of the prototype sokoban.mjs sequential() /
 * greedy() and analyze.mjs switchesOf() — identical results (levels.test.ts checks every level).
 */
import { nb } from './level';
import { applyPush, boxMap, canon, isSolved, legalPushes, minReach, walkDist } from './rules';
import type { StateGraph } from './stategraph';
import { DIR_CH, type Level, type Push } from './types';

// ---------------------------------------------------------------- sequential (no parking)

export function sequential(l: Level, o: { maxStates?: number } = {}): { truncated: boolean; firsts: number[] } {
  const maxStates = o.maxStates ?? 300000;
  interface SeqState { player: number; boxes: Uint16Array; frozen: Set<number>; active: number; first: number }
  const seen = new Set<string>();
  const q: (SeqState | null)[] = [{ player: l.start.player, boxes: canon(l, l.start.boxes), frozen: new Set(), active: -1, first: -1 }];
  const firsts = new Set<number>();
  let n = 0;
  for (let qh = 0; qh < q.length; qh += 1) {
    const st = q[qh]!;
    q[qh] = null;
    n += 1;
    if (n > maxStates) return { truncated: true, firsts: [...firsts] };
    if (isSolved(l, st.boxes) && st.active < 0) {
      firsts.add(st.first);
      continue;
    }
    const bmap = boxMap(l, st.boxes);
    const dist = walkDist(l, bmap, st.player);
    const np = st.active >= 0 ? st.player : minReach(dist);
    const key = `${np}|${Array.from(st.boxes).join(',')}|${[...st.frozen].sort().join(',')}|${st.active}|${st.first}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (st.active >= 0) {
      const s = bmap[st.active];
      if (l.goal[st.active] === l.colorOf[s]) {
        const fz = new Set(st.frozen);
        fz.add(st.active);
        q.push({ ...st, frozen: fz, active: -1 });
      }
    }
    const { pushes } = legalPushes(l, { player: st.player, boxes: st.boxes }, true);
    for (const pu of pushes) {
      if (st.frozen.has(pu.from)) continue;
      if (st.active >= 0 && pu.from !== st.active) continue;
      q.push({ player: pu.from, boxes: applyPush(l, st.boxes, pu), frozen: st.frozen, active: pu.to, first: st.first < 0 ? pu.from : st.first });
    }
  }
  return { truncated: false, firsts: [...firsts].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------- greedy bot

function singleCrate(l: Level, player: number, boxes: Uint16Array, s: number): { pushes: Push[] } | null {
  const color = l.colorOf[s];
  const seen = new Set<string>();
  const q: ({ player: number; boxes: Uint16Array; path: Push[] } | null)[] = [{ player, boxes, path: [] }];
  for (let qh = 0; qh < q.length; qh += 1) {
    const st = q[qh]!;
    q[qh] = null;
    const bmap = boxMap(l, st.boxes);
    const dist = walkDist(l, bmap, st.player);
    const key = `${minReach(dist)}|${Array.from(st.boxes).join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (st.path.length) {
      const moved = st.path[st.path.length - 1].to;
      if (l.goal[moved] === color && !boxes.includes(moved)) return { pushes: st.path };
    }
    if (st.path.length > 30) continue;
    const { pushes } = legalPushes(l, { player: st.player, boxes: st.boxes }, true);
    const target = st.path.length ? st.path[st.path.length - 1].to : boxes[s];
    for (const pu of pushes) {
      if (pu.from !== target) continue;
      q.push({ player: pu.from, boxes: applyPush(l, st.boxes, pu), path: [...st.path, pu] });
    }
  }
  return null;
}

/** The tempting naive plan: push the crate with the shortest single-crate route home, repeat. */
export function greedy(l: Level, graph: StateGraph | null): 'solved' | 'stuck' | 'dead' | 'loop' {
  let player = l.start.player;
  let boxes = canon(l, l.start.boxes);
  for (let iter = 0; iter < 40; iter += 1) {
    if (isSolved(l, boxes)) return 'solved';
    let best: { pushes: Push[] } | null = null;
    for (let s = 0; s < boxes.length; s += 1) {
      if (l.goal[boxes[s]] === l.colorOf[s]) continue;
      const r = singleCrate(l, player, boxes, s);
      if (r && (!best || r.pushes.length < best.pushes.length)) best = r;
    }
    if (!best) return 'stuck';
    for (const pu of best.pushes) {
      boxes = applyPush(l, boxes, pu);
      player = pu.from;
    }
    if (graph && graph.togo({ player, boxes }) < 0) return 'dead';
  }
  return 'loop';
}

// ---------------------------------------------------------------- line metrics

/** Identity-preserving replay → crate switches and same-crate direction changes along a LURD line. */
export function switchesOf(l: Level, lurd: string): { switches: number; turns: number } {
  let player = l.start.player;
  const boxes = Array.from(l.start.boxes);
  let last = -1;
  let sw = 0;
  let turns = 0;
  let lastDir: number | null = null;
  for (const ch of lurd) {
    const k = DIR_CH.indexOf(ch.toLowerCase());
    const y = nb(l, player, k);
    const s = boxes.indexOf(y);
    if (s >= 0 && ch === ch.toUpperCase()) {
      boxes[s] = nb(l, y, k);
      if (last !== -1 && s !== last) sw += 1;
      if (s === last && lastDir !== null && lastDir !== k) turns += 1;
      last = s;
      lastDir = k;
    }
    player = y;
  }
  return { switches: sw, turns };
}
