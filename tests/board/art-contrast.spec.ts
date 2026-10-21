// 烘焙像素取样：对游乐场里真正烘出来的象棋圆片（canvas 像素，不是配方里的色值）逐像素算 WCAG 对比度——
// 字形"实心核心"的墨色 对 圆片面内（半径 0.78R，字形所在处）所有像素的最差值。红子 ≥ 4.5（规格 V7），黑子（浅字深漆）同样 ≥ 4.5（实测 4.8–5.0，别回退）。
import { expect, test } from '@playwright/test';
import { boardPage } from '../../engines/board/test/pw';

/* eslint-disable @typescript-eslint/no-explicit-any */
test('烘焙后的棋子：字对底最差像素对比度（红、黑都 ≥ 4.5）', async ({ page }, info) => {
  await page.goto('/dev/board/?mute=1&bot=0&safe=24,0,20,0&game=xq', { waitUntil: 'networkidle' }); await boardPage(page).waitReady(); await page.waitForTimeout(400);
  const rows = await page.evaluate(() => {
    const lin = (c: number): number => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; const lum = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const cr = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); const nodes = [...document.querySelectorAll('.bk-toy')] as HTMLElement[];
    return { n: nodes.length, canvases: nodes.slice(0, 40).map((n) => { const [body, glyph] = n.children as unknown as HTMLCanvasElement[]; const S = body.width; const bx = body.getContext('2d')!.getImageData(0, 0, S, S).data, gx = glyph.getContext('2d')!.getImageData(0, 0, S, S).data; const R = 0.43 * S, T = 0.07 * S, cx = S / 2, cy = S / 2 - T / 2 - 0.005 * S;
      const counts = new Map<string, number>(); for (let i = 0; i < gx.length; i += 4) if (gx[i + 3] >= 250) { const k = `${gx[i]},${gx[i + 1]},${gx[i + 2]}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
      let ink: string | null = null, best = 0; for (const [k, v] of counts) if (v > best) { best = v; ink = k; } if (!ink) return { S, ink: null, min: 0 };
      const [ir, ig, ib] = ink.split(',').map(Number); const L = lum(ir, ig, ib); let min = 99, dark = [0, 0, 0], light = [0, 0, 0], dL = 9, lL = -1;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { if (Math.hypot(x - cx, y - cy) > 0.78 * R) continue; const i = (y * S + x) * 4; if (bx[i + 3] < 250) continue; const l2 = lum(bx[i], bx[i + 1], bx[i + 2]); const c = cr(L, l2); if (c < min) min = c; if (l2 < dL) { dL = l2; dark = [bx[i], bx[i + 1], bx[i + 2]]; } if (l2 > lL) { lL = l2; light = [bx[i], bx[i + 1], bx[i + 2]]; } }
      const mi = (Math.round(cy) * S + Math.round(cx)) * 4; const red = lum(bx[mi], bx[mi + 1], bx[mi + 2]) > 0.3; return { S, ink, inkLum: L, min, dark, light, red }; }) };
  });
  const list = (rows as any).canvases as { S: number; ink: string | null; min: number; red?: boolean; dark?: number[]; light?: number[] }[]; expect(list.length).toBeGreaterThan(10);
  const red = list.filter((x) => x.ink && x.red), blk = list.filter((x) => x.ink && !x.red); expect(red.length).toBeGreaterThan(5); expect(blk.length).toBeGreaterThan(5);
  const rmin = Math.min(...red.map((x) => x.min)), bmin = Math.min(...blk.map((x) => x.min)); console.info(`[${info.project.name}] 烘焙像素对比度：红子最差 ${rmin.toFixed(2)}（${red.length} 个节点），黑子最差 ${bmin.toFixed(2)}（${blk.length} 个节点），位图边长 ${list[0].S}px`);
  expect(rmin).toBeGreaterThanOrEqual(4.5); expect(bmin).toBeGreaterThanOrEqual(4.5);
});
