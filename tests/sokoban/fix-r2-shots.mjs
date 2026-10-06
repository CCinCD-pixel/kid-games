#!/usr/bin/env node
// QA r2 fix screenshots (星港搬运工): result-card sentences, portrait launch caption, hangar items +
// skills, order → level delivery beat, finale panorama, 维修中 node. WebKit, iPad 9 sizes, DPR 2.
//   node tests/sokoban/fix-r2-shots.mjs [--port=5301] [--only=portrait|landscape] [--steps=a,b]
// Shots → ~/kid-games-work/shots/sokoban/fix-r2/<project>/<name>.png
// Pages load the kit → auto-muted under automation (kit/automute.ts); nothing is ever audible.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5301');
const ONLY = opt('only', '');
const STEPS = opt('steps', '');
const BASE = `http://localhost:${PORT}/sokoban/`;
const OUT = path.join(os.homedir(), 'kid-games-work/shots/sokoban/fix-r2');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const LEVELS = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sokoban/levels.json'), 'utf8')).levels;
const ref = (id) => LEVELS.find((l) => l.id === id).ref;
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const projects = [
  { name: 'portrait-810x1080', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
  { name: 'landscape-1080x810', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
].filter((p) => !ONLY || p.name.startsWith(ONLY));
const want = (s) => !STEPS || STEPS.split(',').includes(s);
const report = {};
const browser = await webkit.launch();
try {
  for (const p of projects) {
    const dir = path.join(OUT, p.name);
    fs.mkdirSync(dir, { recursive: true });
    const context = await browser.newContext({ ...p.ctx, locale: 'zh-CN' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const shot = (n) => page.screenshot({ path: path.join(dir, `${n}.png`) });
    const idle = () => page.waitForFunction(() => { const s = window.__sok?.state?.(); return !!s && !s.busy; }, null, { timeout: 15000 });
    const fresh = async (q) => {
      await page.goto(BASE);
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE}?${q}`);
      await page.waitForSelector('#app[data-ready]');
    };
    if (want('result')) {
      await fresh('test=1&level=0-1');
      await idle();
      await page.evaluate((l) => window.__sok.replay(l), ref('0-1'));
      await page.waitForSelector('[data-testid=result]');
      await page.waitForTimeout(700);
      await shot('10-result-0-1');
      report[`${p.name}:stat`] = await page.evaluate(() => [...document.querySelectorAll('.sok-stat')].map((e) => [e.textContent, getComputedStyle(e.querySelector('span')).fontSize]));
    }
    if (want('launch')) {
      await fresh('test=1&anim=real&level=0-1');
      await idle();
      const l = ref('0-1');
      await page.evaluate((x) => window.__sok.replay(x), l.slice(0, -1));
      await idle();
      void page.evaluate((x) => window.__sok.replay(x), l.slice(-1));
      await page.waitForSelector('.sok-launch', { timeout: 8000 });
      for (const ms of [500, 1000]) {
        await page.waitForTimeout(ms === 500 ? 500 : 500);
        await shot(`20-launch-${ms}`);
      }
      report[`${p.name}:stripDuringFlight`] = await page.evaluate(() => getComputedStyle(document.querySelector('.sok-comp')).opacity);
      await page.waitForTimeout(1800);
      await shot('21-launch-arrive');
    }
    if (want('hangar')) {
      await fresh('test=1&screen=map');
      await page.evaluate(() => window.__sok.unlockAll({ rewards: true }));
      await page.goto(`${BASE}?test=1&screen=hangar`);
      await page.waitForSelector('.sok-hangar');
      await page.waitForTimeout(900);
      await shot('30-hangar-items');
      await page.getByText('本领', { exact: true }).first().click();
      await page.waitForTimeout(500);
      await shot('31-hangar-skills');
      report[`${p.name}:robotPx`] = await page.evaluate(() => Math.round(document.querySelector('.sok-hangar__robot').getBoundingClientRect().height));
      report[`${p.name}:scroll`] = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight);
    }
    if (want('order')) {
      // real timings: no test mode (the start gate is tapped)
      await page.goto(`${BASE}?test=1&screen=map`);
      await page.waitForSelector('#app[data-ready]');
      await page.evaluate(() => window.__sok.unlockAll({ rewards: true }));
      await page.goto(`${BASE}?screen=map`);
      await page.locator('.kit-start__go').click({ timeout: 8000 }).catch(() => {});
      await page.waitForSelector('.sok-map', { timeout: 10000 });
      await page.waitForTimeout(800);
      await page.evaluate(() => { void window.__sok.overlay('orders'); });
      await page.waitForSelector('[data-testid=order-T2]');
      await page.waitForTimeout(600);
      const t0 = Date.now();
      await page.click('[data-testid=order-T2]');
      await page.waitForSelector('[data-testid=deliver]');
      await page.waitForTimeout(450);
      await shot('40-deliver-belt');
      await page.waitForSelector('.sok-deliver.is-open', { timeout: 5000 });
      await page.waitForTimeout(280);
      await shot('41-deliver-assemble');
      await page.waitForSelector('.sok-play', { timeout: 8000 });
      report[`${p.name}:orderToPlayMs`] = Date.now() - t0;
      await page.waitForTimeout(500);
      await shot('42-deliver-play');
    }
    if (want('finale')) {
      await fresh('test=1&screen=map');
      await page.evaluate(() => window.__sok.unlockAll({ except: ['4-7'], rewards: true }));
      await page.goto(`${BASE}?test=1&anim=real&level=4-7`);
      await page.waitForSelector('#app[data-ready]');
      await idle();
      await page.evaluate((l) => window.__sok.replay(l), ref('4-7'));
      await page.waitForSelector('[data-testid=result]', { timeout: 20000 });
      await page.waitForTimeout(600);
      await page.click('[data-testid=result] [data-act="next"]');
      await page.waitForSelector('[data-testid=chapter-done]', { timeout: 10000 });
      await page.click('[data-testid=chapter-done] [data-act="ok"]');
      await page.waitForSelector('[data-testid=finale]', { timeout: 10000 });
      for (const ms of [2400, 3600, 4300]) {
        await page.waitForTimeout(ms === 2400 ? 2400 : ms === 3600 ? 1200 : 700);
        await shot(`50-finale-${ms}`);
      }
      await page.waitForTimeout(2200);
      await shot('51-finale-end');
    }
    if (want('broken')) {
      await fresh('test=1&screen=map');
      await page.evaluate(() => { window.__sok.unlockAll({ except: ['0-2', '0-3', '0-4'] }); window.__sok.breakLevel('0-2'); });
      await page.waitForTimeout(900);
      await shot('60-map-broken-node');
    }
    report[`${p.name}:errors`] = errors.filter((e) => !/维修中|failed to start/.test(e));
    await context.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
