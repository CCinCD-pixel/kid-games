import { expect, test } from '@playwright/test';

test('phone can launch snake again after an edge-swipe back', async ({ page }, info) => {
  test.skip(info.project.name !== 'portrait-810x1080', 'phone case runs once');
  test.setTimeout(25_000);
  await page.context().addInitScript({ path: 'tools/qa/mute-audio.js' });
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/?mute=1');
  await page.waitForSelector('body[data-ready]');
  await page.evaluate(() => {
    (window as any).__hubRestored = false;
    window.addEventListener('pageshow', (e) => { (window as any).__hubRestored = e.persisted; });
  });
  await page.locator('#hub-tabs button[data-id="playground"]').tap();
  await page.locator('.hub-card[data-game="snake-battle"]').tap();
  await page.waitForURL('**/snake-battle/');
  await page.locator('.kit-start button').tap();
  await expect(page.locator('.sb-hud')).toBeVisible();
  await page.goBack();
  await page.waitForURL('**/?mute=1');
  await expect(page.locator('.hub-card[data-game="snake-battle"]')).toBeVisible();
  const restored = await page.evaluate(() => (window as any).__hubRestored === true);
  console.log(`[hub return] bfcache=${restored}`);
  await page.locator('.hub-card[data-game="snake-battle"]').tap();
  await page.waitForURL('**/snake-battle/', { timeout: 4000 });
  await expect(page.locator('.kit-start button')).toBeVisible();
});

test('bfcache restore resets the shell navigation lock', async ({ page }, info) => {
  test.skip(info.project.name !== 'portrait-810x1080', 'phone case runs once');
  await page.context().addInitScript({ path: 'tools/qa/mute-audio.js' });
  let requests = 0;
  await page.route('**/snake-battle/', async (route) => {
    requests++;
    await route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/?mute=1');
  await page.locator('#hub-tabs button[data-id="playground"]').tap();
  const card = page.locator('.hub-card[data-game="snake-battle"]');
  await card.tap();
  await expect.poll(() => requests).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await card.tap();
  await expect.poll(() => requests).toBe(2);
});
