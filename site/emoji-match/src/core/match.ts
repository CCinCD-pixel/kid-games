/** match detection (core.mjs 1:1): findGroups, matchAt, colorConflict. */
import { BOMB, ORB, PIECE, PROP, RH, RV, type GameState, type Group } from './types';

type Board = Pick<GameState, 'W' | 'H' | 'N' | 'kind' | 'color'> & Partial<Pick<GameState, 'mask'>>;

export function colorConflict(st: GameState, i: number, col: number): boolean {
  const { W } = st; const r = (i / W) | 0, c = i % W;
  const same = (j: number) => st.mask[j] && st.kind[j] === PIECE && st.color[j] === col;
  if (c >= 2 && same(i - 1) && same(i - 2)) return true;
  if (r >= 2 && same(i - W) && same(i - 2 * W)) return true;
  if (r >= 1 && c >= 1 && same(i - 1) && same(i - W) && same(i - W - 1)) return true;
  return false;
}

interface Shape { cells: number[]; dir: 'H' | 'V' | 'S'; col: number }
type Run = { cells: number[]; dir: 'H' | 'V'; col: number };

export function findGroups(st: Board): Group[] {
  const { W, H, N, kind, color } = st;
  const shapes: Shape[] = [];
  for (let r = 0; r < H; r += 1) {
    let c = 0;
    while (c < W) {
      const i = r * W + c;
      if (kind[i] !== PIECE) { c += 1; continue; }
      const col = color[i]; let e = c + 1;
      while (e < W && kind[r * W + e] === PIECE && color[r * W + e] === col) e += 1;
      if (e - c >= 3) { const cells: number[] = []; for (let k = c; k < e; k += 1) cells.push(r * W + k); shapes.push({ cells, dir: 'H', col }); }
      c = e;
    }
  }
  for (let c = 0; c < W; c += 1) {
    let r = 0;
    while (r < H) {
      const i = r * W + c;
      if (kind[i] !== PIECE) { r += 1; continue; }
      const col = color[i]; let e = r + 1;
      while (e < H && kind[e * W + c] === PIECE && color[e * W + c] === col) e += 1;
      if (e - r >= 3) { const cells: number[] = []; for (let k = r; k < e; k += 1) cells.push(k * W + c); shapes.push({ cells, dir: 'V', col }); }
      r = e;
    }
  }
  for (let r = 0; r < H - 1; r += 1) for (let c = 0; c < W - 1; c += 1) {
    const i = r * W + c;
    if (kind[i] !== PIECE || kind[i + 1] !== PIECE || kind[i + W] !== PIECE || kind[i + W + 1] !== PIECE) continue;
    const col = color[i];
    if (color[i + 1] === col && color[i + W] === col && color[i + W + 1] === col) shapes.push({ cells: [i, i + 1, i + W, i + W + 1], dir: 'S', col });
  }
  if (!shapes.length) return [];
  const parent = new Int16Array(N).fill(-1);
  const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const s of shapes) {
    for (const i of s.cells) if (parent[i] < 0) parent[i] = i;
    const a = find(s.cells[0]);
    for (const i of s.cells) { const b = find(i); if (b !== a) parent[b] = a; }
  }
  const byRoot = new Map<number, { color: number; cellSet: Set<number>; runs: Run[]; squares: number[][] }>();
  for (const s of shapes) {
    const root = find(s.cells[0]);
    let g = byRoot.get(root);
    if (!g) { g = { color: s.col, cellSet: new Set(), runs: [], squares: [] }; byRoot.set(root, g); }
    for (const i of s.cells) g.cellSet.add(i);
    if (s.dir === 'S') g.squares.push(s.cells); else g.runs.push(s as Run);
  }
  const groups: Group[] = [];
  for (const g of byRoot.values()) {
    const cells = [...g.cellSet].sort((a, b) => a - b);
    let maxRun = 0, longest: Run | null = null;
    for (const run of g.runs) if (run.cells.length > maxRun) { maxRun = run.cells.length; longest = run; }
    const hCells = new Set<number>(), inter: number[] = [];
    for (const run of g.runs) if (run.dir === 'H') for (const i of run.cells) hCells.add(i);
    for (const run of g.runs) if (run.dir === 'V') for (const i of run.cells) if (hCells.has(i)) inter.push(i);
    let type = 0;
    if (maxRun >= 5) type = ORB;
    else if (inter.length) type = BOMB;
    else if (maxRun === 4) { type = longest!.dir === 'H' ? RH : RV; }
    else if (g.squares.length) type = PROP;
    groups.push({ color: g.color, cells, runs: g.runs, squares: g.squares, type, inter, longest });
  }
  return groups;
}

export function matchAt(st: GameState, i: number): boolean {
  if (st.kind[i] !== PIECE) return false;
  const { W, H, kind, color } = st; const col = color[i]; const r = (i / W) | 0, c = i % W;
  const same = (rr: number, cc: number) => rr >= 0 && rr < H && cc >= 0 && cc < W && kind[rr * W + cc] === PIECE && color[rr * W + cc] === col;
  let n = 1; for (let k = c - 1; same(r, k); k -= 1) n += 1; for (let k = c + 1; same(r, k); k += 1) n += 1;
  if (n >= 3) return true;
  n = 1; for (let k = r - 1; same(k, c); k -= 1) n += 1; for (let k = r + 1; same(k, c); k += 1) n += 1;
  if (n >= 3) return true;
  for (const [dr, dc] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
    const r0 = r + dr, c0 = c + dc;
    if (same(r0, c0) && same(r0, c0 + 1) && same(r0 + 1, c0) && same(r0 + 1, c0 + 1)) return true;
  }
  return false;
}
