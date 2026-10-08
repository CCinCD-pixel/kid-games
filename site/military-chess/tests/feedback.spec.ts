/**
 * Dad's feedback (2026-10-08), on every project (iPads and phones):
 *  - 跳过: the kit pill shows after ~1.5 s on the first-time flow and on the 翻翻棋 scenes; skipping counts
 *    as seen (camp + first shoulder board / the scene booked with 1★); the parent switch 跳过开场和教学
 *    skips the first-time flow by itself; the first-time flow can be replayed from the 规则卡.
 *  - 陆战棋 decisions: 对战 and 和爸爸下 offer only 翻翻棋; a known mine makes the coach ask first;
 *    taking the flag wins at once and the rule is said in words (banner + result line).
 */
import { expect, test, type Page } from '@playwright/test';

const URL = '/military-chess/?test=1&fast=1';
async function open(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForSelector('#app[data-ready]');
}
async function go(page: Page, r: Record<string, unknown>): Promise<void> {
  await page.evaluate((rr) => (window as any).__mc.app.go(rr), r);
}
async function tap(page: Page, at: string): Promise<void> {
  const pt = await page.evaluate((a) => (window as any).__mc.point(a), at);
  await page.touchscreen.tap(pt.x, pt.y);
}
const screen = (page: Page): Promise<string | null> => page.evaluate(() => (window as any).__mc.screen());
const FAN = { b11: 'r9^', b12: 'bF^', b1: 'rF^', e7: 'b5^', c3: 'r3', d10: 'b7', a6: 'r6^', d4: 'b2^', e10: 'b4', a1: 'rB', c7: 'bM^' };
async function match(page: Page, pieces: Record<string, string>, o: Record<string, unknown> = { mode: 'fan', ladder: true, family: false }): Promise<void> {
  await page.evaluate(([p, oo]) => (window as any).__mc.position(p, oo), [pieces, o] as const);
  await page.waitForFunction(() => ['idle', 'thinking'].includes((window as any).__mc.phase()));
}
const PILL = '.xg-skip[data-state="shown"]';

test.describe('陆战棋 · 跳过', () => {
  test('first-time flow: 跳过 appears after ~1.5 s; tapping it lands on the camp with the first shoulder board', async ({ page }) => {
    await open(page);
    await go(page, { name: 'ft' });
    await page.waitForTimeout(700);
    await expect(page.locator(PILL)).toHaveCount(0); // not tappable by accident right away
    await page.locator(PILL).waitFor({ timeout: 4_000 });
    await page.locator(PILL).click();
    await page.waitForFunction(() => (window as any).__mc.screen() === 'home');
    const save = await page.evaluate(() => (window as any).__mc.app.save);
    expect(save.firstRun.ft).toBe(true);
    expect(save.rank).toBeGreaterThanOrEqual(0);
    await expect(page.locator(PILL)).toHaveCount(0);
  });

  test('翻翻棋 scene: 跳过 books it with a star and the lesson moves on', async ({ page }) => {
    await open(page);
    await go(page, { name: 'item', id: 'F-1' });
    await page.locator(PILL).waitFor({ timeout: 5_000 });
    await page.locator(PILL).click();
    await page.waitForFunction(() => ((window as any).__mc.app.save.items['F-1']?.stars ?? 0) >= 1, null, { timeout: 5_000 });
    await expect(page.locator(PILL)).toHaveCount(0);
  });

  test('parent switch 跳过开场和教学: the first-time flow does not start; without it, it does', async ({ page }) => {
    await open(page);
    // the camp sends a new player into the first-time flow (outside ?test=1): try both ways
    await page.evaluate(() => {
      const a = (window as any).__mc.app;
      a.save.firstRun.ft = false;
      a.test = false;
      a.go({ name: 'home' });
    });
    expect(await screen(page)).toBe('ft');
    await page.evaluate(() => {
      localStorage.setItem('kg:settings:v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('kg:settings:v1') || '{}'), skipIntros: true }));
      const a = (window as any).__mc.app;
      a.save.firstRun.ft = false;
      a.go({ name: 'home' });
    });
    expect(await screen(page)).toBe('home');
    expect(await page.evaluate(() => (window as any).__mc.app.save.firstRun.ft)).toBe(true);
  });

  test('the 规则卡 replays the first-time flow (skipping never loses it)', async ({ page }) => {
    await open(page);
    await go(page, { name: 'rules', from: 'home' });
    await page.locator('[data-testid="ft-again"]').click();
    await page.waitForFunction(() => (window as any).__mc.screen() === 'ft');
  });
});

test.describe('陆战棋 · 只下翻翻棋', () => {
  test('对战 and 和电脑下 offer only 翻翻棋', async ({ page }) => {
    await open(page);
    for (const r of [{ name: 'ladder' }, { name: 'ladder', free: true }]) {
      await go(page, r);
      await expect(page.locator('[data-testid="mode-tabs"]')).toContainText('翻翻棋');
      await expect(page.locator('[data-testid="tab-ming"], [data-testid="tab-an"]')).toHaveCount(0);
    }
  });

  test('和爸爸下 shows one 翻翻棋 banner (no 明棋 / 暗棋 / 实体棋裁判)', async ({ page }) => {
    await open(page);
    await go(page, { name: 'family' });
    await expect(page.locator('[data-testid^="mode-"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="mode-fan"]')).toHaveClass(/is-banner/);
  });

  test('an old 明棋 save does not crash: the camp still opens', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const a = (window as any).__mc.app;
      a.save.family.lastMode = 'ming';
      a.go({ name: 'family' });
    });
    expect(await screen(page)).toBe('family');
    await expect(page.locator('[data-testid="mode-fan"]')).toBeVisible();
  });
});

test.describe('陆战棋 · 地雷和军旗', () => {
  test('a known mine: the coach asks first ("这是地雷，碰了会牺牲"); 再想想 keeps the piece', async ({ page }) => {
    await open(page);
    await match(page, { ...FAN, c6: 'r5^' });
    await tap(page, 'c6');
    await tap(page, 'c7');
    const sheet = page.locator('[data-testid="sheet"]');
    await expect(sheet).toContainText('地雷');
    await page.locator('[data-testid="sheet-primary"]').click();
    await expect(sheet).toHaveCount(0);
    // no move was made: still the child's turn (the robot is not thinking)
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => (window as any).__mc.phase())).toBe('idle');
  });

  test('the same warning in a family game, for whoever moves', async ({ page }) => {
    await open(page);
    await match(page, { ...FAN, c6: 'r5^' }, { mode: 'fan' });
    await tap(page, 'c6');
    await tap(page, 'c7');
    await expect(page.locator('[data-testid="sheet"]')).toContainText('地雷');
  });

  test('taking the flag wins at once: the banner says the rule, the result repeats it', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { (window as any).__mc.app.save.settings.coachAlerts = 'off'; });
    // no blue mine left → the flag is open: 司令 b11 takes the flag on b12
    await match(page, { ...FAN, c7: 'b6^' });
    await tap(page, 'b11');
    await tap(page, 'b12');
    await expect(page.locator('[data-testid="flag-win"]')).toContainText('扛到军旗');
    await page.waitForFunction(() => (window as any).__mc.screen() === 'result', null, { timeout: 15_000 });
    await expect(page.locator('[data-testid="flag-rule"]')).toContainText('扛到军旗立刻获胜');
    await expect(page.locator('[data-testid="flag-rule"]')).toContainText('先挖光对方地雷');
  });
});
