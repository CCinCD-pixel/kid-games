#!/usr/bin/env node
// Screenshot any 陆战棋 screen by route (dev server on PORT, WebKit, iPad 9 viewports).
//   node tests/military-chess/screens.mjs '<name>=<route json>' [...] [--port=5303] [--only=portrait|landscape]
//        [--wait=ms] [--save=<json patch for the save>] [--js=<expr after the route>] [--after=ms]
// e.g. 'academy={"name":"academy"}' 'l11={"name":"item","id":"L1-1"}'
// One browser, always closed; pages load the kit → auto-muted under automation.
// Shots → ~/kid-games-work/shots/military-chess/<project>/<name>.png
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5303');
const ONLY = opt('only', '');
const WAIT = Number(opt('wait', '1200'));
const SAVE = opt('save', '');
const JS = opt('js', '');
const AFTER = Number(opt('after', '400'));
const OUT = path.join(os.homedir(), 'kid-games-work/shots/military-chess');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const jobs = args.filter((a) => !a.startsWith('--')).map((a) => { const i = a.indexOf('='); return { name: a.slice(0, i), route: JSON.parse(a.slice(i + 1)) }; });
const projects = [
  { name: 'portrait', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
  { name: 'landscape', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
].filter((p) => !ONLY || p.name.startsWith(ONLY));
const browser = await webkit.launch();
try {
  for (const p of projects) {
    const context = await browser.newContext({ ...p.ctx, locale: 'zh-CN' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    for (const j of jobs) {
      await page.goto(`http://localhost:${PORT}/military-chess/?test=1`, { waitUntil: 'load' });
      await page.waitForSelector('#app[data-ready]', { timeout: 15000 }).catch(() => {});
      if (SAVE) await page.evaluate((patch) => { const s = window.__mc.app.save; const deep = (t, o) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object' && !Array.isArray(v) && t[k]) deep(t[k], v); else t[k] = v; } }; deep(s, JSON.parse(patch)); }, SAVE);
      await page.evaluate((r) => window.__mc.app.go(r), j.route);
      await page.waitForTimeout(WAIT);
      if (JS) { await page.evaluate(JS).catch((e) => errors.push('js: ' + e.message)); await page.waitForTimeout(AFTER); }
      const dir = path.join(OUT, p.name);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${j.name}.png`), scale: 'css' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
      console.log(`${p.name}/${j.name}.png${overflow ? '  (OVERFLOW)' : ''}`);
    }
    if (errors.length) console.log('ERRORS', p.name, errors.slice(0, 12));
    await context.close();
  }
} finally {
  await browser.close();
}
