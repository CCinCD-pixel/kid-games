// site/dev/board/layout.ts — 游乐场布局纯函数（布局契约的演示）：layout(viewport, aspect) → 矩形集合；vitest 用 checkLayout 断言
// "全部元素在安全区内、可点 ≥44、互不重叠、底部余量 ≥8"。🏠 键占左上 56×56（+12 边距 + 安全区）。
import { fitRect, safeRect, type Rect, type Viewport } from '@engines/board/view/layout-types';

export interface DemoLayout { back: Rect; status: Rect; board: Rect; boardBox: Rect; panel: Rect; landscape: boolean }
export const DEMO_PANEL_H = 148, DEMO_PANEL_H_PHONE = 92;
/** reserve = 棋盘下方给课步骤界面（答题按钮条）留的高度（px）；缺省 0 */
export function demoLayout(vp: Viewport, aspect: number, reserve = 0): DemoLayout {
  const S = safeRect(vp), G = 12, BACK = 56; const back: Rect = { x: S.x + G, y: S.y + G, w: BACK, h: BACK };
  if (vp.w > vp.h) {                                              // 横屏：左 = 🏠 列，中 = 棋盘（占满高度），右 = 面板
    const boxX = back.x + BACK + G, boxY = S.y + 8, boxH = S.h - 16 - reserve; const boardW = Math.min(boxH * aspect, S.w * 0.62);
    const boardBox: Rect = { x: boxX, y: boxY, w: boardW, h: boxH }; const board = fitRect(boardBox, aspect, { x: 'start' });
    const px = board.x + board.w + G, pw = S.x + S.w - G - px;
    const status: Rect = { x: px, y: S.y + G, w: pw, h: BACK }; const panel: Rect = { x: px, y: status.y + status.h + 8, w: pw, h: S.y + S.h - G - (status.y + status.h + 8) };
    return { back, status, board, boardBox, panel, landscape: true };
  }
  const status: Rect = { x: back.x + BACK + G, y: back.y, w: S.x + S.w - G - (back.x + BACK + G), h: BACK };
  const ph = vp.w < 600 ? DEMO_PANEL_H_PHONE : DEMO_PANEL_H; const panel: Rect = { x: S.x + G, y: S.y + S.h - G - ph, w: S.w - 2 * G, h: ph };
  const boardBox: Rect = { x: S.x + 4, y: back.y + BACK + 6, w: S.w - 8, h: panel.y - 8 - (back.y + BACK + 6) - reserve }; const board = fitRect(boardBox, aspect);
  return { back, status, board, boardBox, panel, landscape: false };
}
