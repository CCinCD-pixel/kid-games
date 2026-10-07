// V15 (spec §9.1, §6.5) in WebKit: the real art modules are imported from the dev server and drawn offscreen.
//  · silhouettes: every volume-1 machine + Boss as a pure black silhouette at 32 px and 48 px height, pairwise IoU ≤ 0.70
//  · atlas: all parts bake into ≤ 3 pages of 2048², baking takes < 400 ms on the desktop
// (Volume-2 rigs arrive in build stage 2; add them to KINDS then.)
import { test, expect } from '@playwright/test';

const KINDS = ['walker', 'shielder', 'ram', 'ant', 'brute', 'rhino'];
test('V15 silhouettes are pairwise distinct; the atlas fits its page budget', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('landscape'), 'resolution-independent: run once');
  await page.goto('/gear-fort/?test=1');
  // imports the source modules, so it needs the dev server (the platform smoke config serves the production build)
  const dev = await page.evaluate(() => fetch('/gear-fort/src/render/atlas.ts').then((x) => x.ok && !/html/.test(x.headers.get('content-type') || '')).catch(() => false));
  test.skip(!dev, 'needs the dev server (source modules): npx playwright test -c tests/gear-fort/playwright.dev.config.ts');
  const r = await page.evaluate(async (kinds) => {
    const { Atlas } = await import('/gear-fort/src/render/atlas.ts' as string);
    const { drawRig } = await import('/gear-fort/src/render/atlas.ts' as string);
    const { RIGS, poseOf } = await import('/gear-fort/src/art/rigs.ts' as string);
    const rigIcon = (_a: unknown, kind: string, size: number, _dpr?: number): HTMLCanvasElement => { // one machine, standing pose, as on the board
      const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d')!; const pose = {};
      poseOf(kind, { t: 0.4, walk: 0, atk: 0, hurt: 0, mode: 0, hp: 1, extra: 1 }, pose);
      const k = (size * 0.8) / (RIGS[kind].height + 40); drawRig(g, atlas, kind, pose, size / 2, size * 0.92, k, 1); return c;
    };
    const atlas = new Atlas(2);
    const mask = (kind: string, H: number): Uint8Array => {
      const src = rigIcon(atlas, kind, 160, 1) as HTMLCanvasElement; const d = src.getContext('2d')!.getImageData(0, 0, 160, 160).data;
      let x0 = 160, y0 = 160, x1 = -1, y1 = -1;
      for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) if (d[(y * 160 + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const w = x1 - x0 + 1, h = y1 - y0 + 1; const W = 2 * H; const s = H / h;
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
      g.drawImage(src, x0, y0, w, h, Math.round((W - w * s) / 2), 0, w * s, H);
      const e = g.getImageData(0, 0, W, H).data; const m = new Uint8Array(W * H); for (let i = 0; i < m.length; i++) m[i] = e[i * 4 + 3] > 128 ? 1 : 0; return m;
    };
    const out: { pair: string; H: number; iou: number }[] = [];
    for (const H of [32, 48]) {
      const ms = kinds.map((k) => mask(k, H));
      for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
        let a = 0, b = 0; for (let p = 0; p < ms[i].length; p++) { a += ms[i][p] & ms[j][p]; b += ms[i][p] | ms[j][p]; }
        out.push({ pair: `${kinds[i]}/${kinds[j]}`, H, iou: +(a / Math.max(1, b)).toFixed(3) });
      }
    }
    return { out, pages: Math.ceil(atlas.page.height / 2048) * Math.ceil(atlas.page.width / 2048), bakeMs: Math.round(atlas.bakeMs), size: [atlas.page.width, atlas.page.height] };
  }, KINDS);
  console.log('V15', JSON.stringify({ pages: r.pages, bakeMs: r.bakeMs, size: r.size, worst: [...r.out].sort((p, q) => q.iou - p.iou).slice(0, 4) }));
  for (const x of r.out) expect(x.iou, `${x.pair} @${x.H}px`).toBeLessThanOrEqual(0.7);
  expect(r.pages).toBeLessThanOrEqual(3); expect(r.bakeMs).toBeLessThan(400);
});
