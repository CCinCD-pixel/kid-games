// Port of kit/rng.ts (FNV-1a hash + mulberry32). Same seed => same stream in the page, vitest and these tools.
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function createRng(seed) {
  const seedNum = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  let state = seedNum;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    seed: seedNum, next,
    int: (a, b) => a + Math.floor(next() * (Math.floor(b) - Math.ceil(a) + 1)),
    float: (a, b) => a + next() * (b - a),
    chance: (p) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    shuffle(xs) { const o = xs.slice(); for (let i = o.length - 1; i > 0; i -= 1) { const j = Math.floor(next() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; },
    gauss() { let u = 0; while (u === 0) u = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next()); },
    fork: (label) => createRng(hashString(`${seedNum}:${label}`)),
  };
  return rng;
}
