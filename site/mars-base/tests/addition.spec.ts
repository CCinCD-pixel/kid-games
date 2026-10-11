import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test.beforeEach(async ({ context }) => {
  await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') });
});

async function fill(page: Page, label: string, value: number): Promise<void> {
  await page.getByRole('button', { name: new RegExp(label) }).click();
  for (const digit of String(value)) await page.locator('.mb-pad').getByRole('button', { name: digit, exact: true }).click();
  await page.locator('.mb-pad').getByRole('button', { name: '交付' }).click();
}

async function solve(page: Page, alreadyPoured = 0, methodShot?: string): Promise<void> {
  const order = await page.locator('.mb-order__target').innerText();
  const [a, b] = order.split('+').map(Number);
  if (await page.getByRole('button', { name: '十位先合' }).count()) {
    await page.getByRole('button', { name: '十位先合' }).click();
    await fill(page, '先得到，当前', Math.floor(a / 10) * 10 + Math.floor(b / 10) * 10);
    await page.getByRole('button', { name: '开始装货' }).click();
    if (methodShot) await page.screenshot({ path: methodShot });
    const fits = await page.evaluate(() => document.querySelector('.mb-addition-actions')!.getBoundingClientRect().bottom <= document.querySelector('.mb-cert-work')!.getBoundingClientRect().bottom);
    expect(fits).toBe(true);
  }
  if (await page.getByRole('button', { name: /先补几，当前/ }).count()) {
    const first = 10 - a % 10;
    await fill(page, '先补几，当前', first);
    await fill(page, '还剩几，当前', b - first);
  }
  if (await page.getByRole('button', { name: /填答案，当前/ }).count()) {
    await page.locator('.mb-addition-choice').getByRole('button', { name: String(10 - a % 10), exact: true }).click();
    await fill(page, '填答案，当前', a + b);
  } else if (await page.getByRole('button', { name: /填结果，当前/ }).count()) {
    const carry = Number(a % 10 + b % 10 >= 10);
    await page.getByRole('button', { name: `进位 ${carry}` }).click();
    await fill(page, '填结果，当前', a + b);
  } else {
    for (let i = 0; i < Math.floor(b / 10); i++) await page.getByRole('button', { name: '倒 1 根棒' }).click();
    for (let i = alreadyPoured; i < b % 10; i++) {
      if (!(await page.getByRole('button', { name: '倒 1 颗晶' }).isEnabled())) await page.getByRole('button', { name: '压成棒' }).click();
      await page.getByRole('button', { name: '倒 1 颗晶' }).click();
    }
    if (await page.getByRole('button', { name: '压成棒' }).isEnabled()) await page.getByRole('button', { name: '压成棒' }).click();
    await expect(page.locator('.mb-addition-bin').last()).toContainText('待装货 · 0');
    await expect(page.locator('.mb-addition-bin').first()).toContainText(`晶槽里 · ${a + b}`);
  }
  await page.locator('.mb-controls').getByRole('button', { name: '交付' }).click();
  await expect(page.locator('.mb-feedback__result')).toHaveText('验收成功');
  await page.getByRole('button', { name: '继续' }).click();
}

