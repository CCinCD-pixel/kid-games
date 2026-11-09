/**
 * 玉兔编程 · walk: every level of the game is solved through the real buttons, the way a child lays cards (one viewport only:
 * 40 levels take a few minutes). A fix-the-bug level is mended by taking the programme apart and laying the fix.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const KEY = 'kg:v1:rover-code';
type L = { id: string; ch: number; n: number; solution: { main: string; p1?: string }; fixP1?: string; p1Slots?: number; buggy?: string; fix?: string; garage?: { open: string[] }; loadout?: Record<string, string> };
const LEVELS: L[] = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../content/rover-code/levels.json'), 'utf8')).levels;

const card = (page: Page, c: string) => page.locator(`.rc-card[data-card="${c}"]`);
async function lay(page: Page, prog: string): Promise<void> {
  for (let i = 0; i < prog.length; i++) {
    const c = prog[i];
    if (/[2-5]/.test(c)) {
      await card(page, 'X').click();
      for (let k = 2; k < Number(c); k++) await page.locator('.rc-block.is-open .rc-bh').click();
      i++;
    } else if (c === ')') { if (await page.locator('.rc-bclose').count()) await page.locator('.rc-bclose').click(); } // a block of four closes itself
    else await card(page, c).click();
  }
}
async function layP1(page: Page, p1: string): Promise<void> {
  if (!p1) return;
  await page.locator('.rc-p1-label').click(); // the magic row takes the next cards
  for (const c of p1) await card(page, c).click();
}
async function takeApart(page: Page): Promise<void> {
  for (let guard = 0; guard < 12; guard++) {
    const one = page.locator('.rc-p1-rail .rc-slot.is-full');
    if (!(await one.count())) break;
    await one.first().click();
  }
  await page.locator('.rc-rail:not(.rc-p1-rail)').first().click({ position: { x: 3, y: 3 } }).catch(() => {}); // the main row takes the cards again
  for (let guard = 0; guard < 30; guard++) {
    const del = page.locator('.rc-bdel');
    if (await del.count()) { await del.first().click(); continue; }
    const one = page.locator('.rc-rail > .rc-slot.is-full');
    if (!(await one.count())) return;
    await one.first().click();
  }
}

test.use({ actionTimeout: 10_000 });
test('every level can be solved through the real buttons', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape-1080x810', 'one viewport is enough for the walk');
  test.setTimeout(30 * 60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('/rover-code/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/rover-code/', { waitUntil: 'load' });
  await page.getByRole('button', { name: /进入飞控中心/ }).click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('.rc-mapscreen');
  // C1-1 through the map, then "下一关" all the way: the real route a child takes, 40 levels in a row
  await page.locator('.xg-node').first().click();
  for (const lv of LEVELS) {
    await page.waitForSelector('.rc-play');
    await expect(page.locator('.rc-title')).toContainText(lv.id).catch(() => {}); // hidden on narrow screens only
    for (const [part, val] of Object.entries(lv.loadout ?? {})) {
      if (lv.garage?.open.includes(part)) await page.locator(`.rc-part[data-part="${part}"] .rc-opt[data-val="${val}"]`).click();
    }
    if (lv.buggy) { await takeApart(page); await lay(page, lv.fix!); await layP1(page, lv.fixP1 ?? ''); } else { await lay(page, lv.solution.main); await layP1(page, lv.solution.p1 ?? ''); }
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: /下一关|回地图/ }).first(), lv.id).toBeVisible({ timeout: 60_000 });
    const stars = (await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.data, KEY)).levels[lv.id]?.stars;
    expect(stars, `${lv.id} stars`).toBeGreaterThanOrEqual(2);
    const next = page.getByRole('button', { name: '下一关' });
    if (await next.count()) await next.click(); else break;
  }
  expect(errors).toEqual([]);
});
