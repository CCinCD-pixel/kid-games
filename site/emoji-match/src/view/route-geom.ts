/**
 * The S1 route's serpentine geometry (spec §2.4), shared by the route screen and the v1 ending (§5.4),
 * so the ending pulls the camera back over exactly the route the child knows. Stops never overlap
 * (stop = 112×136 incl. label): portrait 3×3 bottom → top, landscape 5 + 4; rows alternate direction
 * and the middle of each row lifts a little (an arc).
 */
export interface RoutePt { x: number; y: number; row: number }
export function routeGeom(W: number, H: number, T: number, B: number, land: boolean, o: { bottom?: number; top?: number } = {}): { pts: RoutePt[]; rows: number[]; path: (n?: number) => string } {
  const rows = land ? [5, 4] : [3, 3, 3];
  // narrow: 继续 sits above 机库/自由星海
  const yBot = H - B - (o.bottom ?? (land ? 236 : W < 600 ? 306 : 270)), yTop = T + (o.top ?? (land ? 290 : 230));
  const pts: RoutePt[] = [];
  rows.forEach((n, r) => {
    const y = rows.length === 1 ? yBot : yBot - (r * (yBot - yTop)) / (rows.length - 1);
    for (let j = 0; j < n; j += 1) {
      const f = land ? (j + (r % 2 ? 0.5 : 0)) / 4 : j / (n - 1);
      const fx = r % 2 ? 1 - f : f;
      const x = land ? W * 0.1 + fx * W * 0.8 : W * 0.19 + fx * W * 0.62;
      const lift = Math.sin(((j + (r % 2 && land ? 0.5 : 0)) / Math.max(1, n - 1)) * Math.PI) * (land ? 26 : 34);
      pts.push({ x, y: y - lift, row: r });
    }
  });
  const path = (n = pts.length) => {
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let k = 1; k < Math.min(n, pts.length); k += 1) {
      const a = pts[k - 1], b = pts[k];
      if (a.row === b.row) d += `C${(a.x + b.x) / 2} ${a.y} ${(a.x + b.x) / 2} ${b.y} ${b.x} ${b.y}`;
      else { const out = a.x > W / 2 ? 110 : -110; d += `C${a.x + out} ${a.y} ${b.x + out} ${b.y} ${b.x} ${b.y}`; }
    }
    return d;
  };
  return { pts, rows, path };
}
