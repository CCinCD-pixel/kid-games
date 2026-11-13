/**
 * 玉兔编程 · round 1 (R1–R4) through the real buttons: choose a card and swap it, a run that does not get there keeps its scene,
 * 走一步, the three steps of the hint. Headless and silent; screenshots for dad go to ~/kid-games-work/shots/rover-round1/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SHOTS = path.join(os.homedir(), 'kid-games-work/shots/rover-round1');
const KEY = 'kg:v1:rover-code';
type L = { id: string; ch: number; n: number };
const LEVELS: L[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/rover-code/levels.json'), 'utf8')).levels;

test.beforeEach(async ({ context }) => { await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') }); });
test.use({ actionTimeout: 10_000 });

/** a save with every level before `id` done, and that chapter on show */
async function openAt(page: Page, id: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const lv = LEVELS.find((l) => l.id === id)!;
  const levels: Record<string, { stars: number; tries: number }> = {};
  for (const l of LEVELS) { if (l.id === id) break; levels[l.id] = { stars: 3, tries: 1 }; }
  await page.goto('/rover-code/');
  await page.evaluate(([k, s]) => { localStorage.clear(); localStorage.setItem(k, s); }, [KEY, JSON.stringify({ v: 1, updatedAt: Date.now(), data: { levels, chapter: lv.ch } })]);
  await page.goto('/rover-code/', { waitUntil: 'load' });
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  await page.getByRole('button', { name: /进入飞控中心/ }).click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('.rc-mapscreen');
  await page.locator('.xg-node').nth(lv.n - 1).click();
  await page.waitForSelector('.rc-play');
  return errors;
}
const card = (page: Page, c: string) => page.locator(`.rc-tray .rc-card[data-card="${c}"]`);
const slot = (page: Page, i: number) => page.locator('.rc-rail:not(.rc-p1-rail) > .rc-slot.is-full').nth(i);
const saved = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.data, KEY);
async function shot(page: Page, name: string, project: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, `${project}-${name}.png`) });
}
/** nothing scrolls sideways, and nothing is cut off at the right edge either (the page itself does not scroll, so check the boxes) */
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1
  && ['.rc-hint', '.rc-send', '.rc-stagewrap', '.rc-side'].every((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return !!r && r.right <= window.innerWidth + 1; }));

