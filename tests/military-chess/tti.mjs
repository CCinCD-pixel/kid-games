#!/usr/bin/env node
// Time to interactive of the BUILT page (spec §8.6 Mac proxy ≤ 0.7 s): performance.now() when
// #app[data-ready] appears, ?test=1 (no start gate), 5 cold loads per orientation. Needs
//   npx vite build --config tools/military-chess/vite.mc-build.config.ts && npx vite preview … --port 5313
import { webkit, devices } from '@playwright/test';
const PORT = process.argv.find((a) => a.startsWith('--port='))?.slice(7) ?? '5313';
const browser = await webkit.launch();
try {
  for (const vp of [{ width: 810, height: 1080 }, { width: 1080, height: 810 }]) {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const context = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: vp });
      const page = await context.newPage();
      await page.goto(`http://localhost:${PORT}/military-chess/?test=1`);
      await page.waitForSelector('#app[data-ready]');
      times.push(await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        return Math.round(performance.now() - (nav ? 0 : 0));
      }));
      await context.close();
    }
    times.sort((a, b) => a - b);
    console.log(`${vp.width}x${vp.height}: ready at ${times.join(', ')} ms (median ${times[2]})`);
  }
} finally { await browser.close(); }
