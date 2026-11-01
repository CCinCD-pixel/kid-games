// replica.ts — the client-side sync step for ONE slot as the kit will do it (stamp by diff -> toWire -> merge -> fromWire -> overlay), without the network/disk model
// (S4/S5 add those). Bound to a merge implementation so the SAME suites can run against the real engine and against mutated engines.
import type { Rule, Stamp } from '@kit/sync/rules';
import type * as Merge from '@kit/sync/merge';

export type MergeImpl = typeof Merge;
const clone = <T>(x: T): T => (x === undefined ? undefined as T : JSON.parse(JSON.stringify(x)));

export function bind(M: MergeImpl) {
  const { merge, strip, overlay, lwwPaths, toWire, fromWire, newCtx, canon, cmpStamp, emptyState } = M;
  class Server1 { state: any = emptyState(); puts = 0; get(): any { return clone(this.state); } put(m: any): void { this.state = clone(m); this.puts++; } }   // state carries lc (max Lamport counter seen by the writer)
  class Replica {
    rule: Rule; dev: string; data: any; lc: number; stamps: Record<string, Stamp> = {}; g: Stamp | undefined = undefined; ctx; seen: Record<string, string>;
    constructor(rule: Rule, dev: string, data: unknown, baseline?: unknown, lc0 = 0) { this.rule = rule; this.dev = dev; this.data = clone(data); this.lc = lc0; this.ctx = newCtx(dev, () => ++this.lc); this.seen = this.hashes(baseline ?? data); }
    hashes(d: unknown): Record<string, string> { return Object.fromEntries(Object.entries(lwwPaths(this.rule, strip(this.rule, d))).map(([k, v]) => [k, canon(v)])); }
    touch(): void { for (const [k, v] of Object.entries(lwwPaths(this.rule, strip(this.rule, this.data)))) { const h = canon(v); if (this.seen[k] !== h) { this.stamps[k] = [++this.lc, this.dev]; this.seen[k] = h; } } }
    wire(): any { this.touch(); return { d: toWire(this.rule, strip(this.rule, this.data), this.ctx), st: clone(this.stamps), ...(this.g ? { g: this.g } : {}) }; }
    seeLc(x: unknown): void { if (Number.isInteger(x) && (x as number) > this.lc) this.lc = x as number; }
    absorb(m: any): void { const replace = cmpStamp(m.g ?? [0, ''], this.g ?? [0, '']) > 0; this.data = overlay(this.rule, this.data, fromWire(this.rule, m.d, this.ctx), { replace }); this.stamps = clone(m.st); this.g = m.g; this.seen = this.hashes(this.data); }
    sync(server: Server1): any { const remote = server.get(); this.seeLc(remote.lc); const m = merge(this.rule, this.wire(), remote); const before = canon({ d: remote.d, st: remote.st, g: remote.g }); this.absorb(m); if (canon({ d: m.d, st: m.st, g: m.g }) !== before) server.put({ ...m, lc: this.lc }); return m; }
    // the BROWSER cleared the game key (not a game reset): fresh-join semantics — defaults are the baseline (unchanged defaults must not be stamped as edits), revision/stamps forgotten, generation + sum slots kept
    clearKey(defaults: unknown): void { this.data = clone(defaults); this.stamps = {}; this.seen = this.hashes(defaults); }
    // reset of the whole slot (the game's 重置本游戏进度 / store.reset()): bump the slot generation, replace the data with defaults, keep X fields
    reset(defaults: unknown): void { this.g = [++this.lc, this.dev]; this.data = overlay(this.rule, this.data, strip(this.rule, clone(defaults)), { replace: true }); this.stamps = {}; this.ctx.slots = {}; this.ctx.ords = {}; this.seen = this.hashes(defaults); }
  }
  return { Server1, Replica };
}
