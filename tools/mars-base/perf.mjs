#!/usr/bin/env node
// V11 performance gate (spec §8.6 / §9): ONE browser, CPU-throttled (Chromium + CDP Emulation.setCPUThrottlingRate; WebKit under Playwright has no CPU
// throttle, so WebKit runs unthrottled as a second opinion). Scenes (through ?test=1): map first paint · 10 flag drags (number line + magnifier) ·
// 20 tray operations (real clicks) · the 对质 demo after a wrong delivery · idle rAF. Metrics: drag frame p95, first paint, input feedback p95
// (pointerdown → second rAF), DOM nodes / svg paths per scene, decoded audio bytes.
//   MARS_BASE_URL=http://localhost:5323 node tools/mars-base/perf.mjs [--engine chromium|webkit] [--throttle 4] [--out file.json]
// Thresholds (iPad 9 / A13 ≈ Chromium ×4 on this Mac): drag p95 ≤ 16.7 ms (+0.6 ms: the headless display clock ticks 16.6–16.8, so a flawless run read 16.7 or 16.8 at random) · drag main-thread busy ≤ 8.3 ms per frame (half a frame, the real headroom) · first paint ≤ 120 ms · input feedback p95 ≤ 100 ms · DOM ≤ 1500 · path ≤ 400 · decoded ≤ 48 MB
// · soak (Chromium, 28 open/leave cycles, after GC, cycle 5 → 28): DOM nodes +≤60, listeners +≤60, JS heap +≤3 MB (memory flat).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, webkit } from '@playwright/test';
import { SOAK, SCREENS, present, soak } from './soak-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const engine = arg('engine', 'chromium'); const throttle = Number(arg('throttle', engine === 'chromium' ? 4 : 1));
const BASE = process.env.MARS_BASE_URL ?? 'http://localhost:5323';
const out = arg('out', path.join(os.homedir(), `kid-games-work/state/rr/perf-${engine}-x${throttle}.json`));
const T = { dragP95: 16.7, vsyncJitter: 0.6, dragBusy: 8.3, firstPaint: 120, feedbackP95: 100, dom: 1500, paths: 400, decodedMB: 48, soakNodes: SOAK.maxNodes, soakListeners: SOAK.maxListeners, soakHeapMB: SOAK.maxHeapMB };
const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] : 0; };
const LIT = { state: 'lit', attempts: 1, at: 1 };
const SAVE = { onboarded: true, session: { index: 3, lastActiveAt: Date.now(), missions: 3 }, cert: { C1: LIT, C2: LIT, C3: LIT }, probes: { vault: { done: true }, factory: { done: true }, balance: { done: true } } };