test.describe('玉兔编程 · round 1', () => {
  test.beforeEach(async ({}, info) => { test.skip(!['landscape-1080x810', 'phone-390x664'].includes(info.project.name), 'iPad landscape and one phone'); });

  test('R1: a card in the middle is chosen and swapped, one tap undoes it, and the fix gets three stars', async ({ page }, info) => {
    const errors = await openAt(page, 'C4-2');                                   // FFRFF: the turn should be the other one
    await slot(page, 2).click();
    await expect(slot(page, 2)).toHaveClass(/is-sel/);
    for (const b of ['.rc-del1', '.rc-ins', '.rc-undo']) {
      const box = await page.locator(b).boundingBox();
      expect(box && box.height >= 56 && box.width >= 56, `${b} is a big enough target`).toBe(true);
    }
    await shot(page, 'r1-select', info.project.name);
    await card(page, 'L').click();
    await expect(slot(page, 2)).toHaveAttribute('aria-label', /向左转/);
    await expect(page.locator('.rc-rail:not(.rc-p1-rail) > .rc-slot.is-full')).toHaveCount(5);
    await shot(page, 'r1-replaced', info.project.name);
    await page.locator('.rc-undo').click();                                       // a slip of the finger is taken back
    await expect(slot(page, 2)).toHaveAttribute('aria-label', /向右转/);
    await slot(page, 2).click();
    await card(page, 'L').click();
    expect(await noSideScroll(page)).toBe(true);
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 25000 });
    expect((await saved(page)).levels['C4-2'].stars).toBe(3);
    expect(errors).toEqual([]);
  });

  test('R1: in the magic row too: choose a card, put one in front of it, take one out', async ({ page }) => {
    await openAt(page, 'C6-5');                                                    // magic row FRF
    const p1 = page.locator('.rc-p1-rail .rc-slot.is-full');
    await p1.nth(1).click();
    await page.locator('.rc-ins').click();
    await expect(page.locator('.rc-p1-rail .rc-caret')).toHaveCount(1);
    await card(page, 'L').click();
    await expect(p1).toHaveCount(4);
    await expect(p1.nth(1)).toHaveAttribute('aria-label', /向左转/);
    await page.locator('.rc-done').click();
    await p1.nth(1).click();
    await page.locator('.rc-del1').click();
    await expect(p1).toHaveCount(3);
  });

  test('R2: after a crash the rover stays, the card that stopped it stays lit, until 回到起点', async ({ page }, info) => {
    const errors = await openAt(page, 'C1-4');
    await expect(page.locator('.rc-step')).toBeHidden();                          // 走一步 comes with chapter 4
    for (let k = 0; k < 4; k++) await card(page, 'N').click();
    await page.locator('.rc-send').click();
    await expect(page.locator('.rc-brief')).toContainText(/没有路|大石头/, { timeout: 10000 });
    await page.waitForTimeout(2500);                                               // it used to vanish after 1.1 s
    await expect(page.locator('.rc-slot.is-bad')).toHaveCount(1);
    await expect(page.locator('.rc-home')).toBeVisible();
    await shot(page, 'r2-fail-scene', info.project.name);
    await page.locator('.rc-home').click();
    await expect(page.locator('.rc-slot.is-bad')).toHaveCount(0);
    await expect(page.locator('.rc-home')).toBeHidden();
    await expect(page.locator('.rc-rail > .rc-slot.is-full')).toHaveCount(4);   // the cards stay
    expect(errors).toEqual([]);
  });

  test('R3: 走一步 does one card a press; 发送 then runs the rest; chapter 1 has no 走一步', async ({ page }, info) => {
    const errors = await openAt(page, 'C4-7');
    const step = page.locator('.rc-step');
    await expect(step).toBeVisible();
    await step.click();
    await expect(page.locator('.rc-rail .rc-slot.is-now')).toHaveAttribute('data-i', '0');
    await step.click();
    await expect(page.locator('.rc-rail .rc-slot.is-now')).toHaveAttribute('data-i', '1');
    await expect(page.locator('.rc-home')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await shot(page, 'r3-step', info.project.name);
    await step.click();                                                            // the third card runs into a rock: the scene stays
    await expect(page.locator('.rc-slot.is-bad')).toHaveAttribute('data-i', '2', { timeout: 10000 });
    await expect(page.locator('.rc-rail .rc-slot.is-now')).toHaveCount(0);
    await page.locator('.rc-home').click();
    await step.click();                                                            // a fresh run from the start, then 发送 does the rest
    await page.locator('.rc-send').click();
    await expect(page.locator('.rc-slot.is-bad')).toHaveAttribute('data-i', '2', { timeout: 20000 });
    expect(errors).toEqual([]);
  });

  test('R4: ① the task again, ② a tile circled and the suspect card lit, ③ the next move on his own programme; two stars, never 清空', async ({ page }, info) => {
    const errors = await openAt(page, 'C4-7');                                   // two bugs
    const brief = page.locator('.rc-brief');
    await page.locator('.rc-hint').click();
    await expect(brief).toContainText('逐步运行');
    await shot(page, 'r4-hint1', info.project.name);
    await page.locator('.rc-hint').click();
    await expect(brief).toContainText('圈着');
    await expect(page.locator('.rc-slot.is-hint')).toHaveCount(1);
    await shot(page, 'r4-hint2', info.project.name);
    await page.locator('.rc-hint').click();
    await expect(page.locator('.rc-tray .rc-card.is-pulse, .rc-del1.is-pulse, .rc-send.is-pulse')).not.toHaveCount(0);
    await shot(page, 'r4-hint3', info.project.name);
    // follow step ③ the whole way: it must mend the programme from where it is, card by card
    for (let k = 0; k < 12; k++) {
      await expect(brief).not.toContainText('清空');
      if (await page.locator('.rc-send.is-pulse').count()) break;
      if (await page.locator('.rc-del1.is-pulse').count()) await page.locator('.rc-del1').click();
      else {
        await page.locator('.rc-tray .rc-card.is-pulse').first().click();
        if (await page.locator('.rc-done').isVisible()) await page.locator('.rc-done').click();
      }
      await page.locator('.rc-hint').click();
    }
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 30000 });
    expect((await saved(page)).levels['C4-7'].stars).toBe(2);                    // step ③ caps at two
    expect(errors).toEqual([]);
  });

  test('R4: on a plain level the hint keeps a good start of his own and adds to it', async ({ page }) => {
    await openAt(page, 'C1-5');
    await card(page, 'E').click();
    for (let k = 0; k < 3; k++) await page.locator('.rc-hint').click();
    await expect(page.locator('.rc-tray .rc-card.is-pulse')).toHaveCount(1);
    await expect(page.locator('.rc-rail > .rc-slot.is-full')).toHaveCount(1);
    await expect(page.locator('.rc-slot.is-sel')).toHaveCount(0);
  });
});
