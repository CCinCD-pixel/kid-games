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
  /** cell < 48 (phones: < 28): the window is too small to play (split view) */
  tooSmall: boolean;
  /** 'phone' = the shorter side is < 600 px (Dad plays on his phone too, 2026-10-08): compact HUD */
  size: 'tablet' | 'phone';
}
/** the shorter side is < 600 px — the same test as the hub's and the parent page's phone media queries */
export const isPhone = (vw: number, vh: number): boolean => Math.min(vw, vh) < 600;
/** phone HUD sizes: pause 48, moves 64, goal cards 64 tall, tool buttons 52–56 (all ≥ 44 px tap targets) */
const PH = { pause: 48, moves: 64, head: 52, goalH: 64, goalW: 72, tool: 56, sub: 56, col: 176 } as const;
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
  if (isPhone(vw, vh)) return phoneLayout(i, home, top0, dock, landscape);
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
    return { orientation: 'portrait', home, pause, chip, moves, head, goals, boardArea, panel, cell, rim: RIM, dock, ox: panel.x + RIM, oy: panel.y + RIM, tools, toolBtns, sub, tooSmall: cell < 48, size: 'tablet' };
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
  return { orientation: 'landscape', home, pause, chip, moves, head, goals, boardArea, panel, cell, rim: RIM, dock, ox: panel.x + RIM, oy: panel.y + RIM, tools, toolBtns, sub, tooSmall: cell < 48, size: 'tablet' };
}

/**
 * Phones (portrait 320–599 wide, landscape < 600 tall): the same pieces, compact. Portrait: 🏠 · chip · ⏸
 * on top, moves · goals · head below, the board as wide as the screen, then the subtitle lane and the
 * tool row. Landscape: the board fills the height in the middle; moves / goals / head on the left under
 * 🏠, ⏸ · subtitle lane · tools on the right.
 */
