import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test.beforeEach(async ({ context }) => {
  await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') });
});

test('read crystals, build numbers, resume, and complete the first C1 station', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/mars-base/?test=1&mute=1&node=cert.C1.1');
  await expect(page.locator('#app[data-screen="certMission"]')).toBeVisible();
  for (let index = 0; index < 6; index++) {
    if (index < 3) {
      const rods = await page.locator('.mb-pile__rods .mb-rod').count();
      const crystals = await page.locator('.mb-pile__crystals .mb-crystal').count();
      const bundles = await page.locator('.mb-crystal-bundle').count();
      const expected = String(rods * 10 + crystals + bundles * 10);
      await page.getByRole('button', { name: /答案，当前未填写/ }).click();
      for (const digit of expected) await page.locator('.mb-pad').getByRole('button', { name: digit, exact: true }).click();
      await page.locator('.mb-pad').getByRole('button', { name: '交付' }).click();
    } else {
      const target = Number(await page.locator('.mb-order__target').innerText());
      const rods = Math.floor(target / 10);
      const crystals = target % 10;
      for (let i = 0; i < rods; i++) await page.getByRole('button', { name: '倒 1 根棒' }).click();
      if (index === 3) {
        await page.reload();
        await expect(page.locator('.mb-tray-count')).toHaveText(String(rods * 10));
      }
      for (let i = 0; i < crystals; i++) await page.getByRole('button', { name: '倒 1 颗晶' }).click();
      await expect(page.locator('.mb-tray-count')).toHaveText(String(target));
      if (index === 3) {
        const shots = path.join(ROOT, '../../kid-games-work/shots/mars-base', testInfo.project.name);
        mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, 'phone-c1-build.png') });
      }
      await page.getByRole('button', { name: '交付' }).click();
    }
    await expect(page.locator('.mb-feedback__result')).toHaveText('验收成功');
    await page.getByRole('button', { name: '继续' }).click();
  }
  await expect(page.locator('#app[data-screen="certWrap"]')).toBeVisible();
  await page.getByRole('button', { name: '回基地' }).click();
  await page.getByRole('button', { name: '认证站' }).click();
  await page.getByRole('button', { name: /位值牌/ }).click();
  await expect(page.locator('.mb-node--done')).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('comparison requires sign and deciding place', async ({ page }) => {
  await page.goto('/mars-base/?test=1&mute=1&node=cert.C1.2');
  const values = await page.locator('.mb-compare-number').allInnerTexts();
  const [left, right] = values.map(Number);
  await page.getByRole('button', { name: '交付' }).click();
  await expect(page.locator('#app[data-screen="certMission"]')).toBeVisible();
  const sign = left > right ? '>' : left < right ? '<' : '=';
  await page.locator('.mb-compare-signs').getByRole('button', { name: sign, exact: true }).click();
  await page.locator('.mb-compare-places').getByRole('button', { name: Math.floor(left / 10) === Math.floor(right / 10) ? '个位' : '十位' }).click();
  await page.getByRole('button', { name: '交付' }).click();
  await expect(page.locator('.mb-feedback__result')).toHaveText('验收成功');
});

test('splitting a rod changes the model before the answer is accepted', async ({ page }) => {
  await page.goto('/mars-base/?test=1&mute=1&node=cert.C1.4');
  const prompt = await page.locator('.mb-tray-stage p').innerText();
  const [, totalText, rodsText] = prompt.match(/(\d+) = (\d+) 个十/) ?? [];
  const total = Number(totalText);
  const rods = Number(rodsText);
  await page.getByRole('button', { name: /答案，当前未填写/ }).click();
  for (const digit of String(total - rods * 10)) await page.locator('.mb-pad').getByRole('button', { name: digit, exact: true }).click();
  await page.locator('.mb-pad').getByRole('button', { name: '交付' }).click();
  await expect(page.locator('.mb-feedback__result')).toHaveText('再看一眼');
  await page.getByRole('button', { name: '再试一次' }).click();
  await page.getByRole('button', { name: '切 1 根棒' }).click();
  await page.reload();
  await expect(page.locator('.mb-crystal-bundle')).toHaveCount(1);
  await page.getByRole('button', { name: '交付' }).click();
  await expect(page.locator('.mb-feedback__result')).toHaveText('验收成功');
});

test('v1 orbit progress migrates without losing completed nodes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kg:v1:mars-base', JSON.stringify({ v: 1, updatedAt: 1, data: {
      onboardingDone: true, completed: ['orbit.O1.0'], skipped: ['orbit.O1.1'], calibrations: [],
    } }));
  });
  await page.goto('/mars-base/?test=1&mute=1');
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:mars-base') ?? '{}'));
  expect(data.v).toBe(4);
  expect(data.data.completed).toEqual(['orbit.O1.0']);
  expect(data.data.skipped).toEqual(['orbit.O1.1']);
  expect(data.data.cert.completed).toEqual([]);
  expect(data.data.addition.completed).toEqual([]);
  expect(data.data.subtraction.completed).toEqual([]);
});
