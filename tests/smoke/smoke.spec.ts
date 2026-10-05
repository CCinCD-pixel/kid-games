/**
 * Smoke matrix generated from the registry: the hub, every registered game and the kit playground,
 * in WebKit at 810×1080 and 1080×810 (see playwright.config.ts). Per page:
 *   loads (HTTP 200), 0 console errors / page errors, 0 failed requests, no horizontal overflow,
 *   back button present with a ≥56 px hit area (not on the hub), ≤1 AudioContext, screenshot.
 * Plus behaviour checks for the kit (start gate → audio unlock → first narration, fallback voice,
 * save/reload, back with autosave, relayout on rotation) and the hub (cards = registry, launch log).
 */
import { expect, test } from '@playwright/test';
/* eslint-disable @typescript-eslint/no-explicit-any -- window.__kitDemo is a test hook */
// @ts-expect-error -- plain ESM helper with JSDoc types
import { loadRegistry } from '../../tools/registry.mjs';
import { instrument, probe, shot, watch } from './helpers';

interface Entry { id: string; title: string; href: string; place: string; status: string; smoke?: { waitFor?: string; skip?: boolean } }
const games: Entry[] = loadRegistry();
const matrix = [
  { id: 'hub', href: '/', back: false, waitFor: '.hub-card' },
  ...games.filter((g) => !g.smoke?.skip).map((g) => ({ id: g.id, href: g.href, back: true, waitFor: g.smoke?.waitFor })),
  { id: 'parent', href: '/parent/', back: true, waitFor: '#app[data-gate]' },
  { id: 'credits', href: '/credits/', back: true, waitFor: '#app[data-ready]' },
  { id: 'dev-kit', href: '/dev/kit/', back: true, waitFor: '.kit-start' },
];

test.describe('every page', () => {
  for (const p of matrix) {
    test(`${p.id}: loads cleanly`, async ({ page }, info) => {
      await instrument(page);
      const { errors, failed } = watch(page);
      const res = await page.goto(p.href, { waitUntil: 'load' });
      expect(res?.status(), 'HTTP status').toBe(200);
      if (p.waitFor) await page.waitForSelector(p.waitFor, { state: 'attached' });
      await page.waitForTimeout(500); // first frames, fonts, entrance animations

      const m = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        overflowY: document.documentElement.scrollHeight - window.innerHeight,
      }));
      expect(m.overflowX, 'horizontal overflow (px)').toBeLessThanOrEqual(1);
      if (m.overflowY > 1) info.annotations.push({ type: 'vertical-overflow', description: `${p.id}: ${m.overflowY}px taller than the viewport` });
      if (p.id === 'hub') expect(m.overflowY, 'hub must fit without scrolling').toBeLessThanOrEqual(1);

      if (p.back) {
        const back = page.locator('.kit-back, .kit-back-adopted').first();
        await expect(back).toBeVisible();
        const box = (await back.boundingBox())!;
        expect(Math.min(box.width, box.height), 'back button hit area').toBeGreaterThanOrEqual(56);
        expect(box.y, 'back button below the status bar / inside the viewport').toBeGreaterThanOrEqual(0);
      }

      const pr = await probe(page);
      expect(pr.contexts, 'AudioContexts created').toBeLessThanOrEqual(1);
      if (pr.startsBeforeGesture) info.annotations.push({ type: 'audio-before-touch', description: `${p.id}: ${pr.startsBeforeGesture} audio start(s) before the first touch` });

      await shot(page, info.project.name, p.id);
      expect(errors, 'console errors').toEqual([]);
      expect(failed, 'failed requests').toEqual([]);
    });
  }
});

