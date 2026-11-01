// Playwright WebKit screenshot driver for 火星基地 (dev server on :5323). Usage: node tools/mars-base/shots.mjs <scenario> [viewport...]
// Silence: kit pages auto-mute under WebDriver. Never leave the browser open (try/finally).
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.join(os.homedir(), 'kid-games-work/shots/rr/mars');
fs.mkdirSync(OUT, { recursive: true });
const VP = {
  'ipad-p': { viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'ipad-l': { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'phone-p': { ...devices['iPhone 13'], viewport: { width: 390, height: 664 } },
  'se': { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } },
  'phone-l': { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
};
const scenario = process.argv[2] ?? 'map';
const names = process.argv.slice(3).length ? process.argv.slice(3) : ['ipad-l', 'ipad-p', 'phone-p', 'se', 'phone-l'];
const base = process.env.BASE ?? 'http://localhost:5323/mars-base/?test=1';
const log = [];

const browser = await webkit.launch();
try {
  for (const name of names) {
    const ctx = await browser.newContext({ ...VP[name], locale: 'zh-CN' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') log.push(`[${name}] console error: ${m.text()}`); });
    page.on('pageerror', (e) => log.push(`[${name}] pageerror: ${e.message}`));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.click('.kit-start__go').catch(() => {});
    await page.waitForSelector('#app[data-ready]');
    const shot = async (tag) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, `${scenario}-${name}-${tag}.png`) }); };
    const setup = async (patch = {}) => { await page.waitForTimeout(1800); await page.getByText('跳过').first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(300); await page.evaluate((p) => window.__mars.setSave({ onboarded: true, ...p }), patch); await page.waitForSelector('.mb-map'); };
    if (scenario === 'map') { await page.waitForTimeout(1500); await shot('onboard-or-map'); }
    if (scenario === 'onboard') { await page.waitForSelector('.mb-onboard'); await shot('1'); await page.mouse.click(120, 200); }
    if (scenario === 'map2') { await setup(); await shot('map'); }
    if (scenario === 'mission') {
      const lit = { state: 'lit', attempts: 1 }; await setup({ session: { index: 2, lastActiveAt: Date.now(), missions: 2 }, cert: { C1: lit, C2: lit, C3: lit } });
      for (const [tag, id] of [['place', 'orbit.O1.1'], ['int', 'cert.C2.2'], ['cmp', 'cert.C1.2']]) {
        await page.evaluate((n) => window.__mars.start(n), id); await page.waitForSelector('.mb-mission'); await page.waitForTimeout(500);
        if (tag === 'place') { const it = await page.evaluate(() => window.__mars.item()); log.push(`[${name}] item ${it.fam}`); const box = await page.locator('.nl-svg').boundingBox({ timeout: 3000 }).catch(() => null); if (box) { await page.mouse.move(box.x + box.width * 0.4, box.y + box.height - 60); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.45, box.y + box.height - 60, { steps: 4 }); await shot(`${tag}-drag`); await page.mouse.up(); } }
        await shot(tag);
        await page.evaluate(() => document.querySelector('.mb-map-btn')?.click()); await page.waitForSelector('.mb-map');
      }
    }
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(log.join('\n') || 'no console errors');
