#!/usr/bin/env node
/**
 * 星晶消消乐 frame-time check (spec §8.9, V11): ONE headless Chromium (muted) with the CPU throttled 4×
 * through CDP (≈ an A13; Playwright's WebKit cannot throttle), driving the real page through the
 * ?test=1 hook on the dev server: level start → ready time, then heavy moves (the 9×9 2-10 board,
 * the 1-08 rocket combo, the 3-06 drone squadron, and the spec's heaviest scene: an OO full-board clear
 * on the 9×9 2-10 board from two orbs planted through __em.plant, then 2 more best moves) with every rAF interval and the main-thread work
 * inside the game's rAF callbacks (timeline + particles + canvas draw) recorded while the board
 * animates. Gate (spec): main-thread work per frame p95 ≤ 12 ms at ×4. Headless Chromium rasterises
 * canvases in software, so the rAF interval itself is pessimistic next to the iPad's GPU canvas.
 *   node tools/emoji-match/perf.mjs [--port=5305] [--rate=4]   → ~/kid-games-work/emoji-match/perf.json
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const PORT = (process.argv.find((a) => a.startsWith('--port=')) ?? '--port=5305').split('=')[1];
const RATE = Number((process.argv.find((a) => a.startsWith('--rate=')) ?? '--rate=4').split('=')[1]);
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser (RESOURCE RULES)`); process.exit(2); }
const ALL = ['swap', 'rocket', 'tap', 'prop', 'bomb', 'energy', 'orb', 'comboRR', 'dust', 'boosterDrill', 'dust2', 'comboBB', 'comboRB', 'crate', 'boosterTractor', 'crate2', 'comboPP', 'comboP', 'ice', 'boosterIon', 'ice2', 'comboOR'];

const browser = await chromium.launch({ args: ['--mute-audio'] });
const report = { rate: RATE, at: new Date().toISOString(), scenes: [] };
try {
  const ctx = await browser.newContext({ viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  await ctx.addInitScript({ path: path.join(process.cwd(), 'tools/qa/mute-audio.js') }).catch(() => {});
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`http://localhost:${PORT}/emoji-match/?test=1`);
  await page.waitForSelector('#app[data-ready]', { timeout: 30000 });
  await page.evaluate((i) => { window.__em.setSave({ intros: i }); window.__em.timeScale(1); }, ALL);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  // rAF interval recorder + main-thread work inside the game's rAF callbacks (update + draw)
  await page.evaluate(() => {
    const w = window; w.__frames = []; w.__work = []; let last = 0, on = false;
    w.__rec = (b) => { on = b; last = 0; };
    const raf = window.requestAnimationFrame.bind(window);
    const tick = (t) => { if (on) { if (last) w.__frames.push(t - last); last = t; } raf(tick); };
    raf(tick);
    window.requestAnimationFrame = (cb) => raf((t) => { const a = performance.now(); cb(t); if (on) w.__work.push(performance.now() - a); });
  });
  const scene = async (name, id, seed, moves, pick) => {
    const t0 = Date.now();
    await page.evaluate(([i, s]) => { window.__em.setSeed(s); window.__em.goto({ s: 'play', id: i }); }, [id, seed]);
    await page.waitForFunction(() => window.__em.state()?.ready === true, null, { timeout: 30000 });
    const readyMs = Date.now() - t0;
    await page.evaluate(() => { window.__frames = []; window.__work = []; window.__rec(true); });
    for (let k = 0; k < moves; k += 1) {
      const m = await page.evaluate((p) => {
        if (p === 'oo' && !window.__oo) {
          // spec §8.9 heaviest scene: two adjacent 星核 (orbs) planted near the centre of the 9×9 board, swapped
          // = OO full-board clear (every cell hit once) + white flash + shake, then the refill cascades
          const W = window.__em.width();
          for (let d = 0; d < W * W; d += 1) {
            const c = Math.floor((W * W) / 2) + (d % 2 ? -1 : 1) * Math.ceil(d / 2);
            if (c % W === W - 1) continue;
            const got = window.__em.plant([[c, 6], [c + 1, 6]]);
            if (got.length === 2) { window.__oo = true; return { t: 'swap', a: c, b: c + 1 }; }
          }
        }
        return (p === 'lesson' && window.__em.lessonMove()) || window.__em.bestMove();
      }, pick);
      if (!m) break;
      await page.evaluate((x) => window.__em.play(x), m);
      await page.waitForFunction(() => { const s = window.__em.state(); return s && (s.ready || s.done); }, null, { timeout: 60000 });
    }
    const [f, wk] = await page.evaluate(() => { window.__rec(false); return [window.__frames, window.__work]; });
    const s = [...f].sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
    const w = [...wk].sort((a, b) => a - b), qw = (p) => w[Math.min(w.length - 1, Math.floor(p * w.length))] ?? 0;
    const oo = pick === 'oo' ? await page.evaluate(() => !!window.__oo) : undefined;
    if (pick === 'oo' && !oo) throw new Error('OO scene: could not plant two adjacent orbs');
    const r = { name, id, ...(oo !== undefined ? { ooPlanted: oo } : {}), readyMs, frames: s.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +(s[s.length - 1] ?? 0).toFixed(1), over50: s.filter((x) => x > 50).length, workP50: +qw(0.5).toFixed(1), workP95: +qw(0.95).toFixed(1), workMax: +(w[w.length - 1] ?? 0).toFixed(1) };
    report.scenes.push(r);
    console.log(`${name.padEnd(28)} ready ${String(readyMs).padStart(5)} ms  interval p50 ${r.p50} / p95 ${r.p95} / max ${r.max} ms  ·  main-thread work per frame p50 ${r.workP50} / p95 ${r.workP95} / max ${r.workMax} ms`);
  };
  await scene('2-10 9×9, 4 best moves', '2-10', 1, 4, 'best');
  await scene('1-08 rocket combo (lesson)', '1-08', 1, 2, 'lesson');
  await scene('3-06 drone squadron (lesson)', '3-06', 1, 2, 'lesson');
  await scene('4-10 9×9 three goals', '4-10', 2, 4, 'best');
  await scene('2-10 9×9 OO combo + cascades', '2-10', 3, 3, 'oo');
  const all = report.scenes;
  report.ok = all.every((r) => r.workP95 <= 12);
  console.log(report.ok ? `OK  (CPU ×${RATE}: main-thread work per animation frame p95 ≤ 12 ms in every scene)` : 'SLOW — main-thread work p95 > 12 ms somewhere (perf.json)');
  fs.writeFileSync(path.join(os.homedir(), 'kid-games-work/emoji-match/perf.json'), JSON.stringify(report, null, 1));
  await ctx.close();
} finally {
  await browser.close();
}
