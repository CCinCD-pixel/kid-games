// site/xiangqi/src/app/layout.ts — 楚河棋院"纯函数"布局（spec §2.2；原型 xiangqi-tools/layout.mjs 的 TS 版，断言见 tests/layout.test.ts）。
// 单位 CSS px。输入：视口 + 安全区 + 屏幕类型；输出：全部元素矩形（棋盘外框 9.1c×10.1c，含 0.55c 边距）。纯函数、无 DOM。
export interface Rect { x: number; y: number; w: number; h: number }
export interface Vp { w: number; h: number; safe: { t: number; r: number; b: number; l: number } }
export type Screen = 'game' | 'f2f' | 'lesson';
export type Cluster = { rotated: boolean; keys: Rect[] };
export type Trays = { mode: 'none' } | { mode: 'frame'; top: Rect; bottom: Rect } | { mode: 'chip'; chip: Rect };
export interface Layout { portrait: boolean; coordRow: Rect | null; lefty: boolean; phone: boolean; screen: Screen; S: Rect; home: Rect; skip: Rect | null; title: Rect | null; board: Rect; grid: Rect; c: number; dock: Rect | null; panel: Rect | null; companion: Rect; bubble: Rect; keys: Rect[]; dots: Rect | null; trays: Trays; blackCluster: Cluster | null; redCluster: Cluster | null; replay: Rect | null; popover: Rect | null }
export const K = { TOUCH: 44, HOME: 56, GUTTER: 12, GAP: 8, SLACK: 8, TRAY_FRAME_MIN_C: 60, BOARD_W: 9.1, BOARD_H: 10.1 };
const R = (x: number, y: number, w: number, h: number): Rect => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
export const right = (r: Rect): number => r.x + r.w, bottom = (r: Rect): number => r.y + r.h;
/** keys：把 n 个按键等分到宽 w 的行里，每个 ≤max，≥TOUCH；返回 [{x,y,w,h}]（行起点 x0,y0，行高 h） */
function keyRow(x0: number, y0: number, w: number, h: number, n: number, max = 76, gap = 6): Rect[] { const kw = Math.min(max, Math.floor((w - gap * (n - 1)) / n)); const tot = kw * n + gap * (n - 1); const sx = x0 + Math.max(0, Math.floor((w - tot) / 2)); return Array.from({ length: n }, (_, i) => R(sx + i * (kw + gap), y0, kw, h)); }
export interface LayoutOpts { screen: Screen; /** 竖线号：在棋盘下方留一条 COORD_H 的数字行（棋盘外框边距里放不下：端线棋子的半径占满了边距） */ coords?: boolean; /** 左手顺手：横屏 = 面板在左、棋盘在右；竖屏 = 键组靠 dock 左侧、伙伴靠右 */ lefty?: boolean }
export const COORD_H = 22;
export function layout(vp: Vp, o: LayoutOpts = { screen: 'game' }): Layout {
  const S = R(vp.safe.l, vp.safe.t, vp.w - vp.safe.l - vp.safe.r, vp.h - vp.safe.t - vp.safe.b);
  const portrait = vp.h >= vp.w, phone = Math.min(vp.w, vp.h) < 500, screen = o.screen; const lefty = !!o.lefty && screen !== 'f2f'; const cH = o.coords && !(screen === 'lesson' && phone) ? COORD_H : 0;   // 手机上的课太挤：不留数字行
  const L = { portrait, phone, screen, S, skip: null, title: null, c: 0, dock: null, panel: null, keys: [], dots: null, blackCluster: null, redCluster: null, replay: null, popover: null, coordRow: null, lefty } as unknown as Layout;
  const nKeys = screen === 'lesson' ? 3 : 4; // game/f2f：悔棋 灯泡 存/退 设置；lesson：再听一遍 灯泡 上一步（跳过在页眉）
  const TS = 34;                              // iPad 竖屏：吃子托盘两格并排在 dock 顶部（不再压在棋盘外框边距里盖住端线棋子）
  if (portrait) {
    const top = S.y + 4;
    L.home = R(S.x + K.GUTTER, top, K.HOME, K.HOME);
    L.skip = screen === 'f2f' ? null : R(right(S) - K.GUTTER - 88, top + 6, 88, 44);
    // 底部 dock 最小高度：iPad 150；手机 = 行1(伙伴+气泡 56..64) + 行2(键 48) + 内边距；lesson 另加步骤点 16
    const dockMin = phone ? 132 + (screen === 'lesson' ? 20 : 0) : 150 + (screen === 'lesson' ? 20 : 0);
    const topBand = screen === 'f2f' ? K.HOME + 8 : K.HOME + 4; // f2f：黑簇在页眉里（🏠 右侧）
    const availH = S.h - 4 - topBand - K.GAP - dockMin - K.SLACK - 4 - cH, availW = S.w - 2 * K.GUTTER;
    const c = Math.floor(Math.min(availW / K.BOARD_W, availH / K.BOARD_H)); L.c = c;
    const bw = c * K.BOARD_W, bh = c * K.BOARD_H; const bx = S.x + (S.w - bw) / 2, by = S.y + 4 + topBand + 4;
    L.board = R(bx, by, bw, bh); L.grid = R(bx + 0.55 * c, by + 0.55 * c, 8 * c, 9 * c); if (cH) L.coordRow = R(L.grid.x, bottom(L.board) + 1, 8 * c, cH - 1);
    const dockTop = bottom(L.board) + cH + K.GAP; L.dock = R(S.x + K.GUTTER, dockTop, S.w - 2 * K.GUTTER, bottom(S) - K.SLACK - dockTop);
    const d = L.dock; const strip = screen !== 'lesson' && c >= K.TRAY_FRAME_MIN_C ? TS : 0;
    if (phone) { // 两行：伙伴头 + 气泡 / 一排键
      const keyH = 48, padB = 8, padX = 8;      // QA r2 m3：键行离面板下沿 8 px、离左右边 8 px（原先下边与面板圆角边线重合）
      const rowH = d.h - keyH - 8 - padB - (screen === 'lesson' ? 20 : 0) - 4; const y1 = d.y + (screen === 'lesson' ? 20 : 0) + 4; const dx = d.x + padX, dw = d.w - 2 * padX;
      if (screen === 'lesson') L.dots = R(d.x, d.y + 4, d.w, 16);
      L.companion = R(lefty ? right(d) - padX - 56 : dx, y1, 56, Math.min(56, rowH)); L.bubble = R(lefty ? dx : dx + 64, y1, dw - 64, Math.min(64, rowH));
      L.keys = keyRow(dx, bottom(d) - padB - keyH, dw, keyH, nKeys, 76, 6);
    } else { // iPad：伙伴 96 + 气泡（左），键（右）；左手：键在左、伙伴 + 气泡在右（键序不变，灯泡键始终是左起第二个）
      if (screen === 'lesson') L.dots = R(d.x, d.y, d.w, 16);
      const y1 = d.y + (screen === 'lesson' ? 20 : 0) + strip, h1 = d.h - (screen === 'lesson' ? 20 : 0) - strip;
      const kw = 76, kg = 8, kt = nKeys * kw + (nKeys - 1) * kg; const E = 12;      // QA r2 m3：键组离面板左 / 右边线 12 px（原先"设置"键贴着右边线）
      if (lefty) { L.companion = R(right(d) - E - 96, y1 + (h1 - 96) / 2, 96, 96); L.bubble = R(d.x + E + kt + 16, y1 + 8, d.w - 2 * E - 96 - kt - 16 - 8, h1 - 16); L.keys = Array.from({ length: nKeys }, (_, i) => R(d.x + E + i * (kw + kg), y1 + (h1 - 64) / 2, kw, 64)); }
      else { L.companion = R(d.x + E, y1 + (h1 - 96) / 2, 96, 96); L.bubble = R(d.x + E + 104, y1 + 8, d.w - 2 * E - 104 - kt - 16, h1 - 16); L.keys = Array.from({ length: nKeys }, (_, i) => R(right(d) - E - kt + i * (kw + kg), y1 + (h1 - 64) / 2, kw, 64)); }
    }
    if (screen === 'f2f') { // 黑簇（旋转 180°）放在页眉 🏠 右侧；红簇 = 上面的 dock keys
      const x0 = right(L.home) + 8, w0 = right(S) - K.GUTTER - x0; L.blackCluster = { rotated: true, keys: keyRow(x0, top + 4, w0, 48, 4, 64, 6) };
      L.redCluster = { rotated: false, keys: L.keys };
    }
    // 吃子托盘（c ≥ 60）：dock 顶部一行，左半 / 右半各一格
    if (strip) { const half = Math.floor((d.w - 16 - 8) / 2); L.trays = { mode: 'frame', top: R(d.x + 8 + half + 8, d.y + 2, half, TS - 4), bottom: R(d.x + 8, d.y + 2, half, TS - 4) }; }   // 我吃的（下）靠左，对方吃的（上）靠右
  } else { // 横屏：左棋盘右面板（左手：左面板右棋盘）
    const panelMin = phone ? 300 : 300;
    const availH = S.h - 2 * K.GAP - cH, availW = S.w - 2 * K.GUTTER - K.GAP - panelMin;
    const c = Math.floor(Math.min(availH / K.BOARD_H, availW / K.BOARD_W)); L.c = c;
    const bw = c * K.BOARD_W, bh = c * K.BOARD_H; const by = S.y + Math.max(K.GAP, Math.floor((S.h - bh - cH) / 2));
    const bx = lefty ? right(S) - K.GUTTER - bw : S.x + K.GUTTER;
    L.board = R(bx, by, bw, bh); L.grid = R(bx + 0.55 * c, by + 0.55 * c, 8 * c, 9 * c); if (cH) L.coordRow = R(L.grid.x, bottom(L.board) + 1, 8 * c, cH - 1);
    const px = lefty ? S.x + K.GUTTER : right(L.board) + K.GAP + 4, pw = lefty ? bx - K.GAP - 4 - px : right(S) - K.GUTTER - px, py = S.y + K.GAP, ph = S.h - 2 * K.GAP - 4; L.panel = R(px, py, pw, ph);
    // 面板从上到下：页眉行（🏠 + 标题 + 跳过）· 伙伴+气泡 · [步骤点] · 键 · [吃子 chip]
    L.home = R(px, py, K.HOME, K.HOME); L.skip = screen === 'f2f' ? null : R(px + pw - 88, py + 6, 88, 44);
    const headBottom = py + K.HOME + 6;
    if (screen === 'f2f') { // 上半黑簇（旋转），下半红簇
      L.blackCluster = { rotated: true, keys: keyRow(px, headBottom, pw, 48, 2, 120, 6).concat(keyRow(px, headBottom + 54, pw, 48, 2, 120, 6)) };
      L.redCluster = { rotated: false, keys: keyRow(px, bottom(L.panel) - 102, pw, 48, 2, 120, 6).concat(keyRow(px, bottom(L.panel) - 48, pw, 48, 2, 120, 6)) };
      L.companion = R(px, headBottom + 112, 56, 56); L.bubble = R(px + 64, headBottom + 112, pw - 64, Math.max(48, bottom(L.panel) - 108 - (headBottom + 112) - 8));
      if (L.bubble.h < 48) L.bubble.h = 48;
    } else {
      const compH = phone ? 56 : 96; L.companion = R(px, headBottom, compH, compH); L.bubble = R(px + compH + 8, headBottom, pw - compH - 8, phone ? 72 : 120);
      let y = headBottom + Math.max(compH, L.bubble.h) + 8; if (screen === 'lesson') { L.dots = R(px, y, pw, 16); y += 22; }
      const kh = phone ? 48 : 64; const per = 2, rows = Math.ceil(nKeys / per); L.keys = [];
      for (let r = 0; r < rows; r++) { const n = Math.min(per, nKeys - r * per); L.keys.push(...keyRow(px, y + r * (kh + 6), pw, kh, n, 120, 6)); }
      // 吃子托盘（c ≥ 60）：键组下面两行（上 = 黑方吃的红子，下 = 红方吃的黑子）
      if (screen !== 'lesson' && c >= K.TRAY_FRAME_MIN_C) { const ky = Math.max(...L.keys.map((k) => bottom(k))) + 12; L.trays = { mode: 'frame', top: R(px, ky, pw, TS), bottom: R(px, ky + TS + 6, pw, TS) }; }
    }
  }
  // 吃子托盘：c ≥ 60 在 dock / 面板里（上面）；否则一个 64×44 chip + 弹层（课/谜题没有吃子，不画）
  if (screen === 'lesson') L.trays = { mode: 'none' };
  else if (!L.trays || (L.trays as { mode?: string }).mode === undefined) {
    const cw = 64, ch = 44;
    if (portrait) { const y1 = L.companion.y; L.trays = { mode: 'chip', chip: R(lefty ? L.dock!.x + 8 : right(L.dock!) - cw - 8, y1, cw, ch) }; L.bubble = R(lefty && phone ? L.bubble.x + cw + 8 : L.bubble.x, L.bubble.y, L.bubble.w - cw - 8, L.bubble.h); }
    else if (screen === 'f2f') { L.trays = { mode: 'chip', chip: R(right(L.panel!) - cw, L.companion.y, cw, ch) }; L.bubble = R(L.bubble.x, L.bubble.y, L.bubble.w - cw - 8, L.bubble.h); }
    else { L.trays = { mode: 'chip', chip: R(L.skip!.x - cw - 8, L.skip!.y, cw, ch) }; }
    const pw = Math.min(S.w - 2 * K.GUTTER, 360); L.popover = R(S.x + (S.w - pw) / 2, 0, pw, 2 * 44 + 24); // 弹层向上展开，锚在 dock 底（竖屏）或面板底（横屏）
    const anchorBottom = portrait ? bottom(L.dock!) : bottom(L.panel!); L.popover.y = Math.max(S.y + 4, anchorBottom - L.popover.h - 4);
  }
  return L;
}
export interface HallLayout { S: Rect; portrait: boolean; phone: boolean; home: Rect; settings: Rect; doors: Rect[]; resume: Rect | null; shelf: Rect; wall: Rect; companion: Rect; bubble: Rect; hasResume: boolean }
// ================= 非棋盘屏：大厅 / 学堂地图 / 机关人选择 / 赛前面板（同一套纯函数，同一个测试）=================
/** 大厅：页眉 · 三扇门 · 接着下条 · 陈列架（6 位机关人剪影）· 棋院印墙 · 伙伴 dock。竖屏纵向堆叠；横屏左门右栏。全部 flex 取整，不滚动。 */
export function layoutHall(vp: Vp, o: { hasResume?: boolean } = {}): HallLayout {
  const S = R(vp.safe.l, vp.safe.t, vp.w - vp.safe.l - vp.safe.r, vp.h - vp.safe.t - vp.safe.b); const portrait = vp.h >= vp.w, phone = Math.min(vp.w, vp.h) < 500; const G = K.GUTTER, gap = 8;
  const L: HallLayout = { S, portrait, phone, home: R(S.x + G, S.y + 4, K.HOME, K.HOME), settings: R(right(S) - G - K.TOUCH - 4, S.y + 10, K.TOUCH + 4, K.TOUCH + 4), doors: [], resume: null, shelf: null as unknown as Rect, wall: null as unknown as Rect, companion: null as unknown as Rect, bubble: null as unknown as Rect, hasResume: !!o.hasResume };
  const headB = S.y + 4 + K.HOME + gap;
  if (portrait) {
    const dockH = phone ? 80 : 128, resumeH = o.hasResume ? (phone ? 52 : 64) : 0, shelfH = phone ? 72 : 112, wallH = phone ? 56 : 104, gaps = 5 * gap;
    const doorsH = Math.max(120, bottom(S) - K.SLACK - headB - dockH - resumeH - shelfH - wallH - gaps - (o.hasResume ? 0 : 0)); const dw = Math.floor((S.w - 2 * G - 2 * gap) / 3);
    let y = headB; L.doors = [0, 1, 2].map((i) => R(S.x + G + i * (dw + gap), y, dw, doorsH)); y += doorsH + gap;
    if (resumeH) { L.resume = R(S.x + G, y, S.w - 2 * G, resumeH); y += resumeH + gap; }
    L.shelf = R(S.x + G, y, S.w - 2 * G, shelfH); y += shelfH + gap; L.wall = R(S.x + G, y, S.w - 2 * G, wallH); y += wallH + gap;
    const dockH2 = bottom(S) - K.SLACK - y; L.companion = R(S.x + G, y, phone ? 56 : 96, Math.min(dockH2, phone ? 56 : 96)); L.bubble = R(S.x + G + (phone ? 64 : 104), y, S.w - 2 * G - (phone ? 64 : 104), Math.min(dockH2, phone ? 64 : 96));
  } else {
    const panelW = Math.max(300, Math.floor(S.w * 0.36)), doorsW = S.w - 2 * G - panelW - gap; const dw = Math.floor((doorsW - 2 * gap) / 3); const h = bottom(S) - K.SLACK - headB;
    const resumeH = o.hasResume ? 52 : 0; const doorsH = h - resumeH - (resumeH ? gap : 0);
    L.doors = [0, 1, 2].map((i) => R(S.x + G + i * (dw + gap), headB, dw, doorsH)); if (resumeH) L.resume = R(S.x + G, headB + doorsH + gap, doorsW, resumeH);
    const px = S.x + G + doorsW + gap; const shelfH = phone ? 64 : 112, wallH = phone ? 56 : 104, compH = h - shelfH - wallH - 2 * gap;
    L.shelf = R(px, headB, panelW, shelfH); L.wall = R(px, headB + shelfH + gap, panelW, wallH); const y2 = headB + shelfH + wallH + 2 * gap; L.companion = R(px, y2, phone ? 56 : 96, Math.min(compH, phone ? 56 : 96)); L.bubble = R(px + (phone ? 64 : 104), y2, panelW - (phone ? 64 : 104), Math.min(compH, phone ? 64 : 96));
  }
  return L;
}
/** 学堂：页眉（🏠 + 标题 + 摸底条）固定；地图区 = 唯一可滚动区域（节点 ≥56 px）；底部 dock（伙伴 + 气泡）固定。 */
export function layoutMap(vp: Vp) { const S = R(vp.safe.l, vp.safe.t, vp.w - vp.safe.l - vp.safe.r, vp.h - vp.safe.t - vp.safe.b); const G = K.GUTTER, phone = Math.min(vp.w, vp.h) < 500, landPhone = phone && vp.w > vp.h; const head = R(S.x + G, S.y + 4, S.w - 2 * G, K.HOME);
  const dockH = landPhone ? 52 : phone ? 72 : 112; const dock = R(S.x + G, bottom(S) - K.SLACK - dockH, S.w - 2 * G, dockH);
  // 手机横屏：摸底条并入页眉右侧（省 60 px 纵向）
  const placement = landPhone ? R(right(head) - 200, head.y + 6, 200, 44) : R(S.x + G, bottom(head) + 8, S.w - 2 * G, 52); const mapTop = landPhone ? bottom(head) + 8 : bottom(placement) + 8; const map = R(S.x + G, mapTop, S.w - 2 * G, dock.y - 8 - mapTop);
  return { S, head, home: R(S.x + G, S.y + 4, K.HOME, K.HOME), placement, map, dock, nodeMin: 56 }; }
