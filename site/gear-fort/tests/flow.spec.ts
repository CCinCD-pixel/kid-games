/**
 * 机关守城 · flow (spec §2.4, §9.9, §10.1): both orientations. First visit goes straight into 1-1; the first card
 * can be placed ≤ 8 s after the start gate; the first machine is dismantled ≤ 35 s of game time after a placement
 * at 墨子's hint cell; no console errors; no page overflow; the HUD stays inside the viewport. Also: the 驿马 rack
 * (1-6), the Boss bar (1-11), the assist offers after 3 losses, the ghost replay and the 图谱 open without errors.
 */
import { expect, test, type Page } from '@playwright/test';

const KEY = 'kg:v1:gear-fort';
const won = (ids: string[], extra: Record<string, unknown> = {}): string => JSON.stringify({ v: 1, updatedAt: Date.now(), data: {
  levels: Object.fromEntries(ids.map((id) => [id, { best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' }])), current: ids.length ? `1-${Math.min(11, ids.length + 1)}` : '1-1', ...extra } });
const V1 = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10'];

async function open(page: Page, save: string | null): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('/gear-fort/?test=1');
  await page.evaluate(([k, s]) => { localStorage.clear(); if (s) localStorage.setItem(k as string, s as string); }, [KEY, save]);
  await page.goto('/gear-fort/?test=1', { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  return errors;
}
async function noOverflow(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight; const out: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>('.gf-hud > *')) { if (getComputedStyle(e).display === 'none' || !e.offsetWidth) continue; const b = e.getBoundingClientRect(); if (b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1) out.push(`${e.className} ${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`); }
    return { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, W, H, out };
  });
  expect(r.sw).toBeLessThanOrEqual(r.W); expect(r.sh).toBeLessThanOrEqual(r.H); expect(r.out).toEqual([]);
}

test('first visit: 1-1 at once, first place ≤ 8 s, first machine gone ≤ 35 s', async ({ page }) => {
  test.setTimeout(90_000);
  const t0 = Date.now(); const errors = await open(page, null);
  await page.waitForSelector('.gf-card[data-card="shooter"]', { timeout: 8000 });
  await page.waitForFunction(() => { const g = (window as any).__gf; return g && g.S.tick >= 1 && g.S.grain >= 50; }, null, { timeout: 8000 });
  // drag the card to 墨子's hint cell (第 3 路 第 2 格): drop cell = 0.6 tile above the finger
  const card = await page.locator('.gf-card[data-card="shooter"]').boundingBox();
  const cell = await page.evaluate(() => (window as any).__gf.cell(2, 1));
  const tile = await page.evaluate(() => { const c = document.querySelector('.gf-stage') as HTMLCanvasElement; return c ? 0 : 0; });
  void tile;
  const geoH = await page.evaluate(() => { const g = (window as any).__gf; return g.cell(3, 1).y - g.cell(2, 1).y; });
  await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2); await page.mouse.down();
  await page.mouse.move(cell.x, cell.y - geoH * 0.3 + geoH * 0.6, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => (window as any).__gf.S.units.length > 0, null, { timeout: 3000 });
  expect(Date.now() - t0).toBeLessThan(8000 + 6000); // ≤ 8 s of the child's time; +6 s for page load in CI
  const placedTick = await page.evaluate(() => (window as any).__gf.S.tick);
  expect(placedTick / 20).toBeLessThanOrEqual(8);
  await page.evaluate(() => (window as any).__gf.setSpeed(3));
  await page.waitForFunction(() => (window as any).__gf.S.stats && ((window as any).__gf.S.ev || []).some((e: any) => e.type === 'gone' && !e.log), null, { timeout: 40_000 });
  const goneTick = await page.evaluate(() => ((window as any).__gf.S.ev || []).find((e: any) => e.type === 'gone' && !e.log).tick ?? (window as any).__gf.S.tick);
  expect(goneTick / 20).toBeLessThanOrEqual(35);
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('1-6 rack: 驿马 brings cards; 鲁班按手 before the first 大波', async ({ page }) => {
  const errors = await open(page, won(V1.slice(0, 5)));
  await page.locator('.xg-node').nth(5).click(); await page.locator('.gf-pv__go').click();
  await page.waitForSelector('.gf-tray--rack');
  await page.evaluate(() => (window as any).__gf.setSpeed(12));
  await page.waitForFunction(() => (window as any).__gf.S.belt.length >= 2, null, { timeout: 20_000 });
  await expect(page.locator('.gf-tray--rack .gf-card[data-card]')).toHaveCount(await page.evaluate(() => (window as any).__gf.S.belt.length));
  await page.waitForSelector('.gf-warn', { timeout: 30_000 });
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('1-11 Boss bar replaces the bamboo scroll', async ({ page }) => {
  const errors = await open(page, won(V1));
  await page.locator('.xg-node').nth(10).click(); await page.locator('.gf-pv__go').click();
  await expect(page.locator('.gf-boss')).toBeVisible(); await expect(page.locator('.gf-scroll')).toBeHidden();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('3 losses → debrief offers ghost + both assist tiers; ghost replay plays and returns', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page, won(['1-1', '1-2'], { lossStreak: { '1-3': 2 } }));
  await page.locator('.xg-node').nth(2).click(); await page.locator('.gf-pv__go').click();
  await page.waitForFunction(() => !!(window as any).__gf?.S);
  await page.evaluate(() => { const g = (window as any).__gf; g.S.logs = [1, 1, 1, 1, 1]; g.setSpeed(20); });
  await page.waitForSelector('.gf-debrief', { timeout: 60_000 });
  await expect(page.locator('.gf-helpcard')).toHaveCount(3);
  await noOverflow(page);
  await page.locator('.gf-helpcard[data-a="ghost"]').click();
  await page.waitForSelector('.gf-battle.is-ghost', { timeout: 8000 });
  await page.evaluate(() => (window as any).__gf.setSpeed(20));
  await page.waitForSelector('.gf-debrief', { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('图谱 opens from the map; a met page reads', async ({ page }) => {
  const errors = await open(page, won(V1.slice(0, 4)));
  await page.locator('.gf-bigcard--alm').click();
  await expect(page.locator('.gf-alm__tile:not(.is-locked)').first()).toBeVisible();
  await page.locator('.gf-alm__tile:not(.is-locked)').first().click();
  await expect(page.locator('.gf-alm__page.is-on')).toBeVisible();
  expect(errors).toEqual([]);
});
