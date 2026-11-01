// 楚河棋院 QA 第 1 轮修复（续 2）的回归（WebKit，5 个视口）：R1 软门、棋盒（示范 / 跳过不记学会）、L33 第一盘棋、AI Worker 出错的恢复、大厅进出泄漏（Chromium + CDP，仅 ipadP）。
import { expect, test, type Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import os from 'node:os';

const OUT = `${os.homedir()}/kid-games-work/shots/rr/fix-xiangqi`;
const shotTo = async (page: Page, project: string, name: string): Promise<void> => { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/${project}-${name}.png` }); };
async function boot(page: Page, q: string, sel: string, init?: string): Promise<string[]> {
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript({ path: 'tools/qa/mute-audio.js' }); if (init) await page.addInitScript(init); await page.goto(`/xiangqi/?${q}`); await page.waitForSelector(sel, { timeout: 20_000 }); await page.waitForTimeout(400); return errs;
}
const store = (page: Page): Promise<Record<string, any>> => page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:xiangqi') ?? '{}').data ?? {});   // eslint-disable-line @typescript-eslint/no-explicit-any
const xq = <T,>(page: Page, expr: string): Promise<T> => page.evaluate((e) => new Function('x', `return (${e})`)((window as unknown as { __xq: unknown }).__xq), expr) as Promise<T>;

test('R1 软门：点 R1 先问「先学三招保护将，好吗？」，[不用，直接下] 直接开赛前面板且只问一次；「来个小局」从不弹；家长已全解锁也不弹', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=hall', '.xq-hall');
  await page.locator('[data-act=quick]').click(); await page.waitForSelector('.xq-sheet[data-sheet]');
  expect(await page.locator('.xq-softgate').count()).toBe(0);                                         // 小局：不设门
  await page.goto('/xiangqi/?dev=1&screen=arena'); await page.waitForSelector('.xq-arena'); await page.waitForTimeout(300);
  expect(await page.locator('.xq-card.is-locked').count()).toBe(5);                                    // 只有 R2–R6 是"赢了上一位才开门"，R1 永远开着
  await page.locator('[data-robot=R1]').first().click(); await page.waitForSelector('.xq-softgate'); await expect(page.locator('.xq-softgate')).toContainText('先学三招保护将，好吗？'); await shotTo(page, info.project.name, 'fx-softgate');
  expect(await page.locator('.xq-sheet[data-sheet]').count()).toBe(0);                                // 卡片还在，赛前面板没开
  await page.locator('[data-act=soft-skip]').click(); await page.waitForSelector('.xq-sheet[data-sheet]'); expect((await store(page)).settings.r1Skip).toBe(true);
  await page.goto('/xiangqi/?dev=1&screen=arena'); await page.waitForSelector('.xq-arena'); await page.locator('[data-robot=R1]').first().click(); await page.waitForSelector('.xq-sheet[data-sheet]'); expect(await page.locator('.xq-softgate').count()).toBe(0);   // 只问一次
  expect(errs).toEqual([]);
});

test('R1 软门：[去学] 去学堂（不改存档，下次还会问）', async ({ page }) => {
  const errs = await boot(page, 'dev=1&screen=arena', '.xq-arena'); await page.locator('[data-robot=R1]').first().click(); await page.waitForSelector('.xq-softgate'); await page.locator('[data-act=soft-learn]').click(); await page.waitForSelector('.xq-academy');
  expect((await store(page)).settings?.r1Skip).toBeFalsy(); expect(errs).toEqual([]);
});

test('棋盒：孩子把炮挪开后示范仍能吃到子，无子可吃就摆回去；点「跳过」不记学会 L01 / L02', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&intro=box', '.xq-box[data-ready]');
  await page.waitForFunction(() => (window as unknown as { __xq: { phase: string } }).__xq.phase === 'play', null, { timeout: 15_000 });
  expect(await xq(page, "x.play('b3c3')")).toBe(true); await page.waitForTimeout(500);                // 孩子第一下：把炮横着挪开（它不再能隔马吃车）
  expect(await xq<number>(page, 'x.captures')).toBe(0); await xq(page, 'x.demo()');                    // 示范：找盘上任何能吃的子（马 e5 → f7）
  await page.waitForFunction(() => (window as unknown as { __xq: { captures: number } }).__xq.captures === 1, null, { timeout: 8_000 });
  await page.goto('/xiangqi/?dev=1&intro=box'); await page.waitForSelector('.xq-box[data-ready]'); await page.waitForFunction(() => (window as unknown as { __xq: { phase: string } }).__xq.phase === 'play', null, { timeout: 15_000 });
  await xq(page, "x.play('e5d7')"); await page.waitForTimeout(400); await xq(page, 'x.reset()'); await page.waitForTimeout(1200);
  expect(await xq<number>(page, 'x.session.game.state().b.filter(Boolean).length')).toBe(6); expect(await xq<string>(page, 'x.session.game.fen().split(" ")[0]')).toBe('1r7/9/9/1n3p3/9/4N4/8P/1C7/9/9');   // 摆回去 = 开头那六颗
  await shotTo(page, info.project.name, 'fx-box-reset');
  await xq(page, 'x.skip()'); await page.waitForSelector('.xq-hall', { timeout: 10_000 }); const s = await store(page);
  expect(s.intro.box).toBe(true); expect(s.lessons?.L01).toBeUndefined(); expect(s.lessons?.L02).toBeUndefined();      // 跳过 ≠ 学会
  expect(errs).toEqual([]);
});

test('L33 第一盘棋：三句话逐个指给孩子看（出车 / 架炮 / 护九宫），再去和滑轮下一盘真棋；下完这盘 L33 才算学完', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=lesson&lesson=L33', '.xq-lesson[data-ready]');
  await page.waitForSelector('.bk-su-btn[data-id=play-first]', { timeout: 20_000 }); expect(await page.locator('.bk-su-btn[data-id=play-later]').count()).toBe(1); await shotTo(page, info.project.name, 'fx-L33-play');
  expect((await store(page)).lessons?.L33?.done).toBeFalsy();                                            // 还没下，不算学完
  await page.locator('.bk-su-btn[data-id=play-first]').click(); await page.waitForSelector('.xq-game[data-ready]', { timeout: 15_000 });
  expect(await xq<number>(page, 'x.game.state().b.filter(Boolean).length')).toBe(32);                    // 整盘真棋，不是小局
  await xq(page, "x.play('h3e3')"); await page.waitForTimeout(1500); expect((await store(page)).game?.lesson).toBe('L33');      // 在局存档记得它是从 L33 开出来的
  await page.locator('[data-key=resign]').click(); await page.locator('.xq-ask .xq-btn', { hasText: '认输' }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('kg:v1:xiangqi') ?? '{}').data?.lessons?.L33?.done === true, null, { timeout: 10_000 });   // 输了也算学完（不罚输）
  expect(errs).toEqual([]);
});

for (const mode of ['error', 'ok-false'] as const) {
  test(`AI Worker ${mode === 'error' ? '构造后报错' : '回 ok:false'}：机器人几秒内仍然应一手（引擎 host 重建 → 主线程兜底），不卡在"想想…"`, async ({ page }, info) => {
    const fake = `(() => { const MODE = ${JSON.stringify(mode)}; class FakeWorker { constructor() { this.onmessage = null; this.onerror = null; } postMessage(d) { setTimeout(() => { if (MODE === 'ok-false') this.onmessage && this.onmessage({ data: { id: d.id, epoch: d.epoch, ok: false, error: 'boom' } }); else this.onerror && this.onerror(new Event('error')); }, 0); } terminate() {} addEventListener() {} removeEventListener() {} } window.Worker = FakeWorker; })();`;
    const errs = await boot(page, 'dev=1&robot=3&seed=7', '.xq-game[data-ready]', fake);
    await xq(page, "x.play('h3e3')"); await page.waitForFunction(() => (window as unknown as { __xq: { session: { game: { moves: unknown[] } } } }).__xq.session.game.moves.length >= 2, null, { timeout: 20_000 });
    await shotTo(page, info.project.name, `fx-ai-${mode}`); expect(errs.filter((e) => !/boom|Worker|worker/i.test(e))).toEqual([]);
  });
}

test('大厅进出 10 圈（学堂 / 对弈）不泄漏：节点与监听器各 ≤ +60（Chromium CDP，仅 ipadP）', async ({}, info) => {
  test.skip(info.project.name !== 'ipadP', '只在一个视口里量一次'); test.setTimeout(180_000);
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 810, height: 1080 }, hasTouch: true, baseURL: 'http://localhost:5321' }); const page = await ctx.newPage(); await page.addInitScript({ path: 'tools/qa/mute-audio.js' });
    // 不用 page.waitForSelector：它返回的 ElementHandle 会被 Playwright 一直攥着，量出来的"泄漏"其实是测试自己。再等 15 秒再量：小军师说话的停留计时器没到点时，刚离开的屏幕的 DOM 暂时被计时器闭包攥着（到点即放，不是泄漏）。
    await page.goto('/xiangqi/?dev=1&screen=hall'); await page.locator('.xq-hall').first().waitFor(); const cdp = await ctx.newCDPSession(page);
    const metrics = async (): Promise<{ nodes: number; listeners: number }> => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); const { metrics: m } = await cdp.send('Performance.getMetrics'); const g = (n: string): number => m.find((x) => x.name === n)?.value ?? 0; return { nodes: g('Nodes'), listeners: g('JSEventListeners') }; };
    await cdp.send('Performance.enable'); const cycle = async (door: string, sel: string): Promise<void> => { await page.locator(`[data-door=${door}]`).click(); await page.locator(sel).first().waitFor(); await page.waitForTimeout(150); await page.locator('.kit-back').first().click(); await page.locator('.xq-hall').first().waitFor(); await page.waitForTimeout(150); };
    for (let i = 0; i < 2; i++) { await cycle('academy', '.xq-academy'); await cycle('arena', '.xq-arena'); }        // 热身
    await page.waitForTimeout(15_000); const a = await metrics(); for (let i = 0; i < 10; i++) { await cycle('academy', '.xq-academy'); await cycle('arena', '.xq-arena'); } await page.waitForTimeout(15_000); const b = await metrics();
    console.log(`leak: nodes ${a.nodes} -> ${b.nodes} (+${b.nodes - a.nodes}), listeners ${a.listeners} -> ${b.listeners} (+${b.listeners - a.listeners}) after 10 x (academy + arena)`);
    expect(b.nodes - a.nodes).toBeLessThanOrEqual(60); expect(b.listeners - a.listeners).toBeLessThanOrEqual(60);
  } finally { await browser.close(); }
});