/** 机关人选择：竖屏 3×2 卡片（iPad）/ 手机 = 横向分页轮播（1 张 + 两侧露边）；固定"选"按钮在底。 */
export function layoutRobots(vp: Vp) { const S = R(vp.safe.l, vp.safe.t, vp.w - vp.safe.l - vp.safe.r, vp.h - vp.safe.t - vp.safe.b); const G = K.GUTTER, phone = Math.min(vp.w, vp.h) < 500, portrait = vp.h >= vp.w; const head = R(S.x + G, S.y + 4, S.w - 2 * G, K.HOME); const btn = R(S.x + (S.w - 220) / 2, bottom(S) - K.SLACK - 56, 220, 56); const area = R(S.x + G, bottom(head) + 8, S.w - 2 * G, btn.y - 8 - (bottom(head) + 8)); let cards: Rect[] = [];
  if (phone) { const w = Math.min(area.w - 72, 260); cards = [R(area.x + (area.w - w) / 2, area.y, w, area.h)]; } else { const cols = portrait ? 2 : 3, rows = portrait ? 3 : 2; const cw = Math.floor((area.w - (cols - 1) * 12) / cols), ch = Math.floor((area.h - (rows - 1) * 12) / rows); cards = Array.from({ length: 6 }, (_, i) => R(area.x + (i % cols) * (cw + 12), area.y + Math.floor(i / cols) * (ch + 12), cw, ch)); }
  return { S, head, btn, area, cards, phone }; }
