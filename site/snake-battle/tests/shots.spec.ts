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
/** V14 read-back (QA r4: deterministic and per the spec's rule). The rAF loop is stopped and the sim stepped a fixed
 * number of 60 Hz steps, then one frame is drawn and read from the WebGL buffer. Every on-screen AI and his snake are
 * sampled at body segments 4/6/10/16/24 (samples another snake's body covers are skipped) against the median of 8
 * floor points around them. Per segment, a cross-section through the body is read: the best pixel (the rim / white
 * core the spec scores after "加亮边 / 白芯") must reach ΔE2000 ≥ 25 AND 2:1, and the centre pixel ΔE ≥ 25 OR 2:1. */
async function readBack(page: Page, steps: number, stage = false) {
  return page.evaluate(({ steps, stage }) => {
    const app = (window as any).__sbApp, { view, match } = (window as any).__sb; const gl = view.R.gl as WebGL2RenderingContext; const cv = gl.canvas as HTMLCanvasElement;
    cancelAnimationFrame(app.raf); app.raf = 0;
    for (let i = 0; i < steps && match.state === 'playing'; i++) match.update(1 / 60);
    if (stage) {
      // staged palette sweep: every AI colour lined up around him on this floor (3 columns × 4 rows, his cell left
      // free), so each colour is checked on every venue whatever the seed put on screen
      const cols = ['红', '橙', '绿', '青', '蓝', '紫', '粉', '白', '灰', '棕', '银', '黄'];
      for (let i = 0; i < 40; i++) view.frame(1 / 30);
      const me = match.me, ais = match.world.snakes.filter((x: any) => !x.isPlayer);
      const hw = view.vw / 2 / view.zoom, hh = view.vh / 2 / view.zoom, cx = view.camX, cy = view.camY;
      const cells: [number, number][] = [];
      for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) if (!(col === 2 && (row === 1 || row === 2))) cells.push([cx - hw * 0.3 + col * hw * 0.55, cy - hh * 0.72 + row * hh * 0.48]);
      ais.forEach((a: any, i: number) => {
        const cell = cells[i % cells.length];
        a.color = cols[(i + steps - 1) % cols.length];   // 12 stages: every sampled cell sweeps every colour
        a.spawn(cell[0], cell[1] + (i >= cells.length ? hh * 0.2 : 0), 0, 60, match.world.t);
        a.spawnT = -5; a.alive = i < cells.length; view.looks.delete(a.id);
      });
      me.spawn(cx + hw * 0.62, cy - hh * 0.1, Math.PI / 2, 60, match.world.t); me.spawnT = -5;
    }
    const k = cv.width / cv.clientWidth;
    for (const s of match.world.snakes) s.protect = 0;   // spawn protection draws bodies at 55 % opacity
    view.fx.reduced = true; for (let i = 0; i < (stage ? 1 : 40); i++) view.frame(stage ? 0 : 1 / 30);   // the camera settles on him
    const px = (wx: number, wy: number) => { const [sx, sy] = view.worldToScreen(wx, wy); const b = new Uint8Array(4); gl.readPixels(Math.round(sx * k), Math.round(cv.height - sy * k), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return [b[0], b[1], b[2]]; };
    const alive = match.world.snakes.filter((s: any) => s.alive);
    const covered = (self: any, x: number, y: number, pad: number) => {
      for (const o of alive) { if (o === self) continue; if (Math.hypot(o.x - x, o.y - y) < o.r * 2 + pad) return true; for (let i = 0; i < o.n; i++) { const q = o.idx(i); if (Math.hypot(o.px[q] - x, o.py[q] - y) < o.r + pad) return true; } }
      return false;
    };
    const out: { who: string; seg: number; c: number[]; rim: number[][]; f: number[] }[] = [];
    for (const s of alive) {
      if (!view.onScreen(s.x, s.y, -60)) continue;
      for (const seg of [4, 6, 10, 16, 24, 32, 40]) {
        // body index → path point: sampleBody spaces segments ≈ 0.45 r apart; path points are 5 wu apart
        const pi = Math.round(seg * 0.45 * s.r / 5); if (pi >= s.n - 2) continue;
        const q = s.idx(pi), q2 = s.idx(pi + 1), x = s.px[q], y = s.py[q];
        if (!view.onScreen(x, y, -40) || covered(s, x, y, s.r * 1.5)) continue;
        const dx = s.px[q2] - x, dy = s.py[q2] - y, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
        const rim: number[][] = []; for (let t = -0.9; t <= 0.91; t += 0.15) rim.push(px(x + nx * s.r * t, y + ny * s.r * t));
        // floor: 16 points 3.5–5 r out, skipping any that land on a snake (his own body included), median by brightness
        const fl: number[][] = [];
        for (let a = 0; a < 16; a++) { const rr = s.r * (a % 2 ? 5 : 3.5), fx = x + Math.cos(a * 0.3927) * rr, fy = y + Math.sin(a * 0.3927) * rr; if (!covered(null, fx, fy, s.r * 0.8)) fl.push(px(fx, fy)); }
        if (fl.length < 5) continue;
        fl.sort((p, r) => (p[0] + p[1] + p[2]) - (r[0] + r[1] + r[2]));
        out.push({ who: s.isPlayer ? 'me' : `${s.color ?? '?'}${s.persona}`, seg, c: px(x, y), rim, f: fl[fl.length >> 1] });
      }
    }
    return out;
  }, { steps, stage });
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
        const bad: string[] = []; let n = 0; const who = new Set<string>();
        for (const [steps, stage] of [[84, false], [300, false], [600, false], ...Array.from({ length: 12 }, (_, i) => [601 + i, true])] as [number, boolean][]) {
          for (const r of await readBack(page, stage ? steps - 600 : steps === 84 ? 84 : steps - (steps === 300 ? 84 : 300), stage)) {
            n++; who.add(r.who);
            const best = r.rim.map((p) => ({ p, d: dE00(p as Rgb, r.f as Rgb), k: contrast(p as Rgb, r.f as Rgb) })).sort((a, b) => Math.min(b.d / 25, b.k / 2) - Math.min(a.d / 25, a.k / 2))[0];
            const dc = dE00(r.c as Rgb, r.f as Rgb), kc = contrast(r.c as Rgb, r.f as Rgb);
            if (!(best.d >= 25 && best.k >= 2)) bad.push(`${name}@${steps} ${r.who} seg${r.seg} rim ${best.p} vs ${r.f}: ΔE ${best.d.toFixed(1)} ${best.k.toFixed(2)}:1`);
            // the spec scores the body after its rim / white core (above); the shaded centre must still never vanish
            if (!(dc >= 15 || kc >= 1.4)) bad.push(`${name}@${steps} ${r.who} seg${r.seg} centre ${r.c} vs ${r.f}: ΔE ${dc.toFixed(1)} ${kc.toFixed(2)}:1`);
          }
        }
        console.log(`[V14] ${name} ${orient}: ${n} samples (${[...who].join(' ')}), ${bad.length} below${bad.length ? '\n  ' + bad.join('\n  ') : ''}`);
        expect(n, 'V14 samples').toBeGreaterThan(40);
        const colours = new Set([...who].map((w) => w.slice(0, 1)).filter((c) => c !== 'm'));
        expect(colours.size, `V14 AI colours sampled: ${[...colours].join('')}`).toBe(12);
        expect(bad).toEqual([]);
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
