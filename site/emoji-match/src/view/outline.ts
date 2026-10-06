/**
 * Board outline (spec §6.6): trace the mask's boundary edges into closed loops (outer contour
 * clockwise, holes counter-clockwise), drop collinear vertices, and build a rounded Path2D.
 * Used for the rim stroke and the panel fill, so irregular boards and voids get a clean contour.
 */
export function outlineLoops(mask: Uint8Array, W: number, H: number): [number, number][][] {
  const on = (c: number, r: number) => c >= 0 && r >= 0 && c < W && r < H && mask[r * W + c] === 1;
  // directed edges with the cell on the right-hand side (screen coords, y down → clockwise outer loops)
  const next = new Map<string, [number, number][]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => { const k = `${x0},${y0}`; const l = next.get(k) ?? []; l.push([x1, y1]); next.set(k, l); };
  for (let r = 0; r < H; r += 1) for (let c = 0; c < W; c += 1) {
    if (!on(c, r)) continue;
    if (!on(c, r - 1)) add(c, r, c + 1, r);
    if (!on(c + 1, r)) add(c + 1, r, c + 1, r + 1);
    if (!on(c, r + 1)) add(c + 1, r + 1, c, r + 1);
    if (!on(c - 1, r)) add(c, r + 1, c, r);
  }
  const loops: [number, number][][] = [];
  for (;;) {
    const startKey = [...next.keys()].find((k) => (next.get(k)?.length ?? 0) > 0);
    if (!startKey) break;
    const [sx, sy] = startKey.split(',').map(Number);
    const loop: [number, number][] = [[sx, sy]];
    let cx = sx, cy = sy, px = sx, py = sy - 1;
    for (let guard = 0; guard < 10000; guard += 1) {
      const outs = next.get(`${cx},${cy}`)!;
      // at a pinch point prefer the right turn (keeps diagonal cells as separate corners)
      let pick = 0;
      if (outs.length > 1) {
        const dx = cx - px, dy = cy - py;
        pick = outs.findIndex(([nx, ny]) => (nx - cx) * dy - (ny - cy) * dx < 0);
        if (pick < 0) pick = 0;
      }
      const [nx, ny] = outs.splice(pick, 1)[0];
      if (!outs.length) next.delete(`${cx},${cy}`);
      px = cx; py = cy; cx = nx; cy = ny;
      if (cx === sx && cy === sy) break;
      loop.push([cx, cy]);
    }
    // drop collinear points
    const simp = loop.filter((p, i) => {
      const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
      return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
    });
    loops.push(simp);
  }
  return loops;
}

/** rounded path through the loops, scaled to px: x = ox + gx * cell */
export function roundedPath(loops: [number, number][][], cell: number, ox: number, oy: number, radius: number): Path2D {
  const p = new Path2D();
  for (const loop of loops) {
    const n = loop.length;
    const P = (i: number) => { const q = loop[(i + n) % n]; return [ox + q[0] * cell, oy + q[1] * cell] as const; };
    const m0 = P(0), m1 = P(1);
    p.moveTo((m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2);
    for (let i = 1; i <= n; i += 1) {
      const a = P(i), b = P(i + 1);
      p.arcTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, radius);
    }
    p.closePath();
  }
  return p;
}
