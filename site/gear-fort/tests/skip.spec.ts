/**
 * 跳过 (Dad's feedback 2026-10-08): every story scene, 1-1's lesson and 墨子's ghost replay get the kit's 跳过 pill —
 * invisible for the first ~1.5 s, then one tap ends it and it counts as seen; the parent's 跳过开场和教学 skips them
 * outright; 设置 → 故事和教学 plays them again. iPad (both orientations) + the 844×390 phone.
 */
import { expect, test, type Page } from '@playwright/test';

const KEY = 'kg:v1:gear-fort';
const won = (ids: string[], extra: Record<string, unknown> = {}): string => JSON.stringify({ v: 1, updatedAt: Date.now(), data: {
  levels: Object.fromEntries(ids.map((id) => [id, { best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' }])), current: ids.length ? `1-${Math.min(11, ids.length + 1)}` : '1-1', ...extra } });

test.beforeEach(({}, info) => { test.skip(!/^(landscape-1080x810|portrait-810x1080|phone-land-844x390)$/.test(info.project.name), 'iPads + one phone'); });

async function open(page: Page, save: string | null, skipIntros = false): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('/gear-fort/?test=1');
  await page.evaluate(([k, s, sk]) => { localStorage.clear(); if (s) localStorage.setItem(k as string, s as string); if (sk) localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: true })); }, [KEY, save, skipIntros]);
  await page.goto('/gear-fort/?test=1', { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  return errors;
}
const story = (page: Page): Promise<string[]> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').data?.story ?? [], KEY);

test('a story scene: 跳过 waits ~1.5 s, sits top-right, ends the scene and it counts as seen', async ({ page }) => {
  const errors = await open(page, won(['1-1'], { story: ['prologue', 'map.guide', 'tut.1-1'] })); const vp = page.viewportSize()!;
  await page.evaluate(() => { (window as any).__gfApp.story('dock'); }); // (not awaited: it resolves when the scene ends)
  await expect(page.locator('.gf-story--dock')).toBeVisible();
  const pill = page.locator('.gf-story .xg-skip');
  await page.waitForTimeout(500); await expect(pill).toHaveAttribute('data-state', 'waiting');
  await expect(pill).toHaveAttribute('data-state', 'shown', { timeout: 2500 });
  const b = (await pill.boundingBox())!; expect(b.x + b.width).toBeGreaterThan(vp.width - 100); expect(b.y).toBeLessThan(100); expect(b.height).toBeGreaterThanOrEqual(48);
  await pill.click();
  await expect(page.locator('.gf-story')).toHaveCount(0); await expect(page.locator('.gf-map')).toBeVisible();
  expect(await story(page)).toContain('dock');
  expect(errors).toEqual([]);
});

test('1-1 lesson: 跳过 ends the demo, the level plays on, and the next 1-1 starts without it', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await open(page, null);
  await page.waitForFunction(() => (window as any).__gf, null, { timeout: 8000 });
  const pill = page.locator('.gf-skipbtn');
  await expect(pill).toHaveAttribute('data-state', 'shown', { timeout: 3000 });
  const vp = page.viewportSize()!; const b = (await pill.boundingBox())!; const g = await page.evaluate(() => (window as any).__gf.stage.geo);
  expect(b.x + b.width).toBeLessThanOrEqual(vp.width); expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
  expect(b.y + b.height / 2).toBeGreaterThan(g.by + 4 * g.h); // on the boarded-up 第 5 路, clear of the HUD
  await pill.click();
  await expect(pill).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__gf.hooking)).toBe(false);
  const t0 = await page.evaluate(() => (window as any).__gf.S.tick); await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as any).__gf.S.tick)).toBeGreaterThan(t0);
  expect(await story(page)).toContain('tut.1-1');
  // the lesson's scripted 8-s hand never comes back
  await page.evaluate(() => (window as any).__gf.setSpeed(4)); await page.waitForTimeout(2600);
  expect(await page.evaluate(() => document.querySelector<HTMLElement>('.gf-hand')?.dataset.kind === 'drag' && document.querySelector<HTMLElement>('.gf-hand')!.style.display === 'block')).toBe(false);
  // seen: a first visit with the lesson seen (nothing won yet) goes straight into 1-1, without the lid hook or a 跳过
  errors.push(...(await open(page, won([], { story: ['tut.1-1'] }))));
  await page.waitForFunction(() => (window as any).__gf, null, { timeout: 8000 }); await page.waitForTimeout(1900);
  expect(await page.evaluate(() => (window as any).__gf.hooking)).toBe(false);
  await expect(page.locator('.gf-skipbtn')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('跳过开场和教学 (parent page): no hook, no lesson, no 序幕 / 码头 — the first win goes straight to the map', async ({ page }) => {
  const errors = await open(page, null, true);
  await page.waitForFunction(() => (window as any).__gf, null, { timeout: 8000 }); await page.waitForTimeout(1900);
  expect(await page.evaluate(() => (window as any).__gf.hooking)).toBe(false);
  await expect(page.locator('.xg-skip')).toHaveCount(0);
  await page.evaluate(() => (window as any).__gfApp.win('1-1', 3)); await page.waitForTimeout(1200);
  await page.locator('.xg-modal__actions [data-act="next"]').click();
  await expect(page.locator('.gf-map')).toBeVisible({ timeout: 6000 }); await expect(page.locator('.gf-story')).toHaveCount(0);
  const st = await story(page); expect(st).toEqual(expect.arrayContaining(['prologue', 'dock', 'map.guide', 'tut.1-1']));
  expect(errors).toEqual([]);
});

test('设置 → 故事和教学 plays the 1-1 lesson and a seen scene again', async ({ page }) => {
  const errors = await open(page, won(['1-1', '1-2'], { story: ['prologue', 'dock', 'map.guide', 'tut.1-1'] }), true);
  await page.locator('.gf-map__gear').click();
  const chips = page.locator('.gf-set__chips .xg-btn'); await expect(chips).toHaveText(['新手教学', '序幕', '码头']);
  await chips.filter({ hasText: '序幕' }).click(); // a replay asked for plays even under 跳过开场和教学
  await expect(page.locator('.gf-story--prologue')).toBeVisible();
  await page.locator('.gf-story .xg-skip').click({ timeout: 4000 }); await expect(page.locator('.gf-map')).toBeVisible();
  await page.locator('.gf-map__gear').click(); await page.locator('.gf-set__chips .xg-btn').filter({ hasText: '新手教学' }).click();
  await page.waitForFunction(() => (window as any).__gf, null, { timeout: 8000 });
  expect(await page.evaluate(() => (window as any).__gf.hooking)).toBe(true); // the lid opens: the lesson is on
  await expect(page.locator('.gf-skipbtn')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('墨子\'s ghost replay: 跳过 (on the 附加题 slot) goes back to the 复盘, whose buttons fit', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page, won(['1-1', '1-2'], { lossStreak: { '1-3': 2 }, story: ['prologue', 'dock', 'map.guide', 'tut.1-1'] })); const vp = page.viewportSize()!;
  await page.locator('.xg-node').nth(2).click(); await page.waitForTimeout(900); await page.locator('.gf-pv__go').click(); await page.waitForTimeout(600);
  await page.evaluate(() => { const g = (window as any).__gf; g.S.logs = [1, 1, 1, 1, 1]; g.setSpeed(20); });
  await page.waitForSelector('.gf-debrief', { timeout: 60_000 }); await page.waitForTimeout(600);
  for (const x of await page.locator('.gf-debrief button').all()) { const b = (await x.boundingBox())!; expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1).toBe(true); expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44); }
  await page.locator('.gf-helpcard[data-a="ghost"]').click();
  const pill = page.locator('.gf-skipbtn'); await expect(pill).toHaveAttribute('data-state', 'shown', { timeout: 4000 });
  const b = (await pill.boundingBox())!; const s3 = await page.evaluate(() => { const e = document.querySelector<HTMLElement>('.gf-star3')!; return { x: parseFloat(e.style.left), w: parseFloat(e.style.width), shown: getComputedStyle(e).display !== 'none' }; });
  expect(s3.shown).toBe(false); expect(Math.abs(b.x + b.width - (s3.x + s3.w))).toBeLessThan(3);
  await pill.click();
  await expect(page.locator('.gf-debrief')).toBeVisible({ timeout: 4000 });
  expect(errors).toEqual([]);
});
