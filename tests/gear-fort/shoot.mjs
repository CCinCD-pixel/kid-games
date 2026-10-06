#!/usr/bin/env node
// 机关守城 screenshot tour (spec §9.9): WebKit, iPad 9 viewports (portrait 810×1080 + landscape 1080×810).
//   node tests/gear-fort/shoot.mjs [--port=5311] [--only=portrait|landscape] [--steps=a,b]
// One browser, always closed. Shots → ~/kid-games-work/shots/gear-fort/<project>/<name>.png. Pages load the kit → auto-muted.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5311'); const ONLY = opt('only', ''); const STEPS = opt('steps', '');
const OUT = path.join(os.homedir(), 'kid-games-work/shots/gear-fort');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const URL = `http://localhost:${PORT}/gear-fort/?test=1`;
const projects = [
  { name: 'landscape', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
  { name: 'portrait', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
].filter((p) => !ONLY || p.name.startsWith(ONLY));
const won0 = (ids) => JSON.stringify({ v: 1, updatedAt: Date.now(), data: { ...{}, levels: Object.fromEntries(ids.map((id) => [id, { best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' }])), current: '1-' + (ids.length + 1), counters: { walker: { shooter: 5 }, shielder: { lobber: 3 }, ram: { spikes: 2 } } } });
const won = (ids, extra = {}) => { const o = JSON.parse(won0(ids)); Object.assign(o.data, extra); return JSON.stringify(o); };
const V1 = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10'];

async function open(page, save) {
  await page.goto(`http://localhost:${PORT}/gear-fort/?test=1`);
  await page.evaluate((s) => { localStorage.clear(); if (s) localStorage.setItem('kg:v1:gear-fort', s); }, save);
  await page.goto(URL, { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  await page.waitForTimeout(600);
}
const steps = {
  async first(page, shot) { // first visit → 1-1 straight away
    await open(page, null); await page.waitForTimeout(2200); await shot('s01-1-1-intro');
    await page.evaluate(() => window.__gf.place('shooter', 2, 1)); await page.waitForTimeout(300); await shot('s02-1-1-placed');
    await page.evaluate(() => window.__gf.setSpeed(3)); await page.waitForTimeout(5200); await shot('s03-1-1-fight');
    await page.evaluate(() => window.__gf.place('shooter', 2, 2)); await page.waitForTimeout(6500); await shot('s04-1-1-wave');
    await page.evaluate(() => window.__gf.setSpeed(12)); await page.waitForSelector('.xg-scrim', { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(1600); await shot('s05-1-1-result');
    await page.getByRole('button', { name: '回地图' }).click().catch(() => {}); await page.waitForTimeout(900); await shot('s06-map');
  },
  async preview(page, shot) {
    await open(page, won(V1.slice(0, 7))); await page.waitForTimeout(500); await shot('s10-map-7');
    await page.locator('.xg-node').nth(7).click(); await page.waitForTimeout(1600); await shot('s11-preview-1-8');
    await page.locator('.gf-pv__m').first().click(); await page.waitForTimeout(500); await shot('s12-preview-info'); await page.locator('.gf-info').click();
    await page.locator('.gf-pv__go').click(); await page.waitForTimeout(1200);
    await page.evaluate(() => { const g = window.__gf; for (const [c, l, k] of [['farm', 0, 0], ['farm', 1, 0], ['farm', 2, 0], ['shooter', 0, 1], ['shooter', 1, 1], ['lobber', 2, 1], ['shooter', 3, 1], ['shooter', 4, 1], ['wall', 2, 4], ['pit', 3, 5]]) { g.S.grain += 200; g.place(c, l, k); } g.setSpeed(3); });
    await page.waitForTimeout(9000); await shot('s13-1-8-fight');
    await page.evaluate(() => window.__gf.setSpeed(6)); await page.waitForTimeout(9000); await shot('s14-1-8-later');
  },
  async boss(page, shot) {
    await open(page, won(V1)); await page.locator('.xg-node').nth(10).click(); await page.waitForTimeout(1500); await shot('s20-preview-1-11');
    await page.locator('.gf-pv__go').click(); await page.waitForTimeout(800);
    await page.evaluate(() => { const g = window.__gf; for (const [c, l, k] of [['farm', 0, 0], ['farm', 1, 0], ['lobber', 2, 1], ['lobber', 2, 2], ['shooter', 1, 1], ['shooter', 3, 1], ['wall', 2, 4], ['spikes', 2, 5], ['shooter', 0, 1], ['shooter', 4, 1]]) { g.S.grain += 300; g.place(c, l, k); } g.setSpeed(8); });
    await page.waitForFunction(() => window.__gf.S.enemies.some((e) => e.boss), null, { timeout: 60000 }); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(1500); await shot('s21-1-11-boss');
    await page.evaluate(() => { const e = window.__gf.S.enemies.find((q) => q.boss); if (e) { e.hp = e.p2At; e.boss.phase = 2; e.boss.shellAt = window.__gf.S.tick; e.boss.crack = Math.floor(e.crackMax * 0.45); e.mat = 'metal'; } window.__gf.setSpeed(1); }); await page.waitForTimeout(1200); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(600); await shot('s21b-1-11-shell');
    await page.evaluate(() => window.__gf.pause()); await page.waitForTimeout(500); await shot('s22-pause');
  },
  async rack(page, shot) { // 1-6: 驿马 brings cards to the rack; 鲁班按手 10 s before each 大波
    await open(page, won(V1.slice(0, 5))); await page.locator('.xg-node').nth(5).click(); await page.waitForTimeout(1500); await shot('s15-preview-1-6');
    await page.locator('.gf-pv__go').click(); await page.waitForTimeout(800);
    await page.evaluate(() => window.__gf.setSpeed(10)); await page.waitForFunction(() => window.__gf.S.belt.length >= 4, null, { timeout: 40000 });
    await page.evaluate(() => { const g = window.__gf; g.place(g.S.belt[0], 2, 1); g.setSpeed(1); }); await page.waitForTimeout(900); await shot('s16-1-6-rack');
    await page.evaluate(() => window.__gf.setSpeed(10)); await page.waitForSelector('.gf-warn', { timeout: 60000 }); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(700); await shot('s17-1-6-warn');
  },
  async help(page, shot) { // 3rd loss → 复盘 with 幽灵 + two assist tiers; then the ghost replay
    await open(page, won(['1-1', '1-2'], { lossStreak: { '1-3': 2 } })); await page.locator('.xg-node').nth(2).click(); await page.waitForTimeout(900); await page.locator('.gf-pv__go').click(); await page.waitForTimeout(600);
    await page.evaluate(() => { const g = window.__gf; g.S.logs = [1, 1, 1, 1, 1]; g.setSpeed(20); }); await page.waitForSelector('.gf-debrief', { timeout: 60000 }); await page.waitForTimeout(900); await shot('s30-debrief-help');
    await page.locator('.gf-helpcard[data-a="ghost"]').click(); await page.waitForTimeout(3500); await shot('s31-ghost');
    await page.evaluate(() => window.__gf.setSpeed(20)); await page.waitForSelector('.gf-debrief', { timeout: 60000 });
    await page.locator('.gf-helpcard[data-a="assist2"]').click(); await page.waitForTimeout(1200); await shot('s32-assist2-preview');
    await page.locator('.gf-pv__go').click(); await page.waitForTimeout(600); await page.evaluate(() => window.__gf.setSpeed(6)); await page.waitForTimeout(4000); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(1500); await shot('s33-assist2-battle');
  },
  async almanac(page, shot) {
    await open(page, won(V1)); await page.locator('.gf-bigcard--alm').click(); await page.waitForTimeout(700); await shot('s40-almanac');
    await page.locator('.gf-alm__tile:not(.is-locked)').nth(3).click(); await page.waitForTimeout(800); await shot('s41-almanac-page');
  },
  async resume(page, shot) { // pause → 回地图 → "接着推演第 N 关？"
    await open(page, won(V1.slice(0, 3))); await page.locator('.xg-node').nth(3).click(); await page.waitForTimeout(900); await page.locator('.gf-pv__go').click(); await page.waitForTimeout(2500);
    await page.evaluate(() => window.__gf.pause()); await page.waitForTimeout(400); await page.getByRole('button', { name: '回地图' }).click(); await page.waitForTimeout(1200); await shot('s42-resume');
  },
};
const browser = await webkit.launch();
try {
  for (const p of projects) {
    const context = await browser.newContext({ ...p.ctx, locale: 'zh-CN' });
    const page = await context.newPage(); const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const dir = path.join(OUT, p.name); fs.mkdirSync(dir, { recursive: true });
    const taken = []; const shot = (n) => { taken.push(n); return page.screenshot({ path: path.join(dir, n + '.png') }); };
    for (const [name, fn] of Object.entries(steps)) { if (STEPS && !STEPS.split(',').includes(name)) continue; try { await fn(page, shot); } catch (e) { errors.push(`${name}: ${e.message}`); } }
    const info = await page.evaluate(() => ({ calls: window.__gf?.stage?.drawCalls, w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth })).catch(() => ({}));
    console.log(p.name, JSON.stringify(info), errors.length ? 'ERRORS:\n  ' + errors.slice(0, 12).join('\n  ') : 'no errors');
    if (taken.length) { // one contact sheet per orientation, to review many shots at once
      const sp = await context.newPage(); const cols = p.name === 'landscape' ? 3 : 4; const tw = p.name === 'landscape' ? 520 : 380;
      const cells = taken.map((n) => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(dir, n + '.png')).toString('base64')}"><figcaption>${n}</figcaption></figure>`).join('');
      await sp.setViewportSize({ width: cols * (tw + 12) + 12, height: 800 });
      await sp.setContent(`<style>body{margin:0;background:#222;color:#eee;font:14px sans-serif;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:12px;padding:12px}figure{margin:0}img{width:${tw}px;display:block}</style>${cells}`);
      await sp.waitForTimeout(300); await sp.screenshot({ path: path.join(OUT, `sheet-${p.name}${STEPS ? '-' + STEPS.replace(/,/g, '+') : ''}.png`), fullPage: true }); await sp.close();
    }
    await context.close();
  }
} finally { await browser.close(); }
