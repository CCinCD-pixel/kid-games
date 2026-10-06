/**
 * Engine random streams. Bit-identical to kit/rng.ts createRng (mulberry32 + FNV-1a; asserted in
 * core.test.ts), but as plain {seed, s} records so cloneState can copy them cheaply for the bots
 * (spec §3.18, §8.1 "随机数用 @kit/rng（与原型逐位相同）").
 */
import { hashString } from '@kit/rng';
import type { RngState } from './types';

export { hashString };
export function rngNew(seed: number | string): RngState {
  const n = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return { seed: n, s: n };
}
export function rngFork(r: RngState, label: string): RngState { return rngNew(hashString(`${r.seed}:${label}`)); }
export function rngNext(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** == kit rng.int(0, n-1) */
export const rngBelow = (r: RngState, n: number): number => Math.floor(rngNext(r) * n);
export const rngClone = (r: RngState): RngState => ({ seed: r.seed, s: r.s });
