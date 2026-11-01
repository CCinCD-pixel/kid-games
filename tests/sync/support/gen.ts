// gen.ts — seeded RNG and random wire-state generation for the property tests (no fast-check; zero new dependencies).
// Values use REAL magnitudes (epoch-ms 1.79e12, 1e13, 2^52, slot counters 2.6e9), dotted/colon ids, a 100-char id, unknown enum tokens (passengers) and null.
import type { Rule, Stamp } from '@kit/sync/rules';
import type { WireState } from '@kit/sync/merge';

export type Rng = () => number;
export function rng(seed: number): Rng { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const pick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
export const int = (r: Rng, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'orbit.O1.0', 'first:mars-base:x'];
const POOL = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'orbit.O1.0', 'first:mars-base:orbit.O1.1', 'x'.repeat(100)];
const DEVS = ['A', 'B', 'C'];
export const T = 1792400000000;
const NUMS = (r: Rng): number => pick<() => number>(r, [() => int(r, 0, 12), () => int(r, 0, 12), () => T + int(r, 0, 9), () => 1e13 + int(r, 0, 9), () => 2 ** 52 + int(r, 0, 9)])();
type Stamps = Record<string, Stamp>;
// random value for a rule; `st` receives lww stamps (value is a pure function of its stamp when consistent=true)
export function genValue(rule: Rule, r: Rng, path: string, st: Stamps, consistent: boolean): any {
  const opt = <V>(v: V): V | undefined => (r() < 0.15 ? undefined : v);
  switch (rule.k) {
    case 'max': case 'min': return opt(r() < 0.1 ? pick(r, ['2026-10-01', '2026-10-05', '2026-10-09']) : NUMS(r));
    case 'or': return opt(r() < 0.5);
    case 'sum': return opt(Object.fromEntries(DEVS.slice(0, int(r, 0, 3)).map((d) => [d, pick<() => number>(r, [() => int(r, 0, 9), () => int(r, 0, 9), () => 2.6e9 + int(r, 0, 9), () => 2 ** 39 + int(r, 0, 9)])()])));
    case 'set': return opt([...new Set(Array.from({ length: int(r, 0, 5) }, () => pick(r, POOL)))]);
    case 'rank': return opt(r() < 0.07 ? pick(r, ['zz-new-token', 'aa-new-token']) : pick(r, rule.order));
    case 'longer': return opt(Array.from({ length: int(r, 0, 4) }, () => int(r, 0, 3)));
    case 'maxArr': return opt(Array.from({ length: int(r, 1, 4) }, () => int(r, 0, 9)));
    case 'any': return opt(pick<unknown>(r, [1, 2, 'x', 'y', true, null, { q: 1 }, { q: 2, w: 1 }, [1, 2], 9, 10, 9.5]));
    case 'pick': return opt({ state: pick(r, ['none', 'half', 'lit']), attempts: int(r, 0, 3), z: int(r, 0, 2) });
    case 'lww': {
      if (r() < 0.15) return undefined; const stamp: Stamp = [int(r, 0, 6), pick(r, DEVS)];
      const v = consistent ? `v${stamp[0]}${stamp[1]}${path.length % 3}` : pick<unknown>(r, ['v1', 'v2', 'v3', 1, true, null, { k: 1 }]);
      st[path] = stamp; return v;
    }
    case 'ring': return opt(Array.from({ length: int(r, 0, 5) }, () => (rule.gen as (r: Rng) => unknown)(r)));
    case 'fifo': return opt(Object.fromEntries(Array.from({ length: int(r, 0, 6) }, () => [pick(r, POOL), int(r, 0, 40)])));
    case 'local': return undefined;
    case 'obj': case 'gv': {
      const o: Record<string, unknown> = {}; const names = Object.keys(rule.fields);
      for (const k of names) { const v = rule.k === 'gv' && k === 'g' ? (r() < 0.2 ? undefined : int(r, 0, 2)) : genValue(rule.fields[k]!, r, path + '/' + k, st, consistent); if (v !== undefined) o[k] = v; }
      if (r() < 0.1) o.extra = pick<unknown>(r, [1, 'z', { u: 1 }]);
      return o;
    }
    case 'map': {
      const o: Record<string, unknown> = {}; for (const k of KEYS.slice(0, int(r, 0, 4))) { const v = genValue(rule.of, r, path + '/' + k, st, consistent); if (v !== undefined) o[k] = v; }
      return o;
    }
  }
  return undefined;
}
export function genState(rule: Rule, r: Rng, consistent = true): WireState {
  const st: Stamps = {}; const d = genValue(rule, r, '', st, consistent);
  const g: Stamp | undefined = r() < 0.22 ? [int(r, 1, 3), pick(r, DEVS)] : undefined;      // slot generation (a reset happened somewhere)
  return g ? { d, st, g } : { d, st };
}
