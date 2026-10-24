import catalog from '../../content/star-pets/economy.json';
import { DeviceClock } from '../clock';
import { ID_RE } from '../sync/contract';
import { balance, natEvent, unionLedger, validEv, type LedgerEvent } from '../sync/ledger';
import { ECONOMY_KEY, emptyEconomy, mergeEconomy, normalizeEconomy, type EconomyData, type PendingAward } from './data';

export { ID_RE };
export { ECONOMY_KEY, mergeEconomy, normalizeEconomy } from './data';
export type { EconomyData, PendingAward } from './data';
const EVENT_PREFIX = `${ECONOMY_KEY}:ev:`;
export type PetLine = 'rover' | 'dragon';
export const decor = catalog.decor;
export const foods = catalog.foods;
export const catalogPrice = (id: string): number | null => {
  const item = [...catalog.decor, catalog.hat, ...catalog.paints, ...catalog.lights].find((x) => x.id === id);
  return item?.price ?? null;
};
export const food = (id: string) => foods.find((x) => x.id === id);

/** Synchronous local ledger. A separate event key survives two tabs writing the summary at once. */
export class Economy {
  private storage: Storage | undefined;
  private now: () => number;
  private clock: DeviceClock;
  private local = emptyEconomy();
  private listeners = new Set<(data: EconomyData) => void>();
  unsaved = false;
  constructor(opts: { storage?: Storage; now?: () => number; clock?: DeviceClock } = {}) {
    try { this.storage = opts.storage ?? globalThis.localStorage; } catch { this.storage = undefined; }
    this.now = opts.now ?? Date.now;
    this.clock = opts.clock ?? new DeviceClock({ storage: this.storage, now: this.now });
    this.local = this.read();
  }
  get device(): string { return this.clock.device; }
  private read(): EconomyData {
    let data = emptyEconomy();
    try { data = normalizeEconomy(JSON.parse(this.storage?.getItem(ECONOMY_KEY) ?? 'null')); } catch { /* private mode or bad JSON */ }
    try {
      const loose: LedgerEvent[] = [];
      if (this.storage) for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i); if (!key?.startsWith(EVENT_PREFIX)) continue;
        try { const event = JSON.parse(this.storage.getItem(key) ?? 'null'); if (validEv(event) && key === EVENT_PREFIX + event.id) loose.push(event); } catch { /* one torn event */ }
      }
      data.ledger = unionLedger(data.ledger, loose);
    } catch { /* storage may be blocked */ }
    return data;
  }
  private refresh(): EconomyData { this.local = mergeEconomy(this.read(), this.local); return this.local; }
  private observeLedger(): void {
    let max = 0;
    for (const event of this.refresh().ledger) if (event.lc > max) max = event.lc;
    this.clock.observe(max);
  }
  private publish(data: EconomyData): boolean {
    try {
      if (!this.storage) return false;
      this.storage.setItem(ECONOMY_KEY, JSON.stringify(data));
      this.local = data; this.unsaved = false;
      for (const cb of this.listeners) cb(data);
      return true;
    } catch { this.unsaved = true; return false; }
  }
  view(): EconomyData { return structuredClone(this.refresh()); }
  events(): LedgerEvent[] { return this.view().ledger; }
  balance(): number { return balance(this.refresh().ledger).balance; }
  owned(): Set<string> {
    return new Set(this.refresh().ledger.filter((e) => (e.kind === 'spend' && e.src === 'buy' || e.kind === 'grant' && (e.src === 'free' || e.src === 'gift')) && e.ref.startsWith('item:')).map((e) => e.ref.slice(5)));
  }
  pets(): Set<PetLine> { return new Set(this.refresh().ledger.filter((e) => e.kind === 'grant' && e.src === 'egg').map((e) => e.ref).filter((s): s is PetLine => s === 'rover' || s === 'dragon')); }
  growth(line: PetLine): number {
    return this.refresh().ledger.filter((e) => e.kind === 'spend' && e.src === 'feed' && e.ref.startsWith(`${line}:`)).reduce((n, e) => n + Number(e.ref.split(':')[2] ?? 0), 0);
  }
  unlocked(): Set<string> { return new Set(this.refresh().ledger.filter((e) => e.kind === 'grant' && e.src === 'unlock').map((e) => e.ref)); }
  getPet(key: string): string | null { return this.refresh().pet[key] ?? null; }
  setPet(key: string, value: string | null): boolean {
    return this.setPets({ [key]: value });
  }
  setPets(changes: Record<string, string | null>): boolean {
    if (Object.entries(changes).some(([key, value]) => key.length > 64 || value !== null && value.length > 64)) return false;
    const data = this.refresh(); Object.assign(data.pet, changes);
    return this.publish(data);
  }
  seen(id: string): boolean { return this.refresh().seen.includes(id); }
  markSeen(id: string): boolean { if (!ID_RE.test(id)) return false; const data = this.refresh(); data.seen = [...new Set([...data.seen, id])]; return this.publish(data); }
  onChange(cb: (data: EconomyData) => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  private add(event: LedgerEvent): LedgerEvent | null {
    if (!validEv(event)) return null;
    const data = this.refresh();
    const prior = data.ledger.find((e) => e.id === event.id);
    if (prior) return prior;
    try {
      if (!this.storage) return null;
      this.storage.setItem(EVENT_PREFIX + event.id, JSON.stringify(event));
      const saved = this.storage.getItem(EVENT_PREFIX + event.id);
      if (saved !== JSON.stringify(event)) return null;
    } catch { this.unsaved = true; return null; }
    data.ledger = unionLedger(data.ledger, [event]);
    this.publish(data);
    return event;
  }
  /** The caller owns the stable id. Replays return the original event and never pay again. */
  earn(src: 'mission.new' | 'check.run', o: { id: string; ref: string }): LedgerEvent | null {
    if (!ID_RE.test(o.id) || !o.id.startsWith(src === 'mission.new' ? 'mn:' : 'ck:')) return null;
    const amount = src === 'mission.new' ? catalog.mission : catalog.check;
    this.observeLedger();
    const stamp = this.clock.next();
    return this.add({ id: o.id, d: stamp.dev, lc: stamp.lc, ts: this.now(), kind: 'earn', amount, src, ref: o.ref });
  }
  grant(src: 'egg' | 'unlock' | 'free' | 'gift' | 'retro', ref: string): LedgerEvent | null {
    const id = src === 'egg' ? `egg:${ref}` : src === 'unlock' ? `u:${ref}` : src === 'gift' ? `g:${ref.replace(/^item:/, '')}` : src === 'retro' ? `retro:node:${ref}` : `u:free:${ref.replace(/^item:/, '')}`;
    if (!ID_RE.test(id)) return null;
    return this.add(natEvent(id, { kind: 'grant', amount: src === 'retro' ? catalog.retro : 0, src, ref }));
  }
  spend(src: 'buy' | 'feed' | 'fest', ref: string): LedgerEvent | null {
    let price: number | null = null; let actualRef = ref; let id: string | null = null;
    if (src === 'buy') {
      const item = ref.replace(/^item:/, ''); price = catalogPrice(item); actualRef = `item:${item}`; id = `b:${item}`;
      const prior = this.refresh().ledger.find((e) => e.id === id); if (prior) return prior;
      if (this.owned().has(item)) return null;
    }
    else if (src === 'feed') {
      const [line, foodId] = ref.split(':'); const f = food(foodId);
      if ((line !== 'rover' && line !== 'dragon') || !f || !this.pets().has(line)) return null;
      price = f.price; actualRef = `${line}:${foodId}:${Math.round(f.growth * (f.favorite === line ? 1.5 : 1))}`;
    } else { const fest = catalog.festivals.find((x) => x.id === ref); price = fest?.price ?? null; }
    if (price === null || price > this.balance()) return null;
    this.observeLedger();
    const stamp = this.clock.next(); id ??= `${stamp.dev}.${stamp.lc.toString(36)}`;
    return this.add({ id, d: stamp.dev, lc: stamp.lc, ts: this.now(), kind: 'spend', amount: price, src, ref: actualRef });
  }
  /** Crash recovery for awards persisted in the Mars mission save before this ledger write. */
  flush(pending: readonly PendingAward[]): string[] {
    const done: string[] = [];
    for (const p of pending) {
      const event = p.kind === 'earn' && (p.src === 'mission.new' || p.src === 'check.run') ? this.earn(p.src, { id: p.id, ref: p.ref }) : p.kind === 'grant' && (p.src === 'egg' || p.src === 'unlock' || p.src === 'free' || p.src === 'gift' || p.src === 'retro') ? this.grant(p.src, p.ref) : null;
      if (event?.id === p.id && event.amount === p.amount) done.push(p.id);
    }
    return done;
  }
  /** Remote events are applied at caller-chosen safe points (map, room or completed purchase). */
  merge(remote: EconomyData): boolean { return this.publish(mergeEconomy(this.refresh(), normalizeEconomy(remote))); }
}
