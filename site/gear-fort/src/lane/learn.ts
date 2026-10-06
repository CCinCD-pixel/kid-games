// 学会 (spec §2.3, rev d): a 怕什么 pair (machine kind → card) is learned from what the card visibly DID to that kind.
// Kernel 'counter' events {id, k, card} count only if that machine was afterwards dismantled or captured (not by a 檑木);
// one per machine per card. A pair is learned at a lifetime count of 2 (or after a won 锦囊谜题). Port of proto/learn.mjs.
import { FEARS } from './tags';
import type { SimState } from './types';

export const LEARN_AT = 2;
export type Counters = Record<string, Record<string, number>>;

export function pairEvents(S: SimState): Counters {
  const evs = S.ev || []; const out: Counters = {};
  const done = new Set(evs.filter((e) => e.type === 'gone' && !e.log).map((e) => e.id));
  const seen = new Set<string>();
  for (const e of evs) {
    if (e.type !== 'counter' || !done.has(e.id)) continue;
    const kind = e.k!;
    if (!(FEARS[kind] || []).includes(e.card!)) continue;
    const key = kind + '>' + e.card + '#' + e.id; if (seen.has(key)) continue; seen.add(key);
    out[kind] = out[kind] || {}; out[kind][e.card!] = (out[kind][e.card!] || 0) + 1;
  }
  return out;
}
export function addCounters(save: Counters, ev: Counters): Counters {
  for (const [k, m] of Object.entries(ev)) for (const [c, n] of Object.entries(m)) { save[k] = save[k] || {}; save[k][c] = (save[k][c] || 0) + n; }
  return save;
}
export const learned = (counters: Counters, kind: string, card: string): boolean => ((counters[kind] || {})[card] || 0) >= LEARN_AT;
