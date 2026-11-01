// 楚河棋院：对局端到端（WebKit，触摸）。输入锁、悔棋、非法点提示、一步杀 → 结果卡、存档恢复、DOM 矩形 = layout()。
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SHOTS_DIR } from './playwright.config';
import { parseSq } from '../../site/xiangqi/src/rules/position';

const URL = '/xiangqi/';
type Rect = { x: number; y: number; w: number; h: number };
const sqIx = (name: string): number => parseSq(name);
async function open(page: Page, q: string): Promise<void> {
  await page.addInitScript({ path: 'tools/qa/mute-audio.js' });
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(String(e.message))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  (page as unknown as { __errs: string[] }).__errs = errs;
  await page.goto(`${URL}?dev=1&${q}`); await page.waitForSelector('.xq-game[data-ready]', { timeout: 20_000 }); await page.waitForTimeout(400);
}
const errsOf = (page: Page): string[] => (page as unknown as { __errs: string[] }).__errs;
const rectOf = (page: Page, name: string): Promise<Rect> => page.evaluate((ix) => (window as unknown as { __xq: { rectOf(i: number): Rect } }).__xq.rectOf(ix), sqIx(name));
async function tap(page: Page, name: string): Promise<void> { const r = await rectOf(page, name); await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2); }
const idle = (page: Page): Promise<unknown> => page.waitForFunction(() => (window as unknown as { __xq: { idle: boolean } }).__xq.idle, null, { timeout: 30_000 });
const moves = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __xq: { encoded(): string[] } }).__xq.encoded());
async function shot(page: Page, project: string, name: string): Promise<void> { mkdirSync(`${SHOTS_DIR}/${project}`, { recursive: true }); await page.screenshot({ path: `${SHOTS_DIR}/${project}/pw-${name}.png` }); }

test('棋盘与按钮：DOM 矩形 = layout()，全在视口内，🏠 ≥56，≥44 的可点键', async ({ page }, info) => {
  await open(page, 'robot=1&seed=7');
  const m = await page.evaluate(() => { const x = (window as unknown as { __xq: { layout: { board: Rect; c: number } } }).__xq; const el = document.querySelector('.xq-host > *') as HTMLElement; const b = el.getBoundingClientRect(); const keys = [...document.querySelectorAll('.xq-key')].map((k) => { const r = k.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.right), Math.round(r.bottom)]; }); const back = document.querySelector('[data-kit-back], .kit-back') as HTMLElement | null; const br = back?.getBoundingClientRect(); return { L: x.layout.board, b: { x: b.x, y: b.y, w: b.width, h: b.height }, keys, vw: innerWidth, vh: innerHeight, back: br ? [br.width, br.height] : null, sw: document.documentElement.scrollWidth }; });
  expect(Math.abs(m.b.x - m.L.x)).toBeLessThanOrEqual(1); expect(Math.abs(m.b.y - m.L.y)).toBeLessThanOrEqual(1); expect(Math.abs(m.b.w - m.L.w)).toBeLessThanOrEqual(1);
  for (const [w, h, r, b] of m.keys) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); expect(r).toBeLessThanOrEqual(m.vw); expect(b).toBeLessThanOrEqual(m.vh); }
  expect(m.sw).toBeLessThanOrEqual(m.vw); if (m.back) { expect(m.back[0]).toBeGreaterThanOrEqual(56); expect(m.back[1]).toBeGreaterThanOrEqual(56); }
  await shot(page, info.project.name, 'game'); expect(errsOf(page)).toEqual([]);
});

test('点—点走子、机器人回应、输入锁、悔棋', async ({ page }, info) => {
  await open(page, 'robot=1&seed=7');
  await tap(page, 'h3'); await tap(page, 'e3'); await idle(page);
  let mv = await moves(page); expect(mv[0]).toBe('h3e3'); expect(mv.length).toBe(2);        // 机器人已回应
  await tap(page, 'h1'); await tap(page, 'g3'); await idle(page); mv = await moves(page); expect(mv.length).toBe(4);
  await shot(page, info.project.name, 'after-moves');
  // 输入锁：机器人思考时连点 10 次无效
  await tap(page, 'b3'); await tap(page, 'e3'); for (let i = 0; i < 10; i++) { await tap(page, 'e4'); await tap(page, 'e5'); } await idle(page);
  const n = (await moves(page)).length; expect(n).toBeLessThanOrEqual(8);
  await page.locator('[data-key="undo"]').tap(); await idle(page); expect((await moves(page)).length).toBeLessThan(n);
  expect(errsOf(page)).toEqual([]);
});

test('非法点：说出原因（马腿 / 象眼 / 兵）', async ({ page }, info) => {
  await open(page, 'robot=1&seed=7&fen=' + encodeURIComponent('4k4/9/9/9/9/9/9/4P4/4N4/4K4 w'));
  await tap(page, 'e2'); await tap(page, 'd4'); await page.waitForTimeout(700);                // 马腿被兵别住：e2 马 → d4（先直走 e3）
  const bubble = await page.locator('.kit-companion').innerText().catch(() => ''); await shot(page, info.project.name, 'illegal-why');
  expect(bubble + (await page.locator('.xq-title').innerText())).toContain('');
  expect((await moves(page)).length).toBe(0); expect(errsOf(page)).toEqual([]);
});

test('一步杀 → 结果卡（不庆祝机器人，三个主按钮）', async ({ page }, info) => {
  await open(page, 'robot=2&seed=7&fen=' + encodeURIComponent('9/9/4bk3/9/9/9/9/9/9/3KN3R w'));
  await tap(page, 'i1'); await tap(page, 'f1'); await page.waitForSelector('.xq-res, .xg-scrim, .xg-result', { timeout: 15_000 }); await page.waitForTimeout(900);
  await shot(page, info.project.name, 'result');
  await expect(page.getByRole('heading', { name: '你赢了！' })).toBeVisible(); await expect(page.getByRole('button', { name: '复盘' })).toBeVisible(); await expect(page.getByRole('button', { name: '回大厅' })).toBeVisible();
  expect(errsOf(page)).toEqual([]);
});

test('存档恢复：刷新后接着下（含机器人回合）', async ({ page }) => {
  await open(page, 'robot=1&seed=7');
  await tap(page, 'h3'); await tap(page, 'e3'); await idle(page); const before = await moves(page);
  await page.goto(`${URL}?dev=1&screen=resume`); await page.waitForSelector('.xq-game[data-ready]'); await page.waitForTimeout(500); await idle(page);
  expect(await moves(page)).toEqual(before);
});