const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chromium' ? { args: ['--mute-audio'] } : {});
const res = { engine, throttle, base: BASE, scenes: {} };
try {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: false, locale: 'zh-CN' });
  await ctx.addInitScript({ path: path.resolve(path.dirname(new URL(import.meta.url).pathname), '../qa/mute-audio.js') });
  await ctx.addInitScript(() => { window.__raf = 0; const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { window.__raf++; return r(cb); }; });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  const cdp = engine === 'chromium' ? await ctx.newCDPSession(page) : null;
  await page.goto(`${BASE}/mars-base/?test=1&mute=1`); await page.locator('.kit-start__go').click().catch(() => {});
  await page.waitForSelector('#app[data-ready]'); await page.waitForFunction(() => !!window.__mars);
  await page.evaluate((s) => window.__mars.setSave(s), SAVE); await page.waitForSelector('.mb-map');
  if (cdp && throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const counts = () => page.evaluate(() => ({ dom: document.querySelectorAll('*').length, paths: Math.max(0, ...[...document.querySelectorAll('svg')].map((s) => s.querySelectorAll('path,rect,circle,line,polygon').length)), allPaths: document.querySelectorAll('path').length, decodedMB: window.__mars.decodedBytes() / 1048576 }));
  const idleRaf = async () => { await page.waitForTimeout(400); const a = await page.evaluate(() => window.__raf); await page.waitForTimeout(1500); return (await page.evaluate(() => window.__raf)) - a; };

  // 1 — map first paint: goMap() → second rAF (the map is rebuilt from scratch)
  const paints = [];
  for (let i = 0; i < 5; i++) paints.push(await page.evaluate(async () => { const t0 = performance.now(); window.__mars.goMap(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t0; }));
  res.scenes.map = { firstPaintMs: Math.round(p95(paints)), runs: paints.map((x) => Math.round(x)), ...(await counts()), idleRaf: await idleRaf() };

  // 2 — ten flag drags with the magnifier (real pointer; frames sampled in the page)
  await page.evaluate(() => window.__mars.start('orbit.O2.2')); await page.waitForSelector('.mb-stage .nl[data-kind="place"]');
  const frames = [];
  // headroom beyond the vsync quantum: main-thread busy time (CDP TaskDuration, throttled) per drag frame
  const busy = async () => { if (!cdp) return 0; const m = await cdp.send('Performance.getMetrics'); return (m.metrics.find((x) => x.name === 'TaskDuration')?.value ?? 0) * 1000; };
  if (cdp) await cdp.send('Performance.enable'); const busy0 = await busy();
  for (let k = 0; k < 10; k++) {
    const b = await page.locator('.mb-stage .nl-svg').boundingBox(); const y = await page.evaluate(() => window.__nlCtl.trackClientY()); const x0 = b.x + 40 + ((k * 37) % 5) * 20; const x1 = b.x + 60 + ((k * 211) % (b.width - 120));
    await page.evaluate(() => { window.__fr = []; window.__run = true; const tick = (t) => { window.__fr.push(t); if (window.__run) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await page.mouse.move(x0, y); await page.mouse.down();
    for (let s = 1; s <= 40; s++) { await page.mouse.move(x0 + ((x1 - x0) * s) / 40, y); await page.waitForTimeout(8); }
    await page.mouse.up(); await page.evaluate(() => { window.__run = false; });
    const fr = await page.evaluate(() => window.__fr); for (let i = 1; i < fr.length; i++) frames.push(fr[i] - fr[i - 1]);
  }
  const busyMs = (await busy()) - busy0;
  res.scenes.drag = { frames: frames.length, busyPerFrameMs: +(busyMs / Math.max(1, frames.length)).toFixed(2), frameP95Ms: +p95(frames).toFixed(1), frameMedianMs: +[...frames].sort((a, b) => a - b)[Math.floor(frames.length / 2)].toFixed(1), ...(await counts()) };
  res.scenes.mission = { idleRaf: await idleRaf() };

  // 3 — twenty tray operations (real clicks), input feedback = pointerdown → second rAF after the click
  await page.evaluate(() => window.__mars.goMap()); await page.waitForSelector('.mb-map');
  await page.evaluate(() => window.__mars.start('vault.K1.3')); await page.waitForSelector('.mb-stage .tr-cart');
  await page.evaluate(() => { window.__fb = []; document.addEventListener('pointerdown', () => { window.__t0 = performance.now(); }, true); document.addEventListener('click', () => { const t0 = window.__t0; requestAnimationFrame(() => requestAnimationFrame(() => window.__fb.push(performance.now() - t0))); }, true); });
  const carts = ['crystal', 'rod', 'box'];
  for (let i = 0; i < 20; i++) { await page.click(`.tr-cart[data-cart=${carts[i % 3]}]`, { timeout: 4000 }).catch(() => {}); await page.waitForTimeout(90); }
  await page.waitForTimeout(200); const fb = await page.evaluate(() => window.__fb);
  res.scenes.tray = { ops: fb.length, feedbackP95Ms: Math.round(p95(fb)), feedbackMaxMs: Math.round(Math.max(0, ...fb)), ...(await counts()) };

  // 4 — the 对质 demo after a wrong delivery: frame times while it plays in real time
  await page.evaluate(() => window.__mars.goMap()); await page.waitForSelector('.mb-map');
  await page.evaluate(() => { window.__marsFast = false; window.__mars.start('cert.C1.1'); }); await page.waitForSelector('.mb-keypad .xg-key');
  await page.evaluate(() => { window.__fr = []; window.__run = true; const tick = (t) => { window.__fr.push(t); if (window.__run) requestAnimationFrame(tick); }; requestAnimationFrame(tick); const c = window.__mars.correct(); window.__mars.answer(c + 10); });
  await page.waitForTimeout(3500); const fd = await page.evaluate(() => { window.__run = false; return window.__fr; }); const df = []; for (let i = 1; i < fd.length; i++) df.push(fd[i] - fd[i - 1]);
  res.scenes.demo = { frames: df.length, frameP95Ms: +p95(df).toFixed(1), ...(await counts()) };
  // 5 — soak (Chromium only, CPU unthrottled): 28 cycles of open a mission → leave → (every 7th) 徽章站 → map. After a GC (and a settle for the short timers) the JS heap, DOM nodes and
  //     event listeners must stay flat (cycles 5 → 28). Uses the handle-free driver of soak-lib.mjs (a held ElementHandle pins its screen: that made a phantom 13 453-node "leak").
  //     The per-screen and per-stage-type soaks (map, chapter, badges, archive, parent, wall, build scene, mission, every stage type) are site/mars-base/e2e/soak.spec.ts.
  if (cdp) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.send('Runtime.enable');
    const cyc = ['vault.K1.3', 'factory.P2.5', 'orbit.O2.2', 'cert.C1.1', 'vault.K1.5', 'factory.P1.3'];
    await page.evaluate(() => { window.__marsFast = true; window.__mars.goMap(); }); await present(page, '.mb-map');
    const leave = (i) => SCREENS.missionLeave(page, cyc[i % cyc.length])();
    const r = await soak(page, cdp, 'mixed journey', async (i) => { await leave(i); if (i % 7 === 0) { await SCREENS.badges(page)(); } });
    res.scenes.soak = { cycles: r.cycles, at5: r.at, at28: r.end, dNodes: r.dNodes, dListeners: r.dListeners, dHeapMB: r.dHeapMB };
  }
  if (errors.length) res.errors = [...new Set(errors)];
} finally { await browser.close(); }

const gates = {
  'map first paint': [res.scenes.map.firstPaintMs, T.firstPaint], ['drag frame p95 (16.7 + 0.6 ms vsync-clock jitter' + (engine === 'webkit' ? ' + 1.5 ms: WebKit timers tick in whole ms)' : ')')]: [res.scenes.drag.frameP95Ms, +(T.dragP95 + T.vsyncJitter + (engine === 'webkit' ? 1.5 : 0)).toFixed(1)], ...(engine === 'chromium' ? { 'drag main-thread busy ms/frame (x4 throttle, half a frame)': [res.scenes.drag.busyPerFrameMs, T.dragBusy] } : {}), 'tray input feedback p95': [res.scenes.tray.feedbackP95Ms, T.feedbackP95],
  'DOM nodes (max scene)': [Math.max(...Object.values(res.scenes).map((s) => s.dom ?? 0)), T.dom], 'svg shapes in one svg (max)': [Math.max(...Object.values(res.scenes).map((s) => s.paths ?? 0)), T.paths],
  'decoded audio MB': [Math.max(...Object.values(res.scenes).map((s) => s.decodedMB ?? 0)), T.decodedMB], 'idle rAF on a mission screen': [res.scenes.mission.idleRaf, 0],
  ...(res.scenes.soak ? { 'soak: DOM nodes growth (28 cycles)': [res.scenes.soak.dNodes, T.soakNodes], 'soak: event listeners growth': [res.scenes.soak.dListeners, T.soakListeners], 'soak: JS heap growth MB': [res.scenes.soak.dHeapMB, T.soakHeapMB] } : {}),
};
res.gates = Object.fromEntries(Object.entries(gates).map(([k, [v, lim]]) => [k, { value: v, limit: lim, ok: v <= lim }]));
res.ok = Object.values(res.gates).every((g) => g.ok) && !(res.errors?.length);
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res.scenes)); for (const [k, g] of Object.entries(res.gates)) console.log(`${g.ok ? 'ok  ' : 'FAIL'} ${k}: ${g.value} (limit ${g.limit})`);
if (res.errors) console.log('errors:', res.errors);
process.exit(res.ok ? 0 : 1);
