#!/usr/bin/env node
// Phone + iPad screenshot sweep for 星港搬运工 (Dad's feedback 2026-10-08). Dev server on --port.
//   node tests/sokoban/phone-shots.mjs [--port=5301] [--only=iphone13,se,phone-land,ipad-p,ipad-l] [--tag=after] [--screens=a,b]
// One browser, always closed. Shots → ~/kid-games-work/shots/fb1/sokoban/<tag>/<device>/<screen>.png
// Also prints every tap target < 44 px and every element clipped by the viewport.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5301');
const TAG = opt('tag', 'before');
const ONLY = opt('only', '').split(',').filter(Boolean);
const SCREENS = opt('screens', '').split(',').filter(Boolean);
const OUT = path.join(os.homedir(), 'kid-games-work/shots/fb1/sokoban', TAG);
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
const DEVICES = [
  { name: 'iphone13', ctx: { ...devices['iPhone 13'] } },
  { name: 'se', ctx: { ...devices['iPhone SE'] } },
  { name: 'phone-land', ctx: { ...phone, viewport: { width: 844, height: 390 }, userAgent: devices['iPhone 13'].userAgent } },
  { name: 'ipad-p', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
  { name: 'ipad-l', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
].filter((d) => !ONLY.length || ONLY.includes(d.name));

const ready = (page) => page.waitForSelector('#app[data-ready]', { timeout: 15000 }).catch(() => {});
const S = [
  ['opening', '/sokoban/?test=1&anim=real', async (p) => { await p.waitForTimeout(2600); }],
  ['play-0-1', '/sokoban/?test=1&level=0-1', async (p) => { await p.waitForTimeout(900); }],
  ['play-2-4', '/sokoban/?test=1&level=2-4', async (p) => { await p.waitForTimeout(900); }],
  ['play-4-7', '/sokoban/?test=1&level=4-7', async (p) => { await p.waitForTimeout(900); }],
  ['play-c10', '/sokoban/?test=1&level=C10', async (p) => { await p.waitForTimeout(900); }],
  ['play-arrows', '/sokoban/?test=1&level=1-1', async (p) => { await p.evaluate(() => window.__sok.setArrows('on')); await p.evaluate(() => window.__sok.load('1-2')); await p.waitForTimeout(900); await p.evaluate(() => window.__sok.tapCrate(0)); await p.waitForTimeout(500); }],
  ['map', '/sokoban/?test=1&screen=map', async (p) => { await p.evaluate(() => window.__sok.unlockAll({ rewards: true })); await p.evaluate(() => window.__sok.map(2)); await p.waitForTimeout(900); }],
  ['hangar', '/sokoban/?test=1&screen=map', async (p) => { await p.evaluate(() => window.__sok.unlockAll({ rewards: true })); await p.evaluate(() => window.__sok.hangar()); await p.waitForTimeout(900); }],
  ['quiz', '/sokoban/?test=1&level=3-3', async (p) => { await p.waitForTimeout(1200); }],
  ['result', '/sokoban/?test=1&level=0-2', async (p) => { await p.waitForTimeout(600); await p.evaluate(() => window.__sok.solve()); await p.waitForTimeout(1800); }],
  ['chapter', '/sokoban/?test=1&screen=map', async (p) => { void p.evaluate(() => window.__sok.overlay('chapter', 2)); await p.waitForTimeout(1200); }],
  ['finale', '/sokoban/?test=1&screen=map', async (p) => { void p.evaluate(() => window.__sok.overlay('finale')); await p.waitForTimeout(1500); }],
  ['wrap', '/sokoban/?test=1&screen=map', async (p) => { void p.evaluate(() => window.__sok.overlay('wrap')); await p.waitForTimeout(1200); }],
  ['cert', '/sokoban/?test=1&screen=map', async (p) => { void p.evaluate(() => window.__sok.overlay('cert')); await p.waitForTimeout(1200); }],
  ['orders', '/sokoban/?test=1&screen=map', async (p) => { await p.evaluate(() => window.__sok.unlockAll({ rewards: true })); void p.evaluate(() => window.__sok.overlay('orders')); await p.waitForTimeout(1200); }],
  ['upgrade', '/sokoban/?test=1&anim=real&level=1-1', async (p) => { await p.evaluate(() => window.__sok.setArrows('celebrate')); await p.evaluate(() => window.__sok.load('1-2')); await p.waitForTimeout(2300); }],
  ['skills', '/sokoban/?test=1&screen=map', async (p) => { await p.evaluate(() => window.__sok.unlockAll({ rewards: true })); await p.evaluate(() => window.__sok.hangar()); await p.waitForTimeout(500); await p.locator('.sok-hangar__tabs button').nth(2).click(); await p.waitForTimeout(700); }],
  ['lesson', '/sokoban/?test=1&anim=real&level=0-1', async (p) => { await p.waitForTimeout(2200); }],
].filter(([n]) => !SCREENS.length || SCREENS.includes(n));

const audit = () => {
  const out = [];
  const W = innerWidth, H = innerHeight;
  for (const el of document.querySelectorAll('button, [role="button"], a, [role="tab"]')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const name = (el.getAttribute('aria-label') || el.textContent || el.className).toString().trim().slice(0, 24);
    if (r.width < 44 || r.height < 44) out.push(`small ${Math.round(r.width)}x${Math.round(r.height)} ${name}`);
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push(`clip [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}] ${name}`);
  }
  for (const el of document.querySelectorAll('#app *, .xg-modal *')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!t) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const fs = parseFloat(cs.fontSize);
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    if (fs < 13) out.push(`font ${fs}px "${t.slice(0, 16)}"`);
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible') out.push(`trunc "${t.slice(0, 16)}"`);
  }
  if (document.documentElement.scrollWidth > W + 1) out.push(`hscroll ${document.documentElement.scrollWidth}`);
  return out;
};

process.on('unhandledRejection', () => {});
const browser = await webkit.launch();
try {
  for (const d of DEVICES) {
    const context = await browser.newContext({ ...d.ctx, locale: 'zh-CN' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    for (const [name, url, act] of S) {
      await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'load' });
      await ready(page);
      await page.waitForTimeout(400);
      try { await act(page); } catch (e) { errors.push(`${name}: ${e.message}`); }
      const dir = path.join(OUT, d.name);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${name}.png`) });
      const issues = await page.evaluate(audit).catch((e) => [String(e)]);
      console.log(`${d.name}/${name}${issues.length ? '  ' + [...new Set(issues)].slice(0, 12).join(' | ') : ''}`);
    }
    if (errors.length) console.log('ERRORS', d.name, errors.slice(0, 10));
    await context.close();
  }
} finally {
  await browser.close();
}
