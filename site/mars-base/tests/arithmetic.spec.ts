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
  await page.locator('[data-action="submit"]').click();
  await page.locator('[data-action="next"]').click();
}

test('four operations, eight answers, unlock and best score', async ({ page }) => {
  await boot(page);
  for (const id of ['add-1', 'sub-1', 'mul-1', 'div-1']) await expect(page.locator(`[data-stage="${id}"]`)).toBeEnabled();
  await expect(page.locator('[data-stage="add-2"]')).toBeDisabled();
  await page.locator('[data-stage="add-1"]').click();
  await page.locator('[data-key="hint"]').click();
  await expect(page.locator('.ma-guide-text')).toContainText('从');
  await expect(page.locator('.ma-model')).toBeVisible();
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
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => localStorage.setItem('kg:v1:mars-base', 'old-mars-save'));
  await boot(page);
  await page.locator('[data-stage="sub-1"]').click();
  await page.locator('[data-key="0"]').click();
  await page.locator('[data-action="submit"]').click();
  await expect(page.locator('.ma-retry-note')).toContainText('这道题再试一次');
  await expect(page.locator('.ma-model')).toBeVisible();
  await expect(page.locator('.ma-feedback')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.reload();
  await page.locator('.kit-start__go').click();
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('.ma-play-header strong')).toHaveText('第 1 / 8 题');
  await expect(page.locator('.ma-retry-note')).toBeVisible();
  const equation = await page.locator('.ma-equation').innerText();
  const [a, b] = equation.match(/\d+/g)!.map(Number);
  for (const digit of String(a - b)) await page.locator(`[data-key="${digit}"]`).click();
  await page.locator('[data-action="submit"]').click();
  await expect(page.locator('.ma-feedback.reviewed')).toContainText('自己算出来了');
  await page.locator('[data-action="next"]').click();
  await expect(page.locator('.ma-play-header strong')).toHaveText('第 2 / 8 题');
  await expect(page.locator('.ma-score')).toHaveText('首答 0');
  expect(await page.evaluate(() => localStorage.getItem('kg:v1:mars-base'))).toBe('old-mars-save');
});

test('after another miss the answer is optional and does not award a first-try point', async ({ page }) => {
  await boot(page);
  await page.locator('[data-stage="add-1"]').click();
  for (let i = 0; i < 2; i++) {
    await page.locator('[data-key="0"]').click();
    await page.locator('[data-action="submit"]').click();
  }
  await expect(page.locator('[data-action="show-answer"]')).toBeVisible();
  await page.locator('[data-action="show-answer"]').click();
  await expect(page.locator('.ma-feedback.wrong')).toContainText('正确答案');
  await page.locator('[data-action="next"]').click();
  await expect(page.locator('.ma-score')).toHaveText('首答 0');
});

test('a missed problem returns as a different problem after two more questions and survives reload', async ({ page }) => {
  await boot(page);
  await page.locator('[data-stage="add-1"]').click();
  const first = await page.locator('.ma-equation').innerText();
  await page.locator('[data-key="0"]').click();
  await page.locator('[data-action="submit"]').click();
  const [a, b] = first.match(/\d+/g)!.map(Number);
  await answer(page, a + b);
  for (let i = 0; i < 2; i++) {
    const [x, y] = (await page.locator('.ma-equation').innerText()).match(/\d+/g)!.map(Number);
    await answer(page, x + y);
  }
  await expect(page.locator('.ma-play-header strong')).toHaveText('变式复练 1');
  const variation = await page.locator('.ma-equation').innerText();
  expect(variation).not.toBe(first);
  await page.reload();
  await page.locator('.kit-start__go').click();
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('.ma-equation')).toContainText(variation.replace(/\s+/g, ' ').trim().split('=')[0].trim());
  const [x, y] = variation.match(/\d+/g)!.map(Number);
  await answer(page, x + y);
  await expect(page.locator('.ma-play-header strong')).toHaveText('第 4 / 8 题');
  await expect(page.locator('.ma-score')).toHaveText('首答 2');
});

test('robot reads the arithmetic question and replay works on a phone', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await expect(page.locator('.ma-bot-host .kit-companion')).toBeVisible();
  await page.locator('[data-stage="add-1"]').click();
  await expect(page.locator('.ma-guide-text')).toContainText('等于几');
  await page.locator('[data-action="replay"]').click();
  await page.locator('[data-key="hint"]').click();
  await expect(page.locator('.ma-guide-text')).toContainText('数');
  const manifest = await (await request.get('/audio/mars-arithmetic/audio-manifest-v2.json')).json() as Record<string, { src: string }>;
  for (const id of ['ma.home', 'ma.ask', 'ma.op.add', 'ma.hint.add', 'ma.right', 'ma.wrong']) {
    const response = await request.get(manifest[id].src);
    expect(response.ok(), id).toBe(true);
  }
});

test('a full eight-question round works in all four operations', async ({ page }) => {
  await boot(page);
  const operations = [
    { id: 'add-1', solve: (a: number, b: number) => a + b },
    { id: 'sub-1', solve: (a: number, b: number) => a - b },
    { id: 'mul-1', solve: (a: number, b: number) => a * b },
    { id: 'div-1', solve: (a: number, b: number) => a / b },
  ];
  for (const operation of operations) {
    await page.locator(`[data-stage="${operation.id}"]`).click();
    for (let i = 0; i < 8; i++) {
      const equation = await page.locator('.ma-equation').innerText();
      const [a, b] = equation.match(/\d+/g)!.map(Number);
      await answer(page, operation.solve(a, b));
    }
    await expect(page.getByText('完成挑战')).toBeVisible();
    await page.locator('[data-action="home"]').click();
    await expect(page.locator(`[data-stage="${operation.id}"] small`)).toHaveText('8 / 8');
  }
});
