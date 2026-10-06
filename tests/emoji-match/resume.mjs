#!/usr/bin/env node
// Resume check (spec §8.7): play 3 moves on 1-06, reload the page (kill-and-reopen), continue → same board.
import { webkit, devices } from '@playwright/test';
const browser = await webkit.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('http://localhost:5305/emoji-match/?test=1');
  await page.waitForSelector('#app[data-ready]');
  await page.evaluate(() => { window.__em.timeScale(6); window.__em.setSave({ firstRunDone: true }); window.__em.goto({ s: 'play', id: '1-06' }); });
  await page.waitForFunction(() => window.__em.state()?.ready);
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__em.play(window.__em.bestMove())); }
  const before = await page.evaluate(() => ({ b: window.__em.board(), s: window.__em.state() }));
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
  const cont = await page.evaluate(() => document.querySelector('.em-continue')?.textContent);
  await page.click('.em-continue'); await page.waitForTimeout(600);
  await page.click('.em-card__go'); 
  await page.waitForFunction(() => window.__em.state()?.ready, null, { timeout: 20000 });
  const after = await page.evaluate(() => ({ b: window.__em.board(), s: window.__em.state() }));
  console.log('continue button:', cont);
  console.log('movesUsed', before.s.movesUsed, '→', after.s.movesUsed, '| same board:', before.b === after.b);
} finally { await browser.close(); }
