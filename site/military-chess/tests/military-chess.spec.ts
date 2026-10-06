/**
 * 陆战棋 browser tests (spec §9.6), WebKit at 810×1080 and 1080×810, DPR 2, touch. Picked up by
 * `npm run test:smoke`; tests/military-chess/playwright.dev.config.ts runs them against a dev server.
 * Build stage 1 groups: load, input lock & races, 翻翻棋 first flip, 清点兵力, 暗棋 no-leak, seats,
 * physical referee, rotation mid-animation, resume, deployment rules, family undo/draw.
 * Real taps on stations via window.__mc.point(); `fast=1` scales every animation by 0.1.
 */
import { expect, test, type Page } from '@playwright/test';
import { shot } from '../../../tests/smoke/helpers';

type Pieces = Record<string, string>;
const URL = '/military-chess/?test=1&fast=1';

async function open(page: Page, extra = ''): Promise<void> {
  await page.goto(URL + extra);
  await page.waitForSelector('#app[data-ready]');
}
async function position(page: Page, pieces: Pieces, o: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate(([p, oo]) => (window as any).__mc.position(p, oo), [pieces, o] as const);
  await page.waitForFunction(() => (window as any).__mc.phase() === 'idle' || (window as any).__mc.phase() === 'thinking');
}
async function tap(page: Page, at: string): Promise<void> {
  const pt = await page.evaluate((a) => (window as any).__mc.point(a), at);
  await page.touchscreen.tap(pt.x, pt.y);
}
const state = (page: Page) => page.evaluate(() => (window as any).__mc.state() as string);
const notes = (page: Page) => page.evaluate(() => (window as any).__mc.ctx().notes as string[]);
const settle = (page: Page) => page.waitForFunction(() => ['idle', 'ended', 'thinking'].includes((window as any).__mc.phase()) && (window as any).__mc.screen() === 'match');

function family(mode: 'ming' | 'fan', seating: 'side' | 'face' = 'side', id = 'm' + Math.floor(Date.now() % 1e6)) {
  return {
    v: 1, id, mode, setup: mode === 'fan' ? { firstMover: 0, fanSeed: `mc:fan:${id}`, firstPlayer: 0 } : { firstMover: 0, red: '527369B841371652M41BMFM32', blue: '234216571B835B9146M723MFM' },
    actions: [], opponent: { kind: 'family', seating, names: ['小步步', '爸爸'] }, kidSide: 0, kidSeat: 'near', tags: {},
    hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: false,
  };
}
async function startMatch(page: Page, m: ReturnType<typeof family>): Promise<void> {
  await page.evaluate((mm) => (window as any).__mc.app.go({ name: 'match', setup: mm }), m);
  await settle(page);
}

