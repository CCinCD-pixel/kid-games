// 楚河棋院 QA 第 1 轮修复的回归（WebKit）：课开场棋盘上有东西 + 输入锁、常驻目标条、摸底"好了"确认、竖线号 9 个数字、吃子托盘不压棋子、面对面悔棋退两步。
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import os from 'node:os';

const OUT = `${os.homedir()}/kid-games-work/shots/rr/fix-xiangqi`;
async function boot(page: Page, q: string, sel: string): Promise<string[]> {
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript({ path: 'tools/qa/mute-audio.js' }); await page.goto(`/xiangqi/?${q}`); await page.waitForSelector(sel, { timeout: 20_000 }); await page.waitForTimeout(400); return errs;
}
const tapSq = async (page: Page, name: string): Promise<void> => { const r = await page.evaluate((n) => { const b = (window as unknown as { __xq: { view: { rect(i: number): DOMRect } } }).__xq.view.rect((10 - parseInt(n.slice(1), 10)) * 9 + 'abcdefghi'.indexOf(n[0])); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, name); await page.touchscreen.tap(r.x, r.y); await page.waitForTimeout(250); };

test('课开场：念的时候棋盘上已有这一步的棋子，输入锁住（空盘点不出走法点），开始后目标条常驻', async ({ page }, info) => {
  mkdirSync(`${OUT}/${info.project.name}`, { recursive: true });
  const errs = await boot(page, 'dev=1&screen=lesson&lesson=L07&slow=1', '.xq-lesson[data-ready]'); await page.waitForTimeout(600);
  const intro = await page.evaluate(() => { const x = (window as unknown as { __xq: { state: { b: number[] }; live: boolean } }).__xq; return { pieces: x.state.b.filter(Boolean).length, live: x.live }; });
  expect(intro.live).toBe(false); expect(intro.pieces).toBe(3);                      // 炮 / 兵（炮架）/ 卒：课 7 第 1 步的局面，不是空盘也不是 32 子
  await tapSq(page, 'b3'); expect(await page.evaluate(() => (window as unknown as { __xq: { input: { selected: number | null } } }).__xq.input.selected)).toBeNull();
  await page.screenshot({ path: `${OUT}/${info.project.name}-fx-L07-intro.png` });
  await page.waitForFunction(() => (window as unknown as { __xq: { live: boolean } }).__xq.live, null, { timeout: 25_000 }); await page.waitForTimeout(300);
  await tapSq(page, 'b3'); expect(await page.evaluate(() => (window as unknown as { __xq: { input: { selected: number | null } } }).__xq.input.selected)).not.toBeNull();   // 开始后放开
  await expect(page.locator('.xq-goal')).toContainText('把黑棋全部吃掉'); await page.screenshot({ path: `${OUT}/${info.project.name}-fx-L07-live.png` });
  expect(errs).toEqual([]);
});

test('摸底：每题有目标条；点格子题要按「好了」，答错给出正确的点（不自动提交）', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=academy', '.xq-academy'); await page.locator('[data-act=placement]').click(); await page.waitForSelector('.xq-lesson[data-ready]'); await page.waitForFunction(() => (window as unknown as { __xq: { live: boolean } }).__xq.live);
  await expect(page.locator('.xq-goal')).toContainText('吃掉'); await tapSq(page, 'e2'); await tapSq(page, 'e7');
  await page.waitForFunction(() => (window as unknown as { __xq: { step: string } }).__xq.step === 'PL.2' && (window as unknown as { __xq: { live: boolean } }).__xq.live, null, { timeout: 15_000 }); await tapSq(page, 'b3'); await tapSq(page, 'b9');
  await page.waitForFunction(() => (window as unknown as { __xq: { step: string } }).__xq.step === 'PL.3' && (window as unknown as { __xq: { live: boolean } }).__xq.live, null, { timeout: 15_000 }); await page.waitForTimeout(300);
  await expect(page.locator('.xq-goal')).toContainText('点出它能走的所有点'); await tapSq(page, 'd3'); await tapSq(page, 'f3'); await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __xq: { step: string } }).__xq.step)).toBe('PL.3');      // 点够了也不自动提交
  await page.locator('.bk-su-btn[data-id=confirm]').click(); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${info.project.name}-fx-PL3-miss.png` });
  await page.waitForFunction(() => (window as unknown as { __xq: { step: string } }).__xq.step === 'PL.4', null, { timeout: 15_000 });
  expect(errs).toEqual([]);
});

test('竖线号：设置里打开 → 棋盘下方 9 个数字；吃子托盘在 dock 里，不压在端线棋子上', async ({ page }, info) => {
  const fen = encodeURIComponent('3k5/9/9/p8/9/9/9/9/R3K4/9 w'); const errs = await boot(page, `dev=1&robot=1&seed=7&fen=${fen}`, '.xq-game[data-ready]');
  await page.locator('[data-key=menu]').click(); await page.locator('.xq-menu .xq-btn', { hasText: '设置' }).click(); await page.locator('[data-setting=coords]').click(); await page.locator('[data-act=close]').click(); await page.waitForTimeout(500);
  expect(await page.locator('.xq-coordrow span').allTextContents()).toHaveLength(9); const first = await page.locator('.xq-coordrow span').first().innerText(); expect(first).toBe('九');
  await page.evaluate(() => (window as unknown as { __xq: { play(e: string): Promise<boolean> } }).__xq.play('a2a7')); await page.waitForTimeout(2200);
  await page.waitForFunction(() => !!document.querySelector('.xq-tray .xq-cap') || /吃子 \+/.test(document.querySelector('.xq-chip')?.textContent ?? ''), null, { timeout: 10_000 });   // 窄屏（SE）托盘收成「吃子 +1」小标
  const g = await page.evaluate(() => { const r = (e: Element | null) => { const b = e?.getBoundingClientRect(); return b ? { t: b.top, b: b.bottom, l: b.left, r: b.right } : null; }; const board = document.querySelector('.bk-board'); const vis = (e: Element): boolean => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }; const trays = [...document.querySelectorAll('.xq-tray, .xq-chip')].filter((e) => vis(e) && e.children.length + (e.textContent ?? '').length > 0 && (e.classList.contains('xq-chip') || e.querySelector('.xq-cap'))).map((e) => r(e)); return { board: r(board), trays }; });
  expect(g.trays.length).toBeGreaterThan(0); const vs = page.viewportSize()!; const land = vs.width > vs.height;
  for (const t of g.trays) { if (land) expect(t!.l >= g.board!.r - 1 || t!.r <= g.board!.l + 1, '横屏：托盘在侧栏，不压棋盘').toBe(true); else expect(t!.t).toBeGreaterThanOrEqual(g.board!.b - 1); }              // 竖屏：托盘在棋盘下方（dock 里）；横屏：在侧栏。都不在外框边距里
  await page.screenshot({ path: `${OUT}/${info.project.name}-fx-game-coords-tray.png` }); expect(errs).toEqual([]);
});

test('面对面悔棋：对方已应一步 → 红方悔棋两步一起退，回到开局', async ({ page }) => {
  const errs = await boot(page, 'dev=1&mode=f2f&seed=7', '.xq-game[data-ready]');
  await page.evaluate(() => (window as unknown as { __xq: { play(e: string): Promise<boolean> } }).__xq.play('h3e3')); await page.waitForTimeout(700);
  await page.evaluate(() => (window as unknown as { __xq: { play(e: string): Promise<boolean> } }).__xq.play('h10g8')); await page.waitForTimeout(700);
  expect(await page.evaluate(() => (window as unknown as { __xq: { session: { game: { moves: unknown[] } } } }).__xq.session.game.moves.length)).toBe(2);
  await page.locator('[data-key="undo-0"]').click(); await page.waitForTimeout(300); await page.locator('.bk-f2f-card[data-seat="1"] .bk-f2f-btn').first().click(); await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __xq: { session: { game: { moves: unknown[] } } } }).__xq.session.game.moves.length)).toBe(0);
  expect(errs).toEqual([]);
});
