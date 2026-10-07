#!/usr/bin/env node
// QA r2 fix screenshots (WebKit, both orientations). Kit loaded → auto-muted under automation.
import { webkit, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
const OUT = path.join(os.homedir(), 'kid-games-work/shots/military-chess/fix-r2');
const BASE = 'http://localhost:5303/military-chess/?test=1&fast=1';
const ONLY = process.argv[2] || '';
const fam = (mode, seating, id) => ({ v: 1, id, mode, setup: mode === 'fan' ? { firstMover: 0, fanSeed: `mc:fan:${id}`, firstPlayer: 0 } : { firstMover: 0, red: '527369B841371652M41BMFM32', blue: '234216571B835B9146M723MFM' }, actions: [], opponent: { kind: 'family', seating, names: ['小步步', '爸爸'] }, kidSide: 0, kidSeat: 'near', tags: {}, hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: false });
const browser = await webkit.launch();
try {
  for (const [o, vp] of [['p', { width: 810, height: 1080 }], ['l', { width: 1080, height: 810 }]]) {
    const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: vp });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}-${o}.png`), scale: 'css' });
    const go = (r) => page.evaluate((x) => window.__mc.app.go(x), r);
    const tap = async (a) => { const pt = await page.evaluate((x) => window.__mc.point(x), a); await page.touchscreen.tap(pt.x, pt.y); };
    const wait = (ms) => page.waitForTimeout(ms);
    await page.goto(BASE);
    await page.waitForSelector('#app[data-ready]');
    const want = (n) => !ONLY || ONLY.split(',').includes(n);
    if (want('f1')) {
      await go({ name: 'item', id: 'F-1' });
      await page.waitForFunction(() => window.__mc.said().includes('mc.f1.flip'), null, { timeout: 15000 });
      await wait(600); await tap('c6'); await wait(1500); await shot('f1-youare');
    }
    if (want('face')) {
      await go({ name: 'match', setup: fam('ming', 'face', 'mf' + o) }); await wait(900); await shot('family-face');
    }
    if (want('sheet')) {
      await go({ name: 'match', setup: fam('ming', 'side', 'ms' + o) }); await wait(700);
      await tap('a6'); await wait(200); await tap('b5'); await wait(900);
      await page.click('[data-testid="menu"]'); await wait(300); await shot('menu');
      await page.click('[data-testid="menu-undo"]'); await wait(300);
      await page.setViewportSize({ width: vp.height, height: vp.width }); await wait(500); await shot('undo-sheet-rotated');
      await page.getByRole('button', { name: '同意', exact: true }).click(); await wait(300);
      await page.setViewportSize(vp); await wait(300);
    }
    if (want('fanmenu')) {
      await page.evaluate(() => { const s = window.__mc.save(); s.firstRun.fanCoach = [1,2,3,4,5]; });
      await go({ name: 'match', setup: fam('fan', 'side', 'mfan' + o) }); await wait(800);
      await page.click('[data-testid="menu"]'); await wait(300); await shot('fan-menu');
      await page.click('[data-testid="menu-fanown"]'); await wait(400); await shot('fan-own');
    }
    if (want('deploy')) {
      await go({ name: 'item', id: 'L7-5' }); await wait(1500); await shot('L7-5');
    }
    if (want('home')) {
      await go({ name: 'home', skipFt: true }); await wait(1500); await shot('home');
    }
    if (want('medals')) { await go({ name: 'medals' }); await wait(900); await shot('medals'); }
    if (want('cmp')) { await go({ name: 'item', id: 'L1-2' }); await wait(1800); await shot('L1-2-compare'); await go({ name: 'academy' }); await wait(900); await shot('academy'); }
    if (want('match')) {
      // many pieces down on both sides (dense trays)
      await page.evaluate(() => window.__mc.position({ a1: 'rF', b1: 'rM', a2: 'r9', e6: 'r1', a12: 'bF', b12: 'bM', e7: 'b2' }, { family: false }));
      await wait(800); await shot('ming-dense');
    }
    console.log(o, 'errors:', JSON.stringify(errs));
    await ctx.close();
  }
} finally { await browser.close(); }
