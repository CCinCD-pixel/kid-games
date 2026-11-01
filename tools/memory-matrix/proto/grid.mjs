// Square-grid helpers. A pattern = sorted array of cell indices i = r*g + c. D4 = the 8 symmetries of the square.
export const OPS = {
  id: (g, r, c) => [r, c],
  LR: (g, r, c) => [r, g - 1 - c],        // mirror left<->right
  UD: (g, r, c) => [g - 1 - r, c],        // mirror up<->down
  CW: (g, r, c) => [c, g - 1 - r],        // rotate 90 deg clockwise
  CCW: (g, r, c) => [g - 1 - c, r],       // rotate 90 deg counter-clockwise
  R180: (g, r, c) => [g - 1 - r, g - 1 - c],
  DG: (g, r, c) => [c, r],                // mirror across the main diagonal (fold along the diagonal)
  AD: (g, r, c) => [g - 1 - c, g - 1 - r],
};
export const NON_ID = ['LR', 'UD', 'CW', 'CCW', 'R180', 'DG', 'AD'];
export const apply = (op, g, cells) => cells.map((i) => { const [r, c] = OPS[op](g, Math.floor(i / g), i % g); return r * g + c; }).sort((a, b) => a - b);
export const sameSet = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export const hamming = (a, b) => { const A = new Set(a); let common = 0; for (const x of b) if (A.has(x)) common += 1; return a.length + b.length - 2 * common; };
/** 8-connected components: sizes array (sorted desc). */
export function components8(g, cells) {
  const S = new Set(cells), seen = new Set(), sizes = [];
  for (const s of cells) {
    if (seen.has(s)) continue;
    let size = 0; const q = [s]; seen.add(s);
    while (q.length) {
      const i = q.pop(); size += 1; const r = Math.floor(i / g), c = i % g;
      for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
        if (!dr && !dc) continue; const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= g || cc >= g) continue;
        const j = rr * g + cc; if (S.has(j) && !seen.has(j)) { seen.add(j); q.push(j); }
      }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}
/** Which non-identity symmetries map the set onto itself. */
export const symmetries = (g, cells) => NON_ID.filter((op) => sameSet(apply(op, g, cells), cells));
/** Canonical key: identical for a pattern and any of its 8 rotated / mirrored copies. */
export function canon(g, cells) {
  let best = null;
  for (const op of ['id', ...NON_ID]) { const k = apply(op, g, cells).join(','); if (best === null || k < best) best = k; }
  return `${g}:${best}`;
}
// ---- mirror board (spec 3.5): ONE g x g board, a mirror strip through the middle. Source stars in one half, answer = their reflections in the other half.
export const halfOf = (g, axis, side) => { const h = g / 2, out = []; for (let r = 0; r < g; r += 1) for (let c = 0; c < g; c += 1) { const k = axis === 'LR' ? c : r; if ((side === 0 ? k < h : k >= h)) out.push(r * g + c); } return out; };
/** The reflection (correct answer) and the three typical WRONG answers, all inside the answer half: copy = slid across without flipping (平移),
 *  flip = slid and flipped along the mirror (翻错了方向), rot = turned half a turn about the board centre. */
export function halfImages(g, axis, side, cells) {
  const h = g / 2, sh = side === 0 ? h : -h, mp = (f) => cells.map((i) => { const [r, c] = f(Math.floor(i / g), i % g); return r * g + c; }).sort((a, b) => a - b);
  if (axis === 'LR') return { target: mp((r, c) => [r, g - 1 - c]), copy: mp((r, c) => [r, c + sh]), flip: mp((r, c) => [g - 1 - r, c + sh]), rot: mp((r, c) => [g - 1 - r, g - 1 - c]) };
  return { target: mp((r, c) => [g - 1 - r, c]), copy: mp((r, c) => [r + sh, c]), flip: mp((r, c) => [r + sh, g - 1 - c]), rot: mp((r, c) => [g - 1 - r, g - 1 - c]) };
}
export const isCollinear = (g, cells) => cells.every((i) => Math.floor(i / g) === Math.floor(cells[0] / g)) || cells.every((i) => i % g === cells[0] % g);
/** Two rolling windows: exact keys (W=64, what the page also persists as hashes) and shape keys (Ws=6: the same shape,
 *  rotated or mirrored, is not shown again within 6 rounds). */
export function makeHistory(W = 64, Ws = 6) {
  const mk = (cap) => { const q = [], set = new Map(); return { has: (k) => set.has(k), push(k) { q.push(k); set.set(k, (set.get(k) || 0) + 1); if (q.length > cap) { const o = q.shift(); const c = set.get(o) - 1; if (c) set.set(o, c); else set.delete(o); } } }; };
  const a = mk(W), b = mk(Ws);
  return { has: (k) => a.has(k), hasShape: (k) => b.has(k), push(k, shape) { a.push(k); if (shape !== undefined) b.push(shape); } };
}
