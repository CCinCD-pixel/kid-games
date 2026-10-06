/**
 * Static tiles (spec §6.3): floor checker with seams and bolts, pads, wall auto-tiling (no tile
 * set: convex corners rounded, paper-edge highlights on exposed edges, front faces only where the
 * cell below is open, decals by hash), the paper drop shadow of the whole warehouse.
 * Everything is drawn in page px with the cell size `s`; paths come from shapes.ts (100-unit cells).
 */
import { fnv1a32 } from '@engines/puzzle/src/fnv';
import type { Level } from '@engines/puzzle/src/types';
import type { HallKit } from './halls';
import { CRATES, PAPER_EDGE, SHADOW, WALL_FRONT_BOTTOM, WALL_FRONT_TOP } from './palette';
import { P, chevron, circle, rrect, symbolPath } from './shapes';

import { WALL_H } from './layout';

export { WALL_H };
export const CRATE_H = 0.2;

export interface TileView {
  ctx: CanvasRenderingContext2D;
  level: Level;
  hall: HallKit;
  levelId: string;
  s: number;
  /** grid origin inside the canvas (px) */
  ox: number;
  oy: number;
}

export const isWall = (l: Level, r: number, c: number): boolean => r >= 0 && c >= 0 && r < l.H && c < l.W && l.wall[r * l.W + c] === 1;
const isFloor = (l: Level, r: number, c: number): boolean => r >= 0 && c >= 0 && r < l.H && c < l.W && l.floor[r * l.W + c] === 1;

/** Walls worth drawing: touching the interior (orthogonally or diagonally). Outer filler walls are skipped. */
export function visibleWall(l: Level, r: number, c: number): boolean {
  if (!isWall(l, r, c)) return false;
  for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) if ((dr || dc) && isFloor(l, r + dr, c + dc)) return true;
  return false;
}

function withCell(t: TileView, r: number, c: number, fn: (ctx: CanvasRenderingContext2D) => void, dy = 0): void {
  const { ctx, s } = t;
  ctx.save();
  ctx.translate(t.ox + c * s, t.oy + r * s + dy);
  ctx.scale(s / 100, s / 100);
  fn(ctx);
  ctx.restore();
}

// ---------------------------------------------------------------- shadow

/** Soft paper shadow under the whole cut-out (drawn first on the static layer). */
export function drawShadow(t: TileView): void {
  const { ctx, level: l, s } = t;
  const path = new Path2D();
  for (let r = 0; r < l.H; r += 1) {
    for (let c = 0; c < l.W; c += 1) {
      const i = r * l.W + c;
      if (l.floor[i] || visibleWall(l, r, c)) path.rect(t.ox + c * s - 0.5, t.oy + r * s - (l.wall[i] ? WALL_H * s : 0) - 0.5, s + 1, s + 1 + (l.wall[i] ? WALL_H * s : 0));
    }
  }
  ctx.save();
  ctx.shadowColor = SHADOW;
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = 'rgba(12, 18, 48, 1)';
  ctx.fill(path);
  ctx.restore();
}

// ---------------------------------------------------------------- floor