/** 赛前面板（模态底板）：小局/整盘分段 · 让子缩略图行 · 轻松/教练 开关 · 开始。高度必须 ≤ 视口 − 安全区 − 16，且不滚动。 */
export function layoutSheet(vp: Vp) { const S = R(vp.safe.l, vp.safe.t, vp.w - vp.safe.l - vp.safe.r, vp.h - vp.safe.t - vp.safe.b); const phone = Math.min(vp.w, vp.h) < 500; const w = Math.min(S.w - 24, phone ? S.w - 24 : 560); const rows = { seg: 48, thumbs: phone ? 76 : 96, toggles: 2 * 44 + 6, start: 56 }; const pad = 14, gap = 8; const h0 = pad * 2 + rows.seg + rows.thumbs + rows.toggles + rows.start + 3 * gap + (phone ? 0 : 40); const h = Math.min(h0, S.h - 16);
  const x = S.x + (S.w - w) / 2, y = bottom(S) - 8 - h; let yy = y + pad; const items: Record<string, Rect> = {}; for (const [k, v] of Object.entries(rows)) { items[k] = R(x + pad, yy, w - 2 * pad, v); yy += v + gap; } return { S, sheet: R(x, y, w, h), items, need: h0, fits: h0 <= S.h - 16 }; }

