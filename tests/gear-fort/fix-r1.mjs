#!/usr/bin/env node
// 机关守城 · QA r1 fix tour (WebKit, iPad 9 sizes, both orientations): the 1-1 hook + pulse, the portrait HUD on a
// one-row tray, the "还差 N" card, 亮招/选牒 (fixed deck, own pick, Boss), 图谱 tabs (every tile on screen), the 复盘 with its
// third line, the pause speed segment, the learned tile, the map tabs, the idle-rAF map, a 2nd finger / cancelled drag.
//   node tests/gear-fort/fix-r1.mjs [--port=5311] [--only=portrait|landscape] [--steps=a,b]
// One browser, always closed. Shots → ~/kid-games-work/shots/gear-fort/fix-r1/<project>/<name>.png. Kit pages auto-mute.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5311'); const ONLY = opt('only', ''); const STEPS = opt('steps', '').split(',').filter(Boolean);
const OUT = path.join(os.homedir(), 'kid-games-work/shots/gear-fort/fix-r1');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const BASE = `http://localhost:${PORT}/gear-fort/?test=1`;
const projects = [
  { name: 'landscape', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
  { name: 'portrait', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
].filter((p) => !ONLY || p.name.startsWith(ONLY));
const lv = (n) => ({ best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' });
const save = (ids, extra = {}) => JSON.stringify({ v: 1, updatedAt: Date.now(), data: { levels: Object.fromEntries(ids.map((id) => [id, lv(id)])), current: extra.current || '1-1', ...extra } });
const V1 = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10', '1-11'];
const V2 = ['2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8', '2-9', '2-10', '2-11'];
const results = {}; const fail = (k, v) => { (results.fail ||= []).push(`${k}: ${JSON.stringify(v)}`); };
const want = (s) => !STEPS.length || STEPS.includes(s);

async function open(page, s, q = '') {
  await page.goto(BASE);
  await page.evaluate((x) => { localStorage.clear(); indexedDB.deleteDatabase('kg-gear-fort'); if (x) localStorage.setItem('kg:v1:gear-fort', x); }, s);
  await page.goto(BASE + q, { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
}
const shot = async (page, dir, name) => { fs.mkdirSync(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, name + '.png') }); };
const inView = (page, sel) => page.evaluate((s) => { const W = innerWidth, H = innerHeight; return [...document.querySelectorAll(s)].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1); }).length; }, sel);
const rafRate = (page, ms = 1500) => page.evaluate((T) => new Promise((res) => { let n = 0; const o = window.requestAnimationFrame; window.requestAnimationFrame = (f) => { n++; return o.call(window, f); }; setTimeout(() => { window.requestAnimationFrame = o; res(Math.round(n * 1000 / T)); }, T); }), ms);

const browser = await webkit.launch();
try {
  for (const p of projects) {
    const dir = path.join(OUT, p.name); const R = (results[p.name] = {});
    const ctx = await browser.newContext(p.ctx); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const step = async (name, f) => { if (!want(name)) return; try { await f(); } catch (e) { fail('step ' + name, String(e.message || e).slice(0, 160)); } };
    await step('hook', async () => { // first visit → 1-1 with the hook, then the hand, then the pulse after two idle demos
      await open(page, null);
      await page.waitForFunction(() => (window).__gf, null, { timeout: 8000 });
      await page.waitForTimeout(250); await shot(page, dir, 'a01-hook-0.3s');
      await page.waitForTimeout(1300); await shot(page, dir, 'a02-hook-1.6s');
      await page.waitForTimeout(1050); await shot(page, dir, 'a03-hook-2.6s');
      R.hookTick = await page.evaluate(() => (window).__gf.S.tick);
      await page.waitForFunction(() => !(window).__gf.hooking, null, { timeout: 4000 });
      await page.waitForTimeout(2600); await shot(page, dir, 'a04-hand-5s');
      R.handShown = await page.evaluate(() => getComputedStyle(document.querySelector('.gf-hand')).display);
      await page.evaluate(() => (window).__gf.setSpeed(3)); await page.waitForFunction(() => document.querySelector('.gf-card.is-pulse'), null, { timeout: 15000 }).catch(() => fail('pulse', 'no .is-pulse'));
      await page.evaluate(() => (window).__gf.setSpeed(1)); await page.waitForTimeout(400); await shot(page, dir, 'a05-pulse');
      R.pulseHover = await page.evaluate(() => JSON.stringify((window).__gf.stage.hover));
      // a second finger lifting elsewhere must not drop the first finger's card; a cancel drops nothing
      R.twoFinger = await page.evaluate(async () => {
        const g = (window).__gf; const card = document.querySelector('.gf-card[data-card="shooter"]'); const b = card.getBoundingClientRect(); const c = g.cell(2, 4);
        const pe = (t, id, x, y, prim, target = window) => target.dispatchEvent(new PointerEvent(t, { pointerId: id, isPrimary: prim, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
        pe('pointerdown', 11, b.x + b.width / 2, b.y + b.height / 2, true, card); pe('pointermove', 12, c.x, c.y + 40, false); pe('pointerup', 12, c.x, c.y + 40, false);
        await new Promise((r) => setTimeout(r, 300)); const after2nd = g.S.units.length;
        pe('pointermove', 11, c.x, c.y + 40, true); pe('pointercancel', 11, c.x, c.y + 40, true);
        await new Promise((r) => setTimeout(r, 300)); return { after2nd, afterCancel: g.S.units.length, ghosts: document.querySelectorAll('.gf-dragghost').length };
      });
      if (R.twoFinger.after2nd !== 0 || R.twoFinger.afterCancel !== 0 || R.twoFinger.ghosts !== 0) fail('twoFinger', R.twoFinger);
    });
    await step('tray', async () => { // 1-2: one-row tray in portrait (墨子 row at T+878), "还差 N"
      await open(page, save(['1-1'], { current: '1-2' }));
      await page.evaluate(() => (window).__gfApp.battle((window).__gfApp.level('1-2'), ['shooter', 'farm']));
      await page.waitForTimeout(1200); await page.evaluate(() => { const g = (window).__gf; g.S.grain = 20; });
      await page.waitForTimeout(800); await shot(page, dir, 'b01-1-2-tray');
      R.layout = await page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), Math.round(b.left), Math.round(b.right)]; }; return { mozi: r('.gf-mozi'), speed: r('.gf-speed'), tray: r('.gf-tray'), bubble: r('.gf-bubble--mozi'), luban: r('.gf-bubble--luban'), short: document.querySelector('.gf-card__short')?.textContent }; });
      const L = R.layout; if (p.name === 'portrait' && (L.speed[1] > L.mozi[0] || L.speed[1] > L.bubble[0])) fail('speed overlaps mozi', L);
      await page.evaluate(() => (window).__gf.pause()); await page.waitForTimeout(400); await shot(page, dir, 'b02-pause');
      R.pauseSpeed = await page.locator('.gf-pausel__speed button').count();
    });
    await step('preview', async () => { for (const [id, s] of [['1-3', save(['1-1', '1-2'], { current: '1-3' })], ['1-8', save(V1.slice(0, 7), { current: '1-8' })], ['2-11', save([...V1, ...V2.slice(0, 10)], { current: '2-11' })], ['1-7', save(V1.slice(0, 6), { current: '1-7' })]]) {
      await open(page, s); await page.waitForTimeout(600);
      await page.locator('.xg-node--current').first().click({ timeout: 5000 }).catch(() => {}); await page.waitForSelector('.gf-preview', { timeout: 8000 });
      await page.waitForTimeout(2600); await shot(page, dir, `c-preview-${id}`);
      R['pv' + id] = { out: await inView(page, '.gf-pv__deck *, .gf-pv__m'), log: await page.evaluate(() => (window).__gfVoiceLog?.() ?? null) };
      if (R['pv' + id].out) fail('preview overflow ' + id, R['pv' + id]);
    } });
    await step('almanac', async () => {
      await open(page, save([...V1, ...V2], { current: '2-11', jinnang: { surprise: { seen: true, mastered: null } } }));
      await page.waitForTimeout(500); await page.locator('.gf-bigcard--alm').click(); await page.waitForSelector('.gf-alm__tab');
      for (const t of ['card', 'machine', 'boss', 'jn']) {
        await page.locator(`.gf-alm__tab[data-tab="${t}"]`).click(); await page.waitForTimeout(350); await shot(page, dir, `d-almanac-${t}`);
        const out = await inView(page, '.gf-alm__tile'); const n = await page.locator('.gf-alm__tile').count(); R['alm_' + t] = { n, out };
        if (out) fail('almanac tiles off screen ' + t, { n, out });
      }
      R.tabH = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.gf-alm__tab')].map((e) => e.getBoundingClientRect().height)));
      await page.locator('.gf-back').click(); await page.waitForTimeout(600);
      R.mapTabH = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.gf-tabs button')].map((e) => e.getBoundingClientRect().height)));
      await page.waitForTimeout(3200); R.mapRaf = await rafRate(page); await shot(page, dir, 'e-map');
      if (R.mapRaf > 2) fail('map idle rAF', R.mapRaf);
    });
    await step('debrief', async () => { // lose 1-3 on purpose (nothing placed), fast
      await open(page, save(['1-1', '1-2'], { current: '1-3' }));
      await page.evaluate(() => (window).__gfApp.play('1-3', ['shooter', 'farm', 'wall']));
      await page.waitForTimeout(500); await page.evaluate(() => { const g = (window).__gf; g.place('farm', 1, 0); g.place('farm', 3, 0); g.setSpeed(4); });
      await page.waitForSelector('.gf-debrief', { timeout: 60000 }); await page.waitForTimeout(500); await shot(page, dir, 'f-debrief');
      R.debrief = await page.evaluate(() => [...document.querySelectorAll('.gf-db__panel p')].map((e) => e.textContent));
      if (R.debrief.length < 3) fail('debrief lines', R.debrief);
    });
    await step('learned', async () => {
      await open(page, save(['1-1', '1-2', '1-3', '1-4'], { current: '1-5', counters: { ram: { spikes: 2 } } }));
      await page.evaluate(() => (window).__gfApp.win('1-5', 3)); await page.waitForSelector('.gf-learned', { timeout: 8000 }).catch(() => fail('learned', 'no tile'));
      await page.waitForTimeout(1500); await shot(page, dir, 'g-result-learned');
    });
    R.errors = errors.slice(0, 5); if (errors.length) fail('console errors ' + p.name, errors.slice(0, 3));
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(results, null, 1));
