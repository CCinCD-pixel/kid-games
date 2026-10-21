// 楚河棋院第 2 轮功能的端到端（WebKit）：棋盒 / 复盘 + 摆到真棋盘 / 设置 / 印墙 / 家长角 / 理由图标 / 机关人 tell / 章牌 / ?dev=perf。
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SHOTS_DIR } from './playwright.config';
import { parseSq } from '../../site/xiangqi/src/rules/position';

type Rect = { x: number; y: number; w: number; h: number };
const rectOf = (page: Page, name: string): Promise<Rect> => page.evaluate((ix) => { const b = (window as unknown as { __xq: { view: { rect(i: number): DOMRect } } }).__xq.view.rect(ix); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, parseSq(name));
async function tap(page: Page, name: string): Promise<void> { const r = await rectOf(page, name); await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2); }
async function shot(page: Page, project: string, name: string): Promise<void> { mkdirSync(`${SHOTS_DIR}/${project}`, { recursive: true }); await page.screenshot({ path: `${SHOTS_DIR}/${project}/r2-${name}.png` }); }
const clean = (errs: string[]): string[] => errs.filter((e) => !/Failed to load resource/.test(e));
async function boot(page: Page, q: string, sel: string): Promise<string[]> {
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.addInitScript({ path: 'tools/qa/mute-audio.js' }); await page.goto(`/xiangqi/?${q}`); await page.waitForSelector(sel, { timeout: 20_000 }); await page.waitForTimeout(400); return errs;
}
const MATE1 = encodeURIComponent('4k4/R8/9/1R7/9/9/9/9/3P5/3K5 w');
const xq = (page: Page, expr: string): Promise<unknown> => page.evaluate(`(async () => { const x = window.__xq; return ${expr}; })()`);

