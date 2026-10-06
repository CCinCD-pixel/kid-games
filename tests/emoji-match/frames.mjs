#!/usr/bin/env node
// Frame-time sample during a big move (2-06 BB combo lesson, then best moves) — Chromium, 4× CPU throttle.
import { chromium, devices } from '@playwright/test';
const browser = await chromium.launch({ args: ['--mute-audio'] });
try {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto('http://localhost:5305/emoji-match/?test=1');
  await page.waitForSelector('#app[data-ready]');
  await page.evaluate(() => window.__em.goto({ s: 'play', id: '2-06' }));
  await page.waitForFunction(() => window.__em.state()?.ready);
  if (process.env.HIDE) await page.addStyleTag({ content: `${process.env.HIDE} { display: none !important; }` });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.RATE ?? 4) });
  if (process.env.PROF) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  const r = await page.evaluate(async () => {
    const loaf = []; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) loaf.push({ d: e.duration, render: e.duration - (e.renderStart - e.startTime), style: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0, scripts: e.scripts.map((x) => [x.invoker, Math.round(x.duration)]).filter((x) => x[1] > 5) }); }); po.observe({ type: 'long-animation-frame', buffered: false });
    const dts = []; let last = performance.now(), on = true;
    const loop = (t) => { dts.push(t - last); last = t; if (on) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    for (let i = 0; i < 3; i++) await window.__em.play(window.__em.lessonMove() ?? window.__em.bestMove());
    on = false; dts.sort((a, b) => a - b);
    const q = (p) => dts[Math.floor(p * (dts.length - 1))].toFixed(1);
    po.disconnect(); loaf.sort((a, b) => b.d - a.d);
    return { loafCount: loaf.length, loafTop: loaf.slice(0, 6).map((x) => JSON.stringify({ d: Math.round(x.d), render: Math.round(x.render), style: Math.round(x.style), s: x.scripts })), frames: dts.length, p50: q(0.5), p95: q(0.95), max: q(1), over33: dts.filter((d) => d > 33.4).length };
  });
  if (process.env.PROF) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas; const counts = new Map();
    profile.samples.forEach((id, k) => counts.set(id, (counts.get(id) ?? 0) + (dt[k] ?? 0)));
    for (const [id, us] of counts) { const n = byId.get(id); const f = n.callFrame; const key = f.functionName + ' ' + f.url.split('/').slice(-2).join('/') + ':' + (f.lineNumber + 1); self.set(key, (self.get(key) ?? 0) + us); }
    console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => (v / 1000).toFixed(0).padStart(6) + 'ms ' + k).join('\n'));
  }
  console.log('throttle', process.env.RATE ?? 4, JSON.stringify(r));
} finally { await browser.close(); }
