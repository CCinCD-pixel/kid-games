import { expect, test } from '@playwright/test';

test('phone podium confetti paints on one canvas and cleans up', async ({ page }, info) => {
  test.skip(info.project.name !== 'portrait-810x1080', 'phone case runs once');
  test.setTimeout(30_000);
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/snake-battle/?test=1&nogate&mute=1');
  await page.waitForSelector('#app[data-ready]');
  await page.evaluate(() => {
    const app = (window as any).__sbApp;
    app.save.data.firstRunDone = true;
    void app.startMatch('timed', 'moon', { seed: 42, countdown: false });
  });
  await page.waitForFunction(() => (window as any).__sb?.match?.state === 'playing');
  await page.evaluate(() => {
    const m = (window as any).__sb.match;
    m.me.mass = 5000;
    m.me.stats.peak = 5000;
    m.me.protect = 1e9;
    m.world.t = 179.95;
  });
  await expect(page.locator('.sb-podium')).toBeVisible();
  await expect(page.locator('.xg-confetti canvas')).toBeVisible({ timeout: 3000 });
  expect(await page.locator('.xg-confetti i').count()).toBe(0);
  const painted = await page.locator('.xg-confetti canvas').evaluate((el: HTMLCanvasElement) => {
    const { width, height } = el;
    const pixels = el.getContext('2d')!.getImageData(0, 0, width, height).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) return true;
    return false;
  });
  expect(painted).toBe(true);
  const frames = await page.evaluate(() => new Promise<number[]>((resolve) => {
    const intervals: number[] = [];
    let prev = performance.now();
    const until = prev + 1500;
    const tick = (now: number) => {
      intervals.push(now - prev);
      prev = now;
      if (now < until) requestAnimationFrame(tick);
      else resolve(intervals);
    };
    requestAnimationFrame(tick);
  }));
  const ordered = [...frames].sort((a, b) => a - b);
  console.log(`[confetti phone] p95=${ordered[Math.floor(ordered.length * 0.95)].toFixed(1)}ms max=${ordered.at(-1)!.toFixed(1)}ms`);
  expect(ordered[Math.floor(ordered.length * 0.95)]).toBeLessThan(35);
  await page.locator('.sb-podium .xg-btn', { hasText: '回大厅' }).click();
  await expect(page.locator('.sb-lobby')).toBeVisible();
  await expect(page.locator('.xg-confetti')).toHaveCount(0);
});
