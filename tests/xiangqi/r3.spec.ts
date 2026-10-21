// 楚河棋院 QA 第 3 轮修复（fix-xiangqi-r3）：
//   · 摸底严格计分：前两题没对 → 第 9 题走错一步再走对，也不算会（以前被放宽成一次做对，L25 被白送）；前两题没对但第 9 题一步不错 = 算会；
//   · 结果卡的点击防护：弹出后 600 ms 内的点击 / 没有新 pointerdown 的"补发 click"都不能按下按键（L10 曾没等孩子看见星星就回学堂）；
//   · 步后揭晓句（post）在这一步的盘上念完，下一步才摆上盘（L21.1 / L11.1 / L17.3）。
// 端口 5321；WebKit；一次一个 worker。截图 → ~/kid-games-work/shots/rr/fix-xiangqi-r3/<项目>-<名>.png
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import os from 'node:os';

const OUT = `${os.homedir()}/kid-games-work/shots/rr/fix-xiangqi-r3`;
const shot = async (page: Page, project: string, name: string): Promise<void> => { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/${project}-${name}.png` }); };
type XQ = { step: string; live: boolean; goal: string };
async function boot(page: Page, q: string, sel: string): Promise<string[]> {
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript({ path: 'tools/qa/mute-audio.js' }); await page.addInitScript(() => { try { localStorage.removeItem('kg:v1:xiangqi'); } catch { /* */ } });
  await page.goto(`/xiangqi/?${q}`); await page.waitForSelector(sel, { timeout: 20_000 }); await page.waitForTimeout(500); return errs;
}
const xq = <T,>(page: Page, expr: string): Promise<T> => page.evaluate((e) => new Function('x', `return (${e})`)((window as unknown as { __xq: unknown }).__xq), expr) as Promise<T>;
const fire = (page: Page, expr: string): Promise<void> => page.evaluate((e) => { const x = (window as unknown as { __xq: unknown }).__xq; setTimeout(() => { void new Function('x', `return (${e})`)(x); }, 0); }, expr);
const tapSq = async (page: Page, name: string): Promise<void> => { const r = await page.evaluate((n) => { const b = (window as unknown as { __xq: { view: { rect(i: number): DOMRect } } }).__xq.view.rect((10 - parseInt(n.slice(1), 10)) * 9 + 'abcdefghi'.indexOf(n[0])); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, name); await page.touchscreen.tap(r.x, r.y); await page.waitForTimeout(250); };
const waitLive = (page: Page, step: string): Promise<unknown> => page.waitForFunction((s) => { const x = (window as unknown as { __xq: XQ }).__xq; return x.step === s && x.live; }, step, { timeout: 30_000 });
const waitStep = (page: Page, step: string): Promise<unknown> => page.waitForFunction((s) => (window as unknown as { __xq: XQ }).__xq.step === s, step, { timeout: 30_000 });
const btnCenter = async (page: Page, sel: string): Promise<{ x: number; y: number }> => page.evaluate((s) => { const b = document.querySelector(s)!.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);

/** 把摸底的第 7、8 题先答错再答对（连续两题没对），再到第 9 题。第 9 题：wrong9 = 先走错几步（走错 = 车往上走一段，不是杀） */
async function placementTail(page: Page, wrong9: number): Promise<void> {
  await page.locator('[data-act=placement]').click(); await page.waitForSelector('.xq-lesson[data-ready]'); await page.waitForTimeout(400);
  await xq(page, 'x.runFrom("PL.7")'); await waitLive(page, 'PL.7');
  await tapSq(page, 'a5'); await tapSq(page, 'a6'); await page.waitForTimeout(1800);        // 第 7 题（将军）：先走一个不是将军的着，悔回
  await tapSq(page, 'a5'); await tapSq(page, 'a10');
  await waitLive(page, 'PL.8');
  await tapSq(page, 'e5'); await tapSq(page, 'e8'); await page.waitForTimeout(4200);        // 第 8 题（换子）：先吃亏的那个，对方回吃，悔回
  for (let k = 0; k < 4 && (await xq<string>(page, 'x.step')) === 'PL.8'; k++) { await tapSq(page, 'e5'); await tapSq(page, 'a5'); await page.waitForTimeout(900); }      // 对方回吃的悔回还在跑时点不动：再点
  await waitLive(page, 'PL.9'); await page.waitForFunction(() => !!(window as unknown as { __xq: XQ }).__xq.goal, null, { timeout: 25_000 }); await page.waitForTimeout(400);
  if (wrong9 > 0) { await tapSq(page, 'i1'); await tapSq(page, 'i5'); await page.waitForTimeout(2600); }
  await tapSq(page, 'i1'); await tapSq(page, 'f1'); await page.waitForSelector('.xq-res', { timeout: 12_000 });
}

test('摸底严格计分：第 7、8 题没对之后，第 9 题走错一步再走对 = 什么课都不算会；一步不错 = L25 算会', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=academy', '.xq-academy');
  await placementTail(page, 1); await page.waitForTimeout(700);
  expect(await page.locator('.xq-res-title').innerText()).toContain('从头学起');                      // 以前：有 1 课你已经会了（L25）
  await shot(page, info.project.name, 'placement-wrong-result');
  await page.goto('/xiangqi/?dev=1&screen=academy'); await page.waitForSelector('.xq-academy'); await page.waitForTimeout(300);
  await placementTail(page, 0); await page.waitForTimeout(700);
  expect(await page.locator('.xq-res-title').innerText()).toContain('有 1 课你已经会了');             // 前两题没对，第 9 题真做对了：不冤枉
  expect(errs).toEqual([]);
});

test('结果卡点击防护：600 ms 内的点击、没有新 pointerdown 的补发 click 都按不下去；之后真的点才行', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=lesson&lesson=L10', '.xq-lesson[data-ready]'); await page.waitForTimeout(500);
  await fire(page, 'x.cards.lessonDone()'); await page.waitForSelector('.xq-res[data-kind=lesson-done]'); expect(await page.locator('.xq-res').getAttribute('data-armed')).toBe('0');
  const c = await btnCenter(page, '.xq-res [data-act=map]'); await page.mouse.click(c.x, c.y);                          // 弹出的瞬间有人点（最后一下点棋盘补出来的 click）
  await page.waitForTimeout(250); expect(await page.locator('.xq-res').count()).toBe(1); expect(await page.locator('.xq-lesson').count()).toBe(1);
  await shot(page, info.project.name, 'lesson-done-guarded');
  await page.waitForSelector('.xq-res[data-armed="1"]', { timeout: 3000 });
  await page.evaluate(() => { for (const b of document.querySelectorAll<HTMLElement>('.xq-res .xq-res-btn')) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); });   // 补发的 click（没有 pointerdown）
  await page.waitForTimeout(300); expect(await page.locator('.xq-res').count()).toBe(1);
  await shot(page, info.project.name, 'lesson-done-armed');
  await page.touchscreen.tap(c.x, c.y); await page.waitForSelector('.xq-academy', { timeout: 6000 }); await page.waitForSelector('.xq-res', { state: 'detached', timeout: 3000 });
  expect(errs).toEqual([]);
});

test('步后揭晓句（L21.1）在这一步的盘上念完，下一步才摆上盘；盘上画出能吃到它的线', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&slow=1&screen=lesson&lesson=L21', '.xq-lesson[data-ready]'); await page.waitForTimeout(400);
  await xq(page, 'x.runFrom("L21.1")'); await waitLive(page, 'L21.1'); await page.waitForTimeout(300);
  type Sample = { t: number; step: string; txt: string; arrows: number };
  await page.evaluate(() => { const w = window as unknown as { __rec: Sample[]; __xq: { step: string } }; w.__rec = []; const t0 = performance.now(); const snap = (): void => { const b = document.querySelector('.xg-bot-bubble'); w.__rec.push({ t: Math.round(performance.now() - t0), step: w.__xq.step, txt: b?.textContent ?? '', arrows: document.querySelectorAll('svg line, svg path[class*=arrow], [class*=arrow]').length }); }; snap(); setInterval(snap, 60); });
  await tapSq(page, 'e9');                                                                                          // 点出能吃兵的黑车
  await page.waitForFunction(() => (document.querySelector('.xg-bot-bubble')?.textContent ?? '').includes('看，这些线都能吃到它'), null, { timeout: 30_000 }); await page.waitForTimeout(250); await shot(page, info.project.name, 'post-L21-1');
  await page.waitForFunction(() => (window as unknown as { __xq: { step: string } }).__xq.step === 'L21.2', null, { timeout: 40_000 }); await page.waitForTimeout(300);
  const seen = await page.evaluate(() => (window as unknown as { __rec: Sample[] }).__rec);
  const trace = seen.filter((s, i) => i === 0 || s.step !== seen[i - 1].step || s.txt !== seen[i - 1].txt).map((s) => `${s.t}ms ${s.step} [${s.txt}] arrows=${s.arrows}`).join('\n');
  expect(seen.some((s) => s.step === 'L21.1' && s.txt.includes('看，这些线都能吃到它')), `揭晓句没有在 L21.1 的盘上念\n${trace}`).toBe(true);
  const t1 = seen.find((s) => s.step === 'L21.1' && s.txt.includes('看，这些线'))!.t; const t2 = seen.find((s) => s.step === 'L21.2')!.t;
  expect(t2 - t1, `揭晓句刚出现就换了下一步（${t2 - t1} ms；慢速下每句停 1.2 秒）\n${trace}`).toBeGreaterThanOrEqual(700);      // 以前 < 100 ms 就换盘；现在要等这句说完（慢速下一句 1.2 秒，气泡出现时已过一小段）
  expect(seen[seen.length - 1].step).toBe('L21.2'); expect(errs).toEqual([]);
});

test('步后揭晓句（L11.1）回到这一步的题面上念：象眼上的子还在、象眼发亮；念完才进 L11.2', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&slow=1&screen=lesson&lesson=L11', '.xq-lesson[data-ready]'); await page.waitForTimeout(400);
  await xq(page, 'x.runFrom("L11.1")'); await waitLive(page, 'L11.1'); await page.waitForTimeout(300);
  await tapSq(page, 'd2'); await tapSq(page, 'd3'); await page.waitForTimeout(1500); await tapSq(page, 'c1'); await tapSq(page, 'e3');                  // 先把挡着象眼的车挪开，象再飞到 e3
  await page.waitForFunction(() => (document.querySelector('.xg-bot-bubble')?.textContent ?? '').includes('眼睛被挡住了'), null, { timeout: 30_000 }); await page.waitForTimeout(250);
  expect(await xq<string>(page, 'x.step')).toBe('L11.1');                                                              // 还在这一步上念
  expect(await xq<string>(page, 'x.rules.toFen(x.state).split(" ")[0]')).toBe('9/9/9/9/9/9/9/9/3R5/2B6');            // 盘回到题面：车在 d2 挡着、象在 c1
  await shot(page, info.project.name, 'post-L11-1');
  await waitStep(page, 'L11.2'); expect(errs).toEqual([]);
});
