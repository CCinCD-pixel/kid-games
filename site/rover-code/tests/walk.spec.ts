/**
 * 玉兔编程 · walk: every level of the game is solved through the real buttons, the way a child lays cards (one viewport only:
 * 64 levels take a few minutes). A fix-the-bug level is mended by touching only the cards that need it (round 1, R1): a card is chosen
 * and swapped, taken out, or has one put in front of it; a repeat block gets its number tapped. Each such level must earn three stars.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
test.beforeEach(async ({ context }) => { await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') }); });

const KEY = 'kg:v1:rover-code';
type L = { id: string; kind?: string; role?: string; ch: number; n: number; solution: Record<string, string>; fixP1?: string; p1Slots?: number; buggy?: string; fix?: string; garage?: { open: string[] }; loadout?: Record<string, string> };
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
/** the fewest swaps, removals and inserts that turn a row of plain cards into another, right to left (so earlier places stay put) */
function edits(a: string, b: string): { op: 'rep' | 'del' | 'ins'; i: number; c?: string }[] {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const out: { op: 'rep' | 'del' | 'ins'; i: number; c?: string }[] = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) { i--; j--; }
    else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) { out.push({ op: 'rep', i: i - 1, c: b[j - 1] }); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { out.push({ op: 'del', i: i - 1 }); i--; }
    else { out.push({ op: 'ins', i, c: b[j - 1] }); j--; }
  }
  return out;
}
const slot = (page: Page, i: number) => page.locator('.rc-rail:not(.rc-p1-rail) > .rc-slot.is-full').nth(i);
/** mend a fix-the-bug level through the edit bar, touching only what needs touching */
async function mend(page: Page, lv: L): Promise<void> {
  if (lv.id === 'C5-6') { for (let k = 0; k < 3; k++) await page.locator('.rc-bh').click(); return; }           // 4 -> 5 -> 2 -> 3
  if (lv.id === 'C8-5') {                                                                                  // 3(FFFR)FF -> 2(FFFL)FF
    for (let k = 0; k < 3; k++) await page.locator('.rc-bh').click();                                        // 3 -> 4 -> 5 -> 2
    await page.locator('.rc-block .rc-slot.is-full[data-j="3"]').click();
    await card(page, 'L').click();
    return;
  }
  if (lv.id === 'C6-5') { await page.locator('.rc-p1-label').click(); await card(page, 'L').click(); return; } // the magic row gets one more card
  const bug = lv.buggy!, fix = lv.fix!;
  expect(/^[NESWFLRP]+$/.test(bug + fix), `${lv.id} is a row of plain cards`).toBe(true);
  for (const e of edits(bug, fix)) {
    if (e.op === 'ins' && e.i >= (await page.locator('.rc-rail:not(.rc-p1-rail) > .rc-slot.is-full').count())) { await card(page, e.c!).click(); continue; }
    await slot(page, e.i).click();
    if (e.op === 'rep') await card(page, e.c!).click();
    else if (e.op === 'del') await page.locator('.rc-del1').click();
    else { await page.locator('.rc-ins').click(); await card(page, e.c!).click(); await page.locator('.rc-done').click(); }
  }
  const now = await page.locator('.rc-rail:not(.rc-p1-rail) > .rc-slot.is-full').count();
  expect(now, `${lv.id} has the fix's cards`).toBe(fix.length);
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
    if (lv.kind === 'rules') {
      for (const [cond, act] of Object.entries(lv.solution)) { await page.locator(`.rc-cond[data-cond="${cond}"]`).click(); await page.locator(`.rc-act[data-act="${act}"]`).click(); }
    } else if (lv.buggy) { await mend(page, lv); } else { await lay(page, lv.solution.main); await layP1(page, lv.solution.p1 ?? ''); }
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: /下一关|回地图/ }).first(), lv.id).toBeVisible({ timeout: 60_000 });
    const stars = (await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.data, KEY)).levels[lv.id]?.stars;
    expect(stars, `${lv.id} stars`).toBeGreaterThanOrEqual(2);
    if (lv.buggy) expect(stars, `${lv.id}: only the cards that needed it were touched`).toBe(3);
    const next = page.getByRole('button', { name: '下一关' });
    if (await next.count()) await next.click(); else break;
  }
  expect(errors).toEqual([]);
});
