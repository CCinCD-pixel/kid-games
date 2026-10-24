import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
test.beforeEach(async ({ context }) => { await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') }); });

async function open(page: Page): Promise<void> {
  await page.goto('/sokoban/?test=1&screen=map&mute=1');
  await expect(page.locator('#app[data-ready]')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __sok: { unlockAll: () => void } }).__sok.unlockAll());
}

test('new chapters expose levels 35 through 66 on tablet and phone', async ({ page }, testInfo) => {
  await open(page);
  const viewports = testInfo.project.name.includes('portrait')
    ? [{ width: 810, height: 1080 }, { width: 390, height: 664 }, { width: 320, height: 568 }]
    : [{ width: 1080, height: 810 }, { width: 844, height: 390 }];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const chapter of [5, 6, 7, 8]) {
      await page.evaluate((ch) => (window as unknown as { __sok: { map: (n: number) => void } }).__sok.map(ch), chapter);
      await expect(page.locator(`[data-tab="${chapter}"].is-on`)).toBeAttached();
      for (let level = 1; level <= 8; level++) await expect(page.locator(`[data-testid="node-${chapter}-${level}"]`)).toBeAttached();
      const layout = await page.evaluate(() => {
        const tabs = document.querySelector('.sok-tabs')!;
        const active = tabs.querySelector('.is-on')!;
        const tr = tabs.getBoundingClientRect(), ar = active.getBoundingClientRect();
        const card = document.querySelector('.sok-chcard')!.getBoundingClientRect();
        return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, active: { left: ar.left, right: ar.right, top: ar.top, bottom: ar.bottom }, tabs: { left: tr.left, right: tr.right, top: tr.top, bottom: tr.bottom }, card: { left: card.left, right: card.right, top: card.top, bottom: card.bottom } };
      });
      expect(layout.documentWidth, `chapter ${chapter} ${viewport.width} horizontal overflow`).toBeLessThanOrEqual(layout.width + 1);
      expect(layout.active.left, `chapter ${chapter} tab clipped`).toBeGreaterThanOrEqual(layout.tabs.left - 1);
      expect(layout.active.right, `chapter ${chapter} tab clipped`).toBeLessThanOrEqual(layout.tabs.right + 1);
      expect(layout.active.top).toBeGreaterThanOrEqual(layout.tabs.top - 1);
      expect(layout.active.bottom).toBeLessThanOrEqual(layout.tabs.bottom + 1);
      expect(layout.card.left).toBeGreaterThanOrEqual(-1);
      expect(layout.card.right).toBeLessThanOrEqual(layout.width + 1);
    }
  }
  await page.evaluate(() => (window as unknown as { __sok: { load: (id: string) => void } }).__sok.load('8-8'));
  await expect(page.locator('#app[data-screen="play"]')).toBeVisible();
  await expect(page.locator('.sok-input')).toBeVisible();
});
