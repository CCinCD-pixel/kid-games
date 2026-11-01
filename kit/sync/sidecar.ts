/** Crash-safe local boundary between a live game save and a future cloud merge. */
import { DeviceClock } from '../clock';
import { canon, cmpStamp, fromWire, lwwPaths, merge, overlay, strip, toWire, type SyncCtx, type WireState } from './merge';
import type { Rule, RuleOf, Stamp } from './rules';

export const SYNC_PREFIX = 'kg:sync:v1:';
export const sideKey = (id: string): string => `${SYNC_PREFIX}side:${id}`;
export const inboxKey = (id: string): string => `${SYNC_PREFIX}inbox:${id}`;
export interface SyncOption<T> {
  merge: RuleOf<T>;
  validate(value: unknown): value is T;
  migrateFrom(raw: unknown, version: number): T;
}
export interface SlotSide {
  sv: 1;
  v: number;
  rev: number;
  st: Record<string, Stamp>;
  slots: SyncCtx['slots'];
  ords: SyncCtx['ords'];
  seen: Record<string, string>;
  g?: Stamp;
  pushedHash?: string;
  pending?: { dataCanon: string; final: Omit<SlotSide, 'pending'> };
}
export interface SlotInbox { sv: 1; v: number; rev: number; wire: WireState }
const clone = <T>(value: T): T => structuredClone(value);
const parse = (value: string | null): unknown => { try { return JSON.parse(value ?? 'null'); } catch { return null; } };
const noPending = (side: SlotSide): Omit<SlotSide, 'pending'> => {
  const { pending: _pending, ...rest } = side;
  return rest;
};
const seenOf = (rule: Rule, data: unknown): Record<string, string> => Object.fromEntries(
  Object.entries(lwwPaths(rule, strip(rule, data))).map(([path, value]) => [path, canon(value)]),
);
export const sideVersion = (storage: Storage, id: string): number | null => {
  const raw = parse(storage.getItem(sideKey(id)));
  return raw && typeof raw === 'object' && 'sv' in raw && typeof raw.sv === 'number' ? raw.sv : null;
};
export function readSide(storage: Storage, id: string): SlotSide | null {
  const raw = parse(storage.getItem(sideKey(id)));
  if (!raw || typeof raw !== 'object' || !('sv' in raw) || raw.sv !== 1 || !('st' in raw) || !('slots' in raw) || !('ords' in raw) || !('seen' in raw)) return null;
  return raw as SlotSide;
}
function fresh<T>(version: number, defaults: T, rule: Rule): SlotSide {
  return { sv: 1, v: version, rev: 0, st: {}, slots: {}, ords: {}, seen: seenOf(rule, defaults) };
}

/** If the data write landed before a crash, finish its sidecar; otherwise keep the old sidecar and retry the inbox. */
export function reconcile(storage: Storage, id: string, data: unknown): void {
  const side = readSide(storage, id);
  if (!side?.pending) return;
  try {
    if (canon(data) === side.pending.dataCanon) {
      storage.setItem(sideKey(id), JSON.stringify(side.pending.final));
      storage.removeItem(inboxKey(id));
    } else storage.setItem(sideKey(id), JSON.stringify(noPending(side)));
  } catch { /* a later load can finish this write */ }
}

function stage<T>(storage: Storage, id: string, current: SlotSide, final: SlotSide, data: T, writeData: (data: T) => boolean): boolean {
  const prepared: SlotSide = { ...current, pending: { dataCanon: canon(data), final: noPending(final) } };
  try { storage.setItem(sideKey(id), JSON.stringify(prepared)); } catch { return false; }
  if (!writeData(data)) return false;
  try {
    storage.setItem(sideKey(id), JSON.stringify(noPending(final)));
    storage.removeItem(inboxKey(id));
  } catch { /* reconcile on the next load */ }
  return true;
}

/** Called by createStore.load() before it returns a game save. Never mutates an active screen's in-memory object. */
export function applyInbox<T>(storage: Storage, id: string, version: number, defaults: () => T, local: T, option: SyncOption<T>, writeData: (data: T) => boolean): T {
  if (sideVersion(storage, id) !== null && sideVersion(storage, id) !== 1) return local;
  reconcile(storage, id, local);
  const inbox = parse(storage.getItem(inboxKey(id))) as SlotInbox | null;
  if (!inbox || inbox.sv !== 1 || inbox.v !== version || !inbox.wire || !option.validate(local)) return local;
  const rule = option.merge as Rule;
  const side = readSide(storage, id) ?? fresh(version, defaults(), rule);
  const clock = new DeviceClock({ storage });
  const remoteStamp = Math.max(inbox.wire.g?.[0] ?? 0, ...Object.values(inbox.wire.st ?? {}).map((stamp) => stamp?.[0] ?? 0));
  clock.observe(remoteStamp);
  const next = clone(side);
  const ctx: SyncCtx = { slots: clone(next.slots), ords: clone(next.ords), dev: clock.device, tick: () => clock.next().lc };
  const localData = strip(rule, local);
  const paths = lwwPaths(rule, localData);
  for (const [path, value] of Object.entries(paths)) if (next.seen[path] !== canon(value)) next.st[path] = [clock.next().lc, clock.device];
  const localWire: WireState = { d: toWire(rule, localData, ctx), st: next.st, ...(next.g ? { g: next.g } : {}) };
  const joined = merge(rule, localWire, inbox.wire);
  const replace = cmpStamp(joined.g ?? [0, ''], next.g ?? [0, '']) > 0;
  const resolved = overlay(rule, local, fromWire(rule, joined.d, ctx), { replace }) as T;
  if (!option.validate(resolved)) return local;
  const final: SlotSide = { ...next, v: version, rev: inbox.rev, st: joined.st, g: joined.g, slots: ctx.slots, ords: ctx.ords, seen: seenOf(rule, resolved) };
  return stage(storage, id, side, final, resolved, writeData) ? resolved : local;
}

/** A reset raises the slot generation before writing defaults, so a stale device cannot resurrect it. */
export function resetSynced<T>(storage: Storage, id: string, version: number, defaults: () => T, option: SyncOption<T>, writeData: (data: T) => boolean): boolean {
  if (sideVersion(storage, id) !== null && sideVersion(storage, id) !== 1) return false;
  const rule = option.merge as Rule;
  const current = readSide(storage, id) ?? fresh(version, defaults(), rule);
  const clock = new DeviceClock({ storage });
  const inbox = parse(storage.getItem(inboxKey(id))) as SlotInbox | null;
  clock.observe(Math.max(current.g?.[0] ?? 0, inbox?.sv === 1 ? inbox.wire?.g?.[0] ?? 0 : 0));
  const data = defaults();
  const final: SlotSide = { ...fresh(version, data, rule), g: [clock.next().lc, clock.device] };
  return stage(storage, id, current, final, data, writeData);
}
