// 火星基地 iPad subset (≤ 2 min): the new stages are operated with REAL clicks (tray, counter, hop, array) through the production bundle.
// The full viewport matrix + every node lives in tools/mars-base/stages.mjs (dev server) — see docs/specs/mars-base.md §8.7.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
test.beforeEach(async ({ context }) => { await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') }); });

const LIT = { state: 'lit', attempts: 1, at: 1 };
async function boot(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/mars-base/?test=1&mute=1');
  await page.locator('.kit-start__go').click().catch(() => undefined);
  await page.waitForSelector('#app[data-ready]');
  await page.waitForTimeout(1500); await page.getByText('跳过').first().click({ timeout: 1500 }).catch(() => undefined); await page.waitForTimeout(900);
}
async function start(page: Page, node: string): Promise<void> {
  await page.evaluate((s) => (window as any).__mars.setSave(s), { onboarded: true, session: { index: 3, lastActiveAt: Date.now(), missions: 3 }, cert: { C1: LIT, C2: LIT, C3: LIT }, probes: { vault: { done: true }, factory: { done: true }, balance: { done: true } } });
  await page.waitForSelector('.mb-map'); await page.evaluate((n) => (window as any).__mars.start(n), node); await page.waitForSelector('.mb-mission .mb-stage');
  await page.waitForFunction(() => (window as any).__mars.item());
}
const item = (page: Page) => page.evaluate(() => (window as any).__mars.item());
const clickN = async (page: Page, sel: string, n: number) => { for (let i = 0; i < n; i++) await page.click(sel); };
const stageOk = (page: Page) => expect(page.locator('.mb-stage.is-ok')).toHaveCount(1);

test('tray: build a three-digit number from the carts (real clicks), then the stage lights up', async ({ page }) => {
  const errors: string[] = []; await boot(page, errors); await start(page, 'vault.K1.3');
  const { params } = await item(page); const n = params.n as number;
  await clickN(page, '.tr-cart[data-cart=box]', Math.floor(n / 100)); await clickN(page, '.tr-cart[data-cart=rod]', Math.floor(n / 10) % 10); await clickN(page, '.tr-cart[data-cart=crystal]', n % 10);
  await page.click('.mb-ok'); await stageOk(page); expect(errors).toEqual([]);
});

test('counter: dial a number with the beads and the carry (仓灯 stays out of the digits)', async ({ page }) => {
  const errors: string[] = []; await boot(page, errors); await start(page, 'vault.K1.5');
  const { params } = await item(page); const n = params.n as number;
  await clickN(page, '.ct-arrow[data-up=h]', Math.floor(n / 100)); await clickN(page, '.ct-arrow[data-up=t]', Math.floor(n / 10) % 10); await clickN(page, '.ct-arrow[data-up=o]', n % 10);
  await page.click('.mb-ok'); await stageOk(page); expect(errors).toEqual([]);
});

test('skip counting: hop the right number of times; arrays: build the board', async ({ page }) => {
  const errors: string[] = []; await boot(page, errors);
  await start(page, 'factory.P1.7'); const a = await item(page); await clickN(page, '.hp-go', a.params.k); await page.click('.mb-ok'); await stageOk(page);
  await page.waitForTimeout(1200); await page.evaluate(() => (window as any).__mars.goMap());
  await start(page, 'factory.P2.5'); const b = await item(page);
  if (!b.typed) { await clickN(page, '.ar-keep', b.params.P / b.params.n - 1); await page.click('.mb-ok'); await stageOk(page); }
  expect(errors).toEqual([]);
});

test('compare two boards: pick the bigger one with real clicks (no answer injection)', async ({ page }) => {
  const errors: string[] = []; await boot(page, errors);
  const id: string = await page.evaluate(() => { const m = (window as any).__mars; return m.nodes().find((n: string) => m.node(n).items.some((i: any) => i.fam === 'mul.compareArr')); });
  await start(page, id);
  for (let g = 0; g < 10 && (await item(page)).fam !== 'mul.compareArr'; g++) {   // walk to the first compareArr item with the oracle answer, then play it for real
    const prev = (await item(page)).key; await page.evaluate(() => (window as any).__mars.answer((window as any).__mars.correct()));
    await page.waitForFunction((k) => (window as any).__mars.item()?.key !== k, prev, { timeout: 6000 });
  }
  const { params: p } = await item(page); const a = p.r1 * p.c1, b = p.r2 * p.c2;
  await page.click(a === b ? '.ar-eq' : `.ar-pick[data-i="${a > b ? 1 : 2}"]`); await page.click('.mb-ok'); await stageOk(page); expect(errors).toEqual([]);
});
