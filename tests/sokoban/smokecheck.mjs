// Mirror of the platform smoke checks for /sokoban/ on the dev server (no build needed).
import { webkit, devices } from '@playwright/test';
const browser = await webkit.launch();
try {
  for (const vp of [{ width: 810, height: 1080 }, { width: 1080, height: 810 }]) {
    const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: vp });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const probe = { contexts: 0 };
      window.__kgProbe = probe;
      const O = window.AudioContext;
      window.AudioContext = new Proxy(O, { construct(t, a, n) { probe.contexts += 1; return Reflect.construct(t, a, n); } });
    });
    const errors = []; const failed = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('requestfailed', (r) => failed.push(r.url()));
    page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
    await page.goto('http://localhost:5301/sokoban/');
    await page.waitForSelector('#app[data-ready]', { state: 'attached' });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const b = document.querySelector('.kit-back')?.getBoundingClientRect();
      return { ox: document.documentElement.scrollWidth - innerWidth, oy: document.documentElement.scrollHeight - innerHeight, back: b ? [b.width, b.height] : null, ctx: window.__kgProbe.contexts };
    });
    // tap start, play into the map/opening, then measure again
    await page.click('.kit-start__go');
    await page.waitForTimeout(2500);
    const m2 = await page.evaluate(() => ({ ox: document.documentElement.scrollWidth - innerWidth, ctx: window.__kgProbe.contexts, screen: document.getElementById('app').dataset.screen }));
    console.log(JSON.stringify({ vp, m, m2, errors, failed }));
    await ctx.close();
  }
} finally { await browser.close(); }
