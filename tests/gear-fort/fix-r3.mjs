#!/usr/bin/env node
// 机关守城 · QA r3 fix tour (WebKit, iPad 9 sizes, both orientations): the 1-1 collect demo hand on the resting bag,
// the result's 鲁班的附加题 (outcome + condition), the 复盘 mini sand table (wall, his machines, breach run), the map's
// 家庭推演 card copy, the landscape 图谱 grid, the 1-11 Boss bar + 鲁班 bubble, portrait story framing, the 驿站.
//   node tests/gear-fort/fix-r3.mjs [--port=5311] [--only=portrait|landscape] [--steps=collect,result,…]
// One browser, always closed. Shots → ~/kid-games-work/shots/gear-fort/fix-r3/<project>/<name>.png. Kit pages auto-mute.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5311'); const ONLY = opt('only', ''); const STEPS = opt('steps', '').split(',').filter(Boolean);
const OUT = path.join(os.homedir(), 'kid-games-work/shots/gear-fort/fix-r3');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const BASE = `http://localhost:${PORT}/gear-fort/?test=1`;
const projects = [
  { name: 'portrait', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
  { name: 'landscape', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
].filter((p) => !ONLY || p.name.startsWith(ONLY));
const lv = () => ({ best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' });
const V1 = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10', '1-11'];
const save = (ids, extra = {}) => JSON.stringify({ v: 1, updatedAt: Date.now(), data: { levels: Object.fromEntries(ids.map((id) => [id, lv()])), current: extra.current || '1-1', story: ['prologue', 'dock'], ...extra } });
const want = (s) => !STEPS.length || STEPS.includes(s);
const results = {};

async function open(page, s) {
  await page.goto(BASE);
  await page.evaluate((x) => { localStorage.clear(); indexedDB.deleteDatabase('kg-gear-fort'); if (x) localStorage.setItem('kg:v1:gear-fort', x); }, s);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
}
const shot = async (page, dir, name) => { fs.mkdirSync(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, name + '.png') }); };
const boost = (page) => page.evaluate(() => { const g = window.__gf; g.S.grain = 5000; for (const k of Object.keys(g.S.cdReady)) g.S.cdReady[k] = 0; });

const browser = await webkit.launch();
try {
  for (const p of projects) {
    const dir = path.join(OUT, p.name); const R = (results[p.name] = { errors: [] });
    const ctx = await browser.newContext(p.ctx); const page = await ctx.newPage();
    page.on('pageerror', (e) => R.errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') R.errors.push(m.text()); });
    const step = async (name, f) => { if (!want(name)) return; try { await f(); } catch (e) { R[name] = 'FAIL ' + String(e.message || e).slice(0, 200); } };

    await step('collect', async () => {
      await open(page, null); await page.waitForFunction(() => window.__gf, null, { timeout: 10000 }); await page.evaluate(() => window.__gf.skipHook());
      await page.waitForFunction(() => document.querySelector('.gf-hand')?.dataset.kind === 'drag', null, { timeout: 20000 });
      await page.evaluate(() => { window.__gf.place('shooter', 2, 1); window.__gf.setSpeed(3); });
      await page.waitForFunction(() => { const h = document.querySelector('.gf-hand'); return h && getComputedStyle(h).display === 'block' && h.dataset.kind === 'tap'; }, null, { timeout: 40000 });
      await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(1000); await shot(page, dir, '01-collect-hand');
      R.collect = await page.evaluate(() => { const g = window.__gf; const d = g.S.drops[0]; const b = d && g.stage.dropXY(g.S, d, performance.now()); const [x, y] = document.querySelector('.gf-hand').dataset.tip.split(',').map(Number); return b ? { dx: Math.round(x - b.x), dy: Math.round(y - b.y) } : 'no drop'; });
    });
    await step('result', async () => {
      await open(page, save(V1.slice(0, 4), { current: '1-5' }));
      await page.evaluate(() => window.__gfApp.win('1-5', 2)); await page.waitForTimeout(1800); await shot(page, dir, '02-result-2star');
    });
    await step('debrief', async () => {
      await open(page, save(['1-1', '1-2'], { current: '1-3' }));
      await page.evaluate(() => window.__gfApp.play('1-3', ['shooter', 'farm', 'wall'])); await page.waitForFunction(() => window.__gf?.S.tick > 20, null, { timeout: 15000 });
      await boost(page); await page.evaluate(() => { window.__gf.place('shooter', 0, 1); }); await page.waitForTimeout(120); await boost(page); await page.evaluate(() => window.__gf.place('farm', 1, 0));
      await page.evaluate(() => window.__gf.setSpeed(12));
      await page.waitForSelector('.gf-debrief', { timeout: 90000 }); await page.waitForTimeout(800); await shot(page, dir, '03-debrief');
      R.debrief = await page.locator('.gf-db__line').textContent();
    });
    await step('map', async () => { await open(page, save(V1, { current: '2-1' })); await page.waitForTimeout(900); await shot(page, dir, '04-map'); });
    await step('almanac', async () => {
      await open(page, save(V1, { current: '2-1', almanac: {} })); await page.locator('.gf-bigcard--alm').click(); await page.waitForTimeout(900); await shot(page, dir, '05-almanac');
    });
    await step('boss', async () => {
      await open(page, save(V1.slice(0, 10), { current: '1-11' }));
      await page.evaluate(() => window.__gfApp.play('1-11', ['shooter', 'farm', 'wall', 'lobber', 'spikes', 'strike'])); await page.waitForFunction(() => window.__gf?.S.tick > 20, null, { timeout: 15000 });
      for (let l = 0; l < 5; l++) { await boost(page); await page.evaluate((l) => window.__gf.place('lobber', l, 0), l); await page.waitForTimeout(90); }
      await page.evaluate(() => window.__gf.setSpeed(10)); await page.waitForFunction(() => window.__gf.S.tick > 1080, null, { timeout: 60000 });
      await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(1500); await shot(page, dir, '06-boss');
    });
    await step('story', async () => {
      await open(page, save(V1, { current: '2-1' }));
      page.evaluate(() => window.__gfApp.story('prologue')).catch(() => {});
      for (const t of [1500, 3000, 4500]) { await page.waitForTimeout(t === 1500 ? 1500 : 1500); await shot(page, dir, `07-prologue-${t}`); }
    });
    await step('inn', async () => {
      await open(page, save(V1, { current: '2-1' })); await page.evaluate(() => window.__gfApp.inn('1-11')); await page.waitForTimeout(1500); await shot(page, dir, '08-inn');
    });
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(results, null, 1));
