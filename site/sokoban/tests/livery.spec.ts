/**
 * 我的定制 · 涂装台 × 星港搬运工 (kit/livery). Real clicks: map → 机库 → 涂装台 → 小推: colour + pattern + a sticker →
 * 箱子: colour + a sticker → 保存 → back on the map → level 0-1, where the board's own pixels show the painted 小推
 * and the painted 星港补给 crate. iPad landscape + iPhone 13 contexts (landscape project only). Silent: the kit
 * mutes itself under automation and tools/qa/mute-audio.js is an init script too. LV_SHOTS=1 writes review shots
 * to ~/kid-games-work/shots/my-custom-1/.
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, devices, type Browser, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MUTE = path.join(ROOT, 'tools/qa/mute-audio.js');
const SHOTS = path.join(os.homedir(), 'kid-games-work/shots/my-custom-1');
const IPAD_L = { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const PHONE = { ...devices['iPhone 13'] };
delete (PHONE as { defaultBrowserType?: string }).defaultBrowserType;

async function withPage(browser: Browser, opts: object, fn: (page: Page) => Promise<void>) {
  const ctx = await browser.newContext({ ...opts, locale: 'zh-CN' });
  await ctx.addInitScript({ path: MUTE });
  try { await fn(await ctx.newPage()); } finally { await ctx.close(); }
}
const tile = (page: Page, kind: string, id: string) => page.locator(`.lv-tile--${kind}[data-id="${id}"]`);
const tab = (page: Page, t: string) => page.locator(`.lv-tab[data-tab="${t}"]`);
const stored = (page: Page) => page.evaluate(() => { const raw = localStorage.getItem('kg:v1:livery:sokoban'); return raw ? JSON.parse(raw).data : null; });

/** the board's pixel at a cell-relative offset (dx, dy in cells) from the centre of `which` (the player or crate 0) */
async function boardPixel(page: Page, which: 'player' | 'crate', dx: number, dy: number): Promise<number[]> {
  return page.evaluate(([w, dx, dy]) => {
    const sok = (window as any).__sok, st = sok.state();
    const a = w === 'player' ? sok.cellCenter(st.player) : sok.crateCenter(0), b = sok.cellCenter(st.player + 1);
    const s = Math.abs(b.x - sok.cellCenter(st.player).x) || 60;
    const x = a.x + (dx as number) * s, y = a.y + (dy as number) * s;
    for (const cv of (Array.from(document.querySelectorAll('.sok-board canvas')) as HTMLCanvasElement[]).reverse()) {   // top layer first
      const r = cv.getBoundingClientRect(); if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const g = cv.getContext('2d'); if (!g) continue;
      const px = g.getImageData(Math.round((x - r.left) * cv.width / r.width), Math.round((y - r.top) * cv.height / r.height), 1, 1).data;
      if (px[3] > 200) return [px[0], px[1], px[2]];
    }
    return [];
  }, [which, dx, dy] as const);
}
const amberish = (p: number[]) => p[0] > 200 && p[1] > 140 && p[1] < 190 && p[2] < 80;

