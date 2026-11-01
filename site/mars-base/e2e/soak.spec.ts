/**
 * V11 "memory stays flat over repeated play" (spec §8.6 / §9): every screen type and every stage type is opened and left 28 times; after a GC (cycle 5 → 28)
 * the live DOM nodes and JS event listeners may grow by at most 60 each (heap ≤ 3 MB). Chromium + CDP (`Memory.getDOMCounters`), so this spec drives its own
 * headless Chromium once (project ipad-l only; the other projects skip it). The driver lives in tools/mars-base/soak-lib.mjs (shared with perf.mjs).
 *
 *   MARS_BASE_URL=http://localhost:5323 npx playwright test -c site/mars-base/playwright.mars.config.ts --project=ipad-l soak
 *   MARS_SOAK_BISECT=1  → on a failing "all stage types" the culprit signature(s) are named (one soak per signature, slow)
 *
 * The gate has teeth: the last test plants a leak (a held ElementHandle per cycle) and expects the gate to catch it.
 * Remember when you extend it: never `await page.waitForSelector()` in a soak loop (the handle pins the screen) — use `present()`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type Browser, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
// @ts-expect-error -- plain ESM helper (JSDoc only)
import { SCREENS, NONE, describe, leakControl, playSave, present, soak, stageSigs, stageSoak, stageSoakAll, verdict } from '../../../tools/mars-base/soak-lib.mjs';
import { MUTE } from './lib';

test.describe.configure({ mode: 'serial' });
const PROJECT = 'ipad-l';
const OUT = path.join(os.homedir(), 'kid-games-work/state/rr/e2e/soak.json');
const MISSIONS = ['vault.K1.3', 'factory.P2.5', 'orbit.O2.2', 'cert.C1.1', 'vault.K1.5', 'factory.P1.3'];   // tray, tray+keypad, number line, keypad, pods/array, array

let browser: Browser | null = null; let ctx: BrowserContext; let page: Page; let cdp: CDPSession; const errors: string[] = []; const results: Record<string, unknown>[] = [];

test.beforeAll(async ({}, ti) => {
  if (ti.project.name !== PROJECT) return;
  const base = (ti.project.use as { baseURL?: string }).baseURL ?? 'http://localhost:5323';
  browser = await chromium.launch({ args: ['--mute-audio'] });
  ctx = await browser.newContext({ viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', baseURL: base });
  await ctx.addInitScript({ path: MUTE });
  await ctx.addInitScript(() => { try { localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: true, narration: true })); } catch { /* blocked */ } });
  page = await ctx.newPage(); cdp = await ctx.newCDPSession(page);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  await page.goto('/mars-base/?test=1'); await page.locator('.kit-start__go').click({ timeout: 8000 }).catch(() => undefined);
  await page.waitForSelector('#app[data-ready]', { timeout: 10_000 }); await page.waitForFunction(() => !!(window as any).__mars, undefined, { timeout: 10_000 });
});
test.afterAll(async () => {
  if (!browser) return;
  try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), results }, null, 1)); } catch { /* best effort */ }
  await browser.close();
});
test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name !== PROJECT, `Chromium soak: runs once, on ${PROJECT}`);
  await page.evaluate((s) => (window as any).__mars.setSave(s), playSave()); await present(page, '.mb-map');
});

type Cycle = (i: number) => Promise<void>;
async function gate(name: string, cycle: Cycle, o: { cycles?: number; warm?: number } = {}): Promise<void> {
  const r = verdict(await soak(page, cdp, name, cycle, o)); results.push(r); console.log(describe(r));
  expect(r.ok, describe(r)).toBe(true);
}

test('map: 28 visits are flat', async () => { await gate('map', SCREENS.map(page)); });
test('chapter maps (kit nodeMap): 28 visits are flat', async () => { await gate('chapter maps', SCREENS.chapter(page)); });
test('徽章站: 28 visits are flat', async () => { await gate('badges', SCREENS.badges(page)); });
test('档案馆: 28 visits are flat', async () => { await gate('archive', SCREENS.archive(page)); });
test('家长页: 28 visits (two settings toggles each) are flat', async () => { test.setTimeout(120_000); await gate('parent page', SCREENS.parent(page)); });
test('徽章墙 一起验货: 28 missions opened and left are flat', async () => {
  await page.evaluate((s) => (window as any).__mars.setSave(s), { ...playSave(), cert: { C1: NONE, C2: NONE, C3: NONE } }); await present(page, '.mb-map');
  await gate('wall mission', SCREENS.wall(page));
});
test('build scene overlay: 28 plays are flat', async () => { await gate('build scene', SCREENS.build(page)); });
test('mission: 28 missions of six different stage kinds opened and left are flat', async () => {
  test.setTimeout(120_000);
  await gate('mission open/leave', async (i: number) => SCREENS.missionLeave(page, MISSIONS[i % MISSIONS.length])());
});
test('mission: 28 missions played for 3 orders (every stage swap) are flat', async () => {
  test.setTimeout(300_000);
  await gate('mission play (3 orders)', async (i: number) => SCREENS.missionPlay(page, MISSIONS[i % 2 ? 1 : 0], 3)());
});
test('mission: whole missions to the result card, the build scene and back are flat', async () => {
  test.setTimeout(300_000);
  await gate('mission complete', SCREENS.missionFull(page, 'cert.C1.1'), { cycles: 12, warm: 3 });   // 12 whole missions (~9 s each)
});

test('every stage type (one per family × ask × typed × hands × level) mounted, used and destroyed 28 times is flat', async () => {
  test.setTimeout(240_000);
  const sigs: string[] = await stageSigs(page); expect(sigs.length, 'stage signatures found by the test hook').toBeGreaterThan(100);
  const r = verdict(await stageSoakAll(page, cdp)); results.push({ ...r, signatures: sigs.length }); console.log(describe(r), `(${sigs.length} stage signatures)`);
  expect(r.errors, 'stages must not throw when poked').toEqual([]);
  if (!r.ok && process.env.MARS_SOAK_BISECT) {
    const bad: string[] = [];
    for (const sig of sigs) { const s = verdict(await stageSoak(page, cdp, sig, { settleMs: 5000 })); if (!s.ok) bad.push(describe(s)); }
    expect(bad, `leaking stage types:\n${bad.join('\n')}`).toEqual([]);
  }
  expect(r.ok, `${describe(r)} — rerun with MARS_SOAK_BISECT=1 to name the stage`).toBe(true);
});

test('the gate has teeth: a planted leak (a handle held on every screen) is caught', async () => {
  const r = verdict(await soak(page, cdp, 'planted leak', leakControl(page), { cycles: 12, warm: 3 })); console.log(describe(r));
  expect(r.ok, 'the soak gate must FAIL on a held-handle leak').toBe(false);
  expect(r.dNodes, describe(r)).toBeGreaterThan(200);
});

test('no page errors during the whole soak', async () => { expect(errors).toEqual([]); });
