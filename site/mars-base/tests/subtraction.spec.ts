import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test.beforeEach(async ({ context }) => {
  await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') });
});

async function fill(page: Page, label: string, value: number): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`${label}，当前`) }).click();
  for (const digit of String(value)) await page.locator('.mb-pad').getByRole('button', { name: digit, exact: true }).click();
  await page.locator('.mb-pad').getByRole('button', { name: '交付' }).click();
}

async function solve(page: Page): Promise<void> {
  const order = await page.locator('.mb-order__target').innerText();
  const [a, b] = order.split('−').map(Number);
  const answer = a - b;
  if (await page.getByRole('button', { name: '取走 1 根棒' }).count()) {
    for (let i = 0; i < Math.floor(b / 10); i++) await page.getByRole('button', { name: '取走 1 根棒' }).click();
    for (let i = 0; i < b % 10; i++) {
      if (!(await page.getByRole('button', { name: '取走 1 颗晶' }).isEnabled())) await page.getByRole('button', { name: '切棒成十颗' }).click();
      await page.getByRole('button', { name: '取走 1 颗晶' }).click();
    }
    if (await page.getByRole('button', { name: '收好余晶' }).isEnabled()) await page.getByRole('button', { name: '收好余晶' }).click();
    await expect(page.locator('.mb-addition-bin').first()).toContainText(`还剩 · ${answer}`);
    await expect(page.locator('.mb-addition-bin').last()).toContainText(`已取走 · ${b}/${b}`);
  } else if (await page.getByRole('button', { name: /中间结果，当前/ }).count()) {
    const rounded = Math.ceil(b / 10) * 10;
    await fill(page, '中间结果', a - rounded);
    await fill(page, '最后结果', answer);
  } else if (await page.getByRole('button', { name: /个位，当前/ }).count()) {
    await page.getByRole('button', { name: '切一根棒' }).click();
    await fill(page, '个位', answer % 10);
    await fill(page, '结果', answer);
  } else if (await page.getByRole('button', { name: /相差几，当前/ }).count()) {
    await fill(page, '相差几', answer);
  } else {
    await fill(page, '多几颗', answer);
  }
  await page.locator('.mb-controls').getByRole('button', { name: '交付' }).click();
  await expect(page.locator('.mb-feedback__result')).toHaveText('验收成功');
  await page.getByRole('button', { name: '继续' }).click();
}

test('complete all eight subtraction stations and retain a partly shipped order', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 320, height: 568 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/mars-base/?test=1&mute=1&node=cert.C3.1');
  const titles = ['整十减', '退位', '想加算减', '两位减两位', '减法补偿', '多多少', '减法竖式', '减法订单会'];
  for (let station = 1; station <= 8; station++) {
    await expect(page.locator('#app[data-screen="subMission"]')).toBeVisible();
    await expect(page.locator('.mb-header h1')).toHaveText(titles[station - 1]);
    const count = await page.locator('.mb-progress i').count();
    expect(count).toBe(station === 8 ? 8 : 6);
    for (let index = 0; index < count; index++) {
      await expect(page.locator('#app[data-screen="subMission"]')).toBeVisible();
      if (station === 2 && index === 0) {
        await page.locator('.mb-controls').getByRole('button', { name: '交付' }).click();
        await expect(page.locator('.mb-feedback__result')).toHaveText('再看一眼');
        await page.getByRole('button', { name: '再试一次' }).click();
        await page.getByRole('button', { name: '切棒成十颗' }).click();
        await page.goto('/mars-base/?test=1&mute=1');
        await expect(page.locator('#app[data-screen="subMission"]')).toBeVisible();
        await expect(page.locator('.mb-subtraction-opened .mb-crystal')).toHaveCount(10);
        await page.getByRole('button', { name: '重摆' }).click();
      }
      if ([2, 3, 5, 6, 7].includes(station) && index === 0) {
        await page.screenshot({ path: info.outputPath(`c3-${station}-phone.png`) });
      }
      await test.step(`C3.${station} item ${index + 1}`, () => solve(page));
    }
    await expect(page.locator('#app[data-screen="subWrap"]')).toBeVisible();
    if (station < 8) {
      await page.getByRole('button', { name: '返回' }).click();
      await page.locator('.mb-node:not([disabled]):not(.mb-node--done)').click();
    }
  }
  await page.getByRole('button', { name: '回基地' }).click();
  await page.getByRole('button', { name: '认证站' }).click();
  await expect(page.getByRole('button', { name: /减法牌/ })).toContainText('8/8 座设施');
  expect(errors).toEqual([]);
});

test('v3 save upgrades without losing an active addition mission', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kg:v1:mars-base', JSON.stringify({ v: 3, updatedAt: 1, data: {
    onboardingDone: true, completed: [], skipped: [], calibrations: [], cert: { completed: ['cert.C1.1'] },
    addition: { completed: ['cert.C2.1'], active: { nodeId: 'cert.C2.2', seed: 4, index: 1, draft: '', attempts: 0, firstTry: [] } },
    activeArea: 'addition',
  } })));
  await page.goto('/mars-base/?test=1&mute=1');
  await expect(page.locator('#app[data-screen="addMission"]')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:mars-base') ?? '{}'));
  expect(stored.v).toBe(4);
  expect(stored.data.cert.completed).toEqual(['cert.C1.1']);
  expect(stored.data.addition.completed).toEqual(['cert.C2.1']);
  expect(stored.data.addition.active.index).toBe(1);
  expect(stored.data.subtraction.completed).toEqual([]);
});

test('borrowing controls fit phone landscape and iPad portrait', async ({ page }, info) => {
  for (const viewport of [{ width: 844, height: 390 }, { width: 810, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/mars-base/?test=1&mute=1&node=cert.C3.2');
    await expect(page.locator('#app[data-screen="subMission"]')).toBeVisible();
    const geometry = await page.evaluate(() => {
      const order = document.querySelector('.mb-order')!.getBoundingClientRect();
      const work = document.querySelector('.mb-cert-work')!.getBoundingClientRect();
      const controls = document.querySelector('.mb-controls')!.getBoundingClientRect();
      return { orderBottom: order.bottom, workTop: work.top, workBottom: work.bottom, controlsTop: controls.top, controlsBottom: controls.bottom, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(geometry.workTop).toBeGreaterThanOrEqual(geometry.orderBottom);
    expect(geometry.controlsTop).toBeGreaterThanOrEqual(geometry.workBottom);
    expect(geometry.controlsBottom).toBeLessThanOrEqual(geometry.height);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`c3-${viewport.width}x${viewport.height}.png`) });
    await solve(page);
  }
});

test('column order remains reachable on a short phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/mars-base/?test=1&mute=1&node=cert.C3.7');
  const work = page.locator('.mb-cert-work');
  const intro = work.locator('p').first();
  const workTop = await work.evaluate((element) => element.getBoundingClientRect().top);
  const introTop = await intro.evaluate((element) => element.getBoundingClientRect().top);
  expect(introTop).toBeGreaterThanOrEqual(workTop);
  const resultBottom = await page.getByRole('button', { name: /结果，当前/ }).evaluate((element) => element.getBoundingClientRect().bottom);
  const workBottom = await work.evaluate((element) => element.getBoundingClientRect().bottom);
  expect(resultBottom).toBeLessThanOrEqual(workBottom);
  await page.getByRole('button', { name: '切一根棒' }).click();
  await page.getByRole('button', { name: /个位，当前/ }).click();
  await expect(page.locator('.mb-pad')).toBeVisible();
});
