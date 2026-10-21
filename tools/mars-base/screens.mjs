// Side screens of 火星基地 (map with tiers, 徽章墙, 档案, 家长页, S3 build). Usage: node tools/mars-base/screens.mjs [vp,vp]
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const OUT = path.join(os.homedir(), 'kid-games-work/shots/rr/mars'); fs.mkdirSync(OUT, { recursive: true });
const VP = { 'ipad-p': { viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'ipad-l': { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'phone-p': { ...devices['iPhone 13'], viewport: { width: 390, height: 664 } }, 'se': { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } }, 'phone-l': { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } };
const vps = (process.argv[2] ?? 'ipad-l,phone-p').split(','); const log = [];
const browser = await webkit.launch();
try {
  for (const name of vps) {
    const ctx = await browser.newContext({ ...VP[name], locale: 'zh-CN' }); await ctx.addInitScript({ path: new URL('../qa/mute-audio.js', import.meta.url).pathname }); const page = await ctx.newPage();   // silence: kit auto-mute + explicit init script
    page.on('console', (m) => { if (m.type() === 'error') log.push(`[${name}] console: ${m.text().slice(0, 200)}`); }); page.on('pageerror', (e) => log.push(`[${name}] pageerror: ${e.message.slice(0, 200)}`));
    await page.goto('http://localhost:5323/mars-base/?test=1&mute=1', { waitUntil: 'networkidle' }); await page.click('.kit-start__go').catch(() => {}); await page.waitForSelector('#app[data-ready]');
    await page.waitForTimeout(1500); await page.getByText('跳过').first().click({ timeout: 1200 }).catch(() => {}); await page.waitForTimeout(900);
    await page.evaluate(() => {
      const nodes = {}; for (const id of ['orbit.O1.0', 'orbit.O1.1', 'orbit.O1.2', 'orbit.O1.3', 'orbit.O1.4', 'orbit.O2.1', 'orbit.O2.2', 'orbit.O2.3', 'vault.K1.1', 'vault.K1.2', 'vault.K1.3', 'vault.K1.4', 'vault.K1.5', 'vault.K1.6', 'vault.K1.7', 'vault.K1.8', 'vault.K1.9', 'factory.P1.1', 'factory.P1.3']) nodes[id] = { st: 'done', stars: 2, plays: 1, ft: [] };
      const t = (L, pae, est) => ({ node: 'orbit.O1.0', L, at: Date.now() - 86400000, targets: [3, 12, 25, 42, 64, 86], est, r2: 0.97, slope: 1, pae, pass: true, valid: true });
      window.__mars.setSave({ onboarded: true, session: { index: 5, lastActiveAt: Date.now(), missions: 5 }, nodes, cert: { C1: { state: 'lit', attempts: 1, at: Date.now() }, C2: { state: 'half', attempts: 2, at: Date.now() }, C3: { state: 'none', attempts: 0 } }, probes: { vault: { done: true }, factory: { done: true }, balance: { done: true } },
        orbit: { tests: [t(100, 0.09, [8, 20, 30, 38, 70, 80]), t(100, 0.05, [4, 14, 27, 44, 61, 88]), t(1000, 0.06, [30, 140, 260, 400, 640, 850])] }, errors: { noCarry: { n: 4, recent: [{ fam: 'add.carry1', at: Date.now() }] }, zeroOmit: { n: 1, recent: [] }, logCompress: { n: 2, recent: [] } }, race: { games: 3, inProgress: null },
        tags: { 'pv3.rep': { level: 3, streak: 2, window: '1101111011', tailNoHint: 3, mastered: true, reviews: [], repDown: 0, wrongRun: 0, fam: 'pv3.read' }, 'pv2.rep': { level: 2, streak: 0, window: '0110', tailNoHint: 0, mastered: false, reviews: [], repDown: 0, wrongRun: 0, fam: 'pv2.read' } } });
      window.__mars.base();
    });
    await page.waitForSelector('.mb-map'); await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `scr-${name}-map.png`) });
    await page.evaluate(() => window.__mars.badges()); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `scr-${name}-badges.png`) });
    await page.evaluate(() => window.__mars.archive()); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `scr-${name}-archive.png`) });
    await page.evaluate(() => window.__mars.parent()); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `scr-${name}-parent.png`) });
    await page.evaluate(() => window.__mars.goMap());
    await page.evaluate(() => { window.__marsFast = false; window.__mars.build({ part: true, tierUps: [{ site: 'vault', from: 1, to: 2 }], levelUp: 3, newCards: [] }, 'vault'); }); await page.waitForTimeout(1500); await page.screenshot({ path: path.join(OUT, `scr-${name}-build.png`) });
    await page.waitForTimeout(2500);
    await page.context().close();
  }
} finally { await browser.close(); }
console.log(log.join('\n') || 'no console errors');
