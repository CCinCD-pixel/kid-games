#!/usr/bin/env node
// QA r3 fix screenshots (星港搬运工): landscape opening bubble clear of the moon, cert plate/ribbon tag,
// chapter-0 reward row captions, order cards with size bars, hint count on the result card.
// WebKit, iPad 9 sizes, DPR 2.
//   node tests/sokoban/fix-r3-shots.mjs [--port=5301] [--only=portrait|landscape] [--steps=a,b]
// Shots → ~/kid-games-work/shots/sokoban/fix-r3/<project>/<name>.png
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
const OUT = path.join(os.homedir(), 'kid-games-work/shots/sokoban/fix-r3');
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
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await page.goto(`${BASE}?${q}`);
      await page.waitForSelector('#app[data-ready]');
    };
    if (want('opening')) {
      await page.goto(BASE);
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await page.goto(BASE);
      await page.click('.kit-start__go', { timeout: 10000 });
      await page.waitForSelector('.sok-opening', { timeout: 8000 });
      await page.waitForTimeout(4000);
      await shot('01-opening-4000');
      report[`${p.name}:strip`] = await page.evaluate(() => {
        const r = document.querySelector('.sok-comp')?.getBoundingClientRect();
        return r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null;
      });
    }
    if (want('cert')) {
      await fresh('test=1&screen=map');
      await page.evaluate(() => window.__sok.unlockAll({ except: ['cert-1', 'cert-2'] }));
      await page.goto(`${BASE}?test=1&level=cert-1`);
      await page.waitForSelector('#app[data-ready]');
      await idle();
      await page.waitForTimeout(400);
      await shot('10-cert-plate');
      report[`${p.name}:plate`] = await page.evaluate(() => document.querySelector('.sok-plate__title')?.textContent);
      await page.evaluate((l) => window.__sok.replay(l), ref('cert-1'));
      await page.waitForSelector('[data-testid=result]', { timeout: 15000 });
      await page.waitForTimeout(700);
      await shot('11-cert-result');
      report[`${p.name}:certRibbon`] = await page.evaluate(() => document.querySelector('[data-testid=result] .xg-ribbon')?.textContent);
    }
    if (want('hint')) {
      await fresh('test=1&level=2-5');
      await idle();
      for (let i = 0; i < 3; i += 1) {
        await page.click('[data-testid=hint]');
        await page.waitForTimeout(800);
      }
      await page.waitForTimeout(600);
      await shot('20-hint-ring');
      await idle();
      await page.evaluate((l) => window.__sok.replay(l), ref('2-5'));
      await page.waitForSelector('[data-testid=result]', { timeout: 15000 });
      await page.waitForTimeout(700);
      await shot('21-hint-result');
      await page.waitForTimeout(1800);
      await shot('22-hint-result-settled');
      report[`${p.name}:hintStats`] = await page.evaluate(() => [...document.querySelectorAll('.sok-stat')].map((e) => e.textContent?.replace(/\s+/g, '')));
    }
    if (want('chapter')) {
      await fresh('test=1&screen=map');
      await page.waitForTimeout(500);
      void page.evaluate(() => { void window.__sok.overlay('chapter', 0); });
      await page.waitForSelector('[data-testid=chapter-done]');
      await page.waitForTimeout(1300);
      await shot('30-chapter0-card');
      report[`${p.name}:chapterCaps`] = await page.evaluate(() => [...document.querySelectorAll('.sok-done figcaption')].map((e) => e.textContent));
    }
    if (want('orders')) {
      await fresh('test=1&screen=map');
      await page.evaluate(() => window.__sok.unlockAll({ rewards: true }));
      await page.goto(`${BASE}?test=1&screen=map`);
      await page.waitForSelector('.sok-map', { timeout: 10000 });
      void page.evaluate(() => { void window.__sok.overlay('orders'); });
      await page.waitForSelector('[data-testid=order-T2]');
      await page.waitForTimeout(800);
      await shot('40-orders');
      report[`${p.name}:sizeBars`] = await page.evaluate(() => [...document.querySelectorAll('[data-testid=order-size]')].map((e) => e.querySelectorAll('.is-on').length));
    }
    report[`${p.name}:scroll`] = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth);
    report[`${p.name}:errors`] = errors;
    await context.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
