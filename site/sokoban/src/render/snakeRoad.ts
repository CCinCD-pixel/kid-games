/**
 * The map's road on a phone held upright (QA fb1 r2). The kit's `nodeMap` spaces the nodes by arc
 * length along a sine; on a small, nearly square road box (iPhone SE: 296 × 252) that stacks them — a
 * star pill over the next number, 4/5 and 8/9 on top of each other. Phones in portrait get a winding
 * "snake" road instead: rows of evenly spaced stops climbing from the bottom, turning at the ends.
 * The grid is chosen from each node's real footprint (crate, star pill, tag, 小推) so no two touch.
 */

/** A node's extents from its centre (px): left, right, up, down — badges and 小推 included. */
export interface Foot {
  l: number;
  r: number;
  u: number;
  d: number;
}

export interface SnakeLayout {
  /** node centres in road-box px, node 0 first */
  pts: [number, number][];
  cols: number;
  rows: number;
  /** the smallest gap between two footprints (px; negative = they overlap) */
  clear: number;
}

export interface SnakeOptions {
  /** the most a row / a column may spread on a roomy box (a short road stays together) */
  maxPitchX?: number;
  maxPitchY?: number;
  /** most stops per row */
  maxCols?: number;
}

/** The smallest gap between any two footprints placed at `pts` (+∞ for one node). */
export function minClearance(pts: [number, number][], feet: Foot[]): number {
  let clear = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const a = feet[i], b = feet[j];
      const [ax, ay] = pts[i], [bx, by] = pts[j];
      const gx = Math.max(bx - b.l - (ax + a.r), ax - a.l - (bx + b.r));
      const gy = Math.max(by - b.u - (ay + a.d), ay - a.u - (by + b.d));
      clear = Math.min(clear, Math.max(gx, gy));
    }
  }
  return clear;
}

/**
 * Steps between neighbouring rows or columns: evenly spread when the widest need fits, else each
 * step its own need plus an even share of what is left (squeezed alike if even that does not fit).
 */
function steps(needs: number[], span: number, max: number): number[] {
  if (!needs.length) return [];
  const even = Math.min(max, span / needs.length);
  if (even >= Math.max(...needs)) return needs.map(() => even);
  const sum = needs.reduce((a, b) => a + b, 0);
  if (sum <= span) {
    const extra = (span - sum) / needs.length;
    return needs.map((v) => Math.max(v, Math.min(max, v + extra)));
  }
  return needs.map((v) => (v * span) / sum);
}

/**
 * Lay `feet.length` stops out in rows inside a `w × h` box: row 0 at the bottom running left → right,
 * the next one back right → left, and so on (a boustrophedon road). Rows and columns are spaced by
 * what actually meets there (a wide tag or a boss only widens its own row step). Every column count
 * is tried; the one leaving the widest gap between neighbours wins (the fewest columns on a tie: four
 * stops make a loop).
 */
export function snakeLayout(w: number, h: number, feet: Foot[], o: SnakeOptions = {}): SnakeLayout | null {
  const n = feet.length;
  if (!n || w <= 0 || h <= 0) return null;
  const maxX = o.maxPitchX ?? 124;
  const maxY = o.maxPitchY ?? 120;
  let best: SnakeLayout | null = null;
  for (let cols = 1; cols <= Math.min(n, o.maxCols ?? 6); cols += 1) {
    const rows = Math.ceil(n / cols);
    // a 1-column road of many stops is a ladder, not a road
    if (cols === 1 && n > 2) continue;
    const rc = feet.map((_, i): [number, number] => {
      const row = Math.floor(i / cols), k = i % cols;
      return [row, row % 2 === 0 ? k : cols - 1 - k];
    });
    // columns: margins from the end columns, steps from the neighbours within a row
    const inCol = (c: number) => feet.filter((_, i) => rc[i][1] === c);
    const L = Math.max(...inCol(0).map((f) => f.l));
    const R = Math.max(...inCol(cols - 1).map((f) => f.r));
    const needX = Array.from({ length: cols - 1 }, (_, c) => {
      let v = 0;
      feet.forEach((a, i) => feet.forEach((b, j) => {
        if (rc[i][0] === rc[j][0] && rc[i][1] === c && rc[j][1] === c + 1) v = Math.max(v, a.r + b.l);
      }));
      return v;
    });
    const spanX = w - L - R;
    if (spanX < 0) continue;
    const sx = steps(needX, spanX, maxX);
    const x0 = L + (spanX - sx.reduce((a, b) => a + b, 0)) / 2;
    const xs = [x0];
    for (const v of sx) xs.push(xs[xs.length - 1] + v);
    // rows: margins from the bottom / top rows, steps from the stops that meet across them
    const inRow = (r: number) => feet.filter((_, i) => rc[i][0] === r);
    const D = Math.max(...inRow(0).map((f) => f.d));
    const U = Math.max(...inRow(rows - 1).map((f) => f.u));
    const needY = Array.from({ length: rows - 1 }, (_, r) => {
      let v = 0;
      feet.forEach((a, i) => feet.forEach((b, j) => {
        if (rc[i][0] !== r || rc[j][0] !== r + 1) return;
        // a (below) and b (above) meet when they overlap sideways
        const gx = Math.abs(xs[rc[i][1]] - xs[rc[j][1]]) - (xs[rc[i][1]] < xs[rc[j][1]] ? a.r + b.l : a.l + b.r);
        if (gx < 0) v = Math.max(v, a.u + b.d);
      }));
      return v;
    });
    const spanY = h - U - D;
    if (spanY < 0) continue;
    const sy = steps(needY, spanY, maxY);
    const yb = h - D - (spanY - sy.reduce((a, b) => a + b, 0)) / 2;
    const ys = [yb];
    for (const v of sy) ys.push(ys[ys.length - 1] - v);
    const pts = rc.map(([r, c]): [number, number] => [xs[c], ys[r]]);
    const clear = minClearance(pts, feet);
    if (!best || clear > best.clear + 0.5) best = { pts, cols, rows, clear };
  }
  return best;
}

