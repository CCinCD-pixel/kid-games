import { expect, test } from '@playwright/test';

test('the game serves every clip that speaks 炸', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/military-chess/?test=1&fast=1');
  await expect(page.locator('#app[data-ready]')).toBeVisible();
  await page.evaluate(() => (window as any).__mc.position({ c6: 'bB^', a6: 'r4^', b1: 'rF^', d12: 'bF^' }, { mode: 'fan' }));
  await page.waitForFunction(() => (window as any).__mc.screen() === 'match' && (window as any).__mc.phase() === 'idle');
  const bomb = await page.evaluate(() => (window as any).__mc.point('c6'));
  await page.touchscreen.tap(bomb.x, bomb.y);
  await page.waitForFunction(() => (window as any).__mc.said().includes('mc.w.炸弹'));

  const res = await request.get('/audio/military-chess/audio-manifest.json');
  expect(res.ok()).toBe(true);
  const manifest = await res.json() as Record<string, { text: string; src: string }>;
  const clips = Object.entries(manifest).filter(([, clip]) => clip.text.includes('炸'));
  expect(clips.length).toBeGreaterThanOrEqual(17);
  for (const [id, clip] of clips) {
    const audio = await request.get(clip.src);
    expect(audio.ok(), id).toBe(true);
    expect((await audio.body()).length, id).toBeGreaterThan(1000);
  }
  expect(errors).toEqual([]);
});
