/**
 * QA fix-mars-r1 (T1 + P2 + P4): the end-of-task cards on EVERY viewport, and probe resume after a reload.
 *  - the kit result card (stars / ribbon / title / button) lies inside the viewport — it used to be 396 px wide (30 px off an iPhone 13, 3rd star cut on an SE);
 *  - a calibration card has NO empty star row and shows the orbit picture; a node card shows its stars;
 *  - the build overlay card is inside the viewport;
 *  - a probe interrupted after 2 items continues with item 3 after a reload (the saved mission used to be compared with the wrong id).
 */
import { expect, test, type Page } from '@playwright/test';
import { SHOTS, boot, prepare, startNode, safeOf, PLAY_SAVE } from './lib';
import fs from 'node:fs'; import path from 'node:path';

async function finishMission(page: Page, max = 40): Promise<boolean> {
  for (let i = 0; i < max; i++) { if (await page.locator('.xg-modal').count()) return true; await page.evaluate(() => (window as any).__mars.answer((window as any).__mars.correct())).catch(() => undefined); await page.waitForTimeout(450); }
  return (await page.locator('.xg-modal').count()) > 0;
}
const modalAudit = (page: Page): Promise<string[]> => page.evaluate(() => {
  const out: string[] = []; const VW = innerWidth, VH = innerHeight; const m = document.querySelector('.xg-modal')?.getBoundingClientRect(); if (!m) return ['no result card'];
  const inside = (n: string, r: DOMRect) => { if (r.left < -0.5 || r.right > VW + 0.5 || r.top < -0.5 || r.bottom > VH + 0.5) out.push(`${n} outside the viewport [${[r.left, r.top, r.right, r.bottom].map(Math.round)}] of ${VW}x${VH}`); };
  inside('card', m);
  for (const [n, sel] of [['ribbon', '.xg-ribbon'], ['title', '.xg-modal__title'], ['button', '.xg-modal__actions button'], ['stats', '.xg-result-stats']] as const) { const e = document.querySelector(sel); if (e) inside(n, e.getBoundingClientRect()); }
  document.querySelectorAll('.xg-rstar').forEach((e, i) => inside(`star ${i + 1}`, e.getBoundingClientRect()));
  const t = document.querySelector('.xg-modal__title') as HTMLElement | null; if (t && t.scrollWidth > t.clientWidth + 1) out.push('title text cut');
  return out;
});

