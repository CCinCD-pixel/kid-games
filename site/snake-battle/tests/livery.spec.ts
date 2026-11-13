/**
 * 我的定制 · 涂装台 × 贪吃蛇 (kit/livery). Real clicks only: lobby → 涂装台 → colour + pattern + one sticker → 保存 →
 * the lobby shows 我的蛇 → a timed match draws him with that look (atlas sprites of the look, sticker quads).
 * Runs on an iPad landscape context and an iPhone 13 context (the landscape project only; each test opens its own
 * contexts). Silent: the kit mutes itself under automation and tools/qa/mute-audio.js is an init script too.
 * LV_SHOTS=1 also writes the review screenshots to ~/kid-games-work/shots/my-custom-1/;
 * LV_PERF=1 measures frame work of the default skin vs 我的蛇 (flames + 3 stickers) in WebKit.
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, devices, type Browser, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MUTE = path.join(ROOT, 'tools/qa/mute-audio.js');
const SHOTS = path.join(os.homedir(), 'kid-games-work/shots/my-custom-1');
const IPAD_L = { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const IPAD_P = { viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const PHONE = { ...devices['iPhone 13'] };
delete (PHONE as { defaultBrowserType?: string }).defaultBrowserType;

async function withPage(browser: Browser, opts: object, fn: (page: Page) => Promise<void>) {
  const ctx = await browser.newContext({ ...opts, locale: 'zh-CN' });
  await ctx.addInitScript({ path: MUTE });
  try { const page = await ctx.newPage(); await fn(page); } finally { await ctx.close(); }
}
async function lobby(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/snake-battle/?test=1`);
  await page.waitForSelector('#app[data-ready]');
  await page.locator('.kit-start button').first().click();
  await expect(page.locator('.sb-lobby')).toBeVisible();
  // the 涂装台 entry is ≥ 56 px and nothing (the 领航员, the versus box) sits on top of it
  const hit = await page.locator('.sb-paint-entry').evaluate((b) => { const q = b.getBoundingClientRect(); const t = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return { ok: !!t && b.contains(t), h: q.height, w: q.width }; });
  expect(hit.ok, 'paint entry covered').toBe(true); expect(hit.h).toBeGreaterThanOrEqual(56); expect(hit.w).toBeGreaterThanOrEqual(56);
}
const tile = (page: Page, kind: string, id: string) => page.locator(`.lv-tile--${kind}[data-id="${id}"]`);
const tab = (page: Page, t: string) => page.locator(`.lv-tab[data-tab="${t}"]`);
const app = (page: Page) => page.evaluate(() => { const a = (window as any).__sbApp; return { skin: a.save.data.equipped.skin as string }; });
const stored = (page: Page) => page.evaluate(() => { const raw = localStorage.getItem('kg:v1:livery:snake-battle'); return raw ? JSON.parse(raw).data : null; });

/** every studio control is a ≥ 56 px target, the studio fits the screen, nothing scrolls sideways */
async function checkStudioLayout(page: Page) {
  const vp = page.viewportSize()!;
  const boxes = await page.locator('.lv-studio .xg-btn, .lv-tab, .lv-tile').evaluateAll((els) => els.map((e) => ({ c: e.className, ...e.getBoundingClientRect().toJSON() })));
  expect(boxes.length).toBeGreaterThan(10);
  for (const b of boxes) { expect(b.height, b.c).toBeGreaterThanOrEqual(55.9); expect(b.width, b.c).toBeGreaterThanOrEqual(55.9); }   // 56 px, sub-pixel layout
  // nothing of the page (its 🏠, the 领航员) lies on top of a studio control
  const covered = await page.locator('.lv-studio .xg-btn, .lv-tab').evaluateAll((els) => els.filter((e) => { const q = e.getBoundingClientRect(); const t = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return !t || !e.contains(t); }).map((e) => e.className));
  expect(covered).toEqual([]);
  const save = await page.locator('.lv-save').boundingBox();
  expect(save!.y + save!.height).toBeLessThanOrEqual(vp.height);
  const stage = await page.locator('.lv-stage').boundingBox();
  expect(stage!.height).toBeGreaterThanOrEqual(140);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** the whole path a child takes, with real clicks */
async function paintAndPlay(page: Page, baseURL: string, shot?: string) {
  await lobby(page, baseURL);
  expect((await app(page)).skin).toBe('venus');
  await page.locator('.sb-paint-entry').click();
  await expect(page.locator('.lv-studio')).toBeVisible();
  await checkStudioLayout(page);
  // colour
  await tile(page, 'color', 'night').click();
  await expect(tile(page, 'color', 'night')).toHaveAttribute('aria-pressed', 'true');
  // pattern
  await tab(page, 'pattern').click();
  await tile(page, 'pattern', 'flames').click();
  await expect(tile(page, 'pattern', 'flames')).toHaveAttribute('aria-pressed', 'true');
  // one sticker
  await tab(page, 'sticker').click();
  await tile(page, 'sticker', 'rocket').click();
  await expect(page.locator('.lv-count')).toHaveText('已贴 1/3');
  await expect(tile(page, 'sticker', 'rocket').locator('.lv-tile__badge')).toHaveText('1');
  await checkStudioLayout(page);
  if (shot) { await page.waitForTimeout(700); await page.screenshot({ path: path.join(SHOTS, `studio-${shot}.png`) }); }
  await page.locator('.lv-save').click();
  await expect(page.locator('.lv-studio')).toHaveCount(0);
  // saved on this device, put on, and the lobby shows him
  expect(await stored(page)).toEqual({ looks: { snake: { color: 'night', pattern: 'flames', stickers: ['rocket'] } }, saves: 1 });
  expect((await app(page)).skin).toBe('mine');
  await expect(page.locator('.sb-lobby')).toBeVisible();
  if (shot) { await page.waitForTimeout(900); await page.screenshot({ path: path.join(SHOTS, `lobby-${shot}.png`) }); }
  // into a match: his snake is drawn from the look's own sprites
  await page.locator('.sb-mode--timed').click();
  await page.waitForFunction(() => !!(window as any).__sb?.view);
  const look = await page.evaluate(() => {
    const sb = (window as any).__sb, me = sb.match.me, l = sb.view.lookOf(me), A = sb.view.atlas;
    return { key: l.key, pattern: l.pattern, stickers: l.skin?.stickers, has: ['stk:rocket', `deco:${l.key}:lvFlameA`, `deco:${l.key}:lvFlameB`, `head:${l.key}`].map((k) => A.has(k)) };
  });
  expect(look.key).toBe('skin-mine-night.flames.rocket');
  expect(look.pattern).toBe('lv-flames');
  expect(look.stickers).toEqual(['rocket']);
  expect(look.has).toEqual([true, true, true, true]);
  if (shot) { await page.waitForTimeout(4200); await page.screenshot({ path: path.join(SHOTS, `match-${shot}.png`) }); }
}

test.describe('snake-battle 涂装台', () => {
  test.beforeEach(({}, ti) => { test.skip(ti.project.name !== 'landscape-1080x810', 'own contexts: iPad landscape + iPhone 13'); });

  test('iPad landscape: paint → save → his snake in the lobby and the match', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    await withPage(browser, IPAD_L, (page) => paintAndPlay(page, baseURL!, process.env.LV_SHOTS ? 'ipad-landscape' : undefined));
  });

  test('iPhone 13: paint → save → his snake in the lobby and the match', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    await withPage(browser, PHONE, (page) => paintAndPlay(page, baseURL!, process.env.LV_SHOTS ? 'phone-portrait' : undefined));
  });

  test('random, reset, full sticker sheet, leaving without saving', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    await withPage(browser, IPAD_P, async (page) => {
      await lobby(page, baseURL!);
      await page.locator('.sb-paint-entry').click();
      await expect(page.locator('.lv-studio')).toBeVisible();
      await checkStudioLayout(page);
      // 随机来一个 changes the colour; 恢复原样 goes back to 金星黄 · 条纹
      await page.locator('.lv-random').click();
      await expect(tile(page, 'color', 'sun')).toHaveAttribute('aria-pressed', 'false');
      await page.locator('.lv-reset').click();
      await expect(tile(page, 'color', 'sun')).toHaveAttribute('aria-pressed', 'true');
      // a fourth sticker is refused (the sheet shakes, a toast says why); peeling one off frees a slot
      await tab(page, 'sticker').click();
      for (const id of ['moon', 'gear', 'cloud']) await tile(page, 'sticker', id).click();
      await expect(page.locator('.lv-count')).toHaveText('已贴 3/3');
      await tile(page, 'sticker', 'robot').click();
      await expect(tile(page, 'sticker', 'robot')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('.xg-toast, .kit-toast').first()).toBeVisible();
      await tile(page, 'sticker', 'gear').click();
      await expect(page.locator('.lv-count')).toHaveText('已贴 2/3');
      await expect(tile(page, 'sticker', 'cloud').locator('.lv-tile__badge')).toHaveText('2');
      if (process.env.LV_SHOTS) { await page.waitForTimeout(700); await page.screenshot({ path: path.join(SHOTS, 'studio-ipad-portrait.png') }); }
      // leave: asked whether to keep it → 不要了 → nothing stored, still 金星蛇
      await page.locator('.lv-close').click();
      await page.locator('.kit-modal [data-action="drop"]').click();
      await expect(page.locator('.lv-studio')).toHaveCount(0);
      expect(await stored(page)).toBeNull();
      expect((await app(page)).skin).toBe('venus');
    });
  });

  test('frame work: default skin vs 我的蛇 (LV_PERF=1)', async ({ browser, baseURL }) => {
    test.skip(process.env.LV_PERF !== '1', 'LV_PERF=1 only');
    test.setTimeout(150_000);
    const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
    const out: Record<string, unknown> = {};
    for (const run of ['venus', 'mine', 'venus', 'mine']) {
      await withPage(browser, IPAD_P, async (page) => {
        await page.addInitScript(() => localStorage.setItem('kg:v1:livery:snake-battle', JSON.stringify({ v: 1, updatedAt: 1, data: { looks: { snake: { color: 'rocket', pattern: 'flames', stickers: ['rocket', 'saturn', 'robot'] } }, saves: 1 } })));
        await page.goto(`${baseURL}/snake-battle/?test=1&nogate`); await page.waitForSelector('#app[data-ready]');
        const r = await page.evaluate(async (skin) => {
          const a = (window as any).__sbApp; a.save.data.firstRunDone = true; a.save.data.equipped.skin = skin;
          await a.startMatch('timed', 'blackhole', { seed: 31337, countdown: false });
          const m = (window as any).__sb.match; m.me.mass = 1000; m.me.protect = 1e9; m.input.boost = false;
          await new Promise((ok) => setTimeout(ok, 3000));
          const v = (window as any).__sb.view; a.workLog.length = 0; const iv: number[] = []; let last = performance.now(); const t0 = last;
          await new Promise<void>((ok) => { const f = (now: number) => { iv.push(now - last); last = now; if (now - t0 < 12000) requestAnimationFrame(f); else ok(); }; requestAnimationFrame(f); });
          return { work: [...a.workLog] as number[], iv, atlas: v.atlas.count as number, key: v.lookOf(m.me).key as string };
        }, run);
        const k = `${run}#${Object.keys(out).filter((x) => x.startsWith(run)).length + 1}`;
        out[k] = { key: r.key, atlasSprites: r.atlas, frames: r.iv.length, work50: +q(r.work, 0.5).toFixed(2), work95: +q(r.work, 0.95).toFixed(2), iv95: +q(r.iv, 0.95).toFixed(2), long50: r.iv.filter((x) => x > 50).length };
      });
    }
    console.log('[livery perf webkit 25 snakes]', JSON.stringify(out, null, 1));
  });
});
