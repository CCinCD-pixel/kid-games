import { expect, test } from '@playwright/test';

test('timed and endless battles use the expanded arena on touch screens', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/snake-battle/?test=1&nogate');
  await page.waitForSelector('#app[data-ready]');
  await page.evaluate(() => {
    const app = (window as any).__sbApp;
    app.save.data.firstRunDone = true;
    void app.startMatch('timed', 'moon', { seed: 17, countdown: false });
  });
  await page.waitForFunction(() => (window as any).__sb?.match?.state === 'playing');
  const timed = await page.evaluate(() => {
    const { match, view } = (window as any).__sb;
    return { radius: match.world.R, drawnRadius: match.arenaR, food: match.world.food.count, snakes: match.world.snakes.length, floorRadius: view.R.floorParams.R };
  });
  // `food` is the live count: AIs start eating the instant play begins, so pin the configured 3574 as an upper bound (exact count: validate/arena-radius.test.ts).
  expect(timed.food).toBeGreaterThan(3574 * 0.97); expect(timed.food).toBeLessThanOrEqual(3574);
  expect({ ...timed, food: 0 }).toEqual({ radius: 3200, drawnRadius: 3200, food: 0, snakes: 16, floorRadius: 3200 });
  await expect(page.locator('.sb-mini')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('expanded-moon.png') });
  await page.setViewportSize({ width: 390, height: 664 });
  await expect(page.locator('.sb-mini')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  await page.evaluate(() => {
    const app = (window as any).__sbApp;
    app.teardownMatch();
    void app.startMatch('endless', 'blackhole', { seed: 17, countdown: false });
  });
  await page.waitForFunction(() => (window as any).__sb?.match?.mode === 'endless');
  const endless = await page.evaluate(() => {
    const { match, view } = (window as any).__sb;
    return { radius: match.world.R, drawnRadius: match.arenaR, food: match.world.food.count, snakes: match.world.snakes.length, floorRadius: view.R.floorParams.R };
  });
  expect(endless.food).toBeGreaterThan(7386 * 0.97); expect(endless.food).toBeLessThanOrEqual(7386);
  expect({ ...endless, food: 0 }).toEqual({ radius: 4600, drawnRadius: 4600, food: 0, snakes: 25, floorRadius: 4600 });
  await expect(page.locator('.sb-mini')).toBeVisible();
  expect(errors).toEqual([]);
});
