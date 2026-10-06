/**
 * Screen geometry (spec §2.2), pure. Designed on the iPad 9 viewport (810×1080 / 1080×810) and
 * stretched with the bottom bar anchored for other sizes. T = safe-area top.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardGeom {
  /** cell edge in CSS px */
  s: number;
  /** grid origin (top-left of cell 0,0) in page px */
  x0: number;
  y0: number;
  /** the canvas rectangle = full drawing extent (grid + 0.45 s headroom + 26 px shadow + 18 px sides) */
  canvas: Rect;
  /** grid origin inside the canvas */
  ox: number;
  oy: number;
}

export interface PlayLayout {
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
  top: number;
  hud: Rect;
  board: Rect;
  /** companion strip (portrait) or right column (landscape) */
  side: Rect;
  actions: { undo: Rect; redo: Rect; restart: Rect; map: Rect };
}

export const HEADROOM = 0.45;
/**
 * Wall height (top face raised by this much). The spec draft said 0.32 s; 0.24 s keeps the
 * robot's treads visible in one-cell corridors (a wall south of the robot hides only the last
 * 0.04 s of its tracks) while walls still read as clearly taller than crates (0.20 s).
 */
export const WALL_H = 0.24;
/** Robot feet: 0.80 s below the cell's top edge (head ≤ 0.45 s above it). */
export const ROBOT_FEET = 0.8;
export const SHADOW_PAD_X = 18;
export const SHADOW_PAD_BOTTOM = 26;
export const MAX_CELL = 96;

export function playLayout(width: number, height: number, safeTop = 0): PlayLayout {
  const T = Math.max(0, Math.round(safeTop));
  if (width >= height) {
    const boardW = Math.max(200, width - 272);
    const colX = 16 + boardW + 16;
    const colW = width - colX - 16;
    const bottom = height - 16;
    const row1 = bottom - 76;
    const row2 = row1 - 8 - 76;
    return {
      orientation: 'landscape', width, height, top: T,
      hud: { x: 0, y: T, w: width, h: 76 },
      board: { x: 16, y: T + 84, w: boardW, h: bottom - (T + 84) },
      side: { x: colX, y: T + 84, w: colW, h: row2 - 8 - (T + 84) },
      actions: {
        undo: { x: colX, y: row1, w: 140, h: 76 },
        redo: { x: colX + colW - 76, y: row1, w: 76, h: 76 },
        restart: { x: colX, y: row2, w: 106, h: 76 },
        map: { x: colX + colW - 106, y: row2, w: 106, h: 76 },
      },
    };
  }
  const barY = height - 96;
  const sideY = barY - 84;
  return {
    orientation: 'portrait', width, height, top: T,
    hud: { x: 0, y: T, w: width, h: 76 },
    board: { x: 16, y: T + 84, w: width - 32, h: sideY - 8 - (T + 84) },
    side: { x: 16, y: sideY, w: width - 32, h: 72 },
    actions: {
      undo: { x: 16, y: barY + 10, w: 168, h: 76 },
      redo: { x: 196, y: barY + 10, w: 76, h: 76 },
      restart: { x: 284, y: barY + 10, w: 76, h: 76 },
      map: { x: width - 92, y: barY + 10, w: 76, h: 76 },
    },
  };
}

/** Cell size and placement for a W×H board inside `area` (spec §2.2 formula v1.1). */
export function boardGeom(area: Rect, W: number, H: number): BoardGeom {
  const s = Math.max(8, Math.floor(Math.min((area.w - 2 * SHADOW_PAD_X) / W, (area.h - SHADOW_PAD_BOTTOM) / (H + HEADROOM), MAX_CELL)));
  const x0 = area.x + (area.w - W * s) / 2;
  const y0 = area.y + HEADROOM * s + (area.h - SHADOW_PAD_BOTTOM - (H + HEADROOM) * s) / 2;
  const canvas = { x: Math.round(x0 - SHADOW_PAD_X), y: Math.round(y0 - HEADROOM * s), w: Math.round(W * s + 2 * SHADOW_PAD_X), h: Math.round((H + HEADROOM) * s + SHADOW_PAD_BOTTOM) };
  return { s, x0: Math.round(x0), y0: Math.round(y0), canvas, ox: Math.round(x0) - canvas.x, oy: Math.round(y0) - canvas.y };
}

/** Highest pixel of the top wall row (its top face is raised by 0.32 s). */
export function topWallPixel(g: BoardGeom): number {
  return g.y0 - WALL_H * g.s;
}

export interface MapLayout {
  orientation: 'portrait' | 'landscape';
  hud: Rect;
  card: Rect;
  road: Rect;
  tabs: Rect;
}

export function mapLayout(width: number, height: number, safeTop = 0): MapLayout {
  const T = Math.max(0, Math.round(safeTop));
  if (width >= height) {
    return {
      orientation: 'landscape',
      hud: { x: 0, y: T, w: width, h: 76 },
      tabs: { x: 16, y: T + 84, w: 76, h: height - 16 - (T + 84) },
      card: { x: 108, y: T + 84, w: width - 124, h: 100 },
      road: { x: 108, y: T + 192, w: width - 124, h: height - 16 - (T + 192) },
    };
  }
  return {
    orientation: 'portrait',
    hud: { x: 0, y: T, w: width, h: 76 },
    card: { x: 16, y: T + 84, w: width - 32, h: 120 },
    road: { x: 16, y: T + 212, w: width - 32, h: height - 108 - (T + 212) },
    tabs: { x: 0, y: height - 96, w: width, h: 96 },
  };
}
