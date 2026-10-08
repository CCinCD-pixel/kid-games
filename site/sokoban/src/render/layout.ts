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

/** A phone (Dad's feedback 2026-10-08): the shorter side is under 600 px (GAME_AUTHORING §3). */
export const isPhone = (width: number, height: number): boolean => Math.min(width, height) < 600;

/** Safe-area insets other than the top (phones: the notch side in landscape, the home bar). */
export interface SideInsets {
  left?: number;
  right?: number;
  bottom?: number;
}

export interface PlayLayout {
  orientation: 'portrait' | 'landscape';
  /** shorter side < 600 px: compact HUD, 60 px buttons, the level plate on its own row in portrait */
  phone: boolean;
  /** how the companion strip lays out inside `side` (phones in landscape use the compact head + bubble) */
  stripMode: 'portrait' | 'landscape';
  width: number;
  height: number;
  top: number;
  hud: Rect;
  board: Rect;
  /** companion strip (portrait) or right column (landscape) */
  side: Rect;
  actions: { undo: Rect; redo: Rect; restart: Rect; map: Rect };
  /** phones in landscape with the board at full height (phoneLandscapeTall): the level plate tops the right column */
  plate?: Rect;
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

/** Phone button edge (≥ 44 px tap target, still a thumb-sized key). */
export const PHONE_BTN = 60;

export function playLayout(width: number, height: number, safeTop = 0, inset: SideInsets = {}): PlayLayout {
  const T = Math.max(0, Math.round(safeTop));
  if (isPhone(width, height)) return phonePlayLayout(width, height, T, inset);
  if (width >= height) {
    const boardW = Math.max(200, width - 272);
    const colX = 16 + boardW + 16;
    const colW = width - colX - 16;
    const bottom = height - 16;
    const row1 = bottom - 76;
    const row2 = row1 - 8 - 76;
    return {
      orientation: 'landscape', phone: false, stripMode: 'landscape', width, height, top: T,
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
    orientation: 'portrait', phone: false, stripMode: 'portrait', width, height, top: T,
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

/**
 * Phones (390×664 iPhone 13 Safari, 320×568 iPhone SE, 844×390 landscape): 64 px HUD row, 60 px keys.
 *  - portrait: HUD row (🏠 · pushes · 💡), the level plate on a row of its own under it (CSS), the
 *    board, the companion strip, then one key row: 撤销 (icon only when narrow) · 重做 · 重来 … 地图;
 *  - landscape: HUD row with the plate in the middle; board left; a 232 px column on the right with
 *    the strip (compact head + bubble) over two key rows.
 */
function phonePlayLayout(width: number, height: number, T: number, inset: SideInsets): PlayLayout {
  const B = PHONE_BTN;
  const L = 12 + Math.max(0, Math.round(inset.left ?? 0));
  const R = 12 + Math.max(0, Math.round(inset.right ?? 0));
  const bottom = height - Math.max(10, Math.round(inset.bottom ?? 0));
  if (width >= height) {
    const colW = 232;
    const colX = width - R - colW;
    const row1 = bottom - B;
    const row2 = row1 - 8 - B;
    // clear of the 🏠 button (12 + 56 px) on the left
    const top = T + 72;
    return {
      orientation: 'landscape', phone: true, stripMode: 'portrait', width, height, top: T,
      hud: { x: 0, y: T, w: width, h: 60 },
      board: { x: L, y: top, w: colX - 12 - L, h: bottom - top },
      side: { x: colX, y: top, w: colW, h: row2 - 8 - top },
      actions: {
        undo: { x: colX, y: row1, w: colW - B - 10, h: B },
        redo: { x: colX + colW - B, y: row1, w: B, h: B },
        restart: { x: colX, y: row2, w: B, h: B },
        map: { x: colX + colW - B, y: row2, w: B, h: B },
      },
    };
  }
  const barY = bottom - B;
  const sideY = barY - 8 - 64;
  const top = T + 116;
  const undoW = Math.max(B, Math.min(150, width - 32 - 3 * B - 8 * 2 - 16));
  return {
    orientation: 'portrait', phone: true, stripMode: 'portrait', width, height, top: T,
    hud: { x: 0, y: T, w: width, h: 64 },
    board: { x: 12, y: top, w: width - 24, h: sideY - 6 - top },
    side: { x: 12, y: sideY, w: width - 24, h: 64 },
    actions: {
      undo: { x: 16, y: barY, w: undoW, h: B },
      redo: { x: 16 + undoW + 8, y: barY, w: B, h: B },
      restart: { x: 16 + undoW + 8 + B + 8, y: barY, w: B, h: B },
      map: { x: width - 16 - B, y: barY, w: B, h: B },
    },
  };
}

/**
 * Phones in landscape, the board at full height (QA fb1 r2: under the HUD row a 10-row warehouse got
 * 26-px cells at 844×390): the board runs from the top of the screen down, right of the 🏠 button,
 * and the level plate moves to the top of the right column, under the pushes chip and 💡; the
 * companion keeps the rest of the column above the keys. The play screen takes it when it gives the
 * level a bigger cell (a wide warehouse on a narrow phone keeps the HUD-row layout). Null when it
 * does not apply or the companion would get too short.
 */
export function phoneLandscapeTall(g: PlayLayout, inset: SideInsets = {}): PlayLayout | null {
  if (!g.phone || g.orientation !== 'landscape') return null;
  const L = 12 + Math.max(0, Math.round(inset.left ?? 0));
  // the 🏠 button: 12 px in, ~104 px wide
  const x = L + 112;
  const plate = { x: g.side.x, y: g.top + 64, w: g.side.w, h: 48 };
  const sideY = plate.y + plate.h + 8;
  const sideBottom = g.side.y + g.side.h;
  const boardBottom = g.board.y + g.board.h;
  const boardRight = g.board.x + g.board.w;
  if (sideBottom - sideY < 96 || boardRight - x < 200) return null;
  return {
    ...g,
    plate,
    board: { x, y: g.top + 8, w: boardRight - x, h: boardBottom - (g.top + 8) },
    side: { x: g.side.x, y: sideY, w: g.side.w, h: sideBottom - sideY },
  };
}

/**
 * Phones: the side gutter the cell size keeps (QA fb1 r2: 9–10-column boards at 320 px got 26-px
 * cells). The canvas keeps its 18-px shadow pad either way, reaching into the 12-px screen margin.
 */
export const PHONE_PAD_X = 6;

/**
 * Cell size and placement for a W×H board inside `area` (spec §2.2 formula v1.1); `padX` is the side
 * gutter kept free for the shadow (phones: PHONE_PAD_X).
 */
export function boardGeom(area: Rect, W: number, H: number, padX = SHADOW_PAD_X): BoardGeom {
  const s = Math.max(8, Math.floor(Math.min((area.w - 2 * padX) / W, (area.h - SHADOW_PAD_BOTTOM) / (H + HEADROOM), MAX_CELL)));
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
  phone: boolean;
  /** phones: where the companion strip goes (and its compact mode); iPad: placed by the map screen */
  strip?: Rect;
  hud: Rect;
  card: Rect;
  road: Rect;
  tabs: Rect;
}

export function mapLayout(width: number, height: number, safeTop = 0, inset: SideInsets = {}): MapLayout {
  const T = Math.max(0, Math.round(safeTop));
  if (isPhone(width, height)) {
    const L = 12 + Math.max(0, Math.round(inset.left ?? 0));
    const R = 12 + Math.max(0, Math.round(inset.right ?? 0));
    const bottom = height - Math.max(8, Math.round(inset.bottom ?? 0));
    if (width >= height) {
      // left column: chapter card, the tabs (3 × 2 keys), the companion; the road fills the right
      const colW = 236;
      const tabsY = T + 72 + 92 + 8;
      return {
        orientation: 'landscape', phone: true,
        hud: { x: 0, y: T, w: width, h: 60 },
        card: { x: L, y: T + 72, w: colW, h: 92 },
        tabs: { x: L, y: tabsY, w: colW, h: 118 },
        strip: { x: L, y: tabsY + 118 + 4, w: colW, h: Math.max(60, bottom - (tabsY + 122)) },
        road: { x: L + colW + 12, y: T + 64, w: width - R - (L + colW + 12), h: bottom - (T + 64) },
      };
    }
    const tabsH = 68;
    const roadY = T + 68 + 88 + 8;
    const tabsY = bottom - tabsH;
    return {
      orientation: 'portrait', phone: true,
      hud: { x: 0, y: T, w: width, h: 64 },
      card: { x: 12, y: T + 68, w: width - 24, h: 88 },
      road: { x: 12, y: roadY, w: width - 24, h: tabsY - 76 - roadY },
      strip: { x: 12, y: tabsY - 72, w: width - 24, h: 64 },
      tabs: { x: 0, y: tabsY, w: width, h: tabsH },
    };
  }
  if (width >= height) {
    return {
      orientation: 'landscape', phone: false,
      hud: { x: 0, y: T, w: width, h: 76 },
      tabs: { x: 16, y: T + 84, w: 76, h: height - 16 - (T + 84) },
      card: { x: 108, y: T + 84, w: width - 124, h: 100 },
      road: { x: 108, y: T + 192, w: width - 124, h: height - 16 - (T + 192) },
    };
  }
  return {
    orientation: 'portrait', phone: false,
    hud: { x: 0, y: T, w: width, h: 76 },
    card: { x: 16, y: T + 84, w: width - 32, h: 120 },
    road: { x: 16, y: T + 212, w: width - 32, h: height - 108 - (T + 212) },
    tabs: { x: 0, y: height - 96, w: width, h: 96 },
  };
}
