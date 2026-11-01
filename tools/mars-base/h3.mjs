// H3 / hint ladder visual check on the real stages (dev server :5323): three wrong deliveries → the stage helps (H1 glow, H2 half plan, H3 full plan) → ✓.
// Usage: node tools/mars-base/h3.mjs <vp> <node,node...>   (items answered wrongly through the ✓ button; screenshots after each rung)
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const OUT = path.join(os.homedir(), 'kid-games-work/shots/rr/mars'); fs.mkdirSync(OUT, { recursive: true });
const VP = { 'ipad-l': { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'phone-p': { ...devices['iPhone 13'], viewport: { width: 390, height: 664 } }, 'se': { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } } };
const name = process.argv[2] ?? 'ipad-l'; const nodes = (process.argv[3] ?? 'vault.K1.3').split(','); const log = [];
const b = await webkit.launch();
try {
  const ctx = await b.newContext({ ...VP[name], locale: 'zh-CN' }); await ctx.addInitScript({ path: new URL('../qa/mute-audio.js', import.meta.url).pathname }); const page = await ctx.newPage();   // silence: kit auto-mute + explicit init script
  page.on('console', (m) => { if (m.type() === 'error') log.push('console: ' + m.text().slice(0, 200)); }); page.on('pageerror', (e) => log.push('pageerror: ' + e.message.slice(0, 200)));
  await page.goto('http://localhost:5323/mars-base/?test=1&mute=1', { waitUntil: 'networkidle' }); await page.click('.kit-start__go').catch(() => {}); await page.waitForSelector('#app[data-ready]');
  await page.waitForTimeout(1500); await page.getByText('跳过').first().click({ timeout: 1200 }).catch(() => {}); await page.waitForTimeout(900);
  const lit = { state: 'lit', attempts: 1, at: Date.now() };
  for (const node of nodes) {
    await page.evaluate((s) => window.__mars.setSave(s), { onboarded: true, session: { index: 3, lastActiveAt: Date.now(), missions: 3 }, cert: { C1: lit, C2: lit, C3: lit }, probes: { vault: { done: true }, factory: { done: true }, balance: { done: true } } });
    await page.waitForSelector('.mb-map'); await page.evaluate((n) => window.__mars.start(n), node); await page.waitForSelector('.mb-mission .mb-stage'); await page.waitForTimeout(400);
    const it = await page.evaluate(() => window.__mars.item()); const tag = `h3-${name}-${node.replace('.', '_')}`;
    await page.screenshot({ path: path.join(OUT, `${tag}-0.png`) });
    for (let k = 1; k <= 3; k++) {
      await page.click('.mb-ok').catch(() => {}); await page.waitForTimeout(k === 3 ? 400 : 1500);   // demo plays (fast under automation), then the rung applies
      await page.screenshot({ path: path.join(OUT, `${tag}-${k}.png`) });
      const line = await page.textContent('.mb-comm-text'); log.push(`${node} ${it.fam} rung ${k}: ${line} | hinted=${await page.locator('.is-hinted').count()}`);
    }
    await page.waitForTimeout(5200); await page.screenshot({ path: path.join(OUT, `${tag}-4.png`) });
    await page.click('.mb-ok').catch(() => {}); await page.waitForTimeout(1200);
    const cls = await page.evaluate(() => document.querySelector('.mb-stage')?.className ?? ''); log.push(`${node}: after H3 + ✓ → ${/is-ok/.test(cls) ? 'ok' : 'NOT ok'} | line: ${await page.textContent('.mb-comm-text')}`);
  }
} finally { await b.close(); }
console.log(log.join('\n'));