function phoneLayout(i: LayoutIn, home: Rect, top0: number, dock: number, landscape: boolean): PlayLayout {
  const { vw, vh, T, B } = i;
  const L = i.Lft ?? 0, R = i.R ?? 0;
  const n = i.tools ? Math.max(1, Math.min(3, i.nTools ?? 3)) : 0;
  const ng = Math.max(1, i.goals);
  const pause: Rect = { x: vw - 12 - R - PH.pause, y: top0 + 4, w: PH.pause, h: PH.pause };
  if (!landscape) {
    const chipX = home.x + home.w + 8;
    const chip: Rect = { x: chipX, y: top0 + 6, w: Math.max(0, pause.x - 8 - chipX), h: 44 };
    const rowY = top0 + 56 + 8;
    const moves: Rect = { x: 12 + L, y: rowY, w: PH.moves, h: PH.moves };
    const head: Rect = { x: vw - 12 - R - PH.head, y: rowY + (PH.moves - PH.head) / 2, w: PH.head, h: PH.head };
    const gx0 = moves.x + moves.w + 8, gx1 = head.x - 8;
    const gw = Math.min(PH.goalW, Math.floor((gx1 - gx0 - 6 * (ng - 1)) / ng));
    const gs = gx0 + Math.max(0, Math.floor((gx1 - gx0 - (gw * ng + 6 * (ng - 1))) / 2));
    const goals = Array.from({ length: i.goals }, (_, k) => ({ x: gs + k * (gw + 6), y: rowY, w: gw, h: PH.goalH }));
    // short phones (SE): a slightly tighter bottom so a 9×9 board keeps 30 px cells
    const short = vh < 620, TS: number = short ? 52 : PH.tool, SUB: number = short ? 50 : PH.sub, G = short ? 6 : 8;
    const barY = vh - B - G - TS;
    const toolBtns = Array.from({ length: n }, (_, j) => n - 1 - j).map((k) => ({ x: vw - 12 - R - TS - k * (TS + 8), y: barY, w: TS, h: TS }));
    const tools = n ? { x: toolBtns[0].x, y: barY, w: TS * n + 8 * (n - 1), h: TS } : null;
    // the lane sits beside the tools when it keeps ≥ 200 px, else it gets its own row above them
    const besideW = vw - 24 - L - R - (tools ? tools.w + 8 : 0);
    const sub: Rect = besideW >= 200 ? { x: 12 + L, y: barY + (TS - SUB) / 2, w: besideW, h: SUB } : { x: 12 + L, y: barY - G - SUB, w: vw - 24 - L - R, h: SUB };
    const boardArea: Rect = { x: 6 + L, y: rowY + PH.moves + 6, w: vw - 12 - L - R, h: Math.min(sub.y, barY) - 6 - (rowY + PH.moves + 6) };
    const cell = cellFor(boardArea.w, boardArea.h, i.cols, i.rows, dock);
    const pw = i.cols * cell + 2 * RIM, ph = i.rows * cell + 2 * RIM + dock;
    const panel: Rect = { x: Math.round(boardArea.x + (boardArea.w - pw) / 2), y: Math.round(boardArea.y + (boardArea.h - ph) / 2), w: pw, h: ph };
    return { orientation: 'portrait', home, pause, chip, moves, head, goals, boardArea, panel, cell, rim: RIM, dock, ox: panel.x + RIM, oy: panel.y + RIM, tools, toolBtns, sub, tooSmall: cell < 28, size: 'phone' };
  }
  // landscape: the board takes the full height, two side columns of at least PH.col
  const availH = vh - T - B - 16;
  const cellH = Math.floor((availH - 2 * RIM - dock) / i.rows);
  const cellW = Math.floor((vw - L - R - 2 * (PH.col + 20) - 2 * RIM) / i.cols);
  const cell = even(Math.min(96, cellH, cellW));
  const pw = i.cols * cell + 2 * RIM, ph = i.rows * cell + 2 * RIM + dock;
  const panel: Rect = { x: Math.round(L + (vw - L - R - pw) / 2), y: Math.round(T + 8 + (availH - ph) / 2), w: pw, h: ph };
  const boardArea: Rect = { x: panel.x, y: T + 8, w: pw, h: availH };
  const cw = Math.min(240, Math.floor((vw - L - R - pw) / 2) - 20);
  const x0 = L + 12, x1 = vw - R - 12 - cw;
  const chip: Rect = { x: x0, y: top0 + 56 + 8, w: cw, h: 40 };
  const moves: Rect = { x: x0, y: chip.y + 48, w: PH.moves, h: PH.moves };
  const head: Rect = { x: x0 + PH.moves + 12, y: moves.y + (PH.moves - PH.head) / 2, w: PH.head, h: PH.head };
  const gw = Math.min(PH.goalW, Math.floor((cw - 6 * (ng - 1)) / ng));
  const goals = Array.from({ length: i.goals }, (_, k) => ({ x: x0 + k * (gw + 6), y: moves.y + PH.moves + 10, w: gw, h: PH.goalH }));
  const ts = Math.min(PH.tool, Math.floor((cw - 8 * (Math.max(1, n) - 1)) / Math.max(1, n)));
  const barY = vh - B - 12 - ts;
  const toolBtns = Array.from({ length: n }, (_, k) => ({ x: x1 + k * (ts + 8), y: barY, w: ts, h: ts }));
  const tools = n ? { x: x1, y: barY, w: ts * n + 8 * (n - 1), h: ts } : null;
  const subTop = pause.y + pause.h + 12;
  const sub: Rect = { x: x1, y: subTop, w: cw, h: (n ? barY - 10 : vh - B - 12) - subTop };
  return { orientation: 'landscape', home, pause, chip, moves, head, goals, boardArea, panel, cell, rim: RIM, dock, ox: panel.x + RIM, oy: panel.y + RIM, tools, toolBtns, sub, tooSmall: cell < 28, size: 'phone' };
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
