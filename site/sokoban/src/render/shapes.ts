/**
 * Shape library (spec §6.1): every board shape is SVG path data in a 100-unit cell space, turned
 * into Path2D once and drawn with ctx.scale(s/100). The same strings render the DOM SVG (map
 * nodes, styleboard export, hangar). One shape = one definition.
 */

const cache = new Map<string, Path2D>();

/** Cached Path2D for an SVG path string. */
export function P(d: string): Path2D {
  let p = cache.get(d);
  if (!p) {
    p = new Path2D(d);
    cache.set(d, p);
  }
  return p;
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** Rounded rectangle with per-corner radii [tl, tr, br, bl]. */
export function rrect(x: number, y: number, w: number, h: number, r: number | [number, number, number, number]): string {
  const [tl, tr, br, bl] = typeof r === 'number' ? [r, r, r, r] : r;
  return `M${f(x + tl)} ${f(y)}H${f(x + w - tr)}${tr ? `A${f(tr)} ${f(tr)} 0 0 1 ${f(x + w)} ${f(y + tr)}` : ''}V${f(y + h - br)}${br ? `A${f(br)} ${f(br)} 0 0 1 ${f(x + w - br)} ${f(y + h)}` : ''}H${f(x + bl)}${bl ? `A${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + h - bl)}` : ''}V${f(y + tl)}${tl ? `A${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}` : ''}Z`;
}

export function circle(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
}

/** Five-point star centred at (cx, cy), outer radius r, softly rounded tips. */
export function star(cx: number, cy: number, r: number, inner = 0.48): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  // rounded joins: quadratic through each vertex
  let d = '';
  for (let i = 0; i < 10; i += 1) {
    const [x, y] = pts[i];
    const [px, py] = pts[(i + 9) % 10];
    const [nx, ny] = pts[(i + 1) % 10];
    const k = i % 2 === 0 ? 0.16 : 0.08;
    const ax = x + (px - x) * k;
    const ay = y + (py - y) * k;
    const bx = x + (nx - x) * k;
    const by = y + (ny - y) * k;
    d += `${i ? 'L' : 'M'}${f(ax)} ${f(ay)}Q${f(x)} ${f(y)} ${f(bx)} ${f(by)}`;
  }
  return d + 'Z';
}

export function triangle(cx: number, cy: number, r: number): string {
  return `M${f(cx)} ${f(cy - r)}L${f(cx + r * 0.95)} ${f(cy + r * 0.7)}L${f(cx - r * 0.95)} ${f(cy + r * 0.7)}Z`;
}

export function diamond(cx: number, cy: number, r: number): string {
  return `M${f(cx)} ${f(cy - r)}L${f(cx + r * 0.8)} ${f(cy)}L${f(cx)} ${f(cy + r)}L${f(cx - r * 0.8)} ${f(cy)}Z`;
}

export function symbolPath(kind: 'star' | 'circle' | 'triangle' | 'square' | 'diamond', cx: number, cy: number, r: number): string {
  switch (kind) {
    case 'star': return star(cx, cy, r);
    case 'circle': return circle(cx, cy, r * 0.82);
    case 'triangle': return triangle(cx, cy, r);
    case 'square': return rrect(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5, r * 0.2);
    default: return diamond(cx, cy, r);
  }
}

/** A check mark stroke path (draw with stroke). */
export function check(cx: number, cy: number, r: number): string {
  return `M${f(cx - r * 0.75)} ${f(cy + r * 0.02)}L${f(cx - r * 0.2)} ${f(cy + r * 0.55)}L${f(cx + r * 0.8)} ${f(cy - r * 0.55)}`;
}

/** ✕ stroke path. */
export function cross(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy - r)}L${f(cx + r)} ${f(cy + r)}M${f(cx + r)} ${f(cy - r)}L${f(cx - r)} ${f(cy + r)}`;
}

/** Chevron pointing right (unit: tip at +r), for pad chevrons and selection arrows. */
export function chevron(cx: number, cy: number, r: number, w = 0.55): string {
  return `M${f(cx - r * 0.5)} ${f(cy - r)}L${f(cx + r * 0.5)} ${f(cy)}L${f(cx - r * 0.5)} ${f(cy + r)}L${f(cx - r * 0.5 - r * w)} ${f(cy + r)}L${f(cx + r * 0.5 - r * w)} ${f(cy)}L${f(cx - r * 0.5 - r * w)} ${f(cy - r)}Z`;
}

/** Bold chevron pointing right, centred on (0,0) (selection arrows). */
export const ARROW_RIGHT = 'M-9 -21Q-6 -24 -2 -21L17 -3Q20 0 17 3L-2 21Q-6 24 -9 21L-15 15Q-18 12 -15 9L-6 0L-15 -9Q-18 -12 -15 -15Z';

/** One tread print (the robot's track mark), pointing up; unit ≈ 28 cells wide pair. */
export const TREAD_PRINT = rrect(-6, -13, 12, 26, 5);
export const TREAD_BARS = 'M-4 -8H4M-4 -3H4M-4 2H4M-4 7H4';
