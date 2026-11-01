import { expect, test } from '@playwright/test';

test('the first chess-box line loads its recorded clip after the start tap', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipadP', 'the opening voice path is shared by every viewport');
  await page.addInitScript({ path: 'tools/qa/mute-audio.js' });
  const clip = page.waitForResponse((response) => response.url().includes('/audio/xiangqi/xq.s.title.') && response.status() === 200, { timeout: 15_000 });
  await page.goto('/xiangqi/?mute=1');
  await page.locator('.kit-start__go').click();
  await expect(page.locator('.xq-box[data-ready="1"]')).toBeVisible();
  await clip;
});
