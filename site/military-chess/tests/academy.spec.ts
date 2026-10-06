/**
 * 陆战棋 browser tests, build stage 2 (spec §9.6): first-time flow, 学堂 board items with real taps,
 * 翻翻棋入门 scenes, cards, the L7 deploy item, an endgame with its reply book (deviation → failure
 * → back; optimal → 3★; the mirror twin), the parent gate, performance proxies. WebKit, both
 * orientations, `fast=1` (animations × 0.1). Real taps through window.__mc.point().
 */
import { expect, test, type Page } from '@playwright/test';
import { shot } from '../../../tests/smoke/helpers';

const URL = '/military-chess/?test=1&fast=1';
const W = (page: Page) => page.evaluate(() => (window as any).__mc);
void W;

async function open(page: Page, extra = ''): Promise<void> {
  await page.goto(URL + extra);
  await page.waitForSelector('#app[data-ready]');
}
async function go(page: Page, route: Record<string, unknown>): Promise<void> {
  await page.evaluate((r) => (window as any).__mc.app.go(r), route);
}
async function tap(page: Page, at: string): Promise<void> {
  const pt = await page.evaluate((a) => (window as any).__mc.point(a), at);
  expect(pt, `station ${at}`).not.toBeNull();
  await page.touchscreen.tap(pt.x, pt.y);
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}
const dbg = (page: Page, expr: string) => page.evaluate((e) => { const d = (window as any).__mc.dbg(); return new Function('d', `return (${e})`)(d); }, expr);
const stars = (page: Page, id: string) => page.evaluate((i) => (window as any).__mc.save().items[i]?.stars ?? 0, id);
async function idle(page: Page): Promise<void> {
  await page.waitForFunction(() => { const d = (window as any).__mc.dbg(); return d && d.busy() === 0; }, null, { timeout: 15_000 });
}
async function center(page: Page, sel: string): Promise<{ x: number; y: number }> {
  const box = (await page.locator(sel).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('陆战棋 · 学堂与首次上手', () => {
  test('ft: 团长 takes 营长; 团长 on 师长 bounces and the position is restored; 军长 wins; ft logged', async ({ page }, info) => {
    test.setTimeout(120_000);
    await open(page);
    await go(page, { name: 'ft' });
    await page.waitForFunction(() => (window as any).__mc.dbg()?.step() === 'first', null, { timeout: 30_000 });
    await tap(page, 'c6');
    await tap(page, 'c7');
    await page.waitForFunction(() => (window as any).__mc.dbg()?.step() === 'second', null, { timeout: 30_000 });
    await idle(page);
    await shot(page, info.project.name, 'military-chess-ft-3');
    const before = await dbg(page, 'Array.from(d.state().board).join(",")');
    await tap(page, 'c7');
    await tap(page, 'b7');
    await page.waitForFunction(() => (window as any).__mc.said().includes('mc.ft.bigger'), null, { timeout: 15_000 });
    await idle(page);
    expect(await dbg(page, 'Array.from(d.state().board).join(",")')).toBe(before);
    const log = await dbg(page, 'd.log()');
    expect(log.firstSuccessMs).toBeGreaterThan(0);
    expect(log.deadTaps).toBeGreaterThanOrEqual(0);
    expect(log.helpCount).toBeGreaterThanOrEqual(0);
    await tap(page, 'a7');
    await tap(page, 'b7');
    await page.waitForFunction(() => (window as any).__mc.screen() === 'home', null, { timeout: 20_000 });
    expect(await page.evaluate(() => (window as any).__mc.save().firstRun.ft)).toBe(true);
    expect(await page.evaluate(() => (window as any).__mc.save().rank)).toBe(0);
  });

  test('lesson: L1-3 with the best moves → 3★, no modal; [下一题] appears', async ({ page }, info) => {
    await open(page);
    await go(page, { name: 'item', id: 'L1-3' });
    await page.waitForFunction(() => (window as any).__mc.screen() === 'puzzle');
    await page.waitForTimeout(400);
    await idle(page); // the ghost hand shows the first move first (intro item)
    await tap(page, 'c6');
    await tap(page, 'c7');
    await idle(page);
    await tap(page, 'c7');
    await tap(page, 'b7');
    await page.waitForFunction(() => (window as any).__mc.dbg()?.finished(), null, { timeout: 15_000 });
    expect(await stars(page, 'L1-3')).toBe(3);
    await expect(page.locator('[data-testid="next"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.xg-scrim')).toHaveCount(0);
    await shot(page, info.project.name, 'military-chess-lesson-done');
  });

  test('lesson: L4-7 refuses a turning drop with the reason, the rail ride ends on a7, then 3★', async ({ page }, info) => {
    await open(page);
    await go(page, { name: 'item', id: 'L4-7' });
    await page.waitForFunction(() => (window as any).__mc.screen() === 'puzzle');
    await page.waitForTimeout(400);
    await idle(page);
    const a2 = await page.evaluate(() => (window as any).__mc.point('a2'));
    const e7 = await page.evaluate(() => (window as any).__mc.point('e7'));
    await drag(page, a2, e7);
    await page.waitForFunction(() => (window as any).__mc.said().includes('mc.why.rail.turn'), null, { timeout: 8_000 });
    expect(await dbg(page, 'd.pc().red.length')).toBe(0);
    await tap(page, 'a2');
    await shot(page, info.project.name, 'military-chess-l4-7-select');
    await tap(page, 'a7');
    await idle(page);
    const at = await page.evaluate(() => { const m = (window as any).__mc; const s = m.dbg().state(); return m.sq(Array.from(s.board as Int8Array).findIndex((p) => p >= 0 && s.pside[p] === 0)); });
    expect(at).toBe('a7');
    await tap(page, 'a7');
    await tap(page, 'e7');
    await page.waitForFunction(() => (window as any).__mc.dbg()?.finished(), null, { timeout: 15_000 });
    expect(await stars(page, 'L4-7')).toBe(3);
  });

  test('lesson: L5-4 the engineer turns on the rail to dig, then carries the flag → 3★', async ({ page }) => {
    await open(page);
    await go(page, { name: 'item', id: 'L5-4' });
    await page.waitForFunction(() => (window as any).__mc.screen() === 'puzzle');
    await page.waitForTimeout(400);
    await idle(page);
    await tap(page, 'a7');
    await tap(page, 'b11');
    await idle(page);
    await tap(page, 'b11');
    await tap(page, 'b12');
    await page.waitForFunction(() => (window as any).__mc.dbg()?.finished(), null, { timeout: 15_000 });
    expect(await stars(page, 'L5-4')).toBe(3);
  });

  test('scene: F-1 only the lit tile turns, then "你是红方"; F-2 a face-down target is refused with mc.f2.cant', async ({ page }, info) => {
    await open(page);
    await go(page, { name: 'item', id: 'F-1' });
    await page.waitForFunction(() => (window as any).__mc.said().includes('mc.f1.flip'), null, { timeout: 15_000 });
    await idle(page);
    await shot(page, info.project.name, 'military-chess-f1');
    const down0 = await dbg(page, 'Array.from(d.state().pup).slice(0, d.state().np).join("")');
    await tap(page, 'b6'); // not lit
    await page.waitForTimeout(300);
    expect(await dbg(page, 'Array.from(d.state().pup).slice(0, d.state().np).join("")')).toBe(down0);
    await tap(page, 'c6');
    await expect(page.locator('[data-testid="youare-0"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="youare-0"]')).toContainText('红方');

    await go(page, { name: 'item', id: 'F-2' });
    await page.waitForFunction(() => (window as any).__mc.screen() === 'puzzle' && (window as any).__mc.dbg()?.sceneWaiting(), null, { timeout: 15_000 });
    await tap(page, 'a3');
    await tap(page, 'a4');
    await page.waitForFunction(() => (window as any).__mc.said().includes('mc.f2.cant'), null, { timeout: 10_000 });
    // a4 is still face down: the refusal changed nothing
    expect(await page.evaluate(() => { const m = (window as any).__mc; const s = m.dbg().state(); return s.pup[s.board[m.parse('a4')]]; })).toBe(0);
  });

  test('cards: L1-2 a wrong answer is explained and the same pair comes again; L1-1 order completes', async ({ page }, info) => {
    await open(page);
    await go(page, { name: 'item', id: 'L1-2' });
    await page.waitForFunction(() => (window as any).__mc.screen() === 'cards' && (window as any).__mc.dbg()?.introDone(), null, { timeout: 15_000 });
    await shot(page, info.project.name, 'military-chess-compare');
    // pair 1 is 军长 → 旅长 (攻胜): answer 防守赢 first
    await page.locator('[data-testid="ans-D"]').tap();
    await page.waitForFunction(() => (window as any).__mc.dbg().corrections() === 1, null, { timeout: 10_000 });
    await idle(page);
    expect(await dbg(page, 'd.pair()')).toBe(0);
    const answers = ['A', 'D', 'B', 'A', 'D', 'B'];
    for (let k = 0; k < answers.length; k++) {
      await idle(page);
      await page.locator(`[data-testid="ans-${answers[k]}"]`).tap();
      await page.waitForFunction((n) => (window as any).__mc.dbg().pair() >= n || (window as any).__mc.dbg().finished(), k + 1, { timeout: 10_000 });
    }
    await page.waitForFunction(() => (window as any).__mc.dbg().finished(), null, { timeout: 10_000 });
    expect(await stars(page, 'L1-2')).toBe(2);

    await go(page, { name: 'item', id: 'L1-1' });
    // the ghost puts 工兵 first, then the cards are his
    await page.waitForFunction(() => (window as any).__mc.screen() === 'cards' && (window as any).__mc.dbg()?.introDone(), null, { timeout: 20_000 });
    for (const code of ['2', '3', '4', '5', '6', '7', '8', '9']) {
      const k = Number(code) - 1;
      await page.locator(`.mc-otile[data-where="tray"][data-code="${code}"]`).tap();
      await page.locator(`[data-testid="slot-${k}"]`).tap();
    }
    await page.waitForFunction(() => (window as any).__mc.dbg().finished(), null, { timeout: 10_000 });
    expect(await stars(page, 'L1-1')).toBe(3);
  });

  test('deploy item L7-2: a mine on row 3 and a 师长 that would block the mines are refused; tap returns; completes legal', async ({ page }, info) => {
    await open(page);
    await go(page, { name: 'item', id: 'L7-2' });
    await page.waitForFunction(() => (window as any).__mc.screen() === 'deploy-item' && (window as any).__mc.dbg()?.introDone(), null, { timeout: 15_000 });
    const blanks: number[] = await dbg(page, 'd.blanks()');
    // blanks: (5,2) (6,1) (6,3) (1,3) (2,3) (3,1); tray: M M M 7 B 4
    await drag(page, await center(page, '[data-testid="tray-0"]'), await center(page, `[data-testid="blank-${blanks[5]}"]`));
    await page.waitForFunction(() => (window as any).__mc.said().includes('mc.why.deploy.mine'), null, { timeout: 8_000 });
    await idle(page);
    expect((await dbg(page, 'd.tray()'))[0]).toBe('M');
    await page.locator('[data-testid="tray-3"]').tap();
    await page.locator(`[data-testid="blank-${blanks[1]}"]`).tap();
    await page.waitForFunction(() => (window as any).__mc.said().includes('mc.why.deploy.keep'), null, { timeout: 8_000 });
    await idle(page);
    expect(await dbg(page, 'd.refused()')).toBe(2);
    // a mine into the back row is accepted; tapping it takes it back
    await page.locator('[data-testid="tray-0"]').tap();
    await page.locator(`[data-testid="blank-${blanks[1]}"]`).tap();
    await page.waitForFunction((k) => (window as any).__mc.dbg().layout()[k] === 'M', blanks[1]);
    await idle(page);
    await page.locator(`.mc-dpiece[data-slot="${blanks[1]}"]`).tap();
    await page.waitForFunction((k) => (window as any).__mc.dbg().layout()[k] === '.', blanks[1]);
    await shot(page, info.project.name, 'military-chess-l7-2');
    // finish: mines → back rows, 师长 → (1,3), bomb → (2,3), 营长 → (3,1)
    const plan: Array<[number, number]> = [[0, blanks[0]], [1, blanks[1]], [2, blanks[2]], [3, blanks[3]], [4, blanks[4]], [5, blanks[5]]];
    for (const [i, k] of plan) {
      const tray: string[] = await dbg(page, 'd.tray()');
      if (!tray[i]) continue;
      await page.locator(`[data-testid="tray-${i}"]`).tap();
      await page.locator(`[data-testid="blank-${k}"]`).tap();
      await page.waitForFunction((kk) => (window as any).__mc.dbg().layout()[kk] !== '.', k, { timeout: 8_000 });
      await idle(page);
    }
    await page.waitForFunction(() => (window as any).__mc.dbg().finished(), null, { timeout: 10_000 });
    expect((await dbg(page, 'd.layout()')).includes('.')).toBe(false);
  });

  test('endgame E2-01: a deviation is answered from the book and taken back; the main line → 3★; the twin mirrors', async ({ page }, info) => {
    await open(page);
    await go(page, { name: 'item', id: 'E2-01' });
    await page.waitForFunction(() => (window as any).__mc.screen() === 'puzzle');
    await page.waitForFunction(() => (window as any).__mc.dbg()?.pc(), null, { timeout: 10_000 });
    await idle(page);
    const start = await dbg(page, 'Array.from(d.state().board).join(",")');
    await tap(page, 'd10');
    await tap(page, 'c11');
    await page.waitForFunction(() => (window as any).__mc.said().includes('mc.why.flaglost'), null, { timeout: 15_000 });
    await idle(page);
    expect(await dbg(page, 'Array.from(d.state().board).join(",")')).toBe(start);
    for (const [a, b] of [['c2', 'c1'], ['d10', 'd11'], ['d11', 'd12']]) {
      await idle(page);
      await tap(page, a);
      await tap(page, b);
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(() => (window as any).__mc.dbg()?.finished(), null, { timeout: 15_000 });
    expect(await stars(page, 'E2-01')).toBe(3); // the failure lit H1 by itself; within par and no H3 → 3★
    await shot(page, info.project.name, 'military-chess-endgame-done');
    // the twin: mirrored position, mirrored book lookups
    await go(page, { name: 'item', id: 'E2-01', twin: true });
    await page.waitForFunction(() => (window as any).__mc.dbg()?.pc(), null, { timeout: 10_000 });
    for (const [a, b] of [['c2', 'c1'], ['b10', 'b11'], ['b11', 'b12']]) {
      await idle(page);
      await tap(page, a);
      await tap(page, b);
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(() => (window as any).__mc.dbg()?.finished(), null, { timeout: 15_000 });
  });

  test('parent gate: hold the gear 3 s — no PIN → 去家长页; with a PIN → keypad → S15', async ({ page }, info) => {
    await open(page);
    await page.evaluate(() => (window as any).__mc.setPin(null));
    await go(page, { name: 'home' });
    const gear = await center(page, '[data-testid="gear"]');
    await page.mouse.move(gear.x, gear.y);
    await page.mouse.down();
    await page.waitForTimeout(3300);
    await page.mouse.up();
    await expect(page.locator('[data-testid="gate-parent"]')).toBeVisible();
    await page.locator('[data-testid="gate-cancel"]').tap();
    await page.evaluate(() => (window as any).__mc.setPin('2468'));
    await page.mouse.move(gear.x, gear.y);
    await page.mouse.down();
    await page.waitForTimeout(3300);
    await page.mouse.up();
    await expect(page.locator('.xg-keypad')).toBeVisible();
    for (const k of ['2', '4', '6', '8', 'ok']) await page.locator(`.xg-key[data-key="${k}"]`).tap();
    await page.waitForFunction(() => (window as any).__mc.screen() === 'parent');
    await expect(page.locator('[data-testid="metric-academy"]')).toContainText('/ 66');
    await shot(page, info.project.name, 'military-chess-parent');
    await page.evaluate(() => (window as any).__mc.setPin(null));
  });

  test('perf: interactive fast; no idle requestAnimationFrame; book reply lookups are instant', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__raf = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        (window as any).__raf++;
        return raf(cb);
      };
    });
    const t0 = Date.now();
    await open(page);
    const ready = await page.evaluate(() => performance.now());
    expect(ready).toBeLessThan(3000); // dev server; the 0.7 s proxy is measured on the built page (bench)
    void t0;
    await page.waitForTimeout(1500);
    const r0 = await page.evaluate(() => (window as any).__raf);
    await page.waitForTimeout(5000);
    const r1 = await page.evaluate(() => (window as any).__raf);
    expect(r1 - r0).toBe(0);
    // BLUE's answer in an endgame comes from the reply book: a lookup, not a search
    const reply = await page.evaluate(() => (window as any).__mc.benchReply('E2-01'));
    expect(reply).toBeLessThan(2);
  });
});
