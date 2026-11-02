/**
 * 算术站 2.0 smoke subset (runs in tests/smoke at iPad sizes against dist/). The full matrix — five viewports, 拆一拆, 测起点,
 * 超频, audio check — is math-v2.e2e.ts (npx playwright test -c site/mars-base/playwright.math.config.ts).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
test.beforeEach(async ({ context }) => { await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') }); });

async function boot(page: Page): Promise<void> {
  await page.goto('/mars-base/?mute=1');
  await expect(page.locator('#app[data-ready]')).toBeVisible();
  await page.locator('.kit-start__go').click();
  await expect(page.locator('.kit-start')).toBeHidden();
}

async function answer(page: Page, value: number): Promise<void> {
  for (const digit of String(value)) await page.locator(`[data-key="${digit}"]`).click();
  await page.locator('.ma-primary').click();
  await page.locator('.ma-primary[data-action="next"]').click();
}
const nums = async (page: Page) => (await page.locator('.ma-equation').first().innerText()).match(/\d+/g)!.map(Number);

test('five lines and 44 stages; first stage of each line is open, the rest are locked', async ({ page }) => {
  await boot(page);
  await expect(page.locator('[data-track]')).toHaveCount(5);
  await expect(page.locator('.ma-stage')).toHaveCount(44);
  for (const id of ['add-1', 'sub-1', 'mul-1', 'div-1', 'mix-1']) await expect(page.locator(`[data-stage="${id}"]`)).toBeEnabled();
  for (const id of ['add-2', 'add-7', 'mul-10', 'mix-2']) await expect(page.locator(`[data-stage="${id}"]`)).toBeDisabled();
  await expect(page.locator('.ma-tip')).toContainText('测起点');
});

test('four operations, eight answers, unlock and best score', async ({ page }) => {
  await boot(page);
  await page.locator('[data-stage="add-1"]').click();
  await page.locator('[data-key="hint"]').click();
  await expect(page.locator('.ma-hint')).not.toBeEmpty();
  await expect(page.locator('.ma-model')).toBeVisible();
  await page.locator('[data-key="hint"]').click();
  for (let i = 0; i < 8; i++) { const [a, b] = await nums(page); await answer(page, a + b); }
  await expect(page.getByText('完成挑战')).toBeVisible();
  await page.locator('[data-action="home"]').click();
  await expect(page.locator('[data-stage="add-2"]')).toBeEnabled();
  await expect(page.locator('[data-stage="add-1"] .ma-stage-state')).toContainText('8 / 8');
  const ops = [{ id: 'sub-1', f: (a: number, b: number) => a - b }, { id: 'mul-1', f: (a: number, b: number) => a * b }, { id: 'div-1', f: (a: number, b: number) => a / b }];
  for (const op of ops) {
    await page.locator(`[data-stage="${op.id}"]`).click();
    for (let i = 0; i < 8; i++) { const [a, b] = await nums(page); await answer(page, op.f(a, b)); }
    await expect(page.getByText('完成挑战')).toBeVisible();
    await page.locator('[data-action="home"]').click();
    await expect(page.locator(`[data-stage="${op.id}"] .ma-stage-state`)).toContainText('8 / 8');
  }
});

test('a wrong answer asks for another try; the unfinished round and old save survive a reload', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => localStorage.setItem('kg:v1:mars-base', 'old-mars-save'));
  await boot(page);
  await page.locator('[data-stage="sub-1"]').click();
  await page.locator('[data-key="0"]').click();
  await page.locator('.ma-primary').click();
  await expect(page.locator('.ma-retry-note')).toContainText('再试一次');
  await expect(page.locator('.ma-model')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.reload();
  await page.locator('.kit-start__go').click();
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('.ma-qno')).toHaveText('第 1 / 8 题');
  await expect(page.locator('.ma-retry-note')).toBeVisible();
  const [a, b] = await nums(page);
  for (const digit of String(a - b)) await page.locator(`[data-key="${digit}"]`).click();
  await page.locator('.ma-primary').click();
  await expect(page.locator('.ma-feedback.reviewed')).toBeVisible();
  await page.locator('.ma-primary[data-action="next"]').click();
  await expect(page.locator('.ma-qno')).toHaveText('第 2 / 8 题');
  await expect(page.locator('.ma-score')).toHaveText('一次就对 0');
  expect(await page.evaluate(() => localStorage.getItem('kg:v1:mars-base'))).toBe('old-mars-save');
});

test('a missed problem returns as a different problem after two more questions and survives reload', async ({ page }) => {
  await boot(page);
  await page.locator('[data-stage="add-1"]').click();
  const first = await page.locator('.ma-equation').first().innerText();
  await page.locator('[data-key="0"]').click();
  await page.locator('.ma-primary').click();
  const [a, b] = first.match(/\d+/g)!.map(Number);
  for (const digit of String(a + b)) await page.locator(`[data-key="${digit}"]`).click();
  await page.locator('.ma-primary').click();
  await page.locator('.ma-primary[data-action="next"]').click();
  for (let i = 0; i < 2; i++) { const [x, y] = await nums(page); await answer(page, x + y); }
  await expect(page.locator('.ma-qno')).toHaveText('再来一道 1');
  const variation = await page.locator('.ma-equation').first().innerText();
  expect(variation).not.toBe(first);
  await page.reload();
  await page.locator('.kit-start__go').click();
  await page.locator('[data-action="resume"]').click();
  expect(await page.locator('.ma-equation').first().innerText()).toBe(variation);
  const [x, y] = variation.match(/\d+/g)!.map(Number);
  await answer(page, x + y);
  await expect(page.locator('.ma-qno')).toHaveText('第 4 / 8 题');
  await expect(page.locator('.ma-score')).toHaveText('一次就对 2');
});

test('the robot shows the how-to sentence as caption (the equation stays on the screen), replay works on a phone, recorded whole sentences exist', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await expect(page.locator('.ma-bot-host .kit-companion')).toBeVisible();
  await page.locator('[data-stage="add-1"]').click();
  await expect(page.locator('.ma-guide-text')).toContainText('等于多少');
  await page.locator('[data-action="replay"]').click();
  await page.locator('[data-key="hint"]').click();
  await expect(page.locator('.ma-guide-text')).toContainText('数');
  const manifest = await (await request.get('/audio/mars-arithmetic/audio-manifest-v2.json')).json() as Record<string, { src: string }>;
  for (const id of ['ma.home', 'ma.hint.add', 'ma.right', 'ma.wrong']) expect((await request.get(manifest[id].src)).ok(), id).toBe(true);
});
