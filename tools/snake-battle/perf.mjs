#!/usr/bin/env node
// Perf probe (spec §8.11): black-hole stress (25 snakes), him at mass 1000, 20 s per run.
//   node tools/snake-battle/perf.mjs [port]   → WebKit (iPad 9 viewport) + Chromium with CPU throttled ×5 (A13 proxy)
// Reports main-thread work per frame (sim + sprite build + HUD) p50/p95/p99, long frames (>33 ms), rAF interval p95,
// sprite count and quality tier. Pages load the kit → silent; Chromium also gets --mute-audio.
import { webkit, chromium } from '@playwright/test';
const port = process.argv[2] ?? '5304';
const url = `http://localhost:${port}/snake-battle/?test=1&nogate`;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
async function run(name, launcher, opts, throttle) {
  const browser = await launcher.launch(opts);
  try {
    const ctx = await browser.newContext({ viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(url); await page.waitForSelector('#app[data-ready]');
    if (throttle) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
    await page.evaluate(() => window.__sbApp.startMatch('timed', 'blackhole', { seed: 31337, countdown: false, stress: 25 }));
    await page.evaluate(() => { const m = window.__sb.match; m.me.mass = 1000; m.me.protect = 1e9; });
    await page.waitForTimeout(3000);
    const res = await page.evaluate(async () => {
      const app = window.__sbApp; app.workLog.length = 0; const iv = []; let last = performance.now();
      await new Promise((ok) => { const t0 = performance.now(); const f = (now) => { iv.push(now - last); last = now; if (now - t0 < 20000) requestAnimationFrame(f); else ok(); }; requestAnimationFrame(f); });
      const v = window.__sb.view; return { work: [...app.workLog], iv, sprites: v.R.n, q: v.R.quality, snakes: window.__sb.match.world.snakes.length, segs: v.segCount };
    });
    const long = res.iv.filter((x) => x > 33).length;
    console.log(`${name}: snakes ${res.snakes} · sprites ${res.sprites} · segs ${res.segs} · Q${res.q} · work p50 ${q(res.work, .5).toFixed(2)} p95 ${q(res.work, .95).toFixed(2)} p99 ${q(res.work, .99).toFixed(2)} ms · rAF p95 ${q(res.iv, .95).toFixed(1)} ms · frames ${res.iv.length}/20s · long(>33ms) ${long}`);
  } finally { await browser.close(); }
}
if (!process.argv.includes('--chromium-only')) await run('WebKit iPad-9 viewport', webkit, {});
await run('Chromium CPU×5 (A13 proxy, GPU via ANGLE/Metal)', chromium, { args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }, 5);
if (process.argv.includes('--swiftshader')) await run('Chromium CPU×5 (software GL)', chromium, { args: ['--mute-audio'] }, 5);
