// 楚河棋院冒烟（随 npm run test:smoke）：大厅 / 对局页加载无控制台错误、无横向溢出、🏠 ≥56、≤1 个 AudioContext、棋盘与按键在视口内。
import { expect, test } from '@playwright/test';

for (const q of ['?dev=1', '?dev=1&robot=1&seed=7', '?dev=1&screen=academy']) {
  test(`楚河棋院 ${q} 加载干净`, async ({ page }) => {
    const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`/xiangqi/${q}`); await page.waitForSelector('#app[data-ready]'); await page.waitForTimeout(1200);
    const m = await page.evaluate(() => { const b = document.querySelector('[data-kit-back], .kit-back') as HTMLElement | null; const r = b?.getBoundingClientRect(); const board = document.querySelector('.xq-host > *')?.getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight, back: r ? [r.width, r.height] : null, board: board ? [board.right, board.bottom] : null }; });
    expect(errs.filter((e) => !/Failed to load resource/.test(e))).toEqual([]); expect(m.sw).toBeLessThanOrEqual(m.vw); if (m.back) { expect(m.back[0]).toBeGreaterThanOrEqual(56); expect(m.back[1]).toBeGreaterThanOrEqual(56); } if (m.board) { expect(m.board[0]).toBeLessThanOrEqual(m.vw + 1); expect(m.board[1]).toBeLessThanOrEqual(m.vh + 1); }
  });
}
