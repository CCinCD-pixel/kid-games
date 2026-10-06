/**
 * Main-thread AI client (spec §8.5, R10.2): one resident Worker; every request carries an id
 * (`<matchId>:<ply>`); answers whose id is no longer wanted are dropped; restart / leave terminate
 * and rebuild the Worker. A request unanswered after 4 s → terminate + rebuild + a level-1 move
 * computed right here from the same public view (logged `ai-timeout`; the tests require 0).
 * The client only ever posts PublicViews (core/redact) — never a GameState.
 */
import type { PublicView } from '../core/redact';
import type { Level } from './levels';
import { think, type ThinkStats } from './think';

export interface AiAnswer {
  note: string;
  stats: ThinkStats | null;
  timedOut: boolean;
}

interface Pending {
  resolve: (a: AiAnswer) => void;
  timer: number;
  fallback: () => AiAnswer;
}

export class AiClient {
  private w: Worker | null = null;
  private pending = new Map<string, Pending>();
  /** ?test=1: every message posted to the worker (an-noleak test) */
  readonly sent: unknown[] = [];
  timeouts = 0;

  constructor(private o: { test?: boolean; onTimeout?: (id: string) => void; timeoutMs?: number } = {}) {}

  private worker(): Worker {
    if (this.w) return this.w;
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ t: 'move' | 'error'; id: string; action?: string; stats?: ThinkStats; message?: string }>) => {
      const m = e.data;
      const p = this.pending.get(m.id);
      if (!p) return; // stale (R10.2)
      this.pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.t === 'move' && m.action) p.resolve({ note: m.action, stats: m.stats ?? null, timedOut: false });
      else p.resolve(p.fallback());
    };
    w.onerror = (ev) => {
      // a crashed worker: answer everything still pending locally, rebuild on the next request
      ev.preventDefault?.();
      const all = [...this.pending.values()];
      this.pending.clear();
      this.hardReset();
      for (const p of all) {
        clearTimeout(p.timer);
        p.resolve(p.fallback());
      }
    };
    this.w = w;
    return w;
  }

  private post(msg: Record<string, unknown>, fallback: () => AiAnswer): Promise<AiAnswer> {
    const id = msg.id as string;
    const old = this.pending.get(id);
    if (old) {
      clearTimeout(old.timer);
      this.pending.delete(id);
    }
    return new Promise<AiAnswer>((resolve) => {
      const timer = window.setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        this.timeouts++;
        this.o.onTimeout?.(id);
        this.hardReset();
        resolve(fallback());
      }, this.o.timeoutMs ?? 4000);
      this.pending.set(id, { resolve, timer, fallback });
      if (this.o.test) this.sent.push(JSON.parse(JSON.stringify(msg)));
      this.worker().postMessage(msg);
    });
  }

  think(id: string, view: PublicView, level: Level, seed: string, budget?: { nodes?: number; ms?: number }): Promise<AiAnswer> {
    return this.post({ t: 'think', id, mode: view.mode, view, level, side: view.me, seed, budget }, () => ({ note: think({ view, level: 1, seed }).note, stats: null, timedOut: true }));
  }

  hint(id: string, view: PublicView, seed: string): Promise<AiAnswer> {
    return this.post({ t: 'hint', id, mode: view.mode, view, side: view.me, seed }, () => ({ note: think({ view, level: 'hint', seed, budget: { nodes: 4000 } }).note, stats: null, timedOut: true }));
  }

  /** forget a request (its answer, if any, will be dropped) */
  cancel(id: string): void {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    this.w?.postMessage({ t: 'cancel', id });
  }

  private hardReset(): void {
    this.w?.terminate();
    this.w = null;
  }

  /** restart / leave: terminate the worker and drop every outstanding request */
  reset(): void {
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
    this.hardReset();
  }

  destroy(): void {
    this.reset();
  }
}
