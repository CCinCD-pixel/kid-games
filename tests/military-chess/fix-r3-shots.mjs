#!/usr/bin/env node
// QA r3 fix verification shots (dev server on 5303, WebKit, iPad 9 both orientations). One browser, closed.
//   node tests/military-chess/fix-r3-shots.mjs [gate,ladder,ft,f1,face,hint,result]
import os from 'node:os';
import path from 'node:path';
import { webkit, devices } from '@playwright/test';

const OUT = path.join(os.homedir(), 'kid-games-work/shots/military-chess/fix-r3');
const BASE = 'http://localhost:5303/military-chess/?test=1&fast=1';
const ONLY = process.argv[2] || '';
const want = (n) => !ONLY || ONLY.split(',').includes(n);
const LAY = { red: '527369B841371652M41BMFM32', blue: '234216571B835B9146M723MFM' };
const fam = (mode, seating, id) => ({ v: 1, id, mode, setup: mode === 'fan' ? { firstMover: 0, fanSeed: `mc:fan:${id}`, firstPlayer: 0 } : { firstMover: 0, ...LAY }, actions: [], opponent: { kind: 'family', seating, names: ['小步步', '爸爸'] }, kidSide: 0, kidSeat: 'near', tags: {}, hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: false });
const lad = (id, level) => ({ v: 1, id, mode: 'ming', setup: { firstMover: 0, ...LAY }, actions: [], opponent: { kind: 'ai', level }, kidSide: 0, kidSeat: 'near', tags: {}, hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: true });
const report = {};
const browser = await webkit.launch();
try {
  for (const [o, vp] of [['p', { width: 810, height: 1080 }], ['l', { width: 1080, height: 810 }]]) {
    const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: vp, locale: 'zh-CN' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}-${o}.png`), scale: 'css' });
    const go = (r) => page.evaluate((x) => window.__mc.app.go(x), r);
    const wait = (ms) => page.waitForTimeout(ms);
    if (want('gate')) {
      await page.goto(BASE.replace('&fast=1', '') + '&gate=1');
      const b = await page.locator('.kit-start__go').boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      await wait(1000);
      report[`gate-${o}`] = await page.evaluate(() => window.__mc.screen());
      await shot('gate-after-tap');
    }
    await page.goto(BASE);
    await page.waitForSelector('#app[data-ready]');
    if (want('ladder')) { await go({ name: 'ladder', mode: 'fan' }); await wait(900); await shot('ladder-fan-locked'); }
    if (want('ft')) { await go({ name: 'ft' }); await wait(3500); await shot('ft'); }
    if (want('f1')) {
      await go({ name: 'item', id: 'F-1' });
      await page.waitForFunction(() => window.__mc.said().includes('mc.f1.flip'), null, { timeout: 15000 });
      const pt = await page.evaluate(() => window.__mc.point('c6'));
      await wait(600); await page.touchscreen.tap(pt.x, pt.y); await wait(1500); await shot('f1-youare');
    }
    if (want('face')) { await go({ name: 'match', setup: fam('ming', 'face', 'mf' + o) }); await wait(1800); await shot('family-face'); }
    if (want('hint')) {
      await page.evaluate(() => window.__mc.position({ b1: 'rF^', c6: 'r5', d10: 'b7', e7: 'b4', a12: 'bF^', c3: 'r3', b9: 'b9' }, { mode: 'fan', ladder: true, family: false }));
      await wait(700);
      await page.locator('[data-testid="hint"]').tap();
      await wait(900); await shot('hint-flip');
      report[`replay-${o}`] = await page.evaluate(() => { const b = document.querySelector('.mc-caption .xg-iconbtn'); const r = b?.getBoundingClientRect(); return r ? [r.width, r.height] : null; });
    }
    if (want('result')) {
      await go({ name: 'match', setup: lad('lr' + o, 4) });
      for (let i = 0; i < 400; i++) {
        const sc = await page.evaluate(() => window.__mc.screen());
        if (sc === 'result') break;
        if (sc !== 'match') { await wait(200); continue; }
        await page.evaluate(() => window.__mc.autoMove('b'));
        await wait(120);
      }
      await wait(2500); await shot('result');
      report[`result-${o}`] = await page.evaluate(() => [...document.querySelectorAll('.mc-moment, [data-testid^="moment"]')].map((e) => e.textContent.trim().slice(0, 30)));
    }
    report[`errors-${o}`] = errs;
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 1));
