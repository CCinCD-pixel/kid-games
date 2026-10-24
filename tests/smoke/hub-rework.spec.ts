import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test.beforeEach(async ({ context }) => { await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') }); });

test('two hub places and xiangqi progress fit on narrow screens', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('kg:hub:tab', 'classic');
    localStorage.setItem('kg:hub:v1', JSON.stringify({ xiangqi: { label: '学堂 33/33 · 小局 28/28', value: 1, updatedAt: Date.now() } }));
  });
  await page.goto('/?mute=1');
  await expect(page.locator('#hub-tabs button')).toHaveCount(2);
  await expect(page.locator('#hub-panel-base')).toBeVisible();
  await expect(page.locator('#hub-panel-classic')).toHaveCount(0);
  await expect(page.locator('[data-game="chess"]')).toHaveAttribute('data-place', 'base');
  for (const width of [320, 390, 810, 1080]) {
    await page.setViewportSize({ width, height: width === 1080 ? 810 : width === 810 ? 1080 : 700 });
    const layout = await page.locator('[data-game="xiangqi"]').evaluate((card) => {
      const foot = card.querySelector('.xg-card__foot')!;
      const label = card.querySelector('.hub-card__label')!;
      const cr = card.getBoundingClientRect(), fr = foot.getBoundingClientRect(), lr = label.getBoundingClientRect();
      return { viewport: innerWidth, scroll: document.documentElement.scrollWidth, cardRight: cr.right, footRight: fr.right, labelRight: lr.right, labelScroll: label.scrollWidth, labelWidth: label.clientWidth };
    });
    expect(layout.scroll, `${width}px page overflow`).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.footRight, `${width}px foot overflow`).toBeLessThanOrEqual(layout.cardRight + 1);
    expect(layout.labelRight, `${width}px label overflow`).toBeLessThanOrEqual(layout.footRight + 1);
    expect(layout.labelScroll, `${width}px label clipped`).toBeLessThanOrEqual(layout.labelWidth + 1);
  }
});