test('result cards: node card + calibration card lie inside the viewport; calibration has no empty stars and shows the orbit', async ({ page }, ti) => {
  test.setTimeout(150_000);
  const watch = await prepare(page); await boot(page, ti);
  await startNode(page, 'vault.K1.1'); expect(await finishMission(page), 'node mission ends on a card').toBe(true); await page.waitForTimeout(1500);
  expect(await modalAudit(page), 'node card').toEqual([]); expect(await page.locator('.xg-rstar').count()).toBe(3);
  fs.mkdirSync(path.join(SHOTS, ti.project.name), { recursive: true }); await page.screenshot({ path: path.join(SHOTS, ti.project.name, 'result_node.png') });
  await page.locator('.xg-modal__actions [data-act="home"]').click(); await page.waitForTimeout(600);
  for (let i = 0; i < 12 && !(await page.locator('.mb-map').count()); i++) {
    if (await page.locator('.mb-build').count()) await page.locator('.mb-build').click({ timeout: 800 }).catch(() => undefined);
    if (await page.locator('.xg-modal').count()) await page.locator('.xg-modal__actions [data-act="home"]').click({ timeout: 800 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('.mb-map', { timeout: 8000 });
  // calibration (12 satellites): no star row at all, the orbit picture instead
  await page.evaluate((s) => (window as any).__mars.setSave(s), { ...PLAY_SAVE, onboarded: true, cert: { C1: { state: 'none', attempts: 0 }, C2: { state: 'none', attempts: 0 }, C3: { state: 'none', attempts: 0 } } });
  await startNode(page, 'orbit.O1.0'); expect(await finishMission(page, 60), 'calibration ends on a card').toBe(true); await page.waitForTimeout(1500);
  expect(await modalAudit(page), 'calibration card').toEqual([]);
  expect(await page.locator('.xg-rstar').count(), 'no empty star row on a calibration card').toBe(0); expect(await page.locator('.mb-result-chart svg').count(), 'the orbit picture').toBe(1);
  await page.screenshot({ path: path.join(SHOTS, ti.project.name, 'result_calib.png') });
  await page.locator('.xg-modal__actions [data-act="home"]').click(); await page.waitForTimeout(500);
  for (let i = 0; i < 12 && !(await page.locator('.mb-map').count()); i++) {
    if (await page.locator('.mb-build').count()) await page.locator('.mb-build').click({ timeout: 800 }).catch(() => undefined);
    if (await page.locator('.xg-modal').count()) await page.locator('.xg-modal__actions [data-act="home"]').click({ timeout: 800 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
  // the build overlay card (part rises / tier swap)
  await page.evaluate(() => { (window as any).__marsFast = false; void (window as any).__mars.build({ part: true, tierUps: [{ site: 'orbit', from: 1, to: 2 }], levelUp: 2, newCards: [] }, 'orbit'); }); await page.waitForSelector('.mb-build'); await page.waitForTimeout(150);   // real-time overlay (automation normally fast-forwards it)
  const b = await page.evaluate(() => { const r = document.querySelector('.mb-build-card')!.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; });
  await page.evaluate(() => { (window as any).__marsFast = true; document.querySelector('.mb-build')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(b.l).toBeGreaterThanOrEqual(0); expect(b.r).toBeLessThanOrEqual(b.w + 0.5); expect(b.t).toBeGreaterThanOrEqual(0); expect(b.b).toBeLessThanOrEqual(b.h + 0.5);
  expect(watch.errors).toEqual([]);
});

test('probe: leave after 2 items, reload, 开始任务 continues at item 3 (all of the answers kept)', async ({ page }, ti) => {
  test.setTimeout(90_000);
  const watch = await prepare(page); await boot(page, ti, { save: { probes: { vault: { done: false }, factory: { done: true }, balance: { done: true } }, session: { index: 3, lastActiveAt: Date.now(), missions: 1 } } });
  await page.evaluate(() => (window as any).__mars.start('vault.K1.1')); await page.waitForSelector('.mb-mission .mb-stage'); await page.waitForFunction(() => (window as any).__mars.item());
  const key0 = await page.evaluate(() => (window as any).__mars.item().key); expect(key0).toBe('probe.vault#0');
  for (let i = 0; i < 2; i++) { const k = await page.evaluate(() => (window as any).__mars.item().key); await page.evaluate(() => (window as any).__mars.answer((window as any).__mars.correct())); await page.waitForFunction((kk) => (window as any).__mars.item()?.key !== kk, k, { timeout: 6000 }); }
  expect(await page.evaluate(() => (window as any).__mars.item().key)).toBe('probe.vault#2');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:mars-base')!).data.mission); expect(saved).toMatchObject({ node: 'probe.vault', kind: 'probe' }); expect(saved.results.length).toBe(2);
  // a killed home-screen app: reload the page, start gate, map, 开始任务
  await page.goto(`/mars-base/?test=1${safeOf(ti) ? `&safe=${safeOf(ti)}` : ''}`); await page.locator('.kit-start__go').click({ timeout: 8000 }).catch(() => undefined); await page.waitForSelector('.mb-map', { timeout: 10_000 });
  expect(await page.locator('.mb-go-sub').innerText(), 'the map offers the unfinished order').toContain('接着上次'); await page.locator('.mb-go').click();
  await page.waitForSelector('.mb-mission .mb-stage'); await page.waitForFunction(() => (window as any).__mars.item()); await page.locator('.xg-skip[data-state="shown"]').first().click({ timeout: 600 }).catch(() => undefined);
  expect(await page.evaluate(() => (window as any).__mars.item().key), 'continues with the third item, not item 0').toBe('probe.vault#2');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:mars-base')!).data.mission.results.length)).toBe(2);
  expect(watch.errors).toEqual([]);
});
