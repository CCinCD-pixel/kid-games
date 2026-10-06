#!/usr/bin/env node
// Play part of a ladder game against a robot (real Worker AI) and screenshot it.
//   node tests/military-chess/play.mjs <name> --mode=fan|ming|an --level=1..4 --plies=20 [--port=5303] [--only=portrait|landscape]
//        [--notes] (暗棋 参谋笔记 on) [--fast=0] [--js=<expr after>]
// Shots → ~/kid-games-work/shots/military-chess/<project>/<name>.png ; one browser, always closed.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const NAME = args.find((a) => !a.startsWith('--')) ?? 'play';
const PORT = opt('port', '5303');
const MODE = opt('mode', 'fan');
const LEVEL = Number(opt('level', '1'));
const PLIES = Number(opt('plies', '20'));
const ONLY = opt('only', '');
const FAST = opt('fast', '1');
const JS = opt('js', '');
const OUT = path.join(os.homedir(), 'kid-games-work/shots/military-chess');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
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
    await page.goto(`http://localhost:${PORT}/military-chess/?test=1&fast=${FAST}`, { waitUntil: 'load' });
    await page.waitForSelector('#app[data-ready]');
    await page.evaluate(() => { const s = window.__mc.app.save; s.settings.unlockAll = true; s.settings.coachAlerts = 'off'; s.firstRun.fanCoach = ['rail', 'camp', 'hq', 'mine', 'flag']; });
    await page.evaluate(([m]) => window.__mc.app.go({ name: 'ladder', mode: m }), [MODE]);
    await page.waitForTimeout(300);
    await page.locator(`[data-testid="opp-${LEVEL}"]`).click();
    await page.locator('[data-testid="ladder-start"]').click();
    if (MODE !== 'fan') {
      await page.waitForFunction(() => window.__mc.screen() === 'deploy');
      await page.waitForTimeout(300);
      await page.locator('[data-testid="dep-go"]').click();
    }
    await page.waitForFunction(() => window.__mc.screen() === 'match');
    const t0 = Date.now();
    let plies = 0;
    while (plies < PLIES && Date.now() - t0 < 120_000) {
      const ph = await page.evaluate(() => window.__mc.phase());
      if (ph === 'ended' || (await page.evaluate(() => window.__mc.screen())) !== 'match') break;
      if (ph === 'idle') {
        const n = await page.evaluate(() => window.__mc.autoMove('play'));
        if (n) plies++;
      }
      await page.waitForTimeout(120);
    }
    await page.waitForFunction(() => window.__mc.screen() !== 'match' || window.__mc.phase() === 'idle' || window.__mc.phase() === 'ended', null, { timeout: 15000 }).catch(() => {});
    if (JS) { await page.evaluate(JS).catch((e) => errors.push('js: ' + e.message)); await page.waitForTimeout(500); }
    const dir = path.join(OUT, p.name);
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${NAME}.png`), scale: 'css' });
    const info = await page.evaluate(() => ({ screen: window.__mc.screen(), notes: window.__mc.ctx()?.notes?.length ?? null, timeouts: window.__mcAi?.timeouts ?? null }));
    console.log(`${p.name}/${NAME}.png`, JSON.stringify(info));
    if (errors.length) console.log('ERRORS', p.name, errors.slice(0, 12));
    await context.close();
  }
} finally {
  await browser.close();
}
