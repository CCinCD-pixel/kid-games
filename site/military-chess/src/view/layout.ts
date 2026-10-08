/**
 * Orientation → spacing, station coordinates, panel rectangles, seat rotation (spec §2.2, §2.3).
 * Pure functions in DESIGN units: the match stage is 810×1080 (portrait) or 1080×810 (landscape)
 * and is scaled as a whole to the viewport (scale 1 on the iPad 9 home-screen app).
 */
import { X, Y } from '../core/board';

export type Orientation = 'portrait' | 'landscape';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}

export const STAGE = { portrait: { w: 810, h: 1080 }, landscape: { w: 1080, h: 810 } } as const;

export interface BoardGeom {
  o: Orientation;
  /** board rectangle (frame included) in stage units */
  rect: Rect;
  frame: number;
  /** spacing along the 5 files and the 12 rows */
  colStep: number;
  rowStep: number;
  band: number;
  /** tile size and shape */
  tile: { w: number; h: number; shape: 'wide' | 'tall' };
  /** hit rectangle per station (w × h) */
  hit: { w: number; h: number };
}

export interface StageGeom {
  o: Orientation;
  w: number;
  h: number;
  safeTop: number;
  hudH: number;
  board: BoardGeom;
  /** top bar (portrait: across the top; landscape: the right panel's turn bar) */
  turnBar: Rect;
  /** icon buttons (hint / menu) */
  buttons: Rect[];
  /** intel board */
  intel: Rect;
  /** companion avatar + caption area */
  companion: Rect;
  caption: Rect;
  /** captured trays (one per side, near = index 0) */
  trays: [Rect, Rect];
}

export function boardGeom(o: Orientation, safeTop: number, safeLeft = 0, safeBottom = 0): BoardGeom {
  if (o === 'portrait') {
    const w = 652, h = 810, hudH = 72;
    return {
      o,
      rect: { x: (810 - w) / 2, y: hudH + safeTop + 4, w, h },
      frame: 16,
      colStep: 124,
      rowStep: 60,
      band: 58,
      tile: { w: 92, h: 50, shape: 'wide' },
      hit: { w: 124, h: 60 },
    };
  }
  const w = 808, h = 672, hudH = 64;
  const T = hudH + safeTop + (810 - hudH - safeTop - safeBottom - h) / 2;
  return {
    o,
    rect: { x: 12 + safeLeft, y: T, w, h },
    frame: 16,
    colStep: 128,
    rowStep: 60,
    band: 56,
    tile: { w: 52, h: 88, shape: 'tall' },
    hit: { w: 60, h: 128 },
  };
}

