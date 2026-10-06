/**
 * PuzzleClient robustness (QA r1): a Worker that dies after a level was loaded into it hands the
 * level to the page engine — open requests answer at once with their safe fallback, later ones are
 * computed on the page; cancelPending() (page hidden, spec §3.10) answers everything open at once.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { PuzzleClient } from './src/hints/hintClient';
import { levelById } from './src/data';

class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: { type: string }[] = [];
  terminated = false;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(m: { type: string }): void {
    this.sent.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
}

const g = globalThis as unknown as { Worker?: unknown };
const realWorker = g.Worker;
afterEach(() => {
  g.Worker = realWorker;
});

describe('PuzzleClient', () => {
  it('a Worker error after load → pending requests get their fallback, then the page engine answers', async () => {
    g.Worker = FakeWorker;
    const L = levelById('1-1')!;
    const c = new PuzzleClient();
    const w = FakeWorker.last!;
    c.load(L.id, L.map, { ref: L.ref, maxStates: 20000, maxMs: 2000 });
    expect(w.sent.map((m) => m.type)).toEqual(['load']);
    const start = { player: 10, boxes: [] as number[] };
    const rows = L.map;
    const W = rows[0].length;
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === '@') start.player = y * W + x;
      if (ch === '$' || ch === '*') start.boxes.push(y * W + x);
    }));
    const open = c.togo(start);
    w.onerror?.({});
    expect(w.terminated).toBe(true);
    expect(await open).toBe(-2); // the safe "unknown" at once, not after the 2.5 s timeout
    await c.whenLoaded(3000);
    expect(await c.togo(start)).toBe(L.opt.pushes);
    const h = await c.hint(start);
    expect(h && !('rewind' in h)).toBe(true);
  });
  it('cancelPending answers every open request with its fallback', async () => {
    g.Worker = FakeWorker;
    const L = levelById('1-1')!;
    const c = new PuzzleClient();
    c.load(L.id, L.map, { maxStates: 20000, maxMs: 2000 });
    const a = c.togo({ player: 10, boxes: [] });
    const b = c.hint({ player: 10, boxes: [] });
    c.cancelPending();
    expect(await a).toBe(-2);
    expect(await b).toBe(null);
  });
});
