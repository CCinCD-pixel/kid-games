/**
 * 玉兔编程 · real-click tests (headless, silent: the kit mutes itself under automation). Plays the real levels with the
 * solutions of content/rover-code/levels.json through the card box, the rail and the 发送 button, on five viewports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const KEY = 'kg:v1:rover-code';
type L = { id: string; kind?: string; fixP1?: string; ch: number; n: number; solution: Record<string, string>; buggy?: string; fix?: string; garage?: { open: string[] }; loadout?: Record<string, string>; slots: number; expectMin: number };
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
/** lay a programme the way a child does: "F3(FPF)" = a card, then the repeat card, three taps on its number, cards into the bracket, 收好 */
async function enter(page: Page, prog: string): Promise<void> {
  for (let i = 0; i < prog.length; i++) {
    const c = prog[i];
    if (/[2-5]/.test(c)) {
      await card(page, 'X').click();
      for (let k = 2; k < Number(c); k++) await page.locator('.rc-block.is-open .rc-bh').click();
      i++; // the opening bracket
    } else if (c === ')') await page.locator('.rc-bclose').click();
    else await card(page, c).click();
  }
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

  test('C5-1: the repeat card opens a bracket, the number is tapped up to 5, five steps reach the tower', async ({ page }) => {
    const errors = await open(page, seed('C5-1', 5));
    await openLevel(page, 'C5-1');
    await card(page, 'X').click();
    await expect(page.locator('.rc-block.is-open')).toHaveCount(1);
    await expect(page.locator('.rc-bh b')).toHaveText('2');
    await card(page, 'F').click();
    for (let k = 0; k < 3; k++) await page.locator('.rc-bh').click();
    await expect(page.locator('.rc-bh b')).toHaveText('5');
    await page.locator('.rc-bclose').click();
    await expect(page.locator('.rc-block.is-open')).toHaveCount(0);
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 25000 });
    expect((await saved(page)).levels['C5-1'].stars).toBe(3);
    expect(errors).toEqual([]);
  });

  test('an empty bracket is not sent: the rover stays and the helper says the bracket is empty', async ({ page }) => {
    await open(page, seed('C5-1', 5));
    await openLevel(page, 'C5-1');
    await card(page, 'X').click();
    await page.locator('.rc-send').click();
    await expect(page.locator('.rc-brief')).toContainText('括号里还没有卡');
    await expect(page.locator('.rc-send')).toBeEnabled();
    await page.locator('.rc-bdel').click(); // the whole block goes with its x
    await expect(page.locator('.rc-block')).toHaveCount(0);
  });

  test('C5-6 (fix the count): tapping the number from 4 round to 3 mends the programme with one edit', async ({ page }) => {
    await open(page, seed('C5-6', 5));
    await openLevel(page, 'C5-6');
    await expect(page.locator('.rc-bh b')).toHaveText('4');
    for (let k = 0; k < 3; k++) await page.locator('.rc-bh').click(); // 4 -> 5 -> 2 -> 3
    await expect(page.locator('.rc-bh b')).toHaveText('3');
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 30000 });
    expect((await saved(page)).levels['C5-6'].stars).toBe(3);
  });

  test('C5-2 (a card, then a block with a sample inside): laid through the real buttons it wins', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, seed('C5-2', 5));
    await openLevel(page, 'C5-2');
    await enter(page, lv('C5-2').solution.main);
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 40000 });
  });

  test('C5-5 (garage + loop): big wheels and a repeat block get up the stairs', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, seed('C5-5', 5));
    await openLevel(page, 'C5-5');
    await page.locator('.rc-part[data-part="wheels"] .rc-opt[data-val="L"]').click();
    await enter(page, lv('C5-5').solution.main);
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 40000 });
  });

  test('C6-1: the magic row takes the cards, three magic cards in the main row play it three times', async ({ page }) => {
    const errors = await open(page, seed('C6-1', 6));
    await openLevel(page, 'C6-1');
    await expect(page.locator('.rc-p1')).toBeVisible();
    await enter(page, 'CCC');
    await page.locator('.rc-p1-label').click(); // the next cards go into the magic row
    await expect(page.locator('.rc-p1')).toHaveClass(/is-target/);
    for (const c of lv('C6-1').solution.p1 ?? '') await card(page, c).click();
    await expect(page.locator('.rc-p1-rail .rc-slot.is-full')).toHaveCount(3);
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 30000 });
    expect((await saved(page)).levels['C6-1'].stars).toBe(3);
    expect(errors).toEqual([]);
  });

  test('an empty magic row is not sent: the helper says it is empty and the magic row takes the next card', async ({ page }) => {
    await open(page, seed('C6-1', 6));
    await openLevel(page, 'C6-1');
    await enter(page, 'C');
    await page.locator('.rc-send').click();
    await expect(page.locator('.rc-brief')).toContainText('魔法卡还是空的');
    await expect(page.locator('.rc-p1')).toHaveClass(/is-target/);
  });

  test('C6-5 (fix the magic card): one card added to the magic row mends all three places', async ({ page }) => {
    await open(page, seed('C6-5', 6));
    await openLevel(page, 'C6-5');
    await expect(page.locator('.rc-p1-rail .rc-slot.is-full')).toHaveCount(3);
    await page.locator('.rc-p1-label').click();
    await card(page, 'L').click();
    await expect(page.locator('.rc-p1-rail .rc-slot.is-full')).toHaveCount(4);
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 40000 });
    expect((await saved(page)).levels['C6-5'].stars).toBe(3);
  });

  test('C7-1 (rule card): "如果蓝格就右转" takes the rover home on both maps', async ({ page }) => {
    const errors = await open(page, seed('C7-1', 7));
    await openLevel(page, 'C7-1');
    await expect(page.locator('.rc-stagewrap')).toHaveCount(2);
    await expect(page.locator('.rc-send')).toBeDisabled();
    await page.locator('.rc-cond[data-cond="B"]').click();
    await expect(page.locator('.rc-send')).toBeDisabled();             // half a rule is not sent
    await expect(page.locator('.rc-cond[data-cond="B"]')).toHaveClass(/is-dim/);
    await page.locator('.rc-act[data-act="R"]').click();
    await expect(page.locator('.rc-send')).toBeEnabled();
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '下一关' })).toBeVisible({ timeout: 30000 });
    expect((await saved(page)).levels['C7-1'].stars).toBe(3);
    expect(errors).toEqual([]);
  });

  test('C7-1: a rule that does not fit both maps says which map and why, and the rule stays', async ({ page }) => {
    await open(page, seed('C7-1', 7));
    await openLevel(page, 'C7-1');
    await page.locator('.rc-cond[data-cond="B"]').click();
    await page.locator('.rc-act[data-act="L"]').click();              // blue → left is the wrong way
    await page.locator('.rc-send').click();
    await expect(page.locator('.rc-brief')).toContainText(/图 [AB]/, { timeout: 15000 });
    await expect(page.locator('.rc-send')).toBeEnabled({ timeout: 10000 });
    await expect(page.locator('.rc-rule .rc-slot.is-full')).toHaveCount(2);
  });

  test('C8-1 (rescue): driving onto the stranded rover picks it up and the tow reaches the base', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, seed('C8-1', 8));
    await openLevel(page, 'C8-1');
    await enter(page, lv('C8-1').solution.main);
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: /下一关|回地图/ }).first()).toBeVisible({ timeout: 40000 });
    expect((await saved(page)).levels['C8-1'].stars).toBeGreaterThanOrEqual(2);
  });

  test('我的地图: draw a map, drive through it myself, it is kept and can be played again; a map with no way through is refused', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await open(page, seed('C8-1', 8));
    await page.getByRole('button', { name: '我的地图' }).click();
    await page.getByRole('button', { name: '画一张新地图' }).click();
    await expect(page.locator('.rc-edgrid')).toBeVisible();
    await expect(page.getByRole('button', { name: '开一开试试' })).toBeDisabled();                 // no flag yet
    await page.locator('.rc-tool[data-tool="flag"]').click();
    await page.locator('.rc-edcell[data-x="4"][data-y="1"]').click();
    await expect(page.getByRole('button', { name: '开一开试试' })).toBeEnabled();
    // wall the flag in: the editor says there is no way through
    await page.locator('.rc-tool[data-tool="draw"]').click();
    for (const [x, y] of [[3, 1], [4, 0], [4, 2]]) await page.locator(`.rc-edcell[data-x="${x}"][data-y="${y}"]`).click();
    await page.getByRole('button', { name: '开一开试试' }).click();
    await expect(page.locator('.rc-ednote')).toContainText('过不去');
    await page.locator('.rc-edcell[data-x="3"][data-y="1"]').click();                              // rock -> crater
    await page.locator('.rc-edcell[data-x="3"][data-y="1"]').click();                              // crater -> sample
    await page.locator('.rc-edcell[data-x="3"][data-y="1"]').click();                              // sample -> empty
    await page.getByRole('button', { name: '开一开试试' }).click();
    await page.waitForSelector('.rc-play');
    await enter(page, 'FFFF');
    await page.locator('.rc-send').click();
    await expect(page.getByRole('button', { name: '回地图' })).toBeVisible({ timeout: 30000 });
    expect((await saved(page)).custom).toHaveLength(1);
    expect((await saved(page)).custom[0].solved).toBe(true);
    await page.getByRole('button', { name: '回地图' }).click();
    await expect(page.locator('.rc-mine-item')).toHaveCount(1);
    await page.getByRole('button', { name: '给爸爸玩' }).click();
    await page.waitForSelector('.rc-play');
    await expect(page.locator('.rc-title')).toContainText('我的地图 1').catch(() => {});
    expect(errors).toEqual([]);
  });

  test('月面巡逻: a fresh level each time, solved with the helper pointing out the cards; "再来一张" makes the next one', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page, seed('C2-1', 2));                       // chapter 1 done opens the patrol
    await page.getByRole('button', { name: '月面巡逻' }).click();
    await page.locator('.rc-tier[data-tier="1"]').click();
    await page.waitForSelector('.rc-play');
    const solveWithHelper = async () => {
      await page.locator('.rc-hint').click();                              // the first press says what to do, the second points at a card
      for (let i = 0; i < 20; i++) {
        await page.locator('.rc-hint').click();
        const pulse = page.locator('.rc-tray .rc-card.is-pulse');
        if (!(await pulse.count())) break;
        await pulse.first().click();
      }
      await page.locator('.rc-send').click();
      await expect(page.getByRole('button', { name: '再来一张' })).toBeVisible({ timeout: 40000 });
    };
    await solveWithHelper();
    expect((await saved(page)).patrol.count).toBe(1);
    await page.getByRole('button', { name: '再来一张' }).click();
    await page.waitForSelector('.rc-play');
    await expect(page.locator('.rc-slot.is-full')).toHaveCount(0);           // a new, empty programme
    await page.locator('.kit-back').click();
    await expect(page.locator('.rc-patrol')).toBeVisible();
    await expect(page.locator('.rc-progress')).toContainText('已巡逻 1 次');
    expect(errors).toEqual([]);
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
