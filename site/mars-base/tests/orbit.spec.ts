import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test.beforeEach(async ({ context }) => {
  await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') });
});

test('orbit calibration, progress and resumed placement', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/mars-base/?test=1&mute=1');
  await expect(page.locator('#app[data-ready]')).toBeVisible();
  await page.getByRole('button', { name: '出发' }).click();
  await expect(page.locator('#app[data-screen="map"]')).toBeVisible();
  await page.getByRole('button', { name: /继续 · 百里校准/ }).click();

  for (let i = 0; i < 12; i++) {
    const target = Number(await page.locator('.mb-order__target').innerText());
    await page.locator('.mb-line__input').fill(String(target));
    await page.getByRole('button', { name: '交付' }).click();
    await expect(page.locator('#app[data-screen="feedback"]')).toBeVisible();
    await page.getByRole('button', { name: '继续' }).click();
  }
  await expect(page.locator('#app[data-screen="wrap"]')).toBeVisible();
  await page.getByRole('button', { name: '回基地' }).click();
  await expect(page.getByRole('button', { name: /继续 · 百格锚点/ })).toBeVisible();

  await page.getByRole('button', { name: /继续 · 百格锚点/ }).click();
  const target = await page.locator('.mb-order__target').innerText();
  await page.locator('.mb-line__input').fill('432');
  await page.reload();
  await expect(page.locator('#app[data-screen="mission"]')).toBeVisible();
  await expect(page.locator('.mb-order__target')).toHaveText(target);
  await expect(page.locator('.mb-line__lens')).toHaveText('432');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:mars-base') ?? '{}'));
  expect(saved.v).toBe(2);
  expect(saved.data.active.index).toBe(0);
  expect(saved.data.active.draft).toBe(432);
  expect(errors).toEqual([]);
});

test('map and task stay inside phone viewport', async ({ page }, testInfo) => {
  const shots = path.join(ROOT, '../../kid-games-work/shots/mars-base', testInfo.project.name);
  mkdirSync(shots, { recursive: true });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/mars-base/?test=1&mute=1');
  await page.getByRole('button', { name: '出发' }).click();
  await expect(page.locator('#app[data-screen="map"]')).toBeVisible();
  await page.screenshot({ path: path.join(shots, 'phone-map.png') });
  const mapOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
  expect(mapOverflow).toBe(false);
  await page.getByRole('button', { name: /继续 · 百里校准/ }).click();
  await page.screenshot({ path: path.join(shots, 'phone-orbit.png') });
  const taskOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
  expect(taskOverflow).toBe(false);
  await expect(page.getByRole('button', { name: '交付' })).toBeInViewport();
});

test('zoom stage narrows from thousand to hundred to ten', async ({ page }) => {
  await page.goto('/mars-base/?test=1&mute=1&node=orbit.O2.5');
  const target = Number(await page.locator('.mb-order__target').innerText());
  await page.locator('.mb-line__input').fill(String(target));
  await page.getByRole('button', { name: '放大' }).click();
  await expect(page.locator('.mb-order__unit')).toHaveText('选十段');
  await page.locator('.mb-line__input').fill(String(target));
  await page.reload();
  await expect(page.locator('.mb-order__unit')).toHaveText('选十段');
  await expect(page.locator('.mb-line__lens')).toHaveText(String(target));
  await page.getByRole('button', { name: '放大' }).click();
  await expect(page.locator('.mb-order__unit')).toHaveText('插旗');
  await page.locator('.mb-line__input').fill(String(target));
  await page.getByRole('button', { name: '交付' }).click();
  await expect(page.locator('.mb-feedback__result')).toHaveText('到站了');
});

test('reverse reading uses an in-game keypad on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/mars-base/?test=1&mute=1&node=orbit.O1.2');
  for (let i = 0; i < 4; i++) {
    const target = await page.locator('.mb-order__target').innerText();
    await page.locator('.mb-line__input').fill(target);
    await page.getByRole('button', { name: '交付' }).click();
    await page.getByRole('button', { name: '继续' }).click();
  }
  await expect(page.locator('.mb-order__target')).toHaveText('?');
  const expected = await page.locator('.mb-line__input').inputValue();
  await page.getByRole('button', { name: /旗子所在的位置，当前未填写/ }).click();
  await expect(page.locator('.mb-pad')).toBeInViewport();
  for (const digit of expected) await page.locator('.mb-pad').getByRole('button', { name: digit, exact: true }).click();
  await page.locator('.mb-pad').getByRole('button', { name: '交付' }).click();
  await expect(page.locator('.mb-feedback__result')).toHaveText('到站了');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
