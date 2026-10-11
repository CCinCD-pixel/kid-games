import { expect, test } from '@playwright/test';

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
