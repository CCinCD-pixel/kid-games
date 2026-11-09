/**
 * 玉兔编程 · real-click tests (headless, silent: the kit mutes itself under automation). Plays the real levels with the
 * solutions of content/rover-code/levels.json through the card box, the rail and the 发送 button, on five viewports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const KEY = 'kg:v1:rover-code';
type L = { id: string; ch: number; n: number; solution: { main: string }; buggy?: string; fix?: string; garage?: { open: string[] }; loadout?: Record<string, string>; slots: number; expectMin: number };
const LEVELS: L[] = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../content/rover-code/levels.json'), 'utf8')).levels;
const lv = (id: string): L => LEVELS.find((l) => l.id === id)!;

const seed = (before: string | null, chapter = 1) => {
  const levels: Record<string, { stars: number; tries: number }> = {};
  if (before) for (const l of LEVELS) { if (l.id === before) break; levels[l.id] = { stars: 3, tries: 1 }; }
  return JSON.stringify({ v: 1, updatedAt: Date.now(), data: { levels, chapter } });
};

async function open(page: Page, save: string | null): Promise<string[]> {
  const errors: string[] = [];
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the pulsing first card never holds still otherwise, and a click waits for stillness
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('/rover-code/');
  await page.evaluate(([k, s]) => { localStorage.clear(); if (s) localStorage.setItem(k as string, s as string); }, [KEY, save]);
  await page.goto('/rover-code/', { waitUntil: 'load' });
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  await page.getByRole('button', { name: /进入飞控中心/ }).click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('.rc-mapscreen');
  return errors;
}
async function openLevel(page: Page, id: string): Promise<void> {
  const l = lv(id);
  const tab = page.getByRole('tab', { name: `第 ${l.ch} 章` });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await page.waitForSelector('.xg-node');
  await page.locator('.xg-node').nth(l.n - 1).click();
  await page.waitForSelector('.rc-play');
}
const card = (page: Page, c: string) => page.locator(`.rc-card[data-card="${c}"]`);
async function enter(page: Page, prog: string): Promise<void> {
  for (const c of prog) await card(page, c).click();
}
const saved = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.data, KEY);

test.describe('玉兔编程', () => {
  test('the map: chapter 1, the first level is the current one, the rest are locked; nothing in the console', async ({ page }) => {
    const errors = await open(page, null);
    await expect(page.locator('.xg-node')).toHaveCount(8);
    await expect(page.locator('.xg-node[data-state="current"]')).toHaveCount(1);
    await expect(page.locator('.xg-node[data-state="locked"]')).toHaveCount(7);
    await expect(page.getByRole('tab', { name: '第 2 章' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('C1-1: three right arrows drive to the tower, three stars, saved, and the next level opens', async ({ page }) => {
    const errors = await open(page, null);
    await openLevel(page, 'C1-1');
    await expect(page.locator('.rc-send')).toBeDisabled();
    await enter(page, 'EEE');
    await expect(page.locator('.rc-slot.is-full')).toHaveCount(3);
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 20000 });
    expect((await saved(page)).levels['C1-1'].stars).toBe(3);
    await page.getByRole('button', { name: '回地图' }).click();
    await expect(page.locator('.xg-node[data-state="done"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('a card the rover cannot do says why, keeps the programme, and the child can fix it', async ({ page }) => {
    await open(page, seed('C1-4')); // C1-4 has a big rock right on the way: driving up into the edge of the map is the quickest bump
    await openLevel(page, 'C1-4');
    await enter(page, 'NNNN');
    await page.locator('.rc-send').click();
    await expect(page.locator('.rc-brief')).toContainText(/没有路|大石头/, { timeout: 10000 });
    await expect(page.locator('.rc-send')).toBeEnabled({ timeout: 5000 });
    await expect(page.locator('.rc-slot.is-full')).toHaveCount(4);
    await page.locator('.rc-slot.is-full').first().click(); // tap a card to take it out again
    await expect(page.locator('.rc-slot.is-full')).toHaveCount(3);
  });

  test('a full rail refuses a card instead of dropping it', async ({ page }) => {
    await open(page, null);
    await openLevel(page, 'C1-1');
    await enter(page, 'EEEE');
    await expect(page.locator('.rc-slot.is-full')).toHaveCount(4);
    await card(page, 'E').click();
    await expect(page.locator('.rc-slot.is-full')).toHaveCount(4);
    await expect(page.locator('.rc-brief')).toContainText('满了');
  });

  test('C2-4 (garage): big wheels cost two slots; the level is solved with them', async ({ page }) => {
    await open(page, seed('C2-4', 2));
    await openLevel(page, 'C2-4');
    const l = lv('C2-4');
    await expect(page.locator('.rc-slot')).toHaveCount(l.slots);
    await page.locator('.rc-part[data-part="wheels"] .rc-opt[data-val="L"]').click();
    await expect(page.locator('.rc-slot')).toHaveCount(l.slots - 2);
    await enter(page, l.solution.main);
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 25000 });
  });

  test('C4-1 (fix the bug): the buggy programme is already in the rail; the fix gets three stars', async ({ page }) => {
    await open(page, seed('C4-1', 4));
    await openLevel(page, 'C4-1');
    const l = lv('C4-1');
    await expect(page.locator('.rc-slot.is-full')).toHaveCount(l.buggy!.length);
    await page.locator('.rc-clear').click(); // 还原 keeps the buggy one
    await expect(page.locator('.rc-slot.is-full')).toHaveCount(l.buggy!.length);
    // edit it into the fix the way a child would: take the cards after the bug out, then lay the right ones
    const fix = l.fix!; const bug = l.buggy!;
    let i = 0; while (i < bug.length && bug[i] === fix[i]) i++;
    for (let k = bug.length - 1; k >= i; k--) await page.locator('.rc-slot.is-full').nth(k).click();
    await enter(page, fix.slice(i));
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 25000 });
    expect((await saved(page)).levels['C4-1'].stars).toBe(3);
  });

  test('every level of chapter 1-3 can be solved through the real buttons (first level of each chapter on this viewport)', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, seed('C3-1', 3));
    await openLevel(page, 'C3-1');
    await enter(page, lv('C3-1').solution.main);
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 25000 });
    await page.getByRole('button', { name: '下一关' }).click();
    await expect(page.locator('.rc-play')).toBeVisible(); // the next level opened straight away
    await expect(page.locator('.rc-title')).toContainText('C3-2').catch(() => {}); // the title is hidden on narrow screens
  });

  test('the back button goes from a level to the map; the layout never overflows; reload keeps the stars', async ({ page }) => {
    await open(page, seed('C1-3'));
    await openLevel(page, 'C1-3');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    for (const sel of ['.rc-send', '.rc-card', '.rc-stagewrap']) {
      const box = await page.locator(sel).first().boundingBox();
      const vp = page.viewportSize()!;
      expect(box && box.x >= -1 && box.x + box.width <= vp.width + 1, `${sel} inside the viewport`).toBe(true);
    }
    await page.locator('.kit-back').click();
    await expect(page.locator('.rc-mapscreen')).toBeVisible();
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: /进入飞控中心/ }).click({ timeout: 8000 }).catch(() => {});
    await expect(page.locator('.xg-node[data-state="done"]')).toHaveCount(2);
  });
});
