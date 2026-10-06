#!/usr/bin/env node
// Screenshot helper for 陆战棋 (dev server on PORT, WebKit, iPad 9 viewports, DPR 2).
//   node tests/military-chess/shoot.mjs <name>=<path+query> [...] [--port=5303] [--only=portrait|landscape]
//        [--wait=ms] [--js=<expr run before the shot>] [--after=ms] [--dpr] (keep device pixels; default css-scale shots)
// One browser, always closed. Pages load the kit → auto-muted under automation (kit/automute.ts).
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
const WAIT = Number(opt('wait', '900'));
const JS = opt('js', '');
const AFTER = Number(opt('after', '300'));
const DPR = args.includes('--dpr');
const OUT = path.join(os.homedir(), 'kid-games-work/shots/military-chess');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const jobs = args.filter((a) => !a.startsWith('--')).map((a) => { const i = a.indexOf('='); return { name: a.slice(0, i), url: a.slice(i + 1) }; });
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
      await page.goto(`http://localhost:${PORT}${j.url}`, { waitUntil: 'load' });
      await page.waitForSelector('#app[data-ready]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(WAIT);
      if (JS) { await page.evaluate(JS).catch((e) => errors.push('js: ' + e.message)); await page.waitForTimeout(AFTER); }
      const dir = path.join(OUT, p.name);
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${j.name}.png`), scale: DPR ? 'device' : 'css' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
      console.log(`${p.name}/${j.name}.png${overflow ? '  (OVERFLOW)' : ''}`);
    }
    if (errors.length) console.log('ERRORS', p.name, errors.slice(0, 12));
    await context.close();
  }
} finally {
  await browser.close();
}
