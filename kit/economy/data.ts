import { unionLedger, type LedgerEvent } from '../sync/ledger';

export const ECONOMY_KEY = 'kg:v1:economy';
export interface EconomyData { v: 1; ledger: LedgerEvent[]; pet: Record<string, string | null>; seen: string[] }
export interface PendingAward { id: string; kind: 'earn' | 'grant'; amount: number; src: string; ref: string }
export const emptyEconomy = (): EconomyData => ({ v: 1, ledger: [], pet: {}, seen: [] });
const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const stringMap = (x: unknown): Record<string, string | null> => {
  const out: Record<string, string | null> = {};
  if (isRecord(x)) for (const [k, v] of Object.entries(x).slice(0, 300)) if (k.length <= 64 && (v === null || typeof v === 'string' && v.length <= 64)) out[k] = v;
  return out;
};
export function normalizeEconomy(raw: unknown): EconomyData {
  if (!isRecord(raw) || raw.v !== 1) return emptyEconomy();
  return { v: 1, ledger: unionLedger(Array.isArray(raw.ledger) ? raw.ledger : [], []), pet: stringMap(raw.pet), seen: Array.isArray(raw.seen) ? [...new Set(raw.seen.filter((s): s is string => typeof s === 'string' && s.length <= 96))] : [] };
}
export function mergeEconomy(a: EconomyData, b: EconomyData): EconomyData {
  return { v: 1, ledger: unionLedger(a.ledger, b.ledger), pet: { ...b.pet, ...a.pet }, seen: [...new Set([...a.seen, ...b.seen])] };
}
