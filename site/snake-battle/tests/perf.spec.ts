/**
 * perf.spec (spec §8.11, §9.3; SB_PERF=1 only, portrait project only): what can be measured automatically.
 *  1. 黑洞场 22 snakes, him m=1000, Q2 — the app's own per-frame main-thread work p95 ≤ 12 ms; rAF p95 ≤ 20 ms.
 *  2. stress 25 (?stress) — work p95 ≤ 14 ms; the quality tier may drop to Q1, never Q0.
 *  3. A13 proxy: Chromium + CDP CPU throttling ×5, 黑洞场 60 s — work p95 ≤ 14 ms; > 33 ms frames ≤ 1 per minute.
 *  4. still menu: after 20 s in the lobby, 0 requestAnimationFrame calls in the next 3 s.
 *  5. first playable: page → ready ≤ 3 s (local server); 开始 → c1m1 running ≤ 1.5 s.
 * Pages load the kit → muted under automation; Chromium also gets --mute-audio. Numbers go to the test output.
 */
import { expect, test, chromium, type Page } from '@playwright/test';

const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
async function measure(page: Page, sec: number, stress?: number) {
  await page.evaluate((st) => { const a = (window as any).__sbApp; a.save.data.firstRunDone = true; return a.startMatch('timed', 'blackhole', { seed: 31337, countdown: false, stress: st }); }, stress);
  await page.evaluate(() => { const m = (window as any).__sb.match; m.me.mass = 1000; m.me.protect = 1e9; m.input.boost = false; });
  await page.waitForTimeout(3000);
  return page.evaluate((s) => new Promise<{ work: number[]; iv: number[]; q: number[]; snakes: number }>((ok) => {
    const app = (window as any).__sbApp, v = (window as any).__sb.view; app.workLog.length = 0; const iv: number[] = [], qs: number[] = []; let last = performance.now(); const t0 = last;
    const f = (now: number) => { iv.push(now - last); last = now; qs.push(v.R.quality); if (now - t0 < s * 1000) requestAnimationFrame(f); else ok({ work: [...app.workLog], iv, q: qs, snakes: (window as any).__sb.match.world.snakes.filter((x: any) => x.alive).length }); };
    requestAnimationFrame(f);
  }), sec);
}

test.describe('snake-battle perf', () => {
  test.skip(process.env.SB_PERF !== '1', 'SB_PERF=1 only');
  test.beforeEach(({}, ti) => { test.skip(ti.project.name !== 'portrait-810x1080', 'portrait only'); });

  test('WebKit: 黑洞场 22 snakes and stress 25, him m=1000', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/snake-battle/?test=1&nogate'); await page.waitForSelector('#app[data-ready]');
    const a = await measure(page, 15);
    console.log('[perf webkit 22]', JSON.stringify({ snakes: a.snakes, work95: q(a.work, 0.95), iv95: q(a.iv, 0.95), long: a.iv.filter((x) => x > 50).length, qMin: Math.min(...a.q) }));
    expect(q(a.work, 0.95)).toBeLessThanOrEqual(12); expect(q(a.iv, 0.95)).toBeLessThanOrEqual(20);
    await page.goto('/snake-battle/?test=1&nogate'); await page.waitForSelector('#app[data-ready]');
    const b = await measure(page, 15, 25);
    console.log('[perf webkit 25]', JSON.stringify({ snakes: b.snakes, work95: q(b.work, 0.95), iv95: q(b.iv, 0.95), long: b.iv.filter((x) => x > 50).length, qMin: Math.min(...b.q) }));
    expect(q(b.work, 0.95)).toBeLessThanOrEqual(14); expect(Math.min(...b.q)).toBeGreaterThanOrEqual(1);
  });

  test('A13 proxy: Chromium CPU ×5, 黑洞场 60 s', async ({ baseURL }) => {
    test.setTimeout(180_000);
    const browser = await chromium.launch({ args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
    try {
      const ctx = await browser.newContext({ viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
      await page.goto(`${baseURL}/snake-battle/?test=1&nogate`); await page.waitForSelector('#app[data-ready]');
      const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 5 });
      const r = await measure(page, 60);
      const long = r.iv.filter((x) => x > 33).length;
      console.log('[perf chromium x5]', JSON.stringify({ snakes: r.snakes, work95: q(r.work, 0.95), work99: q(r.work, 0.99), iv95: q(r.iv, 0.95), long }));
      expect(q(r.work, 0.95)).toBeLessThanOrEqual(14); expect(long).toBeLessThanOrEqual(1);
    } finally { await browser.close(); }
  });

  test('still menu sleeps; first playable is quick', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); (window as any).__rafN = 0; window.requestAnimationFrame = (cb) => { (window as any).__rafN++; return raf(cb); }; });
    const t0 = Date.now(); await page.goto('/snake-battle/?test=1&nogate'); await page.waitForSelector('#app[data-ready]'); const ready = Date.now() - t0;
    await page.evaluate(() => { (window as any).__sbApp.save.data.firstRunDone = true; });
    await page.waitForTimeout(20_000);
    const n0 = await page.evaluate(() => (window as any).__rafN); await page.waitForTimeout(3000); const n1 = await page.evaluate(() => (window as any).__rafN);
    const t1 = Date.now(); await page.evaluate(() => (window as any).__sbApp.startMatch('mission', 'moon', { mission: 'c1m1', waitTouch: true }));
    await page.waitForFunction(() => !!(window as any).__sb?.match?.run); const toPlay = Date.now() - t1;
    console.log('[perf idle/start]', JSON.stringify({ ready, idleRaf: n1 - n0, toPlay }));
    expect(ready).toBeLessThanOrEqual(3000); expect(n1 - n0).toBe(0); expect(toPlay).toBeLessThanOrEqual(1500);
  });
});
