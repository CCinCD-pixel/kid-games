#!/usr/bin/env node
// QA r1 fix screenshots (星港搬运工): undo ring, stale caption, landscape captions, quiz bar, hangar
// items, order cards, map stars, retro livery, 0-1 ghost-hand timing. WebKit, iPad 9 sizes, DPR 2.
//   node tests/sokoban/fix-r1-shots.mjs [--port=5301] [--only=portrait|landscape]
// Shots → ~/kid-games-work/shots/sokoban/fix-r1/<project>/<name>.png ; timings → timings.json
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
const OUT = path.join(os.homedir(), 'kid-games-work/shots/sokoban/fix-r1');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const projects = [
  { name: 'portrait-810x1080', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
  { name: 'landscape-1080x810', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
].filter((p) => !ONLY || p.name.startsWith(ONLY));
const want = (s) => !STEPS || STEPS.split(',').includes(s);
const timings = {};
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
    const shot = (n, clip) => page.screenshot({ path: path.join(dir, `${n}.png`), ...(clip ? { clip } : {}) });
    const idle = () => page.waitForFunction(() => { const s = window.__sok?.state?.(); return !!s && !s.busy; }, null, { timeout: 10000 });
    const fresh = async (q) => {
      await page.goto(BASE);
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${BASE}?test=1&${q}`);
      await page.waitForSelector('#app[data-ready]');
    };
    if (want('undo')) {
      // 0-3: the tempting push → ✕ + undo pulse rings; then undo → no stale caption
      await fresh('level=0-3');
      await idle();
      const c = await page.evaluate(() => window.__sok.crateCenter(0));
      await page.touchscreen.tap(c.x, c.y);
      await idle();
      await page.waitForSelector('[data-testid=undo].is-pulse');
      const ub = await page.locator('[data-testid=undo]').boundingBox();
      const clip = { x: Math.max(0, ub.x - 30), y: Math.max(0, ub.y - 30), width: ub.width + 60, height: ub.height + 60 };
      for (const t of [150, 450, 750]) { await page.waitForTimeout(t === 150 ? 150 : 300); await shot(`undo-ring-${t}`, clip); }
      await shot('03-deadlock');
      await page.waitForTimeout(400);
      await page.evaluate(() => document.querySelector('[data-testid=undo]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
      await idle();
      await page.waitForTimeout(500);
      await shot('03-after-undo');
      timings[`${p.name}:captionAfterUndo`] = await page.evaluate(() => document.querySelector('.sok-comp')?.classList.contains('is-on') ? document.querySelector('.sok-comp__text')?.textContent : '(hidden)');
    }
    if (want('captions')) {
      await fresh('level=0-1');
      await page.waitForTimeout(900);
      await shot('01-chapter-line');
      await page.goto(`${BASE}?test=1&level=3-3`);
      await page.waitForSelector('.sok-quizbar');
      await page.waitForTimeout(900);
      await shot('33-quiz');
      // 2-5: undo twice → redo appears → 撤多了，可以点重做
      await page.goto(`${BASE}?test=1&level=2-5`);
      await idle();
      const ref = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content/sokoban/levels.json'), 'utf8')).levels.find((l) => l.id === '2-5').ref;
      const cut = [...ref].reduce((a, ch, i) => (a.n < 2 && ch !== ch.toLowerCase() ? { n: a.n + 1, i } : a), { n: 0, i: 0 }).i;
      await page.evaluate(async (lurd) => { await window.__sok.replay(lurd); }, ref.slice(0, cut + 1));
      await idle();
      for (let i = 0; i < 2; i += 1) {
        await page.evaluate(() => document.querySelector('[data-testid=undo]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
        await idle();
      }
      await page.waitForTimeout(900);
      await shot('25-after-undo');
    }
    if (want('meta')) {
      await fresh('screen=map');
      await page.waitForSelector('.sok-map');
      await page.evaluate(() => window.__sok.unlockAll({ except: ['4-5', '4-6', '4-7', '4-8'], rewards: true }));
      await page.evaluate(() => window.__sok.map(4));
      await page.waitForTimeout(900);
      await shot('map-tab-4');
      await page.evaluate(() => window.__sok.map(1));
      await page.waitForTimeout(900);
      await shot('map-tab-1');
      await page.evaluate(() => { void window.__sok.overlay('orders'); });
      await page.waitForTimeout(1200);
      await shot('orders');
      await page.goto(`${BASE}?test=1&screen=hangar`);
      await page.waitForSelector('.sok-hangar');
      await page.waitForTimeout(1000);
      await shot('hangar-items');
      await page.getByText('本领', { exact: true }).first().click().catch((e) => errors.push('tab: ' + e.message));
      await page.waitForTimeout(600);
      await shot('hangar-skills');
      timings[`${p.name}:skillButtons`] = await page.evaluate(() => [...document.querySelectorAll('.sok-skill__name')].map((b) => Math.round(b.getBoundingClientRect().height)));
      // retro livery on a board (all classic levels done → 复古木箱涂装 equipped)
      await page.evaluate(() => window.__sok.unlockAll({ rewards: true }));
      const eq = await page.evaluate(() => window.__sok.save().cosmetics);
      timings[`${p.name}:cosmetics`] = eq;
      // equip 复古木箱涂装 (the classic milestone) and look at it next to the kraft crates
      await page.goto(`${BASE}?test=1&screen=map`);
      await page.waitForSelector('.sok-map');
      await page.evaluate(() => {
        const k = 'kg:v1:sokoban';
        const d = JSON.parse(localStorage.getItem(k));
        (d.data ?? d).cosmetics.equipped.paint = 'retro';
        localStorage.setItem(k, JSON.stringify(d));
      });
      await page.goto(`${BASE}?test=1&level=C10`);
      await idle();
      await page.waitForTimeout(500);
      await shot('C10-livery');
    }
    if (want('ghost')) {
      // fresh first run, real timers (no test=1): gate → opening (tap skips) → 0-1; when does the hand come?
      await page.goto(BASE);
      await page.evaluate(() => localStorage.clear());
      await page.goto(BASE);
      await page.waitForSelector('.kit-start__go');
      await page.click('.kit-start__go');
      await page.waitForSelector('.sok-opening');
      await page.waitForTimeout(800);
      await page.mouse.click(40, 400);
      await page.waitForFunction(() => document.getElementById('app')?.dataset.screen === 'play');
      const t0 = Date.now();
      let first = -1;
      for (let i = 0; i < 50 && first < 0; i += 1) {
        const on = await page.evaluate(() => { const h = document.querySelector('.xg-ghost-hand'); return !!h && getComputedStyle(h).display !== 'none' && getComputedStyle(h).opacity !== '0' && h.getBoundingClientRect().width > 0; });
        if (on) first = Date.now() - t0;
        else await page.waitForTimeout(100);
      }
      timings[`${p.name}:ghostHandMs`] = first;
      await shot('01-ghost-hand');
      await page.waitForTimeout(2500);
      await shot('01-footprint-after-demo');
    }
    timings[`${p.name}:errors`] = errors;
    await context.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(timings, null, 1));
console.log(JSON.stringify(timings, null, 1));
