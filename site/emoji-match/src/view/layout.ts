/**
 * S4 play-screen geometry (spec §2.2/§2.3) as a pure function of the viewport, the safe area and the
 * board size — V15 (validate/layout.test.ts) asserts every rect is inside the viewport and that no two
 * overlap, for every v1 level × both orientations × T ∈ {20,24} × B ∈ {0,20} × toolbar on/off.
 */
export interface Rect { x: number; y: number; w: number; h: number }
export interface LayoutIn {
  vw: number; vh: number;
  /** safe-area insets */
  T: number; B: number; Lft?: number; R?: number;
  cols: number; rows: number;
  /** pod exit band (v2) */
  dock?: boolean;
  /** booster bar visible (from 2-02; puzzles: undo / restart / hint; free mode: 结束) */
  tools: boolean;
  /** buttons in that bar (default 3): portrait right-aligned, landscape left-aligned */
  nTools?: number;
  /** number of goal cards (1..3) */
  goals: number;
  /** measured width of the kit's 🏠 返回 pill (main.ts); default HOME_W */
  homeW?: number;
}
/** the kit's 🏠 返回 pill (icon + label, kit/ui/skin.css) at max(12, safe-area) from the top-left corner */
export const HOME_W = 104;
export interface PlayLayout {
  orientation: 'portrait' | 'landscape';
  home: Rect; pause: Rect; chip: Rect; moves: Rect; head: Rect; goals: Rect[];
  boardArea: Rect; panel: Rect; cell: number; rim: number; dock: number;
  /** origin (top-left of cell 0,0) in viewport px */
  ox: number; oy: number;
  tools: Rect | null; toolBtns: Rect[]; sub: Rect;
  /** cell < 48: the window is too small to play (split view) */
  tooSmall: boolean;
}
export const RIM = 10;
const even = (x: number) => Math.max(0, Math.floor(x / 2) * 2);

function cellFor(availW: number, availH: number, cols: number, rows: number, dock: number): number {
  return even(Math.min(96, Math.floor((availW - 2 * RIM) / cols), Math.floor((availH - 2 * RIM - dock) / rows)));
}

