// core/rng.ts — mulberry32 + hash32。与 @kit/rng 的 createRng 同算法（rng.test.ts 对 100 个种子做向量比对）。core/ 不得 import kit / DOM，所以这里是独立的小实现。
import type { Rng } from './types';

/** 32 位混合哈希（FNV-1a 起手 + murmur 终混）：Worker 里每个 move 请求的种子 = hash32(gameSeed, ply, fenHash)。 */
export function hash32(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h ^= x | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** mulberry32；序列与 kit/rng.ts createRng(number).next() 逐位相同。 */
export function createRng(seed: number): Rng & { getState(): number; setState(s: number): void } {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState: () => state,
    setState: (s: number) => { state = s >>> 0; },
  };
}

/** 局面哈希对 (lo,hi) → 一个 32 位数（种子里的 fenHash） */
export const keyHash = (k: readonly [number, number]): number => hash32(k[0], k[1]);
