import type { Rng } from '@kit/rng';

/** Rejection sampling with a hard cap (a generator that cannot satisfy its constraints must fail loudly, not loop). */
export function until<T>(make: () => T, ok: (x: T) => boolean, tries = 400): T {
  for (let i = 0; i < tries; i++) { const x = make(); if (ok(x)) return x; }
  throw new Error('generator could not satisfy its constraints');
}
export const between = (rng: Rng, lo: number, hi: number): number => rng.int(Math.min(lo, hi), Math.max(lo, hi));
/** All integers lo..hi. */
export const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
