// Exact pool size (distinct admissible stimuli) for s1 (g <= 5) and every s4 mirror row, by enumeration. Tells us whether the no-repeat window
// W = min(64, pool/3) is affordable at each D; stats.mjs estimates the same number from collisions (effPool) for the rows too big to enumerate.
import { TABLE } from './params.mjs';
import { components8, symmetries, isCollinear, hamming, halfOf, halfImages } from './grid.mjs';
function* subsets(arr, n, start = 0, cur = []) { if (cur.length === n) { yield cur.slice(); return; } for (let i = start; i <= arr.length - (n - cur.length); i += 1) { cur.push(arr[i]); yield* subsets(arr, n, i + 1, cur); cur.pop(); } }
const bboxOk = (g, cells) => { const rs = cells.map((i) => Math.floor(i / g)), cs = cells.map((i) => i % g); return Math.max(...rs) - Math.min(...rs) >= 1 && Math.max(...cs) - Math.min(...cs) >= 1; };
export function poolSize(sector, row) {
  let count = 0; const g = row.g;
  if (sector === 's1') {
    for (const cells of subsets([...Array(g * g).keys()], row.n)) { if (components8(g, cells).length !== row.k || symmetries(g, cells).length || (row.n >= 4 && isCollinear(g, cells))) continue; count += 1; }
    return count;
  }
  for (const axis of row.axes) for (const side of [0, 1]) for (const cells of subsets(halfOf(g, axis, side), row.n)) {
    const k = components8(g, cells).length; if (k < row.kLo || k > Math.min(row.kHi, row.n)) continue;
    if (row.n >= 3 && (isCollinear(g, cells) || !bboxOk(g, cells))) continue;
    const im = halfImages(g, axis, side, cells); if (hamming(im.copy, im.target) < 4 || [im.flip, im.rot].some((w) => hamming(w, im.target) < 2)) continue;
    count += 1;
  }
  return count;
}
if (process.argv[1].endsWith('pool.mjs')) {
  for (const s of ['s1', 's4']) for (const r of TABLE[s]) if ((s === 's1' && r.g <= 5) || (s === 's4' && r.g * r.g / 2 <= 18 && r.n <= 6)) console.log(s, 'D' + r.D, `${r.g}x${r.g} n${r.n}`, 'pool', poolSize(s, r));
}
