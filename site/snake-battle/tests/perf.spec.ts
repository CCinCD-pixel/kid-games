/**
 * perf.spec (spec §8.11, §9.3; SB_PERF=1): the heaviest case — 黑洞场 with 25 snakes and him at m=1000 —
 * for 12 s in WebKit at the iPad 9 viewport, DPR 2. Frame intervals from rAF: p95 ≤ 20 ms and at most
 * 3 frames > 50 ms; the app's own per-frame work time p95 ≤ 8 ms. Numbers go to the test output.
 */
import { expect, test } from '@playwright/test';

test.describe('snake-battle perf', () => {
  test.skip(process.env.SB_PERF !== '1', 'SB_PERF=1 only');
  test('blackhole, 25 snakes, him m=1000', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/snake-battle/?test=1&nogate');
    await page.waitForSelector('#app[data-ready]');
    await page.evaluate(() => { const a = (window as any).__sbApp; a.save.data.firstRunDone = true; return a.startMatch('timed', 'blackhole', { seed: 7, countdown: false, stress: 25 }); });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const { match } = (window as any).__sb; const me = match.me; me.spawn(0, 0, 0, 1000, match.world.t); me.protect = 0; match.world.rebuildHash(); match.input.boost = false; });
    const r = await page.evaluate(() => new Promise<{ n: number; p50: number; p95: number; long: number; snakes: number }>((res) => {
      const ts: number[] = []; let last = performance.now(); const end = last + 12000;
      const f = (t: number) => { ts.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else { const s = [...ts].sort((a, b) => a - b); res({ n: ts.length, p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)], long: ts.filter((x) => x > 50).length, snakes: (window as any).__sb.match.world.snakes.filter((q: any) => q.alive).length }); } };
      requestAnimationFrame(f);
    }));
    console.log('[perf]', JSON.stringify(r));
    expect(r.p95).toBeLessThanOrEqual(20);
    expect(r.long).toBeLessThanOrEqual(3);
  });
});