test.describe('hub', () => {
  const listed = games.filter((g) => g.status !== 'hidden');

  /** Visit every place tab and collect the cards it shows. */
  async function cardsByTab(page: import('@playwright/test').Page) {
    const out: Record<string, string[]> = {};
    for (const tab of await page.locator('#hub-tabs button[data-id]').all()) {
      await tab.tap();
      const id = (await tab.getAttribute('data-id'))!;
      out[id] = await page.locator('.hub-panel:not([hidden]) .hub-card:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.game!));
    }
    return out;
  }

  test('place tabs show every listed game from the registry; wip cards say 建造中', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-ready]');
    const byTab = await cardsByTab(page);
    for (const [place, ids] of Object.entries(byTab)) {
      expect(ids.sort()).toEqual(listed.filter((g) => g.place === place).map((g) => g.id).sort());
    }
    expect(Object.values(byTab).flat().sort()).toEqual(listed.map((g) => g.id).sort());
    for (const g of listed.filter((x) => x.status === 'wip')) {
      await expect(page.locator(`.hub-card[data-game="${g.id}"]`)).toHaveAttribute('aria-disabled', 'true');
      await expect(page.locator(`.hub-card[data-game="${g.id}"] .hub-card__building`)).toHaveText('建造中');
    }
    // today's moon is drawn
    await expect(page.locator('#hub-moon svg')).toHaveCount(1);
    expect(await page.locator('#hub-moon').getAttribute('aria-label')).toMatch(/^今天的月亮：/);
  });

  test('a wip card answers instead of navigating; a live card launches with its source logged', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-ready]');
    const wip = games.find((g) => g.status === 'wip');
    if (wip) {
      await page.locator(`#hub-tabs button[data-id="${wip.place}"]`).tap();
      await page.locator(`.hub-card[data-game="${wip.id}"]`).tap({ force: true }); // aria-disabled: Playwright would wait for "enabled"
      await page.waitForTimeout(400);
      expect(new URL(page.url()).pathname).toBe('/');
    }
    const target = games.find((g) => g.status === 'live')!;
    await page.locator(`#hub-tabs button[data-id="${target.place}"]`).tap();
    await page.locator(`.hub-card[data-game="${target.id}"]`).tap();
    await page.waitForURL(`**${target.href}`);
    await page.waitForTimeout(300);
    const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:log:v1') || '[]'));
    const mine = sessions.filter((s: { game: string }) => s.game === target.id);
    expect(mine.at(-1)?.source).toBe('hub');
  });

  test('parent page: 3 s hold → set PIN → hide a game → the hub hides it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('body[data-ready]');
    const parent = page.locator('#hub-parent');
    await parent.dispatchEvent('pointerdown', { isPrimary: true, pointerId: 1, button: 0 });
    await page.waitForURL('**/parent/', { timeout: 6000 });
    await expect(page.locator('.pg-gate__msg')).toContainText('设置 4 位家长 PIN');
    for (let round = 0; round < 2; round += 1) {
      for (const d of ['1', '3', '5', '7']) await page.locator(`.pg-keypad [data-k="${d}"]`).tap();
      await page.waitForTimeout(300);
    }
    await expect(page.locator('.pg-head h1')).toHaveText('家长中心');
    await shot(page, test.info().project.name, 'parent-overview');
    expect(await page.evaluate(() => localStorage.getItem('kg:parent:pin'))).not.toContain('1357');
    await page.locator('.pg-tabs button[data-id="settings"]').tap();
    const victim = games.find((g) => g.status === 'live')!;
    const row = page.locator('.pg-gametoggles .pg-row', { hasText: victim.title }).first();
    await row.locator('label').tap();
    await shot(page, test.info().project.name, 'parent-settings');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kg:settings:v1') || '{}').hiddenGames)).toContain(victim.id);
    await page.locator('.kit-back').tap();
    await page.waitForURL((u) => u.pathname === '/');
    await page.waitForSelector('body[data-ready]');
    await expect(page.locator(`.hub-card[data-game="${victim.id}"]`)).toBeHidden();
  });

  test('service worker installs and precaches the shell', async ({ page, browserName }) => {
    await page.goto('/');
    const supported = await page.evaluate(() => 'serviceWorker' in navigator);
    test.skip(!supported, `no service worker support in this ${browserName} build`);
    const caches = await page.evaluate(async () => {
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 10_000))]);
      if (!reg) return null;
      for (let i = 0; i < 50; i += 1) {
        const keys = await window.caches.keys();
        const shell = keys.find((k) => k.startsWith('kg-shell-'));
        if (shell) {
          const c = await window.caches.open(shell);
          const urls = (await c.keys()).map((r) => new URL(r.url).pathname);
          if (urls.includes('/') && urls.includes('/chess/')) return { shell, count: urls.length };
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      return { shell: null, count: 0 };
    });
    expect(caches, 'service worker never became ready').not.toBeNull();
    expect(caches!.shell).toMatch(/^kg-shell-[0-9a-f]{12}$/);
    expect(caches!.count).toBeGreaterThan(10);
  });
});

