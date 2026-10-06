/**
 * AI Web Worker entry (spec §8.5 protocol). Receives ONLY public views:
 *   { t: 'think', id, mode, view, level, side, seed, budget }
 *   { t: 'hint',  id, mode, view, side, seed, budget }
 *   { t: 'cancel', id }   (a single-threaded worker cannot stop mid-search; stale ids are dropped by the client)
 * Answers { t: 'move', id, action, stats } or { t: 'error', id, message }.
 */
/// <reference lib="webworker" />
import { think } from './think';
import type { PublicView } from '../core/redact';
import type { Level } from './levels';

interface ThinkMsg {
  t: 'think' | 'hint';
  id: string;
  view: PublicView;
  level?: Level;
  seed: string;
  budget?: { nodes?: number; ms?: number };
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (e: MessageEvent<ThinkMsg | { t: 'cancel'; id: string }>) => {
  const msg = e.data;
  if (msg.t !== 'think' && msg.t !== 'hint') return;
  try {
    const r = think({ view: msg.view, level: msg.t === 'hint' ? 'hint' : (msg.level ?? 1), seed: msg.seed, budget: msg.budget });
    ctx.postMessage({ t: 'move', id: msg.id, action: r.note, stats: r.stats });
  } catch (err) {
    ctx.postMessage({ t: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
