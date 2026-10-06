#!/usr/bin/env node
// Screenshot driver for 星晶消消乐 (dev server, WebKit, iPad 9 viewports, DPR 2).
//   node tests/emoji-match/shoot.mjs <name>=<url>[|<js step>|<js step>…] … [--port=5305] [--only=portrait|landscape] [--wait=ms]
// A js step (or "!<file>" holding js) is evaluated in the page (await-able); "@<ms>" waits; "#<name>" takes an intermediate shot.
// One browser at a time, always closed. Shots → ~/kid-games-work/shots/emoji-match/<project>/<name>.png
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5305');
const ONLY = opt('only', '');
const WAIT = Number(opt('wait', '1500'));
const OUT = path.join(os.homedir(), 'kid-games-work/shots/emoji-match');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const jobs = args.filter((a) => !a.startsWith('--')).map((a) => { const i = a.indexOf('='); const [url, ...steps] = a.slice(i + 1).split('|'); return { name: a.slice(0, i), url, steps }; });
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
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const dir = path.join(OUT, p.name);
    fs.mkdirSync(dir, { recursive: true });
    for (const j of jobs) {
      await page.goto(`http://localhost:${PORT}${j.url}`, { waitUntil: 'load' });
      await page.waitForSelector('#app[data-ready]', { timeout: 20000 }).catch(() => errors.push('no data-ready'));
      await page.waitForTimeout(WAIT);
      for (const s of j.steps) {
        if (s.startsWith('@')) { await page.waitForTimeout(Number(s.slice(1))); continue; }
        if (s.startsWith('#')) { await page.screenshot({ path: path.join(dir, `${j.name}-${s.slice(1)}.png`) }); console.log(`${p.name}/${j.name}-${s.slice(1)}.png`); continue; }
        const code = s.startsWith('!') ? fs.readFileSync(s.slice(1), 'utf8') : s;
        const r = await page.evaluate(`(async () => { ${code} })()`).catch((e) => { errors.push('js: ' + e.message); return null; });
        if (r !== undefined && r !== null) console.log('  →', JSON.stringify(r).slice(0, 300));
      }
      await page.screenshot({ path: path.join(dir, `${j.name}.png`) });
      console.log(`${p.name}/${j.name}.png`);
    }
    if (errors.length) console.log('ERRORS', p.name, errors.slice(0, 12));
    await context.close();
  }
} finally {
  await browser.close();
}
