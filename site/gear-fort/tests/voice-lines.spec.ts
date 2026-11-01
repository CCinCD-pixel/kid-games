/**
 * Narration of 2026-10-20 (docs/HANDOFF §7 待补配音): 码头第 3 镜 now says fort.dock.3 「走，我们跟墨子去守城！」, fort.belt.full is
 * the 驿马/牒 wording, and 首领 is a point-read word (the 图谱 tab reads it on a long press). Headless + muted (kit automute).
 *   npx vite --port 5311 --strictPort ; npx playwright test -c tests/gear-fort/playwright.dev.config.ts voice-lines
 */
import { expect, test, type Page } from '@playwright/test';

const KEY = 'kg:v1:gear-fort';
const save = JSON.stringify({ v: 1, updatedAt: Date.now(), data: { levels: Object.fromEntries(['1-1', '1-2', '1-3', '1-4'].map((id) => [id, { best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' }])), current: '1-5', story: ['prologue', 'map.guide', 'tut.1-1'] } });

test.beforeEach(({}, info) => { test.skip(!/^(landscape-1080x810|portrait-810x1080)$/.test(info.project.name), 'iPad sizes'); });

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('/gear-fort/?test=1');
  await page.evaluate(([k, s]) => { localStorage.clear(); localStorage.setItem(k, s); }, [KEY, save]);
  await page.goto('/gear-fort/?test=1', { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  return errors;
}
const voice = (page: Page, id: string) => page.evaluate((i) => { const V = (window as any).__gfApp.voice; return { text: V.text(i) as string, clip: !!V.hasClip(i) }; }, id);

test('码头第 3 镜：墨子号之后一句「走，我们跟墨子去守城！」，有字幕、有配音', async ({ page }) => {
  const errors = await open(page);
  expect(await voice(page, 'fort.dock.3')).toEqual({ text: '走，我们跟墨子去守城！', clip: true });
  await page.evaluate(() => { (window as any).__gfApp.story('dock'); });
  await expect(page.locator('.gf-story--dock')).toBeVisible();
  await page.evaluate(() => (window as any).__gfStory.jump(2));   // the third shot (the closing hop)
  await expect(page.locator('.gf-story--dock .gf-cap__t')).toHaveText('走，我们跟墨子去守城！');
  expect(await page.evaluate(() => (window as any).__gfApp.voice.log.slice(-1)[0])).toBe('fort.dock.3');
  expect(errors).toEqual([]);
});

test('牒放满了：驿马说法，不再说传送带；首领是点读词，图谱页签长按读出', async ({ page }) => {
  const errors = await open(page);
  const belt = await voice(page, 'fort.belt.full');
  expect(belt).toEqual({ text: '牒放满啦，先用掉一张！', clip: true });
  expect(belt.text).not.toMatch(/传送带/);
  expect(await voice(page, 'fort.w.首领')).toMatchObject({ clip: true });
  await page.locator('.gf-bigcard--alm').click();
  const tab = page.locator('.gf-alm__tab[data-tab="boss"]');
  await expect(tab).toHaveText(/首领/);
  await expect(tab).toHaveAttribute('data-word', '首领');
  const b = (await tab.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();   // ≥ 450 ms = a long press
  await expect.poll(() => page.evaluate(() => (window as any).__gfApp.voice.log.slice(-1)[0])).toBe('fort.w.首领');
  await expect(tab).not.toHaveClass(/is-on/);   // the click after a long press is swallowed: still on the first tab
  expect(errors).toEqual([]);
});
