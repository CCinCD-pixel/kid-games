import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
test.beforeEach(async ({ context }) => { await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') }); });

async function boot(page: Page): Promise<void> {
  await page.goto('/mars-base/?mute=1');
  await expect(page.locator('#app[data-ready]')).toBeVisible();
}

async function answer(page: Page, value: number): Promise<void> {
  for (const digit of String(value)) await page.locator(`[data-key="${digit}"]`).click();
  await page.locator('[data-action="submit"]').click();
  await page.locator('[data-action="next"]').click();
}

test('four operations, eight answers, unlock and best score', async ({ page }) => {
  await boot(page);
  for (const id of ['add-1', 'sub-1', 'mul-1', 'div-1']) await expect(page.locator(`[data-stage="${id}"]`)).toBeEnabled();
  await expect(page.locator('[data-stage="add-2"]')).toBeDisabled();
  await page.locator('[data-stage="add-1"]').click();
  await page.locator('[data-key="hint"]').click();
  await expect(page.locator('.ma-hint')).not.toBeEmpty();
  for (let i = 0; i < 8; i++) {
    const values = await page.locator('.ma-equation').innerText();
    const nums = values.match(/\d+/g)!.map(Number);
    await answer(page, nums[0] + nums[1]);
  }
  await expect(page.getByText('完成挑战')).toBeVisible();
  await page.locator('[data-action="home"]').click();
  await expect(page.locator('[data-stage="add-2"]')).toBeEnabled();
  await expect(page.locator('[data-stage="add-1"] small')).toHaveText('8 / 8');
});

test('wrong answer feedback and unfinished round survive reload; old save remains', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kg:v1:mars-base', 'old-mars-save'));
  await boot(page);
  await page.locator('[data-stage="sub-1"]').click();
  await page.locator('[data-key="0"]').click();
  await page.locator('[data-action="submit"]').click();
  await expect(page.locator('.ma-feedback.wrong')).toContainText('正确答案');
  await page.locator('[data-action="next"]').click();
  await page.reload();
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('.ma-play-header strong')).toHaveText('第 2 / 8 题');
  expect(await page.evaluate(() => localStorage.getItem('kg:v1:mars-base'))).toBe('old-mars-save');
});
