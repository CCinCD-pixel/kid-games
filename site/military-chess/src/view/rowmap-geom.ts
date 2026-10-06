/** Pure geometry of the serpentine lesson map (view/rowmap.ts) — testable without a DOM. */
export type P = [number, number];

/** node centres: rows of equal spacing, alternating direction, a slight stagger inside each row */
export function rowPoints(w: number, h: number, n: number, o: { pad?: number; above?: number; below?: number } = {}): { pts: P[]; rows: number; cols: number } {
  const rows = n <= 4 ? 2 : 3;
  const cols = Math.ceil(n / rows);
  const padX = o.pad ?? 76;
  // margins include the in-row stagger (−12 / +6) so badges, stars and name pills stay in the box
  const top = (o.above ?? 40) + 48 + 12, bottom = (o.below ?? 60) + 48 + 6;
  const gapY = rows > 1 ? (h - top - bottom) / (rows - 1) : 0;
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const k = i % cols;
    const c = r % 2 === 0 ? k : cols - 1 - k;
    const x = cols > 1 ? padX + (c * (w - 2 * padX)) / (cols - 1) : w / 2;
    const y = top + r * gapY + (c % 2 === 1 ? -12 : 6);
    pts.push([x, y]);
  }
  return { pts, rows, cols };
}