test('棋盒：棋子弹上盘 → 炮隔子吃 → 双车将死 → 星飞过河与九宫 → 发现印 → 大厅依次点亮', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&intro=box', '.xq-box[data-ready]');
  await page.waitForFunction(() => (window as unknown as { __xq: { phase: string } }).__xq.phase === 'play', null, { timeout: 15_000 }); await shot(page, info.project.name, 'box-play');
  expect(await xq(page, 'x.session.game.state().b.filter(Boolean).length')).toBe(6);
  expect(await xq(page, "x.play('b3b10')")).toBe(true);                                                  // 炮隔着马吃车
  await page.waitForFunction(() => (window as unknown as { __xq: { phase: string } }).__xq.phase === 'goal', null, { timeout: 10_000 });
  await page.waitForFunction(() => (window as unknown as { __xq: { session: { game: { fen(): string } } } }).__xq.session.game.fen().startsWith('4k4'), null, { timeout: 10_000 }); await page.waitForTimeout(500); await shot(page, info.project.name, 'box-goal');
  expect(await xq(page, "x.play('a9a8')")).toBe(true);                                                   // 没将死：不说"错"，回到原位再来
  await page.waitForTimeout(1400); expect(await xq(page, 'x.session.game.fen()')).toContain('4k4/R8/9/1R7');
  expect(await xq(page, "x.play('b7b10')")).toBe(true);
  await page.waitForFunction(() => (window as unknown as { __xq: { phase: string } }).__xq.phase === 'star', null, { timeout: 10_000 });
  await page.waitForSelector('.xq-star', { timeout: 15_000 }); await page.waitForTimeout(1800); await shot(page, info.project.name, 'box-star'); await page.locator('.xq-star').dispatchEvent('pointerdown'); await page.waitForSelector('.xq-discover'); await shot(page, info.project.name, 'box-stamp');
  await page.waitForSelector('.xq-star', { timeout: 15_000 }); await page.waitForTimeout(1800); await page.locator('.xq-star').dispatchEvent('pointerdown');
  await page.waitForSelector('.xq-hall.is-intro', { timeout: 15_000 }); await page.waitForTimeout(2500); await shot(page, info.project.name, 'hall-intro');
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:xiangqi') ?? '{}').data); expect(s.intro).toEqual({ box: true, river: true, palace: true }); expect(s.lessons.L01.known).toBe(true);
  expect(clean(errs)).toEqual([]);
});
test('棋盒：跳过按钮 1.5 秒后出现，点了直接回大厅且不再出现棋盒', async ({ page }) => {
  await boot(page, 'dev=1&intro=box', '.xq-box[data-ready]'); await page.waitForTimeout(1900); await page.getByText('跳过').first().click(); await page.waitForSelector('.xq-hall', { timeout: 8000 });
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:xiangqi') ?? '{}').data); expect(s.intro.box).toBe(true);
  await page.goto('/xiangqi/?dev=1&intro=box'); await page.waitForSelector('.xq-hall', { timeout: 8000 });   // 已看过 → 直接大厅（intro=box 只是允许开发时显示）
});
test('复盘：精彩时刻（将死）+ 棋谱条 + 摆到真棋盘 + 从这里重新下', async ({ page }, info) => {
  const errs = await boot(page, `dev=1&mode=xj&robot=1&seed=7&fen=${MATE1}`, '.xq-game[data-ready]');
  await xq(page, "x.play('b7b10')"); await page.getByRole('button', { name: '复盘' }).waitFor({ timeout: 15_000 }); await page.waitForSelector('.xq-res[data-armed="1"]'); await shot(page, info.project.name, 'result-xj');      // 结果卡弹出后 600 ms 内不接受点击（补发点击防护）
  const narrow = page.viewportSize()!.height < 640; if (narrow) { await page.getByText('复盘', { exact: true }).first().click(); await page.waitForSelector('.xq-notes .xq-note-chip'); await page.locator('[data-key=r-more]').click(); await page.getByText('摆到真棋盘', { exact: true }).click(); } else await page.getByText('摆到真棋盘', { exact: true }).click();
  await page.waitForSelector('.xq-diagram'); expect(await page.locator('.xq-diagram circle').count()).toBe(5); expect(await page.locator('.xq-plist').innerText()).toContain('帅'); await shot(page, info.project.name, 'real-board');
  await page.getByText('好了', { exact: true }).click(); if (!narrow) { await page.waitForSelector('.xq-res[data-armed="1"]'); await page.getByText('复盘', { exact: true }).first().click(); await page.waitForSelector('.xq-notes .xq-note-chip'); }
  expect(await page.locator('.xq-note-chip.is-pos').count()).toBe(1); expect(await page.locator('.xq-note-chip').first().innerText()).toBe('开局'); expect(await page.locator('.xq-note-chip').nth(1).innerText()).toContain('车八进三');
  await page.locator('[data-key=r-spot]').click(); await page.waitForTimeout(1200); expect(await xq(page, 'x.replay.ply')).toBe(1); await shot(page, info.project.name, 'replay-mate');
  expect(await xq(page, 'x.highlights.length')).toBe(1);
  await page.locator('.xq-note-chip').first().click(); await page.waitForTimeout(500);
  await page.locator('[data-key=r-more]').click(); await page.getByText('从这里重新下', { exact: true }).click(); await page.waitForSelector('.xq-game[data-ready]'); await page.waitForTimeout(600);
  expect(await xq(page, 'x.session.game.fen()')).toContain('4k4/R8'); expect(clean(errs)).toEqual([]);
});
test('设置 / 印墙 / 家长角（长按页眉 3 秒）', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1', '.xq-hall');
  await page.locator('.xq-gear').click(); await page.waitForSelector('.is-settings'); expect(await page.locator('.is-settings [data-setting]').count()).toBe(6);
  await page.locator('[data-setting=danger]').click(); await page.locator('[data-setting=hand]').click(); await page.locator('[data-setting=material]').click(); await page.getByText('好了', { exact: true }).click();
  let s = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:xiangqi') ?? '{}').data.settings); expect(s.dangerHatch).toBe(true); expect(s.handedness).toBe('left'); expect(s.material).toBe(false);
  await page.locator('[data-act=wall]').click(); await page.waitForSelector('.is-wall'); expect(await page.locator('.xq-cardchip').count()).toBe(8); expect(await page.locator('.xq-cardchip.is-locked').count()).toBe(8); await shot(page, info.project.name, 'wall'); await page.getByText('好了', { exact: true }).click();
  const t = page.locator('.xq-hall-title'); const b = (await t.boundingBox())!; await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(3300); await page.mouse.up();
  await page.waitForSelector('.is-parent'); const txt = await page.locator('.is-parent').innerText(); for (const k of ['训练目标', '课标锚点', '证据等级', '困毙', '长将', '限着']) expect(txt).toContain(k); await shot(page, info.project.name, 'parent');
  s = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:xiangqi') ?? '{}').data.settings); expect(s.houseRules).toBeTruthy(); expect(clean(errs)).toEqual([]);
});
test('理由图标：马腿 = 脚印；见面 = 金线', async ({ page }, info) => {
  const errs = await boot(page, `dev=1&robot=2&seed=7&fen=${encodeURIComponent('4k4/9/9/9/9/9/9/4p4/4N4/3K5 w')}`, '.xq-game[data-ready]');
  await tap(page, 'e2'); await tap(page, 'd4'); await page.waitForSelector('.xq-badge.is-leg', { timeout: 3000 }); await shot(page, info.project.name, 'reason-leg');
  await page.waitForTimeout(2800); expect(await page.locator('.xq-badge').count()).toBe(0);
  await xq(page, "x.setFen('4k4/9/9/9/9/9/R8/9/9/3K5 w')"); await page.waitForTimeout(300); await tap(page, 'd1'); await tap(page, 'e1'); await page.waitForSelector('g[data-kind=sight]', { state: 'attached', timeout: 3000 }); await shot(page, info.project.name, 'reason-face');
  expect(clean(errs)).toEqual([]);
});
test('机关人的小动作：木牛思考时眼睛锁住它想吃的子（琥珀线）', async ({ page }, info) => {
  const errs = await boot(page, `dev=1&robot=2&seed=7&side=1&fen=${encodeURIComponent('4k4/9/9/9/9/9/9/9/r3R4/3K5 w')}`, '.xq-game[data-ready]');
  await page.waitForSelector('.xq-tell line', { timeout: 4000 }); await shot(page, info.project.name, 'tell-r2'); expect(await page.locator('.xq-av.is-think').count()).toBeGreaterThan(0); expect(clean(errs)).toEqual([]);
});
test('学堂：九张章牌 +「我会了」', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=academy', '.xq-academy .xq-chap'); expect(await page.locator('.xq-chap').count()).toBe(9); expect(await page.locator('.xq-node').count()).toBe(33);
  for (const r of await page.locator('.xq-chap-know, .xq-node, .xq-placement, button.xq-btn').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }))) expect(Math.min(r[0], r[1])).toBeGreaterThanOrEqual(44);
  await page.locator('[data-know="1"]').click(); await page.waitForSelector('.xq-res[data-armed="1"]'); await page.getByText('真的会').click(); await page.waitForTimeout(300); expect(await page.locator('.xq-chap').first().innerText()).toContain('已会'); expect(await page.locator('.xq-node.is-known').count()).toBe(3); await shot(page, info.project.name, 'academy-known');
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:xiangqi') ?? '{}').data.lessons); expect(s.L01.known && s.L02.known && s.L03.known).toBe(true); expect(clean(errs)).toEqual([]);
});
test('?dev=perf：六位机关人的耗时表（R6 最大 < 700 ms）', async ({ page }, info) => {
  test.setTimeout(170_000); const errs = await boot(page, 'dev=perf', '.xq-perf'); await page.waitForSelector('.xq-perf[data-ready]', { timeout: 150_000 }); await shot(page, info.project.name, 'perf');
  const r = (await page.evaluate(() => (window as unknown as { __perf: { rows: { robot: string; max: number; avg: number }[]; r6max: number } }).__perf)); expect(r.rows.length).toBe(6); console.log(info.project.name, 'perf', r.rows.map((x) => `${x.robot} avg ${x.avg.toFixed(0)} max ${x.max.toFixed(0)}`).join(' | ')); expect(r.r6max).toBeLessThan(700); expect(clean(errs)).toEqual([]);
});
test('课里的理由图标：L09 马被别住 → 脚印', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=lesson&lesson=L09&intro=0', '.xq-lesson[data-ready]'); await page.waitForFunction(() => (window as unknown as { __xq: { step: string } }).__xq.step === 'L09.1', null, { timeout: 15_000 }); await page.waitForTimeout(900);
  await tap(page, 'e5'); await tap(page, 'd7'); await page.waitForSelector('.xq-badge.is-leg', { timeout: 4000 }); await shot(page, info.project.name, 'lesson-leg'); expect(clean(errs)).toEqual([]);
});
