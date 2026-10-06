/// <reference lib="webworker" />
/**
 * Puzzle Worker (spec §5.1, §8.1): builds the full StateGraph of the current level within its
 * state/time budget, answers togo queries (layer-2 deadlock), the "回到能推完的地方" rewind search,
 * hints and solves (A* fallback with a node/time budget when there is no graph). Never blocks input.
 */
import { generatePuzzle } from '@engines/puzzle/src/generator';
import { parseLevel } from '@engines/puzzle/src/level';
import { nextPush, normalKey, referenceKeys } from '@engines/puzzle/src/hint';
import { applyPush } from '@engines/puzzle/src/rules';
import { solvePushOptimal } from '@engines/puzzle/src/solver';
import { StateGraph } from '@engines/puzzle/src/stategraph';
import type { Level } from '@engines/puzzle/src/types';
import roomsJson from '../../../../content/sokoban/rooms.json';
import type { WorkerReply, WorkerRequest } from './protocol';

const ROOMS = (roomsJson as unknown as { rooms: Record<string, string[]> }).rooms;

interface Loaded {
  key: string;
  level: Level;
  ref?: string;
  refKeys?: string[];
  graph: StateGraph | null;
  building: Promise<StateGraph | null> | null;
  abort: AbortController;
  failed: boolean;
}

let cur: Loaded | null = null;
const FALLBACK = { nodes: 200000, ms: 1500 };

const post = (m: WorkerReply) => (self as unknown as Worker).postMessage(m);

async function graphOrNull(L: Loaded, waitMs: number): Promise<StateGraph | null> {
  if (L.graph || !L.building) return L.graph;
  if (waitMs <= 0) return null;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), waitMs));
  return Promise.race([L.building, timeout]);
}

/** togo with the graph, else a budgeted A*: ≥0 pushes left, −1 dead, −2 unknown. */
async function togoOf(L: Loaded, player: number, boxes: number[]): Promise<number> {
  const g = await graphOrNull(L, 600);
  const s = { player, boxes: Uint16Array.from(boxes) };
  if (g) {
    const t = g.togo(s);
    if (t !== -2) return t;
  }
  const r = solvePushOptimal(L.level, s, FALLBACK);
  return 'pushes' in r ? r.pushes.length : 'dead' in r ? -1 : -2;
}

/** Up to `n` pushes of an optimal line from a state: graph hints, else the reference, else a budgeted A*. */
async function lineOf(L: Loaded, player: number, boxes: number[], n: number): Promise<{ from: number; dir: number }[] | null> {
  const g = await graphOrNull(L, 1500);
  let s: { player: number; boxes: Uint16Array } = { player, boxes: Uint16Array.from(boxes) };
  const out: { from: number; dir: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = nextPush(L.level, s, { graph: g, reference: L.ref, refKeys: L.refKeys });
    if (!a || 'rewind' in a) break;
    out.push({ from: a.push.from, dir: a.push.dir });
    s = { player: a.push.from, boxes: applyPush(L.level, s.boxes, a.push) };
  }
  if (out.length) return out;
  const r = solvePushOptimal(L.level, { player, boxes: Uint16Array.from(boxes) }, FALLBACK);
  return 'pushes' in r ? r.pushes.slice(0, n).map((p) => ({ from: p.from, dir: p.dir })) : null;
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const m = ev.data;
  try {
    if (m.type === 'generate') {
      const t0 = performance.now();
      const result = generatePuzzle(m.tier, m.seed, ROOMS, { colors: m.colors, avoid: new Set(m.avoid) });
      post({ type: 'generate', req: m.req, result, ms: Math.round(performance.now() - t0) });
      return;
    }
    if (m.type === 'load') {
      if (cur && cur.key !== m.key) cur.abort.abort();
      if (cur && cur.key === m.key) {
        post({ type: 'loaded', key: m.key, ok: !!cur.graph || !!cur.building, states: cur.graph?.size ?? 0, ms: cur.graph?.buildMs ?? 0 });
        return;
      }
      const level = parseLevel(m.rows, m.key);
      const abort = new AbortController();
      const L: Loaded = { key: m.key, level, ref: m.ref, graph: null, building: null, abort, failed: false };
      cur = L;
      if (m.ref) L.refKeys = referenceKeys(level, m.ref);
      L.building = StateGraph.build(level, { maxStates: m.maxStates, maxMs: m.maxMs, signal: abort.signal }).then((g) => {
        if (cur === L) {
          L.graph = g;
          L.failed = !g;
          L.building = null;
        }
        post({ type: 'loaded', key: m.key, ok: !!g, states: g?.size ?? 0, ms: g?.buildMs ?? 0 });
        return g;
      });
      return;
    }
    const L = cur;
    if (!L || L.key !== m.key) {
      post({ type: 'error', req: 'req' in m ? m.req : -1, message: 'level not loaded' });
      return;
    }
    if (m.type === 'togo') {
      post({ type: 'togo', req: m.req, togo: await togoOf(L, m.player, m.boxes) });
    } else if (m.type === 'rewind') {
      // newest history state that can still be finished (the start always can)
      let idx = 0;
      for (let i = m.states.length - 1; i >= 0; i -= 1) {
        const t = await togoOf(L, m.states[i].player, m.states[i].boxes);
        if (t >= 0) {
          idx = i;
          break;
        }
      }
      post({ type: 'rewind', req: m.req, index: idx });
    } else if (m.type === 'hint') {
      const g = await graphOrNull(L, 1500);
      const a = nextPush(L.level, { player: m.player, boxes: Uint16Array.from(m.boxes) }, { graph: g, reference: L.ref, refKeys: L.refKeys });
      post({ type: 'hint', req: m.req, answer: a ? ('rewind' in a ? { rewind: true } : { slotCell: a.push.from, dir: a.push.dir, kind: a.kind, togo: a.togo }) : null });
    } else if (m.type === 'line') {
      post({ type: 'line', req: m.req, pushes: await lineOf(L, m.player, m.boxes, m.n) });
    } else if (m.type === 'refRewind') {
      let idx = -1;
      if (L.refKeys) {
        const on = new Set(L.refKeys);
        for (let i = m.states.length - 1; i >= 0; i -= 1) {
          if (on.has(normalKey(L.level, { player: m.states[i].player, boxes: Uint16Array.from(m.states[i].boxes) }))) {
            idx = i;
            break;
          }
        }
      }
      post({ type: 'refRewind', req: m.req, index: idx });
    } else if (m.type === 'solve') {
      const r = solvePushOptimal(L.level, { player: m.player, boxes: Uint16Array.from(m.boxes) }, { nodes: m.nodes ?? 400000, ms: m.ms ?? 8000 });
      post({ type: 'solve', req: m.req, pushes: 'pushes' in r ? r.pushes.map((p) => ({ from: p.from, dir: p.dir })) : null });
    }
  } catch (err) {
    post({ type: 'error', req: 'req' in m ? (m as { req: number }).req : -1, message: (err as Error).message });
  }
};
