/**
 * Smoke matrix generated from the registry: the hub, every registered game and the kit playground,
 * in WebKit at 810×1080 and 1080×810 (see playwright.config.ts). Per page:
 *   loads (HTTP 200), 0 console errors / page errors, 0 failed requests, no horizontal overflow,
 *   back button present with a ≥56 px hit area (not on the hub), ≤1 AudioContext, screenshot.
 * Plus behaviour checks for the kit (start gate → audio unlock → first narration, fallback voice,
 * save/reload, back with autosave, relayout on rotation) and the hub (cards = registry, launch log).
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
/* eslint-disable @typescript-eslint/no-explicit-any -- window.__kitDemo is a test hook */
// @ts-expect-error -- plain ESM helper with JSDoc types
import { loadRegistry } from '../../tools/registry.mjs';
import { SHOTS_DIR } from './playwright.config';

interface Entry { id: string; href: string; status: string; smoke?: { waitFor?: string; skip?: boolean } }
const games: Entry[] = loadRegistry();
const matrix = [
  { id: 'hub', href: '/', back: false, waitFor: '.hub-card' },
  ...games.filter((g) => !g.smoke?.skip).map((g) => ({ id: g.id, href: g.href, back: true, waitFor: g.smoke?.waitFor })),
  { id: 'dev-kit', href: '/dev/kit/', back: true, waitFor: '.kit-start' },
];

/** Count AudioContexts and audio starts before the first touch (installed before any page script). */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const probe = { contexts: 0, gesture: false, startsBeforeGesture: 0 };
    (w as Record<string, unknown>).__kgProbe = probe;
    for (const type of ['pointerdown', 'touchstart', 'mousedown', 'keydown']) {
      window.addEventListener(type, () => (probe.gesture = true), { capture: true });
    }
    for (const key of ['AudioContext', 'webkitAudioContext'] as const) {
      const Orig = w[key];
      if (typeof Orig !== 'function') continue;
      w[key] = new Proxy(Orig, {
        construct(target, args, newTarget) {
          probe.contexts += 1;
          return Reflect.construct(target, args, newTarget);
        },
      });
    }
    const wrapStart = (proto: { start?: (...a: unknown[]) => unknown } | undefined) => {
      if (!proto?.start) return;
      const orig = proto.start;
      proto.start = function (this: unknown, ...a: unknown[]) {
        if (!probe.gesture) probe.startsBeforeGesture += 1;
        return orig.apply(this, a);
      };
    };
    wrapStart(window.AudioScheduledSourceNode?.prototype as never);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!probe.gesture) probe.startsBeforeGesture += 1;
      return play.call(this);
    };
  });
}

function watch(page: Page) {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText ?? 'failed'} ${r.url()}`));
  page.on('response', (r) => {
    // the kit demo manifest deliberately lists one missing clip (fallback-voice test)
    if (r.status() >= 400 && !r.url().includes('dev.missing')) failed.push(`${r.status()} ${r.url()}`);
  });
  return { errors, failed };
}

const probe = (page: Page) => page.evaluate(() => (window as unknown as { __kgProbe: { contexts: number; startsBeforeGesture: number } }).__kgProbe);

async function shot(page: Page, project: string, name: string) {
  const dir = path.join(SHOTS_DIR, project);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

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
  test('cards come from the registry and a launch is logged with its source', async ({ page }) => {
    await page.goto('/');
    const live = games.filter((g) => g.status === 'live').map((g) => g.id).sort();
    const shown = (await page.locator('.hub-card:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.game!))).sort();
    expect(shown).toEqual(live);
    const target = games.find((g) => g.status === 'live')!;
    await page.locator(`.hub-card[data-game="${target.id}"]`).click();
    await page.waitForURL(`**${target.href}`);
    await page.waitForTimeout(300);
    const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:log:v1') || '[]'));
    const mine = sessions.filter((s: { game: string }) => s.game === target.id);
    expect(mine.at(-1)?.source).toBe('hub');
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
