// tests/xiangqi/shots.mjs — 楚河棋院截图 / 巡检驱动（Playwright WebKit，单浏览器 try/finally，静音）。
// 用法：node tests/xiangqi/shots.mjs <视口,视口|all> <场景,场景|all>   视口 = ipadP ipadL phoneP se phoneL ；截图 → ~/kid-games-work/shots/rr/xiangqi/<视口>/<场景>.png
// 场景 = hall arena sheet game game-mid xj f2f-setup f2f check mate（见 SCENES）；每个场景同时输出 DOM 度量（棋盘矩形、🏠、控制台错误、横向溢出）。
import { webkit, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.XQ_BASE ?? 'http://localhost:5321/xiangqi/';
const OUT = process.env.XQ_OUT ?? `${homedir()}/kid-games-work/shots/rr/xiangqi`;
const VPS = {
  ipadP: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } }, ipadL: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } },
  phoneP: { ...devices['iPhone 13'], viewport: { width: 390, height: 664 } }, se: { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } }, phoneL: { ...devices['iPhone 13'], viewport: { width: 844, height: 390 } },
};
const MID = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
const enc = encodeURIComponent;
const SCENES = {
  hall: { url: '?dev=1' },
  arena: { url: '?dev=1&unlock=1&screen=arena' },
  academy: { url: '?dev=1&screen=academy' },
  lesson: { url: '?dev=1&screen=lesson&lesson=L04&intro=0', wait: '.xq-lesson[data-ready]', delay: 3500 },
  starmap: { url: '?dev=1&screen=starmap', wait: '.xq-lesson[data-ready]', delay: 2500 },
  lesson9: { url: '?dev=1&screen=lesson&lesson=L09&intro=0', wait: '.xq-lesson[data-ready]', delay: 9000 },
  lesson22: { url: '?dev=1&screen=lesson&lesson=L22&intro=0', wait: '.xq-lesson[data-ready]', delay: 7000 },
  sheet: { url: '?dev=1&unlock=1&screen=arena', steps: async (p) => { await p.locator('button[data-robot="R1"]').click(); await p.waitForTimeout(500); } },
  'f2f-setup': { url: '?dev=1&screen=f2f-setup' },
  game: { url: `?dev=1&robot=2&seed=7`, game: true },
  'game-mid': { url: `?dev=1&robot=2&seed=7&moves=${['h3e3', 'h10g8', 'b3e3', 'b10c8', 'e3e7', 'e7e3'].join(',')}`, game: true },
  xj: { url: `?dev=1&mode=xj&robot=3&seed=7&fen=${enc('3a5/9/4ka3/R2P5/9/9/9/9/9/5K3 w')}`, game: true },
  f2f: { url: `?dev=1&mode=f2f&seed=7`, game: true },
  check: { url: `?dev=1&robot=2&seed=7&fen=${enc('3k5/9/9/9/9/9/9/9/4R4/3K5 w')}&moves=`, game: true, steps: async (p) => { await p.evaluate(() => window.__xq.play('e2e10')); await p.waitForTimeout(1500); } },
  box: { url: '?dev=1&intro=box', wait: '.xq-box[data-ready]', delay: 7500 },
  box2: { url: '?dev=1&intro=box', wait: '.xq-box[data-ready]', delay: 4000, steps: async (p) => { await p.evaluate(() => window.__xq.play('b3b10')); await p.waitForTimeout(2600); } },
  wall: { url: '?dev=1&unlock=1', steps: async (p) => { await p.locator('[data-act=wall]').click(); await p.waitForTimeout(500); } },
  settings: { url: '?dev=1', steps: async (p) => { await p.locator('.xq-gear').click(); await p.waitForTimeout(500); } },
  reason: { url: `?dev=1&robot=2&seed=7&fen=${enc('4k4/9/9/9/9/9/9/4p4/4N4/3K5 w')}`, game: true, steps: async (p) => { const c = (n) => window.__xq.rectOf(((10 - +n.slice(1)) * 9) + 'abcdefghi'.indexOf(n[0])); const a = await p.evaluate((n) => { const r = window.__xq.rectOf(((10 - +n.slice(1)) * 9) + 'abcdefghi'.indexOf(n[0])); return [r.x + r.w / 2, r.y + r.h / 2]; }, 'e2'); const b = await p.evaluate((n) => { const r = window.__xq.rectOf(((10 - +n.slice(1)) * 9) + 'abcdefghi'.indexOf(n[0])); return [r.x + r.w / 2, r.y + r.h / 2]; }, 'd4'); await p.mouse.click(a[0], a[1]); await p.waitForTimeout(300); await p.mouse.click(b[0], b[1]); await p.waitForTimeout(450); void c; } },
  review: { url: `?dev=1&mode=xj&robot=1&seed=7&fen=${enc('4k4/R8/9/1R7/9/9/9/9/3P5/3K5 w')}`, game: true, steps: async (p) => { await p.evaluate(() => window.__xq.play('b7b10')); await p.waitForTimeout(3800); await p.getByText('复盘', { exact: true }).first().click(); await p.waitForTimeout(1200); } },
  perf: { url: '?dev=perf', wait: '.xq-perf[data-ready]', delay: 300 },
  black: { url: `?dev=1&robot=2&seed=7&side=1`, game: true },
};
const pick = (arg, all) => (!arg || arg === 'all' ? Object.keys(all) : arg.split(','));
const vps = pick(process.argv[2], VPS), scenes = pick(process.argv[3], SCENES);
const browser = await webkit.launch();
try {
  for (const v of vps) {
    mkdirSync(`${OUT}/${v}`, { recursive: true });
    const ctx = await browser.newContext({ ...VPS[v], locale: 'zh-CN' });
    await ctx.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') });
    for (const sc of scenes) {
      const S = SCENES[sc]; const page = await ctx.newPage(); const errs = [];
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); }); page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 200)));
      try {
        await page.goto(BASE + S.url, { waitUntil: 'load', timeout: 30000 }); await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
        if (S.game) await page.waitForSelector('.xq-game[data-ready]', { timeout: 20000 }); if (S.wait) await page.waitForSelector(S.wait, { timeout: 20000 }); await page.waitForTimeout(S.delay ?? 900);
        if (S.steps) await S.steps(page); await page.waitForTimeout(500);
        const m = await page.evaluate(() => { const r = (e) => { const b = e?.getBoundingClientRect(); return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null; }; const back = document.querySelector('.kit-back, [data-kit-back], #kit-back, .kit-home'); return { vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, back: r(back), board: r(document.querySelector('.bk-board, .bk-root, .xq-host > *')), screen: document.querySelector('.xq-screen')?.getAttribute('data-screen') }; });
        await page.screenshot({ path: `${OUT}/${v}/${sc}.png` });
        console.log(`${v}/${sc}`, JSON.stringify(m), errs.length ? 'ERR ' + errs.join(' | ') : 'ok');
      } catch (e) { console.log(`${v}/${sc} FAIL`, String(e.message).slice(0, 300), errs.join(' | ')); try { await page.screenshot({ path: `${OUT}/${v}/${sc}.FAIL.png` }); } catch { /* ignore */ } }
      await page.close();
    }
    await ctx.close();
  }
} finally { await browser.close(); }
