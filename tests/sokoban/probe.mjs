#!/usr/bin/env node
// Scripted QA probe for 星港搬运工 (dev server, WebKit, iPad 9 viewports). Runs a step file and
// takes screenshots where it says so — for looking at states the spec tests do not photograph.
//
//   node tests/sokoban/probe.mjs <steps.mjs> [--only=portrait|landscape] [--port=5301] [--out=<dir>]
//
// <steps.mjs> default-exports `async (t) => { … }` where `t` has:
//   t.page                      the Playwright page
//   t.go(query)                 open /sokoban/?<query> and wait for #app[data-ready] (+ __sok when test=1)
//   t.shot(name, clip?)         screenshot → <out>/<project>/<name>.png (clip in CSS px)
//   t.tapCell(c) / t.tapCrate(s) / t.tap(x, y)   real touch taps (then waits until idle)
//   t.idle() / t.wait(ms) / t.state() / t.eval(fn, arg)
//   t.project                   'portrait-810x1080' | 'landscape-1080x810'
// One browser, always closed; refuses to start below 25 % free memory. Pages are silent (kit/automute).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node tests/sokoban/probe.mjs <steps.mjs> [--only=portrait|landscape]');
  process.exit(2);
}
const PORT = opt('port', '5301');
const ONLY = opt('only', '');
const OUT = opt('out', path.join(os.homedir(), 'kid-games-work/shots/sokoban/probe'));
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) {
  console.error(`memory free ${free}% < 25% — not starting a browser`);
  process.exit(2);
}
const steps = (await import(pathToFileURL(path.resolve(file)).href)).default;
const projects = [
  { name: 'portrait-810x1080', viewport: { width: 810, height: 1080 } },
  { name: 'landscape-1080x810', viewport: { width: 1080, height: 810 } },
].filter((p) => !ONLY || p.name.startsWith(ONLY));

const browser = await webkit.launch();
let failed = false;
try {
  for (const p of projects) {
    const context = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: p.viewport, locale: 'zh-CN' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    const dir = path.join(OUT, p.name);
    fs.mkdirSync(dir, { recursive: true });
    const idle = () => page.waitForFunction(() => {
      const s = window.__sok?.state?.();
      return !s || !s.busy;
    }, null, { timeout: 15_000 });
    const t = {
      page,
      project: p.name,
      async go(query) {
        await page.goto(`http://localhost:${PORT}/sokoban/?${query}`, { waitUntil: 'load' });
        await page.waitForSelector('#app[data-ready]', { timeout: 15_000 });
        if (/(^|&)test=1/.test(query)) await page.waitForFunction(() => !!window.__sok, null, { timeout: 15_000 });
      },
      async shot(name, clip) {
        await page.screenshot({ path: path.join(dir, `${name}.png`), ...(clip ? { clip } : {}) });
        console.log(`  shot ${p.name}/${name}.png`);
      },
      async tap(x, y) {
        await page.touchscreen.tap(x, y);
      },
      async tapCell(c) {
        const q = await page.evaluate((cell) => window.__sok.cellCenter(cell), c);
        await page.touchscreen.tap(q.x, q.y);
        await idle();
      },
      async tapCrate(s) {
        const q = await page.evaluate((slot) => window.__sok.crateCenter(slot), s);
        await page.touchscreen.tap(q.x, q.y);
        await idle();
      },
      idle,
      wait: (ms) => page.waitForTimeout(ms),
      state: () => page.evaluate(() => window.__sok?.state?.() ?? null),
      eval: (fn, arg) => page.evaluate(fn, arg),
    };
    console.log(`[${p.name}]`);
    try {
      await steps(t);
    } catch (e) {
      failed = true;
      console.log(`  FAILED: ${e.message}`);
    }
    if (errors.length) console.log(`  console (${errors.length}):\n   ${errors.slice(0, 12).join('\n   ')}`);
    await context.close();
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
