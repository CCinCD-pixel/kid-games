#!/usr/bin/env node
// QA r2: FT at real speed (no fast=1): a tap during the demo takes over; 团长→师长 right after the question → mc.ft.bigger.
import { webkit, devices } from '@playwright/test';
const browser = await webkit.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5303/military-chess/?test=1');
  await page.waitForSelector('#app[data-ready]');
  await page.evaluate(() => window.__mc.app.go({ name: 'ft' }));
  const tap = async (a) => { const pt = await page.evaluate((x) => window.__mc.point(x), a); await page.touchscreen.tap(pt.x, pt.y); };
  await page.waitForFunction(() => window.__mc.said().includes('mc.ft.1'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const t0 = Date.now();
  await tap('c6');
  await page.waitForFunction(() => window.__mc.dbg().step() === 'first', null, { timeout: 3000 });
  const lifted = await page.evaluate(() => document.querySelectorAll('.mc-piece.is-lifted, .is-lifted').length);
  console.log('takeover ms', Date.now() - t0, 'lifted', lifted);
  await tap('c7');
  await page.waitForFunction(() => window.__mc.dbg().step() === 'second', null, { timeout: 15000 });
  const t1 = Date.now();
  await page.waitForFunction(() => window.__mc.dbg().busy() === 0, null, { timeout: 5000 });
  console.log('input open after step second ms', Date.now() - t1, 'said', (await page.evaluate(() => window.__mc.said())).slice(-2));
  await tap('c7'); await page.waitForTimeout(120); await tap('b7');
  await page.waitForFunction(() => window.__mc.said().includes('mc.ft.bigger'), null, { timeout: 8000 });
  console.log('bigger OK; log', JSON.stringify(await page.evaluate(() => window.__mc.dbg().log())));
} finally { await browser.close(); }
