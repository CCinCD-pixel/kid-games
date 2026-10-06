/**
 * 陆战棋 board geometry (spec §3.2, R1). Pure, no DOM.
 *
 * Coordinates: x 0..4 (files a..e, left→right as seen by RED), y 0..11 (y = 0 is BLUE's back row,
 * y = 11 is RED's back row). index = y·5 + x. Notation "c4" = file c, row 12 − y (row 1 = RED back).
 * RED owns y 6..11 (front row y = 6 = row 6); BLUE owns y 0..5 (front row y = 5 = row 7).
 */

export const W = 5;
export const H = 12;
export const N = 60;
export const RED = 0;
export const BLUE = 1;
export type Side = 0 | 1;

export const idx = (x: number, y: number): number => y * W + x;
export const X = (i: number): number => i % W;
export const Y = (i: number): number => (i / W) | 0;
export const sq = (i: number): string => 'abcde'[X(i)] + (12 - Y(i));
export function parseSq(s: string): number {
  const x = 'abcde'.indexOf(s[0]);
  const row = parseInt(s.slice(1), 10);
  if (x < 0 || !(row >= 1 && row <= 12)) throw new Error(`bad square ${s}`);
  return idx(x, 12 - row);
}
/** which half (owner) a station belongs to */
export const half = (i: number): Side => (Y(i) >= 6 ? RED : BLUE);

export const KIND_STATION = 0;
export const KIND_CAMP = 1;
export const KIND_HQ = 2;
const CAMP_XY: ReadonlyArray<readonly [number, number]> = [[1, 7], [3, 7], [2, 8], [1, 9], [3, 9], [1, 4], [3, 4], [2, 3], [1, 2], [3, 2]];
const HQ_XY: ReadonlyArray<readonly [number, number]> = [[1, 11], [3, 11], [1, 0], [3, 0]];

export const kind = new Uint8Array(N);
for (const [x, y] of CAMP_XY) kind[idx(x, y)] = KIND_CAMP;
for (const [x, y] of HQ_XY) kind[idx(x, y)] = KIND_HQ;
export const isCamp = (i: number): boolean => kind[i] === KIND_CAMP;
export const isHQ = (i: number): boolean => kind[i] === KIND_HQ;
export function isRail(i: number): boolean {
  const x = X(i), y = Y(i);
  return y === 1 || y === 5 || y === 6 || y === 10 || ((x === 0 || x === 4) && y >= 1 && y <= 10);
}

/** Road graph: every drawn line (rails included), sorted ascending per station. */
export const adj: number[][] = Array.from({ length: N }, () => []);
/** Direction vectors; railNext[i][d] = next rail station in direction d or −1. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const railNext: Int8Array[] = Array.from({ length: N }, () => new Int8Array([-1, -1, -1, -1]));

function link(a: number, b: number): void {
  if (!adj[a].includes(b)) {
    adj[a].push(b);
    adj[b].push(a);
  }
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (x + 1 < W) link(i, idx(x + 1, y));
    if (y + 1 < H) {
      const sameHalf = y !== 5;
      if (sameHalf || x === 0 || x === 2 || x === 4) link(i, idx(x, y + 1)); // only 3 front-line crossings
    }
  }
}
for (const [x, y] of CAMP_XY) {
  for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    if ((ny >= 6) !== (y >= 6)) continue;
    link(idx(x, y), idx(nx, ny));
  }
}
for (let i = 0; i < N; i++) adj[i].sort((a, b) => a - b);

/** adjacency as a bitset-ish lookup for hot paths */
const ADJ_SET: Uint8Array = new Uint8Array(N * N);
for (let i = 0; i < N; i++) for (const j of adj[i]) ADJ_SET[i * N + j] = 1;
export const isAdj = (a: number, b: number): boolean => ADJ_SET[a * N + b] === 1;

export const isRailEdge = (a: number, b: number): boolean =>
  isRail(a) && isRail(b) && isAdj(a, b) && (X(a) === X(b) || Y(a) === Y(b));

for (let i = 0; i < N; i++) {
  DIRS.forEach(([dx, dy], d) => {
    const x = X(i) + dx, y = Y(i) + dy;
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const j = idx(x, y);
    if (isRailEdge(i, j)) railNext[i][d] = j;
  });
}

/** All drawn lines as [a, b] with a < b (for the board renderer). */
export function edges(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) for (const j of adj[i]) if (j > i) out.push([i, j]);
  return out;
}

/** True when the edge crosses the mountain band (the three crossings a/c/e 6–7). */
export const isCrossing = (a: number, b: number): boolean => half(a) !== half(b);

// ---- owner-perspective deployment slots: r = 1 (front) .. 6 (back), c = 1 (owner's left) .. 5
export function slotToIndex(side: Side, r: number, c: number): number {
  return side === RED ? idx(c - 1, 5 + r) : idx(5 - c, 6 - r);
}
export function indexToSlot(i: number): { side: Side; r: number; c: number } {
  const side = half(i);
  return side === RED ? { side, r: Y(i) - 5, c: X(i) + 1 } : { side, r: 6 - Y(i), c: 5 - X(i) };
}
/** Deployment slot order (25 per side): front → back, owner-left → right, camps skipped. */
export const SLOTS: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (let r = 1; r <= 6; r++) {
    for (let c = 1; c <= 5; c++) {
      if (kind[slotToIndex(RED, r, c)] === KIND_CAMP) continue;
      out.push([r, c]);
    }
  }
  return out;
})();
/** station index of layout slot k for a side */
export const slotStation = (side: Side, k: number): number => slotToIndex(side, SLOTS[k][0], SLOTS[k][1]);
/** layout slot k of a station (−1 for camps) */
export function stationSlot(i: number): number {
  const { r, c } = indexToSlot(i);
  return SLOTS.findIndex(([rr, cc]) => rr === r && cc === c);
}

/** Left-right mirror of a station (x → 4 − x). */
export const mirrorSq = (i: number): number => idx(4 - X(i), Y(i));

/** Board distance in road steps ignoring pieces (BFS over adj), precomputed. */
export const ROAD_DIST: Uint8Array = (() => {
  const d = new Uint8Array(N * N).fill(255);
  for (let s = 0; s < N; s++) {
    d[s * N + s] = 0;
    const q = [s];
    while (q.length) {
      const c = q.shift()!;
      for (const n of adj[c]) {
        if (d[s * N + n] !== 255) continue;
        d[s * N + n] = d[s * N + c] + 1;
        q.push(n);
      }
    }
  }
  return d;
})();
export const roadDist = (a: number, b: number): number => ROAD_DIST[a * N + b];
