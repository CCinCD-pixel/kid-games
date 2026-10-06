/**
 * Hint protocol (spec §5.1): the next push on an optimal line, from the full graph when it is
 * ready, else from the stored reference line (`ref`, LURD). Ties: shortest walk, then crate slot,
 * then direction up → right → down → left.
 */
import { applyPush, boxMap, canon, legalPushes, minReach, replayLurd, stateKey, walkDist } from './rules';
import type { StateGraph } from './stategraph';
import type { Level, Push, State } from './types';

export type HintKind = 'normal' | 'unlock' | 'park';
export type HintAnswer = { push: Push; kind: HintKind; togo: number } | { rewind: true } | null;

const DIR_RANK = [0, 2, 3, 1]; // up 0, right 1, down 2, left 3 → rank by engine dir (0 up, 1 down, 2 left, 3 right)

function manhattanToPad(l: Level, cell: number, color: number): number {
  let best = 1e9;
  const r = (cell / l.W) | 0;
  const c = cell % l.W;
  for (let i = 0; i < l.N; i += 1) {
    if (l.goal[i] !== color) continue;
    const d = Math.abs(((i / l.W) | 0) - r) + Math.abs((i % l.W) - c);
    if (d < best) best = d;
  }
  return best;
}

export function hintKind(l: Level, p: Push): HintKind {
  const color = l.colorOf[p.slot];
  if (l.goal[p.from] === color) return 'unlock';
  if (manhattanToPad(l, p.to, color) > manhattanToPad(l, p.from, color)) return 'park';
  return 'normal';
}

function better(a: Push, b: Push): boolean {
  if (a.walk !== b.walk) return a.walk < b.walk;
  if (a.slot !== b.slot) return a.slot < b.slot;
  return DIR_RANK[a.dir] < DIR_RANK[b.dir];
}

/** States (normalised keys) along a reference line, in order; index 0 = start. */
export function referenceKeys(l: Level, ref: string): string[] {
  const keys: string[] = [];
  const add = (player: number, boxes: ArrayLike<number>) => {
    const b = canon(l, boxes);
    keys.push(stateKey(minReach(walkDist(l, boxMap(l, b), player)), b));
  };
  add(l.start.player, l.start.boxes);
  let line = '';
  for (const ch of ref) {
    line += ch;
    if (ch !== ch.toLowerCase()) {
      const r = replayLurd(l, line);
      add(r.player, r.boxes);
    }
  }
  return keys;
}

export function normalKey(l: Level, s: State): string {
  const b = canon(l, s.boxes);
  return stateKey(minReach(walkDist(l, boxMap(l, b), s.player)), b);
}

/**
 * The next push. With a graph: an optimal push (`togo` drops by one) or `{rewind}` when the state
 * cannot be finished. Without a graph: the reference line's next push when the state is on it,
 * else null (the caller rewinds to the newest history state that is on the line).
 */
export function nextPush(l: Level, s: State, src: { graph?: StateGraph | null; reference?: string; refKeys?: string[] }): HintAnswer {
  const { pushes } = legalPushes(l, s);
  if (src.graph) {
    const cur = src.graph.togo(s);
    if (cur === -1) return { rewind: true };
    if (cur >= 0) {
      if (cur === 0) return null;
      let best: Push | null = null;
      for (const p of pushes) {
        const t = src.graph.togo({ player: p.from, boxes: applyPush(l, s.boxes, p) });
        if (t === cur - 1 && (!best || better(p, best))) best = p;
      }
      if (best) return { push: best, kind: hintKind(l, best), togo: cur };
    }
  }
  if (src.reference) {
    const keys = src.refKeys ?? referenceKeys(l, src.reference);
    const at = keys.indexOf(normalKey(l, s));
    if (at < 0 || at >= keys.length - 1) return null;
    const want = keys[at + 1];
    let best: Push | null = null;
    for (const p of pushes) {
      const next = normalKey(l, { player: p.from, boxes: applyPush(l, s.boxes, p) });
      if (next === want && (!best || better(p, best))) best = p;
    }
    if (best) return { push: best, kind: hintKind(l, best), togo: keys.length - 1 - at };
  }
  return null;
}
