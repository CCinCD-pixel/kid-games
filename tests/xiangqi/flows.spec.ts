// 楚河棋院：学堂课 / 星图 / 面对面 的端到端（WebKit，触摸）。
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SHOTS_DIR } from './playwright.config';
import { parseSq } from '../../site/xiangqi/src/rules/position';

type Rect = { x: number; y: number; w: number; h: number };
const rectOf = (page: Page, name: string): Promise<Rect> => page.evaluate((ix) => { const b = (window as unknown as { __xq: { view: { rect(i: number): DOMRect } } }).__xq.view.rect(ix); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, parseSq(name));
async function tap(page: Page, name: string): Promise<void> { const r = await rectOf(page, name); await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2); }
async function shot(page: Page, project: string, name: string): Promise<void> { mkdirSync(`${SHOTS_DIR}/${project}`, { recursive: true }); await page.screenshot({ path: `${SHOTS_DIR}/${project}/pw-${name}.png` }); }
const clean = (errs: string[]): string[] => errs.filter((e) => !/Failed to load resource/.test(e));
async function boot(page: Page, q: string, sel: string): Promise<string[]> {
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.addInitScript({ path: 'tools/qa/mute-audio.js' }); await page.goto(`/xiangqi/?dev=1&${q}`); await page.waitForSelector(sel, { timeout: 20_000 }); await page.waitForTimeout(500); return errs;
}

test('学堂：路径图 → L04 第一步（车走到星星）→ 进入下一步', async ({ page }, info) => {
  const errs = await boot(page, 'screen=academy', '.xq-academy'); await shot(page, info.project.name, 'academy');
  await page.goto('/xiangqi/?dev=1&screen=lesson&lesson=L04&intro=0'); await page.waitForSelector('.xq-lesson[data-ready]'); await page.waitForFunction(() => (window as unknown as { __xq: { step: string } }).__xq.step === 'L04.1', null, { timeout: 15_000 });
  await page.waitForTimeout(800); await tap(page, 'a1'); await tap(page, 'a6'); await page.waitForFunction(() => (window as unknown as { __xq: { step: string } }).__xq.step !== 'L04.1', null, { timeout: 15_000 });
  await shot(page, info.project.name, 'lesson-step2'); expect(clean(errs)).toEqual([]);
});

test('星图：做对一道一步杀（首次做对）', async ({ page }, info) => {
  const errs = await boot(page, 'screen=starmap', '.xq-lesson[data-ready]'); await page.waitForFunction(() => (window as unknown as { __xq: { queue: unknown[] } }).__xq.queue.length > 0, null, { timeout: 15_000 });
  const q = await page.evaluate(() => (window as unknown as { __xq: { queue: { sol: string }[] } }).__xq.queue[0]); await page.waitForTimeout(800);
  const from = q.sol.slice(0, q.sol.length === 4 ? 2 : q.sol.length - 2 > 2 ? 3 : 2); void from;
  const m = /^([a-i]\d+)([a-i]\d+)$/.exec(q.sol) as RegExpExecArray; console.log('starmap', JSON.stringify(q)); await tap(page, m[1]); await tap(page, m[2]); await page.waitForTimeout(600); await shot(page, info.project.name, 'starmap-try');
  await page.waitForFunction(() => (window as unknown as { __xq: { ix: number } }).__xq.ix >= 1, null, { timeout: 15_000 }); await shot(page, info.project.name, 'starmap-next');
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:xiangqi') ?? '{}').data.puzzles.recent30); expect(rec).toEqual([true]); expect(clean(errs)).toEqual([]);
});

test('面对面：双方走子、黑方字形旋转、悔棋要对方同意', async ({ page }, info) => {
  const errs = await boot(page, 'mode=f2f&seed=7', '.xq-game[data-ready]');
  await tap(page, 'h3'); await tap(page, 'e3'); await page.waitForFunction(() => (window as unknown as { __xq: { idle: boolean } }).__xq.idle); await tap(page, 'h10'); await tap(page, 'g8'); await page.waitForFunction(() => (window as unknown as { __xq: { idle: boolean; encoded(): string[] } }).__xq.idle && (window as unknown as { __xq: { encoded(): string[] } }).__xq.encoded().length === 2);
  await page.locator('[data-key="undo-1"]').tap(); await page.waitForSelector('.bk-f2f-card'); await shot(page, info.project.name, 'f2f-consent');
  await page.getByRole('button', { name: '同意' }).tap(); await page.waitForFunction(() => (window as unknown as { __xq: { encoded(): string[] } }).__xq.encoded().length === 1, null, { timeout: 10_000 });
  expect(clean(errs)).toEqual([]);
});