/** station centre relative to the board's top-left corner */
export function stationLocal(g: BoardGeom, i: number): Pt {
  const x = X(i), y = Y(i);
  if (g.o === 'portrait') return { x: 16 + x * 124 + 62, y: 16 + y * 60 + 30 + (y >= 6 ? 58 : 0) };
  return { x: 16 + (11 - y) * 60 + 30 + (y <= 5 ? 56 : 0), y: 16 + x * 128 + 64 };
}
/** station centre in stage units */
export function stationXY(g: BoardGeom, i: number): Pt {
  const p = stationLocal(g, i);
  return { x: g.rect.x + p.x, y: g.rect.y + p.y };
}
/** station under a stage point (hit rectangle = full spacing cell), or −1 */
export function stationAt(g: BoardGeom, px: number, py: number): number {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < 60; i++) {
    const c = stationXY(g, i);
    const dx = Math.abs(px - c.x), dy = Math.abs(py - c.y);
    if (dx <= g.hit.w / 2 && dy <= g.hit.h / 2) {
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}
/** nearest station within `radius` (drag snapping) */
export function nearestStation(g: BoardGeom, px: number, py: number, radius: number): number {
  let best = -1, bestD = radius * radius;
  for (let i = 0; i < 60; i++) {
    const c = stationXY(g, i);
    const d = (px - c.x) ** 2 + (py - c.y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function stageGeom(o: Orientation, safeTop = 20): StageGeom {
  const board = boardGeom(o, safeTop);
  const r = board.rect;
  if (o === 'portrait') {
    const top = 12 + safeTop;
    const panelY = r.y + r.h + 8;
    const panelH = 1068 - panelY;
    return {
      o,
      w: 810,
      h: 1080,
      safeTop,
      hudH: 72,
      board,
      turnBar: { x: 225, y: top, w: 360, h: 52 },
      buttons: [
        { x: 810 - 12 - 56 - 8 - 56, y: top - 2, w: 56, h: 56 },
        { x: 810 - 12 - 56, y: top - 2, w: 56, h: 56 },
      ],
      companion: { x: 12, y: panelY, w: 150, h: panelH },
      intel: { x: 12 + 150 + 20, y: panelY, w: 616, h: panelH },
      caption: { x: 12 + 150 + 20, y: panelY, w: 616, h: 64 },
      trays: [
        { x: 12 + 150 + 20, y: panelY, w: 616, h: panelH / 2 },
        { x: 12 + 150 + 20, y: panelY + panelH / 2, w: 616, h: panelH / 2 },
      ],
    };
  }
  const px = 832, pw = 236;
  const top = 12 + safeTop;
  return {
    o,
    w: 1080,
    h: 810,
    safeTop,
    hudH: 64,
    board,
    turnBar: { x: px, y: top, w: pw, h: 52 },
    // 情报板 7 rows × ≥48 px touch cells (QA r1: 43 px in landscape 翻翻棋)
    intel: { x: px, y: top + 52 + 20, w: pw, h: 364 },
    companion: { x: px, y: top + 52 + 20 + 364 + 8, w: pw, h: 266 },
    caption: { x: px, y: top + 52 + 20 + 364 + 8, w: pw, h: 266 },
    buttons: [
      { x: px, y: 810 - 12 - 56, w: 56, h: 56 },
      { x: px + 56 + 12, y: 810 - 12 - 56, w: 56, h: 56 },
    ],
    trays: [
      { x: px, y: top + 52 + 12, w: pw, h: 143 },
      { x: px, y: top + 52 + 12 + 143, w: pw, h: 143 },
    ],
  };
}

/**
 * Text rotation for a piece (spec §2.2 对坐): side-by-side seating → 0. Face-to-face: portrait far
 * seat 180°; landscape near seat +90° (clockwise), far seat −90°.
 */
export function seatRotation(o: Orientation, seating: 'side' | 'face', seat: 'near' | 'far'): number {
  if (seating === 'side') return 0;
  if (o === 'portrait') return seat === 'far' ? 180 : 0;
  return seat === 'near' ? 90 : -90;
}

/** a phone = the shorter side under 600 CSS px (docs/GAME_AUTHORING.md §3) */
export const isPhone = (vw: number, vh: number): boolean => Math.min(vw, vh) < 600;
/** the phone stage: 390 units across (portrait) or 390 tall (landscape), filling the viewport */
export const PHONE_UNIT = 390;
export function phoneStage(o: Orientation, vw: number, vh: number): { w: number; h: number; scale: number } {
  if (o === 'portrait') {
    const scale = vw / PHONE_UNIT;
    return { w: PHONE_UNIT, h: Math.round(vh / scale), scale };
  }
  const scale = vh / PHONE_UNIT;
  return { w: Math.round(vw / scale), h: PHONE_UNIT, scale };
}

/** scale + offset that fit a design stage into a viewport (letterboxed, centred) */
export function fitStage(o: Orientation, vw: number, vh: number): { scale: number; ox: number; oy: number } {
  const s = STAGE[o];
  const scale = Math.min(vw / s.w, vh / s.h);
  return { scale, ox: (vw - s.w * scale) / 2, oy: (vh - s.h * scale) / 2 };
}

export const rectsOverlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const rectInside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - 0.01 && inner.y >= outer.y - 0.01 && inner.x + inner.w <= outer.x + outer.w + 0.01 && inner.y + inner.h <= outer.y + outer.h + 0.01;