test('complete the eight addition stations with carry, strategies, and restored progress', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 320, height: 568 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/mars-base/?test=1&mute=1&node=cert.C2.1');
  const titles = ['整十加', '进位', '凑整十', '两位加两位', '补偿法', '怎么算快', '竖式现身', '加法订单会'];
  for (let station = 1; station <= 8; station++) {
    await expect(page.locator('#app[data-screen="addMission"]'), `C2.${station} should open`).toBeVisible();
    await expect(page.locator('.mb-header h1'), `C2.${station} title`).toHaveText(titles[station - 1]);
    const count = await page.locator('.mb-progress i').count();
    expect(count, `C2.${station} item count`).toBe(station === 8 ? 8 : 6);
    for (let index = 0; index < count; index++) {
      await expect(page.locator('#app[data-screen="addMission"]'), `C2.${station} item ${index + 1}`).toBeVisible();
      if (station === 6 && index === 0) {
        await page.locator('.mb-controls').getByRole('button', { name: '交付' }).click();
        await expect(page.locator('#app[data-screen="addMission"]')).toBeVisible();
      }
      if ([5, 6, 7].includes(station) && index === 0) {
        const shots = path.join(ROOT, '../../kid-games-work/shots/mars-base', testInfo.project.name);
        mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, `phone-c2-${station}.png`) });
      }
      let poured = 0;
      if (station === 2 && index === 0) {
        await page.locator('.mb-controls').getByRole('button', { name: '交付' }).click();
        await expect(page.locator('.mb-feedback__result')).toHaveText('再看一眼');
        await page.getByRole('button', { name: '再试一次' }).click();
        await page.getByRole('button', { name: '倒 1 颗晶' }).click();
        poured = 1;
        await page.goto('/mars-base/?test=1&mute=1');
        await expect(page.locator('#app[data-screen="addMission"]')).toBeVisible();
        const shots = path.join(ROOT, '../../kid-games-work/shots/mars-base', testInfo.project.name);
        mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, 'phone-c2-carry.png') });
      }
      const methodShot = station === 6 && index === 0 ? path.join(ROOT, '../../kid-games-work/shots/mars-base', testInfo.project.name, 'phone-c2-6-tray.png') : undefined;
      await test.step(`C2.${station} item ${index + 1}`, () => solve(page, poured, methodShot));
    }
    await expect(page.locator('#app[data-screen="addWrap"]')).toBeVisible();
    if (station < 8) {
      await page.getByRole('button', { name: '返回' }).click();
      await page.locator('.mb-node:not([disabled]):not(.mb-node--done)').click();
    }
  }
  await page.getByRole('button', { name: '回基地' }).click();
  await page.getByRole('button', { name: '认证站' }).click();
  await expect(page.getByRole('button', { name: /加法牌/ })).toContainText('8/8 座设施');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('v2 progress gains an addition chapter without losing an unfinished C1 mission', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kg:v1:mars-base', JSON.stringify({ v: 2, updatedAt: 1, data: {
      onboardingDone: true, completed: [], skipped: [], calibrations: [], cert: {
        completed: ['cert.C1.1'], active: { nodeId: 'cert.C1.2', seed: 4, index: 1, draft: '', attempts: 0, firstTry: [] },
      },
    } }));
  });
  await page.goto('/mars-base/?test=1&mute=1');
  await expect(page.locator('#app[data-screen="certMission"]')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:mars-base') ?? '{}'));
  expect(stored.v).toBe(4);
  expect(stored.data.cert.completed).toEqual(['cert.C1.1']);
  expect(stored.data.cert.active.index).toBe(1);
  expect(stored.data.addition.completed).toEqual([]);
  expect(stored.data.subtraction.completed).toEqual([]);
});

test('addition controls fit phone landscape and iPad portrait', async ({ page }, testInfo) => {
  const shots = path.join(ROOT, '../../kid-games-work/shots/mars-base', testInfo.project.name);
  mkdirSync(shots, { recursive: true });
  for (const viewport of [{ width: 844, height: 390 }, { width: 810, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/mars-base/?test=1&mute=1&node=cert.C2.2');
    await expect(page.locator('#app[data-screen="addMission"]')).toBeVisible();
    const geometry = await page.evaluate(() => {
      const order = document.querySelector('.mb-order')!.getBoundingClientRect();
      const work = document.querySelector('.mb-cert-work')!.getBoundingClientRect();
      const controls = document.querySelector('.mb-controls')!.getBoundingClientRect();
      const actions = [...document.querySelectorAll('.mb-addition-actions button')].map((button) => button.getBoundingClientRect());
      return { orderBottom: order.bottom, workTop: work.top, workBottom: work.bottom, controlsTop: controls.top, controlsBottom: controls.bottom, actions: actions.map((rect) => ({ top: rect.top, bottom: rect.bottom })), height: innerHeight, overflows: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.workTop).toBeGreaterThanOrEqual(geometry.orderBottom);
    expect(geometry.controlsTop).toBeGreaterThanOrEqual(geometry.workBottom);
    expect(geometry.controlsBottom).toBeLessThanOrEqual(geometry.height);
    expect(geometry.overflows).toBe(false);
    if (viewport.height < 600) {
      for (const action of geometry.actions) {
        expect(action.top).toBeGreaterThanOrEqual(geometry.workTop);
        expect(action.bottom).toBeLessThanOrEqual(geometry.workBottom);
      }
    }
    await page.screenshot({ path: path.join(shots, `addition-${viewport.width}x${viewport.height}.png`) });
    await solve(page);
  }
});