test.describe('陆战棋', () => {
  test('loads cleanly: camp, no console errors, no overflow', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page);
    await expect(page.locator('[data-testid="card-family"]')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
    expect(overflow).toBe(false);
    await shot(page, info.project.name, 'military-chess-home');
    expect(errors).toEqual([]);
  });

  test('lock: taps while the opponent thinks change nothing; a fast double tap commits once', async ({ page }) => {
    await open(page, '&opp=dev&aiwait=2500');
    await position(page, { a6: 'r5', e6: 'r4', b1: 'rF', d12: 'bF', a12: 'bM', c8: 'b3', e9: 'b6' }, { family: false });
    // double tap on the destination 80 ms apart → exactly one commit
    await tap(page, 'a6');
    await tap(page, 'b5');
    await page.waitForTimeout(80);
    await tap(page, 'b5');
    await page.waitForFunction(() => (window as any).__mc.phase() === 'thinking');
    expect(await notes(page)).toEqual(['a6-b5']);
    // while thinking: own piece, enemy piece, empty station → no state change, the turn capsule wobbles
    const before = await state(page);
    for (const at of ['e6', 'c8', 'c5']) await tap(page, at);
    expect(await state(page)).toBe(before);
    await expect(page.locator('[data-testid="turn"].is-wobble')).toHaveCount(1);
    await page.waitForFunction(() => (window as any).__mc.phase() === 'idle', null, { timeout: 10_000 });
    expect((await notes(page)).length).toBe(2);
  });

  test('翻翻棋: the first flip decides colours and passes the turn to the other colour', async ({ page }) => {
    await open(page);
    await startMatch(page, family('fan'));
    expect(await page.evaluate(() => (window as any).__mc.ctx().state.turn)).toBe(-1);
    await tap(page, 'c6');
    await settle(page);
    const ctx = await page.evaluate(() => { const c = (window as any).__mc.ctx(); return { turn: c.state.turn, colorOf: [...c.state.colorOf] }; });
    expect(ctx.colorOf[0]).not.toBe(-1);
    expect(ctx.turn).toBe(1 - ctx.colorOf[0]);
    await expect(page.locator('[data-testid="youare-legend"]')).toBeVisible();
  });

  test('清点兵力: ladder 翻翻棋 at quiet 39 → count animation → result with both totals; family → draw', async ({ page }) => {
    await open(page);
    const pcs = { a6: 'r9^', e7: 'b5^', c11: 'r4', d10: 'b7', b1: 'rF^', b12: 'bF^', a12: 'bM' };
    await position(page, pcs, { mode: 'fan', ladder: true, quiet: 39, family: false });
    await tap(page, 'a6');
    await tap(page, 'a5');
    await expect(page.locator('[data-testid="count"]')).toBeVisible();
    await page.waitForFunction(() => (window as any).__mc.screen() === 'result', null, { timeout: 15_000 });
    await expect(page.locator('[data-testid="result-title"]')).toHaveText('演习胜利');
    await expect(page.locator('.mc-result__head')).toContainText('清点兵力 13 : 12');
    // the same position in a family game is a draw
    await position(page, pcs, { mode: 'fan', quiet: 39 });
    await tap(page, 'a6');
    await tap(page, 'a5');
    await page.waitForFunction(() => (window as any).__mc.screen() === 'result', null, { timeout: 15_000 });
    await expect(page.locator('[data-testid="result-title"]')).toHaveText('和棋');
    expect(await page.evaluate(() => (window as any).__mc.sounds.includes('jingle-round-over') || (window as any).__mc.sounds.includes('ui-confirm'))).toBe(true);
    await expect(page.locator('.xg-confetti')).toHaveCount(0);
  });

  test('暗棋 no-leak: hidden enemy tiles carry no identity; hidden bombs show generic smoke only', async ({ page }) => {
    await open(page, '&opp=dev');
    await position(page, { c6: 'r7', c7: 'bB', b1: 'rF', d12: 'bF', a6: 'r4', e8: 'b6', a12: 'bM' }, { mode: 'an', family: false });
    const leak = await page.evaluate(() => [...document.querySelectorAll('.mc-piece[data-side="1"]')].map((e) => ({ type: (e as HTMLElement).dataset.type ?? null, text: e.textContent })));
    expect(leak.length).toBe(4);
    for (const l of leak) {
      expect(l.type).toBeNull();
      expect(l.text).not.toMatch(/[军师旅团营连排工炸地司]/);
    }
    await tap(page, 'c6');
    await tap(page, 'c7');
    await expect(page.locator('[data-testid="verdict"]')).toBeVisible();
    await expect(page.locator('.mc-ring')).toHaveCount(0); // no bomb shock ring: the child's own piece is not a bomb
    expect(await page.evaluate(() => (window as any).__mc.sounds.includes('mc.boom'))).toBe(false);
  });

  test('seats: face to face rotates the far player\'s text (portrait 180°, landscape ±90°)', async ({ page }, info) => {
    await open(page);
    await startMatch(page, family('ming', 'face'));
    const rot = await page.evaluate(() => {
      const get = (side: string) => {
        const g = document.querySelector(`.mc-piece[data-side="${side}"] svg > g > g`);
        return g?.getAttribute('transform') ?? '';
      };
      return { red: get('0'), blue: get('1') };
    });
    if (info.project.name.startsWith('portrait')) {
      expect(rot.red).toContain('rotate(0)');
      expect(rot.blue).toContain('rotate(180)');
    } else {
      expect(rot.red).toContain('rotate(90)');
      expect(rot.blue).toContain('rotate(-90)');
    }
    await expect(page.locator('[data-testid="turn-far"]')).toBeVisible();
    await shot(page, info.project.name, 'military-chess-face');
  });

  test('physical referee: 师长 attacks 地雷 → "把进攻方的子拿下来", no piece names on the verdict; background → mask', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__mc.app.go({ name: 'physical' }));
    await page.click('[data-testid="att-0"]');
    await page.click('[data-testid="key-9"]');
    await expect(page.locator('[data-testid="handoff"]')).toBeVisible();
    const hold = await page.locator('[data-testid="hold"]').boundingBox();
    await page.mouse.move(hold!.x + 80, hold!.y + 80);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(page.locator('[data-testid="key-1"]')).toBeVisible();
    // going to the background while the defender picks → the mask comes back first
    await page.evaluate(() => (window as any).__mc.app.screen().pause());
    await expect(page.locator('[data-testid="handoff"]')).toBeVisible();
    await page.mouse.move(hold!.x + 80, hold!.y + 80);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.click('[data-testid="key-1"]');
    const panel = page.locator('[data-testid="verdict-panel"]');
    await expect(panel).toContainText('进攻方');
    const txt = (await panel.textContent()) ?? '';
    expect(txt).not.toMatch(/师长|地雷|工兵|司令|军长|炸弹|军旗/);
  });

  test('rotation mid-animation: the move completes and every piece sits on its station', async ({ page }) => {
    await open(page);
    await position(page, { a2: 'r1', e11: 'b4', b1: 'rF', d12: 'bF', c9: 'b3' });
    await tap(page, 'a2');
    await tap(page, 'e11');
    const vp = page.viewportSize()!;
    await page.setViewportSize({ width: vp.height, height: vp.width });
    await settle(page);
    await page.waitForTimeout(300);
    const off = await page.evaluate(() => {
      const mc = (window as any).__mc;
      const c = mc.ctx().state;
      let worst = 0;
      for (let p = 0; p < c.np; p++) {
        if (!c.palive[p]) continue;
        const el = document.querySelector(`.mc-piece[data-pid="${p}"]`)!.getBoundingClientRect();
        const pt = mc.point(mc.sq(c.ppos[p]));
        worst = Math.max(worst, Math.hypot(el.left + el.width / 2 - pt.x, el.top + el.height / 2 - pt.y));
      }
      return worst;
    });
    expect(off).toBeLessThan(4);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
  });

  test('E18: the robot\'s answer arriving while the page is hidden waits, then plays on return', async ({ page }) => {
    await open(page, '&opp=dev&aiwait=600');
    await position(page, { a6: 'r5', e6: 'r4', b1: 'rF', d12: 'bF', a12: 'bM', c8: 'b3', e9: 'b6' }, { family: false });
    await tap(page, 'a6');
    await tap(page, 'b5');
    await page.waitForFunction(() => (window as any).__mc.phase() === 'thinking');
    await page.evaluate(() => (window as any).__mc.app.screen().pause()); // = shell pause (page hidden)
    await page.waitForTimeout(2000);
    expect(await notes(page)).toEqual(['a6-b5']); // the answer is queued, not animated in the background
    await page.evaluate(() => (window as any).__mc.app.screen().resume());
    await page.waitForFunction(() => (window as any).__mc.phase() === 'idle', null, { timeout: 10_000 });
    expect((await notes(page)).length).toBe(2);
  });

  test('drag: dropping on a legal station commits; dropping across the mountain springs back with the reason', async ({ page }) => {
    await open(page);
    await startMatch(page, family('ming'));
    const drag = async (from: string, to: string) => {
      const a = await page.evaluate((x) => (window as any).__mc.point(x), from);
      const b = await page.evaluate((x) => (window as any).__mc.point(x), to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      for (let k = 1; k <= 6; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 6, a.y + ((b.y - a.y) * k) / 6);
      await page.mouse.up();
    };
    await drag('b6', 'b7');
    await page.waitForTimeout(500);
    expect(await notes(page)).toEqual([]);
    expect(await page.evaluate(() => (window as any).__mc.said().includes('mc.ref.mountain'))).toBe(true);
    await drag('a6', 'b5');
    await settle(page);
    expect(await notes(page)).toEqual(['a6-b5']);
  });

  test('resume: a family game survives a reload with the identical position', async ({ page }) => {
    await open(page);
    await startMatch(page, family('ming'));
    await tap(page, 'a6');
    await tap(page, 'b5');
    await settle(page);
    await tap(page, 'e7');
    await tap(page, 'd8');
    await settle(page);
    const before = await state(page);
    await page.reload();
    await page.waitForSelector('#app[data-ready]');
    await page.click('[data-testid="resume"]');
    await settle(page);
    expect(await state(page)).toBe(before);
  });

  test('deployment: an illegal swap is refused (layout stays legal), a legal swap goes through', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__mc.app.go({ name: 'family' }));
    await page.click('[data-testid="start"]');
    await page.waitForFunction(() => (window as any).__mc.screen() === 'deploy');
    const layout = () => page.evaluate(() => (window as any).__mc.deploy().layout() as string);
    const tapSlot = async (k: number) => {
      const p = await page.evaluate((kk) => (window as any).__mc.deploy().slotPoint(kk), k);
      await page.touchscreen.tap(p.x, p.y);
    };
    const l0 = await layout();
    const mine = l0.indexOf('M');
    await tapSlot(mine);
    await tapSlot(0); // front row: a mine may not go there
    await page.waitForTimeout(400);
    expect(await layout()).toBe(l0);
    expect(await page.evaluate(() => (window as any).__mc.said().includes('mc.why.deploy.mine'))).toBe(true);
    await tapSlot(0);
    await tapSlot(1);
    await page.waitForFunction(() => !(window as any).__mc.deploy().busy());
    const l1 = await layout();
    expect(l1[0]).toBe(l0[1]);
    expect(l1[1]).toBe(l0[0]);
  });

  test('family 明棋: undo needs the other player\'s yes; agreed draw ends neutrally', async ({ page }) => {
    await open(page);
    await startMatch(page, family('ming'));
    await tap(page, 'a6');
    await tap(page, 'b5');
    await settle(page);
    await page.click('[data-testid="menu"]');
    await page.click('[data-testid="menu-undo"]');
    await page.getByRole('button', { name: '同意', exact: true }).click();
    await settle(page);
    expect(await notes(page)).toEqual([]);
    await page.click('[data-testid="menu"]');
    await page.click('[data-testid="menu-draw"]');
    await page.getByRole('button', { name: '同意和棋' }).click();
    await page.waitForFunction(() => (window as any).__mc.screen() === 'result');
    await expect(page.locator('[data-testid="result-title"]')).toHaveText('和棋');
  });
});
