/**
 * Worker RPC (spec §8.1 hintClient): request ids, per-request timeouts, one level loaded at a time.
 * If a module Worker cannot start — or dies later (e.g. its chunk fails to fetch) — the same engine
 * runs on the page for the current level (v1 boards are small). `cancelPending()` answers every
 * open request with its safe fallback at once (spec §3.10 切后台).
 */
import type { GeneratedFail, GeneratedLevel } from '@engines/puzzle/src/generator';
import { nextPush, normalKey, referenceKeys } from '@engines/puzzle/src/hint';
import { parseLevel } from '@engines/puzzle/src/level';
import { applyPush } from '@engines/puzzle/src/rules';
import { solvePushOptimal } from '@engines/puzzle/src/solver';
import { StateGraph } from '@engines/puzzle/src/stategraph';
import type { Level } from '@engines/puzzle/src/types';
import type { HintReply, WorkerReply, WorkerRequest } from '../worker/protocol';

type Pending = { resolve: (r: WorkerReply) => void; timer: ReturnType<typeof setTimeout>; fallback: WorkerReply };
type Snap = { player: number; boxes: ArrayLike<number> };

export class PuzzleClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private key = '';
  /** page fallback */
  private local: { level: Level; graph: StateGraph | null; ref?: string; refKeys?: string[] } | null = null;
  graphReady = false;
  graphStates = 0;
  graphMs = 0;
  private loadWaiters: (() => void)[] = [];
  /** the current level's load() arguments: a Worker that dies later is replaced by the page engine */
  private lastLoad: { key: string; rows: string[]; o: { ref?: string; maxStates: number; maxMs: number } } | null = null;

  constructor() {
    try {
      this.worker = new Worker(new URL('../worker/puzzle.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<WorkerReply>) => this.onReply(ev.data);
      this.worker.onerror = () => this.workerFailed();
    } catch {
      this.worker = null;
    }
  }

  /** The Worker errored: answer what is open, then run the current level on the page. */
  private workerFailed(): void {
    this.worker?.terminate();
    this.worker = null;
    this.cancelPending();
    const l = this.lastLoad;
    if (l && !this.local) this.loadLocal(l.key, l.rows, l.o);
  }

  /** Every open request resolves now with its safe fallback (late Worker replies are ignored). */
  cancelPending(): void {
    const open = [...this.pending.values()];
    this.pending.clear();
    for (const p of open) {
      clearTimeout(p.timer);
      p.resolve(p.fallback);
    }
  }

  private onReply(m: WorkerReply): void {
    if (m.type === 'loaded') {
      if (m.key === this.key) {
        this.graphReady = m.ok;
        this.graphStates = m.states;
        this.graphMs = m.ms;
        for (const w of this.loadWaiters.splice(0)) w();
      }
      return;
    }
    const p = this.pending.get(m.req);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(m.req);
    // a Worker-side error answers like a timeout: the caller gets its safe fallback ("unknown")
    p.resolve(m.type === 'error' ? p.fallback : m);
  }

  private send<T extends WorkerReply>(msg: WorkerRequest & { req: number }, timeoutMs: number, fallback: T): Promise<T> {
    return new Promise<T>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.req);
        resolve(fallback);
      }, timeoutMs);
      this.pending.set(msg.req, { resolve: resolve as (r: WorkerReply) => void, timer, fallback });
      if (this.worker) this.worker.postMessage(msg);
      else {
        clearTimeout(timer);
        this.pending.delete(msg.req);
        resolve(fallback);
      }
    });
  }

  load(key: string, rows: string[], o: { ref?: string; maxStates: number; maxMs: number }): void {
    this.key = key;
    this.graphReady = false;
    this.lastLoad = { key, rows, o };
    if (this.worker) {
      this.local = null;
      this.worker.postMessage({ type: 'load', key, rows, ref: o.ref, maxStates: o.maxStates, maxMs: o.maxMs } satisfies WorkerRequest);
      return;
    }
    this.loadLocal(key, rows, o);
  }

  private loadLocal(key: string, rows: string[], o: { ref?: string; maxStates: number; maxMs: number }): void {
    const level = parseLevel(rows, key);
    const local = { level, graph: null as StateGraph | null, ref: o.ref, refKeys: o.ref ? referenceKeys(level, o.ref) : undefined };
    this.local = local;
    void StateGraph.build(level, { maxStates: o.maxStates, maxMs: o.maxMs }).then((g) => {
      if (this.local !== local) return;
      local.graph = g;
      this.graphReady = !!g;
      this.graphStates = g?.size ?? 0;
      for (const w of this.loadWaiters.splice(0)) w();
    });
  }

  /** Resolves when the current level's graph build ended (or after `ms`). */
  whenLoaded(ms = 4000): Promise<void> {
    if (this.graphReady) return Promise.resolve();
    return new Promise((r) => {
      this.loadWaiters.push(r);
      setTimeout(r, ms);
    });
  }

  private localTogo(s: Snap): number {
    const L = this.local;
    if (!L) return -2;
    const st = { player: s.player, boxes: Uint16Array.from(s.boxes) };
    if (L.graph) {
      const t = L.graph.togo(st);
      if (t !== -2) return t;
    }
    const r = solvePushOptimal(L.level, st, { nodes: 200000, ms: 1500 });
    return 'pushes' in r ? r.pushes.length : 'dead' in r ? -1 : -2;
  }

  /** pushes still needed (≥0), −1 cannot finish, −2 unknown */
  async togo(s: Snap): Promise<number> {
    if (!this.worker) return this.local ? this.localTogo(s) : -2;
    const r = await this.send({ type: 'togo', req: ++this.seq, key: this.key, player: s.player, boxes: Array.from(s.boxes) }, 2500, { type: 'togo', req: 0, togo: -2 });
    return r.togo;
  }

  /** index of the newest state that can still be finished */
  async rewindIndex(states: Snap[]): Promise<number> {
    if (!this.worker) {
      if (!this.local) return 0;
      for (let i = states.length - 1; i >= 0; i -= 1) if (this.localTogo(states[i]) >= 0) return i;
      return 0;
    }
    const r = await this.send({ type: 'rewind', req: ++this.seq, key: this.key, states: states.map((s) => ({ player: s.player, boxes: Array.from(s.boxes) })) }, 4000, { type: 'rewind', req: 0, index: 0 });
    return r.index;
  }

  async hint(s: Snap): Promise<HintReply> {
    if (!this.worker) {
      const L = this.local;
      if (!L) return null;
      const a = nextPush(L.level, { player: s.player, boxes: Uint16Array.from(s.boxes) }, { graph: L.graph, reference: L.ref, refKeys: L.refKeys });
      return a ? ('rewind' in a ? { rewind: true } : { slotCell: a.push.from, dir: a.push.dir, kind: a.kind, togo: a.togo }) : null;
    }
    const r = await this.send({ type: 'hint', req: ++this.seq, key: this.key, player: s.player, boxes: Array.from(s.boxes) }, 2500, { type: 'hint', req: 0, answer: null });
    return r.answer;
  }

  /** The next `n` pushes of an optimal line (H3). */
  async line(s: Snap, n: number): Promise<{ from: number; dir: number }[] | null> {
    if (!this.worker) {
      const L = this.local;
      if (!L) return null;
      let st: { player: number; boxes: Uint16Array } = { player: s.player, boxes: Uint16Array.from(s.boxes) };
      const out: { from: number; dir: number }[] = [];
      for (let i = 0; i < n; i += 1) {
        const a = nextPush(L.level, st, { graph: L.graph, reference: L.ref, refKeys: L.refKeys });
        if (!a || 'rewind' in a) break;
        out.push({ from: a.push.from, dir: a.push.dir });
        st = { player: a.push.from, boxes: applyPush(L.level, st.boxes, a.push) };
      }
      return out.length ? out : null;
    }
    const r = await this.send({ type: 'line', req: ++this.seq, key: this.key, player: s.player, boxes: Array.from(s.boxes), n }, 4000, { type: 'line', req: 0, pushes: null });
    return r.pushes;
  }

  /** Newest history state on the reference line (−1 none). */
  async refRewind(states: Snap[]): Promise<number> {
    if (!this.worker) {
      const L = this.local;
      if (!L?.refKeys) return -1;
      const on = new Set(L.refKeys);
      for (let i = states.length - 1; i >= 0; i -= 1) if (on.has(normalKey(L.level, { player: states[i].player, boxes: Uint16Array.from(states[i].boxes) }))) return i;
      return -1;
    }
    const r = await this.send({ type: 'refRewind', req: ++this.seq, key: this.key, states: states.map((x) => ({ player: x.player, boxes: Array.from(x.boxes) })) }, 3000, { type: 'refRewind', req: 0, index: -1 });
    return r.index;
  }

  /**
   * 随机新仓库: generate in the Worker. Resolves `null` after `timeoutMs` (the page then uses the
   * fallback pool); the Worker still finishes and `late` receives that warehouse for the next order.
   */
  generate(tier: 1 | 2 | 3 | 4, seed: number, avoid: number[], timeoutMs: number, late?: (r: GeneratedLevel | GeneratedFail, ms: number) => void): Promise<{ result: GeneratedLevel | GeneratedFail; ms: number } | null> {
    return new Promise((resolve) => {
      if (!this.worker) {
        void import('@engines/puzzle/src/generator').then(async ({ generatePuzzle }) => {
          const rooms = ((await import('../../../../content/sokoban/rooms.json')) as unknown as { default: { rooms: Record<string, string[]> } }).default.rooms;
          const t0 = performance.now();
          const result = generatePuzzle(tier, seed, rooms, { colors: false, avoid: new Set(avoid) });
          resolve({ result, ms: Math.round(performance.now() - t0) });
        });
        return;
      }
      const req = ++this.seq;
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        resolve(null);
      }, timeoutMs);
      this.pending.set(req, {
        resolve: (m) => {
          clearTimeout(timer);
          if (m.type !== 'generate') {
            if (!settled) resolve(null);
            return;
          }
          if (settled) late?.(m.result, m.ms);
          else resolve({ result: m.result, ms: m.ms });
        },
        timer: setTimeout(() => this.pending.delete(req), 60_000),
        fallback: { type: 'error', req, message: 'timeout' },
      });
      this.worker.postMessage({ type: 'generate', req, tier, seed, avoid, colors: false } satisfies WorkerRequest);
    });
  }

  async solve(s: Snap): Promise<{ from: number; dir: number }[] | null> {
    if (!this.worker) {
      if (!this.local) return null;
      const r = solvePushOptimal(this.local.level, { player: s.player, boxes: Uint16Array.from(s.boxes) }, { nodes: 400000, ms: 8000 });
      return 'pushes' in r ? r.pushes.map((p) => ({ from: p.from, dir: p.dir })) : null;
    }
    const r = await this.send({ type: 'solve', req: ++this.seq, key: this.key, player: s.player, boxes: Array.from(s.boxes) }, 10000, { type: 'solve', req: 0, pushes: null });
    return r.pushes;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