/**
 * The road through `pts` (all of them, or the first few for the travelled part): straight runs along
 * the rows and a rounded U-turn bulging out past the end stop between rows.
 */
export function snakePath(pts: [number, number][], bulge: number): string {
  if (!pts.length) return '';
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i += 1) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (Math.abs(ay - by) < 0.5) {
      d += `L${f(bx)} ${f(by)}`;
      continue;
    }
    // a row change: out past the end stop and back in (to the right on the right edge, else left)
    const prev = i >= 2 ? pts[i - 2][0] : ax;
    const out = prev < ax - 0.5 ? 1 : prev > ax + 0.5 ? -1 : bx >= ax ? 1 : -1;
    const k = bulge * 1.33;
    d += `C${f(ax + out * k)} ${f(ay)} ${f(bx + out * k)} ${f(by)} ${f(bx)} ${f(by)}`;
  }
  return d;
}

/** Footprint of a map node as drawn now (the node and its pills, tags, ribbon and 小推). */
export function measureFoot(b: HTMLElement): Foot {
  const r = b.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const f: Foot = { l: r.width / 2, r: r.width / 2, u: r.height / 2, d: r.height / 2 };
  for (const e of b.querySelectorAll<HTMLElement>('.sok-node__stars, .xg-node__stars, .sok-node__tag, .sok-node__legacy, .sok-node__ribbon, .xg-node__marker')) {
    if (!e.getClientRects().length || getComputedStyle(e).display === 'none') continue;
    const q = e.getBoundingClientRect();
    // 小推 floats up and down a little (xg-float)
    const lift = e.classList.contains('xg-node__marker') ? 4 : 0;
    f.l = Math.max(f.l, cx - q.left);
    f.r = Math.max(f.r, q.right - cx);
    f.u = Math.max(f.u, cy - q.top + lift);
    f.d = Math.max(f.d, q.bottom - cy);
  }
  return f;
}

/**
 * Re-lay the kit's road (`nodeMap` output inside `road`) as a snake road: moves the node buttons and
 * redraws the road's paths (the travelled part up to `cur`). Returns the layout, or null if the box
 * is empty.
 */
export function applySnakeRoad(road: HTMLElement, btns: HTMLElement[], cur: number, gap = 6): SnakeLayout | null {
  const w = road.clientWidth, h = road.clientHeight;
  // each footprint padded by half the wanted gap, so `clear` ≥ 0 means at least `gap` between two
  const feet = btns.map((b) => {
    const f = measureFoot(b);
    return { l: f.l + gap / 2, r: f.r + gap / 2, u: f.u + gap / 2, d: f.d + gap / 2 };
  });
  const lay = snakeLayout(w, h, feet);
  if (!lay) return null;
  lay.pts.forEach(([x, y], i) => {
    btns[i].style.left = `${x.toFixed(1)}px`;
    btns[i].style.top = `${y.toFixed(1)}px`;
  });
  // the U-turns use the side margin (never wider than half a row step)
  const side = Math.min(...feet.map((f) => Math.min(f.l, f.r)));
  const step = lay.rows > 1 ? Math.abs(lay.pts[0][1] - lay.pts[Math.min(lay.pts.length - 1, lay.cols)][1]) : 0;
  const bulge = Math.max(0, Math.min(side * 0.9, step * 0.5));
  const full = snakePath(lay.pts, bulge);
  const paths = road.querySelectorAll<SVGPathElement>('.xg-map__path path');
  paths.forEach((p, i) => {
    // the kit draws: shadow, road, dots, then the travelled dots (only when a stop past the first is reached)
    p.setAttribute('d', i < 3 ? full : snakePath(lay.pts.slice(0, Math.max(1, cur + 1)), bulge));
  });
  road.dataset.road = 'snake';
  return lay;
}