export function drawFloor(t: TileView): void {
  const { ctx, level: l, hall, s } = t;
  for (let r = 0; r < l.H; r += 1) {
    for (let c = 0; c < l.W; c += 1) {
      const i = r * l.W + c;
      if (!l.floor[i]) continue;
      const x = t.ox + c * s;
      const y = t.oy + r * s;
      ctx.fillStyle = (r + c) % 2 === 0 ? hall.floorA : hall.floorB;
      ctx.fillRect(x, y, s, s);
      // seams right / bottom (1 px), bolts at s ≥ 64
      ctx.fillStyle = hall.seam;
      ctx.fillRect(x + s - 1, y, 1, s);
      ctx.fillRect(x, y + s - 1, s, 1);
      if (s >= 64) {
        ctx.fillStyle = hall.bolt;
        const k = 0.085 * s;
        for (const [bx, by] of [[x + k, y + k], [x + s - k, y + k], [x + k, y + s - k], [x + s - k, y + s - k]]) {
          ctx.beginPath();
          ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // ambient occlusion under a wall to the north and beside walls to the west/east
      if (isWall(l, r - 1, c)) {
        const g = ctx.createLinearGradient(0, y, 0, y + 0.16 * s);
        g.addColorStop(0, 'rgba(19, 27, 66, 0.30)');
        g.addColorStop(1, 'rgba(19, 27, 66, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, s, 0.16 * s);
      }
      if (isWall(l, r, c - 1)) {
        const g = ctx.createLinearGradient(x, 0, x + 0.08 * s, 0);
        g.addColorStop(0, 'rgba(19, 27, 66, 0.16)');
        g.addColorStop(1, 'rgba(19, 27, 66, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, 0.08 * s, s);
      }
      if (isWall(l, r, c + 1)) {
        const g = ctx.createLinearGradient(x + s, 0, x + s - 0.08 * s, 0);
        g.addColorStop(0, 'rgba(19, 27, 66, 0.16)');
        g.addColorStop(1, 'rgba(19, 27, 66, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + s - 0.08 * s, y, 0.08 * s, s);
      }
      if (l.goal[i] >= 0) drawPadBase(t, r, c, l.goal[i]);
    }
  }
}

/** Pad: recessed hatch + coloured ring + 4 inward chevrons + the shape symbol; hazard ticks around. */
export function drawPadBase(t: TileView, r: number, c: number, color: number): void {
  const k = CRATES[color] ?? CRATES[0];
  withCell(t, r, c, (ctx) => {
    // hazard ticks at the four corners (0.12 s wide, α .5)
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = t.hall.hazard[0];
    for (const [cx, cy, rot] of [[9, 9, -45], [91, 9, 45], [91, 91, 135], [9, 91, -135]] as const) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.fill(P(rrect(-9, -3, 18, 6, 3)));
      ctx.restore();
    }
    ctx.restore();
    // recessed hatch
    ctx.fillStyle = t.hall.seam;
    ctx.fill(P(circle(50, 50, 37)));
    const g = ctx.createRadialGradient(50, 44, 18, 50, 50, 37);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(38, 28, 48, 0.18)');
    ctx.fillStyle = g;
    ctx.fill(P(circle(50, 50, 37)));
    // inner top shadow (depth)
    ctx.save();
    ctx.clip(P(circle(50, 50, 37)));
    ctx.strokeStyle = 'rgba(38, 28, 48, 0.22)';
    ctx.lineWidth = 5;
    ctx.stroke(P(circle(50, 53, 37)));
    ctx.restore();
    // ring
    ctx.strokeStyle = k.top;
    ctx.lineWidth = 6;
    ctx.stroke(P(circle(50, 50, 40)));
    ctx.strokeStyle = 'rgba(255,250,240,0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke(P(circle(50, 50, 43.2)));
    // four chevrons pointing in
    ctx.fillStyle = k.top;
    for (let q = 0; q < 4; q += 1) {
      ctx.save();
      ctx.translate(50, 50);
      ctx.rotate((q * Math.PI) / 2);
      ctx.translate(-27, 0);
      ctx.fill(P(chevron(0, 0, 5.5, 0.6)));
      ctx.restore();
    }
    // symbol
    ctx.fillStyle = k.top;
    ctx.fill(P(symbolPath(k.symbol, 50, 50, 11)));
  });
}

// ---------------------------------------------------------------- walls

export interface WallMask {
  n: boolean;
  s: boolean;
  w: boolean;
  e: boolean;
}

/** Neighbour walls that are drawn (hidden filler walls count as open, so edges toward them get rounded). */
export function wallMask(l: Level, r: number, c: number): WallMask {
  return { n: visibleWall(l, r - 1, c), s: visibleWall(l, r + 1, c), w: visibleWall(l, r, c - 1), e: visibleWall(l, r, c + 1) };
}

function decalFor(t: TileView, r: number, c: number): number {
  const h = fnv1a32(`${t.levelId}:${r * t.level.W + c}`) % 100;
  return h < 15 ? 0 : h < 22 ? 1 : h < 30 ? 2 : -1;
}

/** A pad touches this wall's front (south) side → hazard stripes there. */
function nextToPad(l: Level, r: number, c: number): boolean {
  for (const [dr, dc] of [[1, 0]]) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < l.H && cc >= 0 && cc < l.W && l.goal[rr * l.W + cc] >= 0) return true;
  }
  return false;
}

/** Draw every visible wall of row r (top face raised by 0.32 s + front face where the cell below is open). */
export function drawWallRow(t: TileView, r: number): void {
  const { level: l } = t;
  for (let c = 0; c < l.W; c += 1) if (visibleWall(l, r, c)) drawWall(t, r, c);
}

export function drawWall(t: TileView, r: number, c: number): void {
  const { level: l, hall } = t;
  const m = wallMask(l, r, c);
  const R = 18;
  const hw = WALL_H * 100;
  // corners convex when both orthogonal neighbours at that corner are open
  const tl = !m.n && !m.w ? R : 0;
  const tr = !m.n && !m.e ? R : 0;
  const frontVisible = !m.s && r + 1 < l.H;
  withCell(t, r, c, (ctx) => {
    // front face (only where the cell below is not a wall)
    if (frontVisible || r + 1 >= l.H) {
      const bl = !m.w ? R * 0.7 : 0;
      const br = !m.e ? R * 0.7 : 0;
      const g = ctx.createLinearGradient(0, 100 - hw, 0, 100);
      g.addColorStop(0, WALL_FRONT_TOP);
      g.addColorStop(1, WALL_FRONT_BOTTOM);
      ctx.fillStyle = g;
      ctx.fill(P(rrect(0, 100 - hw - 12, 100, hw + 12, [0, 0, br, bl])));
      // decals on the front face
      const d = decalFor(t, r, c);
      if (nextToPad(l, r, c) && frontVisible) drawDecal(ctx, 'hazard', hall, hw);
      else if (d >= 0 && frontVisible) drawDecal(ctx, hall.decals[d], hall, hw);
    }
    // top face
    const bl2 = !m.s && !m.w ? R : 0;
    const br2 = !m.s && !m.e ? R : 0;
    const top = P(rrect(0, -hw, 100, 100, [tl, tr, br2 ? 4 : 0, bl2 ? 4 : 0]));
    ctx.fillStyle = hall.wallTop;
    ctx.fill(top);
    // light from the north-west: a soft sheen on the top face + a faint per-block panel seam
    ctx.save();
    ctx.clip(top);
    const sheen = ctx.createLinearGradient(0, -hw, 60, 100 - hw);
    sheen.addColorStop(0, 'rgba(255, 250, 240, 0.10)');
    sheen.addColorStop(1, 'rgba(255, 250, 240, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, -hw, 100, 100);
    ctx.strokeStyle = 'rgba(7, 11, 31, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke(P(rrect(12, -hw + 12, 76, 76, 9)));
    ctx.fillStyle = 'rgba(255, 250, 240, 0.12)';
    for (const [bx, by] of [[20, 20], [80, 20], [20, 80], [80, 80]]) ctx.fill(P(circle(bx, -hw + by, 2.4)));
    ctx.restore();
    // paper thickness: a soft lighter bevel just inside the exposed edges
    ctx.save();
    ctx.clip(top);
    ctx.strokeStyle = hall.wallTopHi;
    ctx.lineWidth = 9;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    if (!m.n) {
      ctx.moveTo(0, -hw + 4.5);
      ctx.lineTo(100, -hw + 4.5);
    }
    if (!m.w) {
      ctx.moveTo(4.5, -hw);
      ctx.lineTo(4.5, 100 - hw);
    }
    if (!m.e) {
      ctx.moveTo(95.5, -hw);
      ctx.lineTo(95.5, 100 - hw);
    }
    if (!m.s) {
      ctx.moveTo(0, 100 - hw - 4.5);
      ctx.lineTo(100, 100 - hw - 4.5);
    }
    ctx.stroke();
    ctx.restore();
    // paper-edge highlights on exposed edges (2.5 px at s = 64 → 3.9 units)
    ctx.strokeStyle = PAPER_EDGE;
    ctx.lineWidth = 3.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const y0 = -hw + 2;
    if (!m.n) {
      ctx.moveTo(tl ? tl : 0, y0);
      ctx.lineTo(100 - (tr ? tr : 0), y0);
    }
    if (!m.w) {
      ctx.moveTo(2, -hw + (tl ? tl : 0));
      ctx.lineTo(2, 100 - hw - 2);
    }
    if (!m.e) {
      ctx.moveTo(98, -hw + (tr ? tr : 0));
      ctx.lineTo(98, 100 - hw - 2);
    }
    ctx.stroke();
    if (!m.n && tl) {
      ctx.beginPath();
      ctx.arc(tl, -hw + tl, tl - 2, Math.PI, Math.PI * 1.5);
      ctx.stroke();
    }
    if (!m.n && tr) {
      ctx.beginPath();
      ctx.arc(100 - tr, -hw + tr, tr - 2, Math.PI * 1.5, Math.PI * 2);
      ctx.stroke();
    }
    // fold line between top and front
    if (frontVisible) {
      ctx.strokeStyle = 'rgba(255, 250, 240, 0.35)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(m.w ? 0 : 6, 100 - hw);
      ctx.lineTo(m.e ? 100 : 94, 100 - hw);
      ctx.stroke();
    }
  });
}

function drawDecal(ctx: CanvasRenderingContext2D, kind: string, hall: HallKit, hw: number): void {
  const y = 100 - hw;
  ctx.save();
  ctx.beginPath();
  ctx.rect(4, y + 3, 92, hw - 5);
  ctx.clip();
  switch (kind) {
    case 'hazard': {
      ctx.fillStyle = hall.hazard[0];
      ctx.fillRect(8, y + 9, 84, 13);
      ctx.fillStyle = hall.hazard[1];
      for (let x = -4; x < 100; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, y + 22);
        ctx.lineTo(x + 7, y + 22);
        ctx.lineTo(x + 14, y + 9);
        ctx.lineTo(x + 7, y + 9);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,250,240,0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(8, y + 9, 84, 13);
      break;
    }
    case 'vent':
    case 'grille': {
      ctx.fillStyle = 'rgba(255,250,240,0.10)';
      ctx.fill(P(rrect(24, y + 8, 52, 16, 4)));
      ctx.strokeStyle = 'rgba(255,250,240,0.32)';
      ctx.lineWidth = 2;
      for (let x = 30; x <= 70; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, y + 11);
        ctx.lineTo(x, y + 21);
        ctx.stroke();
      }
      break;
    }
    case 'porthole': {
      ctx.fillStyle = 'rgba(255, 216, 99, 0.85)';
      ctx.fill(P(circle(50, y + 16, 6)));
      ctx.fillStyle = 'rgba(255, 216, 99, 0.25)';
      ctx.fill(P(circle(50, y + 16, 11)));
      ctx.strokeStyle = 'rgba(255,250,240,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke(P(circle(50, y + 16, 8.5)));
      break;
    }
    case 'brush': {
      ctx.strokeStyle = 'rgba(255,250,240,0.16)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (const [x1, x2, yy] of [[12, 46, 10], [30, 80, 16], [18, 60, 22]]) {
        ctx.beginPath();
        ctx.moveTo(x1, y + yy);
        ctx.lineTo(x2, y + yy - 2);
        ctx.stroke();
      }
      break;
    }
    case 'plate':
    case 'oldplate': {
      ctx.fillStyle = kind === 'plate' ? 'rgba(226, 231, 251, 0.85)' : 'rgba(232, 213, 177, 0.85)';
      ctx.fill(P(rrect(34, y + 8, 32, 16, 3)));
      ctx.fillStyle = '#26346e';
      ctx.font = '700 11px "Baloo 2", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(kind === 'plate' ? 'B2' : 'No.7', 50, y + 16.5);
      break;
    }
    case 'stripe': {
      ctx.fillStyle = hall.hazard[0];
      ctx.fillRect(0, y + 12, 100, 6);
      break;
    }
    case 'pipe': {
      ctx.strokeStyle = 'rgba(255,250,240,0.28)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, y + 12);
      ctx.lineTo(100, y + 12);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,250,240,0.35)';
      ctx.fillRect(40, y + 7, 8, 10);
      break;
    }
    case 'wood': {
      ctx.strokeStyle = 'rgba(232, 213, 177, 0.22)';
      ctx.lineWidth = 1.6;
      for (const yy of [9, 15, 21]) {
        ctx.beginPath();
        ctx.moveTo(6, y + yy);
        ctx.bezierCurveTo(30, y + yy - 2, 60, y + yy + 2, 94, y + yy);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
