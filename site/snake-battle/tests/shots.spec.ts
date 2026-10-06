/**
 * shots.spec (spec §9.3; SB_SHOTS=1): every match mode × both orientations — screenshot, HUD rectangles
 * inside the view and never overlapping (§2.3), 2× crops of his head at m=20 and m=1000 (portrait), and
 * V14 pixel read-back: his body and an AI body vs. the floor right next to them (CIEDE2000 ≥ 25 or
 * contrast ≥ 2:1), read from the WebGL drawing buffer right after a frame is drawn.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { dE00, contrast, type Rgb } from '../validate/color';

const SHOTS = process.env.SB_SHOTS === '1';
const DIR = process.env.KG_SHOTS_DIR ?? '/tmp';
type Rect = { x: number; y: number; width: number; height: number; n: string };
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
const HUD = ['.sb-pill', '.sb-board', '.sb-mini', '.sb-boost', '.sb-pause', '.sb-goal', '.sb-pus'];
const CASES: [string, string, string, string?][] = [['timed-moon', 'timed', 'moon'], ['timed-mars', 'timed', 'mars'], ['timed-jupiter', 'timed', 'jupiter'], ['timed-blackhole', 'timed', 'blackhole'], ['endless-moon', 'endless', 'moon'], ['mission-rings', 'mission', 'moon', 'c1m1'], ['mission-race', 'mission', 'moon', 'c3m7'], ['mission-king', 'mission', 'moon', 'c5m7']];

async function boot(page: Page) {
  await page.goto('/snake-battle/?test=1&nogate');
  await page.waitForSelector('#app[data-ready]');
  await page.evaluate(() => { (window as any).__sbApp.save.data.firstRunDone = true; });
}
async function readBack(page: Page) {
  return page.evaluate(() => {
    const { view, match } = (window as any).__sb; const gl = view.R.gl as WebGL2RenderingContext; const cv = gl.canvas as HTMLCanvasElement;
    const k = cv.width / cv.clientWidth;
    for (const s of match.world.snakes) s.protect = 0;   // spawn protection draws bodies at 55 % opacity
    view.frame(0);
    const px = (wx: number, wy: number) => { const [sx, sy] = view.worldToScreen(wx, wy); const b = new Uint8Array(4); gl.readPixels(Math.round(sx * k), Math.round(cv.height - sy * k), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return [b[0], b[1], b[2]]; };
    const body = (s: any) => { const q = s.idx(Math.min(s.n - 1, 6)); return [s.px[q], s.py[q]]; };
    const floorNear = (x: number, y: number, r: number) => { const out: number[][] = []; for (let a = 0; a < 8; a++) out.push(px(x + Math.cos(a * 0.785) * r * 5, y + Math.sin(a * 0.785) * r * 5)); out.sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2])); return out[3]; };
    const me = match.me, [mx, my] = body(me);
    const ai = match.world.snakes.filter((s: any) => s.alive && !s.isPlayer && view.onScreen(s.x, s.y, -60)).sort((a: any, b: any) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    const res: Record<string, number[][]> = { me: [px(mx, my), floorNear(mx, my, me.r)] };
    if (ai) { const [ax, ay] = body(ai); res.ai = [px(ax, ay), floorNear(ax, ay, ai.r)]; }
    return res;
  });
}

test.describe('snake-battle shots', () => {
  test.skip(!SHOTS, 'SB_SHOTS=1 only');
  for (const [name, mode, venue, mission] of CASES) {
    test(`shots ${name}`, async ({ page }, info) => {
      const orient = info.project.name.startsWith('portrait') ? 'portrait' : 'landscape';
      await boot(page);
      await page.evaluate(({ mode, venue, mission }) => (window as any).__sbApp.startMatch(mode, venue, { seed: 21, countdown: false, ...(mission ? { mission } : {}) }), { mode, venue, mission });
      await page.waitForTimeout(1400);
      fs.mkdirSync(path.join(DIR, orient), { recursive: true });
      await page.screenshot({ path: path.join(DIR, orient, `shots-${name}.png`) });
      const vp = page.viewportSize()!;
      const rects: Rect[] = [];
      for (const sel of HUD) for (const r of await page.locator(sel).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent && getComputedStyle(e).visibility !== 'hidden').map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }))) if (r.width > 0 && r.height > 0) rects.push({ ...r, n: sel });
      for (const r of rects) { expect(r.x, `${r.n} inside`).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(vp.width + 0.5); expect(r.y + r.height).toBeLessThanOrEqual(vp.height + 0.5); }
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j]), `${rects[i].n} × ${rects[j].n}`).toBe(false);
      if (mode === 'timed') {
        const rb = await readBack(page);
        for (const [who, [c, f]] of Object.entries(rb)) {
          const d = dE00(c as Rgb, f as Rgb), k = contrast(c as Rgb, f as Rgb);
          expect(d >= 25 || k >= 2, `${name} ${who} ${c} vs floor ${f}: ΔE00 ${d.toFixed(1)}, contrast ${k.toFixed(2)}`).toBe(true);
        }
      }
      if (orient === 'portrait' && name === 'timed-moon') {
        for (const m of [20, 1000]) {
          await page.evaluate((m) => { const { match } = (window as any).__sb; const me = match.me; me.spawn(me.x, me.y, me.angle, m, match.world.t); me.protect = 0; match.world.rebuildHash(); }, m);
          await page.waitForTimeout(900);
          const [x, y] = await page.evaluate(() => { const { view, match } = (window as any).__sb; return view.worldToScreen(match.me.x, match.me.y); });
          await page.screenshot({ path: path.join(DIR, orient, `crop-head-m${m}.png`), clip: { x: Math.max(0, x - 100), y: Math.max(0, y - 100), width: 200, height: 200 } });
        }
      }
    });
  }
});