export function playLayout(i: LayoutIn): PlayLayout {
  const { vw, vh, T, B } = i;
  const L = i.Lft ?? 0, R = i.R ?? 0;
  const dock = i.dock ? 28 : 0;
  // the kit places 🏠 at max(12, inset); ⏸ and the level chip share that top line
  const top0 = Math.max(12, T);
  const home: Rect = { x: Math.max(12, L), y: top0, w: i.homeW ?? HOME_W, h: 56 };
  const landscape = vw > vh;
  if (!landscape) {
    const pause: Rect = { x: vw - 16 - R - 56, y: top0, w: 56, h: 56 };
    const chip: Rect = { x: home.x + home.w + 16, y: top0 + 6, w: pause.x - 16 - (home.x + home.w + 16), h: 44 };
    const moves: Rect = { x: 24 + L, y: T + 80, w: 112, h: 112 };
    const head: Rect = { x: vw - 24 - R - 64, y: T + 104, w: 64, h: 64 };
    const gx0 = moves.x + moves.w + 16, gx1 = head.x - 12;
    const gw = Math.min(104, Math.floor((gx1 - gx0 - 12 * (i.goals - 1)) / i.goals));
    const goals = Array.from({ length: i.goals }, (_, k) => ({ x: gx0 + k * (gw + 12), y: T + 80, w: gw, h: 112 }));
    const boardArea: Rect = { x: 16 + L, y: T + 212, w: vw - 32 - L - R, h: vh - B - 108 - (T + 212) };
    const cell = cellFor(boardArea.w, boardArea.h, i.cols, i.rows, dock);
    const pw = i.cols * cell + 2 * RIM, ph = i.rows * cell + 2 * RIM + dock;
    const panel: Rect = { x: Math.round(boardArea.x + (boardArea.w - pw) / 2), y: Math.round(boardArea.y + (boardArea.h - ph) / 2), w: pw, h: ph };
    const rowY = vh - B - 96;
    const n = i.tools ? Math.max(1, Math.min(3, i.nTools ?? 3)) : 0;
    const toolBtns = Array.from({ length: n }, (_, j) => n - 1 - j).map((k) => ({ x: vw - 24 - R - 80 - k * 92, y: rowY, w: 80, h: 80 }));
    const tools = n ? { x: toolBtns[0].x, y: rowY, w: 80 * n + 12 * (n - 1), h: 80 } : null;
    const subRight = tools ? tools.x - 16 : vw - 24 - R;
    const sub: Rect = { x: 24 + L, y: rowY, w: Math.min(tools ? 470 : 760, subRight - 24 - L), h: 80 };
    return { orientation: 'portrait', home, pause, chip, moves, head, goals, boardArea, panel, cell, rim: RIM, dock, ox: panel.x + RIM, oy: panel.y + RIM, tools, toolBtns, sub, tooSmall: cell < 48 };
  }
  const col = 300;
  const pause: Rect = { x: L + 232, y: top0, w: 56, h: 56 };
  const chip: Rect = { x: L + 16, y: T + 76, w: 272, h: 40 };
  const moves: Rect = { x: L + 24, y: T + 126, w: 112, h: 112 };
  const head: Rect = { x: L + 200, y: T + 146, w: 72, h: 72 };
  const goals = Array.from({ length: i.goals }, (_, k) => ({ x: L + 12, y: T + 250 + k * 80, w: 276, h: 72 }));
  const n = i.tools ? Math.max(1, Math.min(3, i.nTools ?? 3)) : 0;
  const toolBtns = Array.from({ length: n }, (_, k) => ({ x: L + 18 + k * 92, y: T + 494, w: 80, h: 80 }));
  const tools = n ? { x: L + 18, y: T + 494, w: 80 * n + 12 * (n - 1), h: 80 } : null;
  const subTop = i.tools ? T + 586 : T + 250 + Math.max(1, i.goals) * 80 + 12;
  const sub: Rect = { x: L + 16, y: subTop, w: 268, h: vh - B - 12 - subTop };
  const boardArea: Rect = { x: L + col + 12, y: T + 12, w: vw - R - 12 - (L + col + 12), h: vh - B - 12 - (T + 12) };
  const cell = cellFor(boardArea.w, boardArea.h, i.cols, i.rows, dock);
  const pw = i.cols * cell + 2 * RIM, ph = i.rows * cell + 2 * RIM + dock;
  const panel: Rect = { x: Math.round(boardArea.x + (boardArea.w - pw) / 2), y: Math.round(boardArea.y + (boardArea.h - ph) / 2), w: pw, h: ph };
  return { orientation: 'landscape', home, pause, chip, moves, head, goals, boardArea, panel, cell, rim: RIM, dock, ox: panel.x + RIM, oy: panel.y + RIM, tools, toolBtns, sub, tooSmall: cell < 48 };
}

export const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const inside = (a: Rect, vw: number, vh: number): boolean => a.x >= 0 && a.y >= 0 && a.x + a.w <= vw && a.y + a.h <= vh;

/** viewport px → cell index (−1 outside); the 12 px rim outside the board counts as the nearest cell */
export function cellAt(l: PlayLayout, cols: number, rows: number, x: number, y: number, slop = 12): number {
  const lx = x - l.ox, ly = y - l.oy;
  if (lx < -slop || ly < -slop || lx > cols * l.cell + slop || ly > rows * l.cell + slop) return -1;
  const c = Math.min(cols - 1, Math.max(0, Math.floor(lx / l.cell)));
  const r = Math.min(rows - 1, Math.max(0, Math.floor(ly / l.cell)));
  return r * cols + c;
}