async function paintAndPlay(page: Page, baseURL: string, shot?: string) {
  await page.goto(`${baseURL}/sokoban/?test=1&screen=map`);
  await page.waitForSelector('.sok-map');
  await page.locator('[data-testid=hangar-btn]').click();
  await expect(page.locator('[data-testid=hangar]')).toBeVisible();
  const entry = await page.locator('[data-testid=hangar-paint]').evaluate((b) => { const q = b.getBoundingClientRect(); const t = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return { ok: !!t && b.contains(t), w: q.width, h: q.height }; });
  expect(entry.ok, 'paint entry covered').toBe(true); expect(entry.h).toBeGreaterThanOrEqual(55.9); expect(entry.w).toBeGreaterThanOrEqual(55.9);
  await page.locator('[data-testid=hangar-paint]').click();
  await expect(page.locator('.lv-studio')).toBeVisible();
  // ≥ 56 px controls, nothing on top of them, the studio fits
  const vp = page.viewportSize()!;
  const bad = await page.locator('.lv-studio .xg-btn, .lv-tab, .lv-part, .lv-tile').evaluateAll((els) => els.filter((e) => { const q = e.getBoundingClientRect(); const g = e.closest('.lv-grid')?.getBoundingClientRect(); if (g && (q.top < g.top || q.bottom > g.bottom)) return q.height < 55.9 || q.width < 55.9;   /* scrolled out of the sheet: only its size counts */ const t = document.elementFromPoint(q.x + q.width / 2, Math.min(innerHeight - 1, q.y + q.height / 2)); return q.height < 55.9 || q.width < 55.9 || (q.bottom <= innerHeight && (!t || !e.contains(t))); }).map((e) => e.className));
  expect(bad).toEqual([]);
  expect((await page.locator('.lv-save').boundingBox())!.y + 56).toBeLessThanOrEqual(vp.height);
  // 小推: the first part, own colour 小推橙 first in the list
  await expect(page.locator('.lv-part[data-part=porter]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.lv-tile--color').first()).toHaveAttribute('data-id', 'amber');
  await tile(page, 'color', 'rocket').click();
  await tab(page, 'pattern').click();
  await tile(page, 'pattern', 'stars').click();
  await tab(page, 'sticker').click();
  await tile(page, 'sticker', 'robot').click();
  await expect(page.locator('.lv-count')).toHaveText('已贴 1/2');
  // 箱子
  await page.locator('.lv-part[data-part=crate]').click();
  await tab(page, 'color').click();
  await expect(page.locator('.lv-tile--color').first()).toHaveAttribute('data-id', 'kraft');
  await tile(page, 'color', 'sky').click();
  await tab(page, 'sticker').click();
  await tile(page, 'sticker', 'rocket').click();
  await expect(page.locator('.lv-count')).toHaveText('已贴 1/1');
  if (shot) { await page.waitForTimeout(800); await page.screenshot({ path: path.join(SHOTS, `porter-studio-${shot}.png`) }); }
  await page.locator('.lv-save').click();
  await expect(page.locator('.lv-studio')).toHaveCount(0);
  expect(await stored(page)).toEqual({ looks: { porter: { color: 'rocket', pattern: 'stars', stickers: ['robot'] }, crate: { color: 'sky', pattern: 'plain', stickers: ['rocket'] } }, saves: 1 });
  if (shot) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(SHOTS, `porter-hangar-${shot}.png`) }); }
  // into level 0-1 from the map
  await page.locator('[data-testid=hangar-back]').click();
  await page.waitForSelector('.sok-map');
  await page.locator('[data-testid="node-0-1"]').click();
  await page.waitForFunction(() => { const s = (window as any).__sok?.state?.(); return !!s && !s.busy && s.level === '0-1'; });
  await page.waitForTimeout(600);
  // the crate's top face (right of the tape, above the sticker): sky blue, not kraft
  const crate = await boardPixel(page, 'crate', 0.3, -0.12);
  expect(crate.length, 'crate pixel').toBe(3);
  expect(crate[2] - crate[0], `crate ${crate}`).toBeGreaterThan(40);
  // 小推's body (front view, between the chest stickers and beside the plate): rocket red, no hero amber left
  const body = [await boardPixel(page, 'player', 0, -0.05), await boardPixel(page, 'player', -0.24, -0.16), await boardPixel(page, 'player', 0.24, -0.16)];
  for (const p of body) { expect(p.length).toBe(3); expect(amberish(p), `body ${p}`).toBe(false); }
  expect(body.some((p) => p[0] > 150 && p[1] < 120), `red body ${JSON.stringify(body)}`).toBe(true);
  if (shot) await page.screenshot({ path: path.join(SHOTS, `porter-level-${shot}.png`) });
}

test.describe('sokoban 涂装台', () => {
  test.beforeEach(({}, ti) => { test.skip(ti.project.name !== 'landscape-1080x810', 'own contexts: iPad landscape + iPhone 13'); });

  test('iPad landscape: paint 小推 and the crate → saved → level 0-1 draws them', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    await withPage(browser, IPAD_L, (page) => paintAndPlay(page, baseURL!, process.env.LV_SHOTS ? 'ipad-landscape' : undefined));
  });

  test('iPhone 13: paint 小推 and the crate → saved → level 0-1 draws them', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    await withPage(browser, PHONE, (page) => paintAndPlay(page, baseURL!, process.env.LV_SHOTS ? 'phone-portrait' : undefined));
  });

  test('恢复原样 is the original art: nothing painted, the earned 涂装 job is untouched', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    await withPage(browser, { ...IPAD_L, viewport: { width: 810, height: 1080 } }, async (page) => {
      await page.goto(`${baseURL}/sokoban/?test=1&screen=map`);
      await page.waitForSelector('.sok-map');
      await page.locator('[data-testid=hangar-btn]').click();
      await page.locator('[data-testid=hangar-paint]').click();
      await expect(page.locator('.lv-studio')).toBeVisible();
      await page.locator('.lv-random').click();
      await expect(tile(page, 'color', 'amber')).toHaveAttribute('aria-pressed', 'false');
      await page.locator('.lv-reset').click();
      await expect(tile(page, 'color', 'amber')).toHaveAttribute('aria-pressed', 'true');
      if (process.env.LV_SHOTS) { await page.waitForTimeout(800); await page.screenshot({ path: path.join(SHOTS, 'porter-studio-ipad-portrait.png') }); }
      await page.locator('.lv-save').click();
      expect((await stored(page)).looks).toEqual({ porter: { color: 'amber', pattern: 'plain', stickers: [] }, crate: { color: 'kraft', pattern: 'plain', stickers: [] } });
      await page.locator('[data-testid=hangar-back]').click();
      await page.locator('[data-testid="node-0-1"]').click();
      await page.waitForFunction(() => { const s = (window as any).__sok?.state?.(); return !!s && !s.busy && s.level === '0-1'; });
      await page.waitForTimeout(600);
      const crate = await boardPixel(page, 'crate', 0.3, -0.12);
      expect(crate[0] - crate[2], `kraft ${crate}`).toBeGreaterThan(40);   // #A27038, as before
    });
  });
});
