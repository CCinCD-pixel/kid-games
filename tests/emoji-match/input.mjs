#!/usr/bin/env node
// Real-pointer check: drag the 1-01 lesson move with the mouse, then tap-select two cells (點選) on 1-06,
// then tap a special to fire it. Prints movesUsed after each gesture.
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) process.exit(2);
const browser = await webkit.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('http://localhost:5305/emoji-match/?test=1');
  await page.waitForSelector('#app[data-ready]');
  const go = async (id) => { await page.evaluate((id) => { window.__em.timeScale(4); window.__em.goto({ s: 'play', id }); }, id); await page.waitForFunction(() => window.__em.state()?.ready, null, { timeout: 15000 }); };
  const cell = (i) => page.evaluate((i) => { const r = window.__em.rects(); const w = window.__em.width(); return { x: r.ox + ((i % w) + 0.5) * r.cell, y: r.oy + (Math.floor(i / w) + 0.5) * r.cell }; }, i);
  const settle = () => page.waitForFunction(() => window.__em.state()?.ready || window.__em.state()?.done, null, { timeout: 15000 });
  const used = () => page.evaluate(() => window.__em.state().movesUsed);
  // 1) drag
  await go('1-01');
  const mv = await page.evaluate(() => window.__em.lessonMove());
  const a = await cell(mv.a), b = await cell(mv.b);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 6, a.y + ((b.y - a.y) * k) / 6);
  await page.mouse.up(); await page.waitForTimeout(300); await settle();
  console.log('drag 1-01 → movesUsed', await used());
  // 2) tap-select on a free level
  await go('1-06');
  const sw = await page.evaluate(() => window.__em.legal().find((m) => m.t === 'swap'));
  const c1 = await cell(sw.a), c2 = await cell(sw.b);
  await page.mouse.click(c1.x, c1.y); await page.waitForTimeout(250); await page.mouse.click(c2.x, c2.y); await page.waitForTimeout(300); await settle();
  console.log('tap-select 1-06 → movesUsed', await used());
  // 3) tap-fire a special if one exists
  const tap = await page.evaluate(() => window.__em.legal().find((m) => m.t === 'tap'));
  if (tap) { const c = await cell(tap.a); await page.mouse.click(c.x, c.y); await page.waitForTimeout(300); await settle(); console.log('tap-fire → movesUsed', await used()); }
  else console.log('no special on board for tap-fire');
} finally { await browser.close(); }
