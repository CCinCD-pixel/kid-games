import { DEV_RE, MAX_LC } from './sync/contract';
import { lcSeed } from './sync/ledger';

export const CLOCK_KEY = 'kg:clock:v1';
export interface ClockState { dev: string; lc: number }

function read(storage: Storage | undefined): ClockState | null {
  try {
    const value = JSON.parse(storage?.getItem(CLOCK_KEY) ?? 'null') as ClockState | null;
    return value && DEV_RE.test(value.dev) && Number.isSafeInteger(value.lc) && value.lc >= 0 && value.lc <= MAX_LC ? value : null;
  } catch { return null; }
}

function newDevice(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
}

/** A device keeps its id across reloads. The wall clock seeds a new install once, then never orders events. */
export class DeviceClock {
  private state: ClockState;
  private storage: Storage | undefined;
  constructor(opts: { storage?: Storage; now?: () => number; device?: () => string } = {}) {
    try { this.storage = opts.storage ?? globalThis.localStorage; } catch { this.storage = undefined; }
    const dev = opts.device?.() ?? newDevice();
    if (!DEV_RE.test(dev)) throw new Error('clock: invalid device id');
    this.state = read(this.storage) ?? { dev, lc: lcSeed((opts.now ?? Date.now)()) };
    this.write();
  }
  get device(): string { return this.state.dev; }
  get counter(): number { return this.state.lc; }
  /** Merge the counter most recently written by another tab before issuing a new stamp. */
  next(seen = 0): ClockState {
    const disk = read(this.storage);
    if (disk && disk.dev === this.state.dev) this.state.lc = Math.max(this.state.lc, disk.lc);
    const lc = Math.max(this.state.lc, seen) + 1;
    if (!Number.isSafeInteger(lc) || lc > MAX_LC) throw new Error('clock: counter exhausted');
    this.state = { dev: this.state.dev, lc };
    this.write();
    return { ...this.state };
  }
  observe(lc: number): void {
    if (!Number.isSafeInteger(lc) || lc < 0 || lc > MAX_LC) return;
    if (lc > this.state.lc) { this.state.lc = lc; this.write(); }
  }
  private write(): void { try { this.storage?.setItem(CLOCK_KEY, JSON.stringify(this.state)); } catch { /* the in-memory counter still advances */ } }
}
