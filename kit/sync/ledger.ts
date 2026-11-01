// kit/sync/ledger.ts — THE coin-ledger contract (docs/specs/sync.md §8.4). Port of ~/kid-games-work/specs/sync-tools/ledger.mjs v1.1; vectors: tests/economy/vectors.json.
// Append-only coin events; union by id; canonical order (lc, d, id); clamped fold; every result is a pure function of the SET of events (arrival order, duplicates, batching never matter).
//   Event = { id, d, lc, ts, kind: 'earn'|'spend'|'grant', amount (UNSIGNED integer 0..100000), src, ref } — the sign comes from kind (spend = minus); `ts` is display-only, never ordered.
// Natural ids (once-only awards) are content-derived and canonical (see natEvent). A same-id collision with different content is a contract violation; it is resolved deterministically
// (smaller (lc, d, canonical JSON) wins — never decided by the amount text) but the validators/CI reject such events.
import { DEV_RE, ID_RE, KINDS, LC_SEED_EPOCH_MS, LC_SEED_MAX, MAX_AMOUNT, MAX_LC, MAX_SAFE, NATURAL_RE, REF_MAX, SRC_MAX, type Kind } from './contract';

export { DEV_RE, ID_RE, KINDS, MAX_AMOUNT, NATURAL_RE };
export interface LedgerEvent { id: string; d: string; lc: number; ts: number; kind: Kind; amount: number; src: string; ref: string }
export type NaturalEntry = Pick<LedgerEvent, 'kind' | 'amount' | 'src' | 'ref'>;
export type NaturalTable = Readonly<Record<string, NaturalEntry>>;

export const delta = (e: Pick<LedgerEvent, 'kind' | 'amount'>): number => (e.kind === 'spend' ? -e.amount : e.amount);
export const cmpEv = (a: LedgerEvent, b: LedgerEvent): number => (a.lc - b.lc) || (a.d < b.d ? -1 : a.d > b.d ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const cj = (e: LedgerEvent): string => JSON.stringify([e.id, e.d, e.lc, e.ts, e.kind, e.amount, e.src, e.ref]);
export function validEv(x: unknown): x is LedgerEvent {
  const e = x as Partial<LedgerEvent> | null | undefined;
  return !!e && typeof e.id === 'string' && ID_RE.test(e.id) && typeof e.d === 'string' && DEV_RE.test(e.d) && Number.isInteger(e.lc) && e.lc! >= 0 && e.lc! <= MAX_LC
    && (KINDS as readonly unknown[]).includes(e.kind) && Number.isInteger(e.amount) && e.amount! >= 0 && e.amount! <= MAX_AMOUNT && Number.isInteger(e.ts) && e.ts! >= 0 && e.ts! <= MAX_SAFE
    && typeof e.src === 'string' && e.src.length <= SRC_MAX && typeof e.ref === 'string' && e.ref.length <= REF_MAX;
}
// natural-id contract (once-only awards: first:, m:, u:, egg:, g:, d1:, rf:, retro:): the event is CANONICAL — a pure function of its id: d = 'n', lc = 0, ts = 0, kind/amount/src/ref from the content table.
// Two devices that award the same milestone offline therefore produce BYTE-IDENTICAL events, so server dedupe by id (first arrival wins) can never leave two devices holding different versions.
// (Consequence: such awards sort FIRST in the fold. They are gains, so only a forgiven overdraft later in the order can absorb them — bounded by the forgiven total.)
export const natEvent = (id: string, t: NaturalEntry): LedgerEvent => ({ id, d: 'n', lc: 0, ts: 0, kind: t.kind, amount: t.amount, src: t.src, ref: t.ref });
export const validNatural = (e: LedgerEvent, table: NaturalTable): boolean => !NATURAL_RE.test(e.id) || (!!table[e.id] && e.d === 'n' && e.lc === 0 && e.ts === 0 && table[e.id]!.kind === e.kind && table[e.id]!.amount === e.amount && table[e.id]!.src === e.src && table[e.id]!.ref === e.ref);
/** Union by id. Same id, different content -> smaller (lc, d, canonical JSON) wins: deterministic, order-free, independent of the amount. Invalid events are dropped (never thrown). */
export function unionLedger(a: readonly unknown[], b: readonly unknown[]): LedgerEvent[] {
  const m = new Map<string, LedgerEvent>();
  for (const e of [...a, ...b]) {
    if (!validEv(e)) continue; const p = m.get(e.id);
    if (!p) { m.set(e.id, e); continue; }
    const c = (e.lc - p.lc) || (e.d < p.d ? -1 : e.d > p.d ? 1 : 0) || (cj(e) < cj(p) ? -1 : cj(e) > cj(p) ? 1 : 0);
    if (c < 0) m.set(e.id, e);
  }
  return [...m.values()].sort(cmpEv);
}
/** balance = clamped replay in canonical order: b <- max(0, b + delta). Pure function of the SET of events. `forgiven` = total overdraft the clamp forgave. */
export function balance(events: readonly LedgerEvent[]): { balance: number; forgiven: number } {
  let b = 0, forgiven = 0;
  for (const e of [...events].sort(cmpEv)) { const nb = b + delta(e); if (nb < 0) { forgiven += -nb; b = 0; } else b = nb; }
  return { balance: b, forgiven };
}
export const rawSum = (events: readonly LedgerEvent[]): number => events.reduce((s, e) => s + delta(e), 0);
/** Seed for a device's Lamport counter, read ONCE at install / restore (never compared afterwards): a fresh or reinstalled device's events sort AFTER everything an old device has,
 *  so an early-sorting earn can never be absorbed by a forgiven overdraft that sits later in the order. Capped: a crazy clock cannot push lc past the validator limit. */
export const lcSeed = (nowMs: number): number => (Number.isFinite(nowMs) ? Math.min(LC_SEED_MAX, Math.max(0, Math.floor((nowMs - LC_SEED_EPOCH_MS) / 1000))) : 0);
// ---- compaction by RE-ENCODING (v1.1): sealed immutable segments hold the same events; the fold input set never changes, so no coordination and no late-event problem.
export function packSegments(events: readonly LedgerEvent[], size = 500): LedgerEvent[][] { const s = [...events].sort(cmpEv); const out: LedgerEvent[][] = []; for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size)); return out; }
export const unpackSegments = (segs: readonly (readonly LedgerEvent[])[]): LedgerEvent[] => unionLedger(segs.flat(), []);