test.describe('kit playground', () => {
  test('start gate unlocks audio, then the first line plays from its clip', async ({ page }) => {
    await instrument(page);
    const { errors } = watch(page);
    await page.goto('/dev/kit/');
    await expect(page.locator('.kit-start')).toBeVisible();
    // nothing may start before the first touch
    expect((await probe(page)).startsBeforeGesture).toBe(0);
    await page.locator('.kit-start__go').tap({ force: true }); // the button breathes forever: skip the stability wait
    await expect(page.locator('.kit-start')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as any).__kitDemo.audio.isAudioUnlocked())).toBe(true);
    await expect(page.locator('.kit-subtitle__text')).toHaveText('你好，我是领航员。');
    const firstCue = await page.evaluate(() => (window as any).__kitDemo.cues.find(Boolean));
    expect(firstCue.id).toBe('dev.hello');
    expect(['clip', 'speech']).toContain(firstCue.source);
    test.info().annotations.push({ type: 'first-line-source', description: firstCue.source });
    expect((await probe(page)).contexts).toBe(1);
    await shot(page, test.info().project.name, 'dev-kit-started');
    expect(errors).toEqual([]);
  });

  test('missing clip falls back and still shows the subtitle; replay repeats', async ({ page }) => {
    await page.goto('/dev/kit/');
    await page.locator('.kit-start__go').tap({ force: true }); // the button breathes forever: skip the stability wait
    await page.locator('#say-missing').tap();
    await expect(page.locator('.kit-subtitle__text')).toHaveText('这句话的录音不存在，用备用朗读。');
    const cue = await page.evaluate(() => (window as any).__kitDemo.cues.filter(Boolean).at(-1));
    expect(cue.source).not.toBe('clip');
    await page.locator('.kit-subtitle__replay').tap();
    await expect.poll(() => page.evaluate(() => (window as any).__kitDemo.cues.filter(Boolean).length)).toBeGreaterThanOrEqual(3);
  });

  test('progress survives a reload; back button saves and returns to the hub', async ({ page }) => {
    await page.goto('/dev/kit/');
    await page.locator('.kit-start__go').tap({ force: true }); // the button breathes forever: skip the stability wait
    await page.locator('#save-inc').tap();
    await page.locator('#save-inc').tap();
    await expect(page.locator('#save-out')).toHaveText('2');
    await page.reload();
    await expect(page.locator('#save-out')).toHaveText('2');
    await page.locator('.kit-back').tap();
    await page.waitForURL((u) => u.pathname === '/');
    const env = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:dev-kit') || 'null'));
    expect(env).toMatchObject({ v: 1, data: { count: 2 } });
  });

  test('layout hook follows rotation', async ({ page }) => {
    await page.goto('/dev/kit/');
    const before = await page.evaluate(() => document.documentElement.dataset.orientation);
    const vp = page.viewportSize()!;
    await page.setViewportSize({ width: vp.height, height: vp.width });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.orientation)).not.toBe(before);
    const vw = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kit-vw').trim());
    expect(vw).toBe(`${vp.height}px`);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflowX).toBeLessThanOrEqual(1);
  });
});
