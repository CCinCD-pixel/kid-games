/**
 * Seeded PRNG (mulberry32). Deterministic across browsers and Node, so level generators,
 * validators and replays agree. Never use Math.random() for anything a test or a parent might
 * want to reproduce.
 *
 *   const rng = createRng('mars-base:chapter1:42');
 *   rng.int(1, 6); rng.pick(['a', 'b']); rng.shuffle(list); const sub = rng.fork('enemies');
 */

export interface Rng {
  /** The numeric seed this generator started from. */
  readonly seed: number;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** true with probability p. */
  chance(p: number): boolean;
  /** One element (throws on an empty array). */
  pick<T>(items: readonly T[]): T;
  /** Weighted pick: weights >= 0, at least one > 0. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** A shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** An independent generator derived from this one's seed and a label (stable, order-independent). */
  fork(label: string | number): Rng;
  /** Internal state, for save/restore. */
  getState(): number;
  setState(state: number): void;
}

/** FNV-1a 32-bit hash of a string. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A fresh random 32-bit seed (crypto when available). */
export function randomSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] >>> 0;
  return (Math.random() * 0x100000000) >>> 0;
}

export function createRng(seed: number | string = randomSeed()): Rng {
  const seedNum = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  let state = seedNum;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    seed: seedNum,
    next,
    int(min, max) {
      if (max < min) throw new RangeError(`rng.int: max ${max} < min ${min}`);
      return min + Math.floor(next() * (Math.floor(max) - Math.ceil(min) + 1));
    },
    float(min, max) {
      return min + next() * (max - min);
    },
    chance(p) {
      return next() < p;
    },
    pick(items) {
      if (items.length === 0) throw new RangeError('rng.pick: empty array');
      return items[Math.floor(next() * items.length)];
    },
    weighted(items, weights) {
      if (items.length !== weights.length || items.length === 0) throw new RangeError('rng.weighted: items/weights mismatch');
      const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
      if (!(total > 0)) throw new RangeError('rng.weighted: all weights are zero');
      let r = next() * total;
      for (let i = 0; i < items.length; i += 1) {
        r -= Math.max(0, weights[i]);
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    fork(label) {
      return createRng(hashString(`${seedNum}:${label}`));
    },
    getState() {
      return state;
    },
    setState(s) {
      state = s >>> 0;
    },
  };
  return rng;
}
