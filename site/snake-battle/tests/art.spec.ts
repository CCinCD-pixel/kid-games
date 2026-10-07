/**
 * V14 sprite gate (spec §9.2 V14, 'art.test'): measured on the real match atlas in WebKit via `?dev=art`
 * (src/dev/art.ts). 9 persona faces pairwise silhouette IoU ≤ 0.80; every isolated feature of every sprite
 * (opaque or dark-ink component) ≥ 2 texels thick at the smallest size tier (mip level 2 = ¼ cell).
 */
import { expect, test } from '@playwright/test';

test('V14 art: persona faces are distinct, no line vanishes at the smallest tier', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('landscape'), 'orientation-independent');
  await page.goto('/snake-battle/?dev=art');
  await page.waitForSelector('#app[data-ready]');
  const r = await page.evaluate(() => (window as unknown as { __art: { iou: { a: string; b: string; v: number }[]; maxIoU: { a: string; b: string; v: number }; thin: { key: string; layer: string; area: number; maxDT: number }[]; thinOutlines: string[]; sprites: number; features: number } }).__art);
  console.log(`[V14 art] faces: max IoU ${r.maxIoU.v.toFixed(2)} (${r.maxIoU.a}/${r.maxIoU.b}); top: ${r.iou.slice(0, 4).map((x) => `${x.a}/${x.b} ${x.v.toFixed(2)}`).join(', ')}`);
  console.log(`[V14 art] lines: ${r.sprites} sprites, ${r.features} features; thin: ${r.thin.map((t) => `${t.key}/${t.layer} dt${t.maxDT.toFixed(1)} a${t.area}`).join(', ') || 'none'}`);
  console.log(`[V14 art] rims (not gated): ${r.thinOutlines.join(', ')}`);
  expect(r.maxIoU.v).toBeLessThanOrEqual(0.8);
  expect(r.thin.map((t) => `${t.key}/${t.layer} maxDT ${t.maxDT.toFixed(1)}`)).toEqual([]);
});
