import { expect, test } from '@playwright/test';

test('rhino preview fills all six slots with the counter deck', async ({ page }, info) => {
  await page.context().addInitScript({ path: 'tools/qa/mute-audio.js' });
  if (info.project.name === 'landscape-1080x810') await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript(() => {
    const levels = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`1-${i + 1}`, { best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' }]));
    localStorage.setItem('kg:v1:gear-fort', JSON.stringify({ v: 1, updatedAt: Date.now(), data: { levels, current: '1-11', story: ['tut.1-1'] } }));
  });
  await page.goto('/gear-fort/?test=1&mute=1');
  await page.getByRole('button', { name: /开始/ }).first().click();
  await page.locator('.kit-start').waitFor({ state: 'detached' });
  await page.locator('.gf-map').waitFor();
  await page.evaluate(() => (window as any).__gfApp.preview('1-11'));
  await expect(page.locator('.gf-pv__count')).toHaveText('6/6');
  const names = await page.locator('.gf-pv__slots .gf-slot').evaluateAll((slots) => slots.map((s) => (s as HTMLElement).dataset.word));
  expect(names).toEqual(expect.arrayContaining(['连弩车', '禾田', '木垒', '籍车', '阳燧', '铁蒺藜']));
  const frame = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    slots: [...document.querySelectorAll('.gf-pv__slots .gf-slot')].map((slot) => {
      const r = slot.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }) }));
  expect(frame.scroll).toBeLessThanOrEqual(frame.width);
  expect(frame.slots.every((r) => r.left >= 0 && r.right <= frame.width && r.top >= 0 && r.bottom <= page.viewportSize()!.height)).toBe(true);
  await page.screenshot({ path: info.outputPath('rhino-preview.png') });
});

test('rhino approach shows the counter card and Mozi hint', async ({ page }, info) => {
  await page.context().addInitScript({ path: 'tools/qa/mute-audio.js' });
  if (info.project.name === 'landscape-1080x810') await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/gear-fort/?test=1&mute=1');
  await page.getByRole('button', { name: /开始/ }).first().click();
  await page.locator('.kit-start').waitFor({ state: 'detached' });
  await page.waitForFunction(() => !!(window as any).__gfApp);
  await page.evaluate(() => {
    const app = (window as any).__gfApp;
    app.battle({ ...app.level('1-11'), spawns: [[1, 2, 'boss:rhino', 1]], flags: [], endTick: 10000 }, ['shooter', 'farm', 'wall', 'lobber', 'beam', 'spikes']);
  });
  await expect(page.locator('.gf-card[data-card="lobber"].is-hint')).toBeVisible();
  await expect(page.locator('.gf-bubble--mozi .t')).toContainText('铜壳');
});

test('live battles use the gentler pace and show the actual grain rate', async ({ page }) => {
  async function backToMap(): Promise<void> {
    await page.evaluate(() => (window as any).__gf.pause());
    await page.locator('.gf-pausel [data-a="map"]').click();
    await expect(page.locator('.gf-map')).toBeVisible();
  }
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/gear-fort/?test=1');
  await page.getByRole('button', { name: /开始/ }).first().click();
  await page.waitForFunction(() => !!(window as any).__gfApp && !!(window as any).__gf);
  expect(await page.evaluate(() => ({ income: (window as any).__gf.S.im, cooldown: (window as any).__gf.S.cooldownPct }))).toEqual({ income: 100, cooldown: 100 });

  await backToMap();
  await page.evaluate(() => { const a = (window as any).__gfApp; a.play('1-2', a.level('1-2').loadout); });
  await page.waitForFunction(() => (window as any).__gf?.S.L.id === '1-2' && (window as any).__gf.S.tick > 1);
  expect(await page.evaluate(() => ({ income: (window as any).__gf.S.im, cooldown: (window as any).__gf.S.cooldownPct }))).toEqual({ income: 110, cooldown: 90 });
  await page.evaluate(() => (window as any).__gf.place('farm', 1, 0));
  await page.waitForFunction(() => (window as any).__gf.S.units.some((u: any) => u.k === 'farm'));
  expect(await page.evaluate(() => { const S = (window as any).__gf.S; const farm = S.units.find((u: any) => u.k === 'farm'); return S.cdReady.farm - farm.t0; })).toBe(108);
  await expect(page.locator('.gf-bin__rate')).toHaveText('每分钟 +238');

  await backToMap();
  await page.evaluate(() => (window as any).__gfApp.play('1-11', ['shooter', 'farm', 'wall', 'lobber', 'spikes', 'strike']));
  await page.waitForFunction(() => (window as any).__gf?.S.L.id === '1-11');
  expect(await page.evaluate(() => ({ income: (window as any).__gf.S.im, cooldown: (window as any).__gf.S.cooldownPct }))).toEqual({ income: 125, cooldown: 75 });

  await backToMap();
  await page.evaluate(() => (window as any).__gfApp.play('2-7', []));
  await page.waitForFunction(() => (window as any).__gf?.S.L.id === '2-7');
  expect(await page.evaluate(() => (window as any).__gf.S.beltPeriod)).toBe(255);
  expect(errors).toEqual([]);
});
