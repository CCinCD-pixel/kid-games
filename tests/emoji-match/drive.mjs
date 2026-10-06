#!/usr/bin/env node
// Flow driver: plays a level through the ?test=1 hook move by move (Node-side loop, logged), then shoots.
//   node tests/emoji-match/drive.mjs <level> <win|lose> <shotName> [--land] [--save=<json>]
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, chromium, devices } from '@playwright/test';

const [id, mode, name] = process.argv.slice(2);
const land = process.argv.includes('--land');
const saveArg = process.argv.find((a) => a.startsWith('--save='))?.slice(7);
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error('memory low'); process.exit(2); }
const dir = path.join(os.homedir(), 'kid-games-work/shots/emoji-match', land ? 'landscape' : 'portrait');
fs.mkdirSync(dir, { recursive: true });
const browser = process.argv.includes('--chromium') ? await chromium.launch({ args: ['--mute-audio'] }) : await webkit.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: land ? { width: 1080, height: 810 } : { width: 810, height: 1080 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  page.on('crash', () => console.log('PAGE CRASH'));
  page.on('close', () => console.log('PAGE CLOSE'));
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console.' + m.type(), m.text().slice(0, 300)); });
  await page.goto('http://localhost:5305/emoji-match/?test=1');
  await page.waitForSelector('#app[data-ready]');
  if (saveArg) await page.evaluate((s) => window.__em.setSave(JSON.parse(s)), saveArg);
  await page.evaluate((id) => { window.__em.timeScale(6); window.__em.goto({ s: 'play', id }); }, id);
  await page.waitForTimeout(1500);
  for (let i = 0; i < 80; i++) {
    const s = await page.evaluate(() => window.__em.state());
    if (!s || s.done) { console.log('end', JSON.stringify(s)); break; }
    const mv = await page.evaluate((mode) => {
      const em = window.__em;
      const les = em.lessonMove?.();
      if (les) return les;
      if (mode === 'win') return em.bestMove();
      const l = em.legal().filter((m) => m.t === 'swap'); return l[l.length - 1] ?? em.legal()[0];
    }, mode);
    const t0 = Date.now();
    const ok = await page.evaluate((mv) => window.__em.play(mv), mv);
    console.log(i, JSON.stringify(mv), ok, Date.now() - t0, 'ms', JSON.stringify(await page.evaluate(() => window.__em.state())));
  }
  await page.waitForSelector('.xg-modal', { timeout: 30000 }).catch(() => console.log('no result modal'));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
  console.log('shot', name);
  await ctx.close();
} finally { await browser.close(); }
