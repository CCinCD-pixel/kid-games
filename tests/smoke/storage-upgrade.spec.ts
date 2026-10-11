import { expect, test } from '@playwright/test';

test('progress survives navigation and an older page cannot overwrite a newer save', async ({ page }, info) => {
  test.skip(info.project.name !== 'portrait-810x1080', 'storage case runs once');
  await page.context().addInitScript({ path: 'tools/qa/mute-audio.js' });
  await page.goto('/snake-battle/?test=1&nogate&mute=1');
  await page.waitForSelector('#app[data-ready]');
  await page.evaluate(() => {
    const save = (window as any).__sbApp.save;
    save.data.firstRunDone = true;
    save.save();
  });
  await page.goto('/?mute=1');
  await page.goto('/snake-battle/?test=1&nogate&mute=1');
  await page.waitForSelector('#app[data-ready]');
  expect(await page.evaluate(() => (window as any).__sbApp.save.data.firstRunDone)).toBe(true);
  const future = JSON.stringify({ v: 99, updatedAt: Date.now() + 1, data: { future: true } });
  await page.evaluate((raw) => {
    localStorage.setItem('kg:v1:snake-battle', raw);
    (window as any).__sbApp.save.save();
  }, future);
  expect(await page.evaluate(() => localStorage.getItem('kg:v1:snake-battle'))).toBe(future);
});
