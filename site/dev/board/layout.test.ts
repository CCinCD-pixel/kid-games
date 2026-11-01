import { describe, expect, it } from 'vitest';
import { checkLayout, rectBottom, rectInside, safeRect, SAFE_HOME_APP, SAFE_NONE, VIEWPORTS, type Viewport } from '@engines/board/view/layout-types';
import { demoLayout } from './layout';

describe('游乐场布局纯函数：5 视口 × 无安全区 / 主屏 App 安全区 × 两种棋盘比例', () => {
  for (const [name, base] of Object.entries(VIEWPORTS) as [keyof typeof VIEWPORTS, { w: number; h: number }][]) {
    for (const [safeName, safe] of [['none', SAFE_NONE], ['home', SAFE_HOME_APP[name]]] as const) for (const [game, aspect] of [['象棋', 910 / 1010], ['国象', 1]] as const) {
      it(`${name} ${safeName} ${game}`, () => {
        const vp: Viewport = { ...base, safe }; const L = demoLayout(vp, aspect); const S = safeRect(vp);
        const bad = checkLayout(vp, [{ name: 'back', rect: L.back, tappable: true }, { name: 'status', rect: L.status }, { name: 'board', rect: L.board }, { name: 'panel', rect: L.panel }]);
        expect(bad).toEqual([]); expect(rectInside(L.board, S)).toBe(true); expect(rectBottom(L.panel)).toBeLessThanOrEqual(rectBottom(S) - 8 + 0.5);
        expect(L.board.w / L.board.h).toBeCloseTo(aspect, 1);
        const c = (L.board.w / (aspect === 1 ? 900 : 910)) * 100; expect(c).toBeGreaterThan(name === 'se' ? 30 : name === 'phoneL' ? 34 : name === 'phoneP' ? 36 : 60);   // 一格的像素数：手机 ≥ 36，iPad ≥ 60
      });
    }
  }
});