/** 结果卡 / 提问卡的可用盒子（视口坐标，纯函数；tests/layout.test.ts 断言）：整张卡永远在安全区内，且**不压 🏠**（home = 当前屏 🏠 的真实位置；竖屏在左上，横屏在右侧面板的左上角）。
 *  竖屏 / 大屏 = 单列；矮横屏（高 < 560）= 两列（左：标题 + 正文，右：按键竖排）。🏠 若与卡片横向相交，卡片顶边下移到 🏠 下面。按键行永远整行可见，只有正文区能滚。 */
export interface ResultBox { box: Rect; pad: { t: number; r: number; b: number; l: number }; cols: 1 | 2; maxW: number }
export function resultBox(vp: Vp, home?: Rect | null): ResultBox {
  const S = R(vp.safe.l, vp.safe.t, vp.w - vp.safe.l - vp.safe.r, vp.h - vp.safe.t - vp.safe.b); const cols: 1 | 2 = vp.w > vp.h && vp.h < 560 ? 2 : 1; const maxW = cols === 2 ? 700 : 520; const M = 8;
  const hm = home ?? R(S.x + K.GUTTER, S.y + 4, K.HOME, K.HOME);
  const l = S.x + M, r = vp.w - right(S) + M; let t = S.y + M; const b = vp.h - bottom(S) + M;
  const w = Math.min(maxW, vp.w - l - r); const x = (vp.w - w) / 2;
  if (hm.x < x + w + M && right(hm) + M > x && bottom(hm) + M > t) t = Math.max(t, bottom(hm) + M);        // 🏠 与卡片横向相交 → 卡片放到 🏠 下面
  return { box: R(x, t, w, vp.h - t - b), pad: { t, r, b, l }, cols, maxW };
}
