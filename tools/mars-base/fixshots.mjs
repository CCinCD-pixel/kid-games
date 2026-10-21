#!/usr/bin/env node
// QA fix-mars-r1 screenshots (headless WebKit, muted, one browser, always closed). Usage: node tools/mars-base/fixshots.mjs <scenario> [...]
//   scenarios: onboard map plots mission archive result nl all     (server: MARS_BASE_URL or http://localhost:5323)
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const BASE = process.env.MARS_BASE_URL || 'http://localhost:5323'; const OUT = path.join(os.homedir(), 'kid-games-work/shots/rr/fix-mars'); fs.mkdirSync(OUT, { recursive: true });
const MUTE = path.resolve('tools/qa/mute-audio.js');
const VPS = { ipadP: { viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ipadL: { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ip13: { ...devices['iPhone 13'] }, se: { ...devices['iPhone SE'] }, ip13L: { ...devices['iPhone 13'], viewport: { width: 844, height: 390 } } };
for (const v of Object.values(VPS)) delete v.defaultBrowserType;
const LIT = { state: 'lit', attempts: 1, at: 1 };
const PLAY = { onboarded: true, session: { index: 3, lastActiveAt: Date.now(), missions: 3 }, cert: { C1: LIT, C2: LIT, C3: LIT }, probes: { vault: { done: true }, factory: { done: true }, balance: { done: true } } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(browser, vp, { skip = true, save = null, query = '' } = {}) {
  const ctx = await browser.newContext({ ...VPS[vp], locale: 'zh-CN' }); await ctx.addInitScript({ path: MUTE });
  await ctx.addInitScript((s) => { try { localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: s, narration: false })); } catch {} }, skip);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE}/mars-base/?test=1${query}`); await page.locator('.kit-start__go').click({ timeout: 8000 }).catch(() => {});
  if (save) { await page.waitForFunction(() => !!window.__mars, null, { timeout: 10000 }); await page.evaluate((s) => window.__mars.setSave(s), { ...PLAY, ...save }); await page.waitForSelector('.mb-map'); }
  return { ctx, page, errs };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const scen = {
  async onboard(b) { const { ctx, page, errs } = await open(b, 'ipadP', { skip: false }); try {
    await page.waitForSelector('.mb-onboard', { timeout: 10000 }); await wait(500); await shot(page, 'onb-1-start'); await wait(1500); await shot(page, 'onb-2-hand-mid'); await wait(1300); await shot(page, 'onb-3-flag-at-30'); await wait(2200); await shot(page, 'onb-4-after');
    const fl = await page.evaluate(() => document.querySelector('.mb-onboard .nl-flag')?.getAttribute('transform')); console.log('flag transform after demo', fl);
    // play it out: drag to 30, ok; 62; 45
    for (const v of [30, 62, 45]) { const svg = await page.locator('.mb-ob-stage .nl-svg').boundingBox(); const gg = await page.evaluate((vv) => { const c = window.__nlCtl; return { x: c.flagToClientX(vv), y: c.trackClientY() }; }, v); const x = gg.x, y = gg.y; await page.mouse.move(svg.x + 40, y); await page.mouse.down(); await page.mouse.move(x, y, { steps: 8 }); await page.mouse.up(); await wait(200); await page.locator('.mb-ob-ok').click(); await wait(900); }
    await wait(300); await shot(page, 'onb-5-celebrate'); await wait(2800); await shot(page, 'onb-6-map'); console.log('errs', errs); } finally { await ctx.close(); } },
  async map(b) { for (const vp of ['ipadP', 'ip13']) { const { ctx, page, errs } = await open(b, vp, { save: {} }); try { await wait(500); await shot(page, `map-${vp}`); await page.locator('[data-site="balance"]').click(); await wait(350); await shot(page, `map-${vp}-plot-tap`); console.log(vp, 'toast', await page.locator('.mb-map-toast').innerText(), errs); } finally { await ctx.close(); } } },
  async mission(b) { const nodes = [['orbit.O1.1', 'orbit'], ['vault.K1.1', 'vault'], ['factory.P1.3', 'factory'], ['cert.C1.3', 'cert']]; for (const [id, z] of nodes) for (const vp of ['ipadP', 'ip13']) { const { ctx, page, errs } = await open(b, vp, { save: {} }); try { await page.evaluate((n) => window.__mars.start(n), id); await page.waitForSelector('.mb-mission .mb-stage', { timeout: 8000 }); await wait(900); await shot(page, `mission-${z}-${vp}`); console.log(id, vp, errs); } finally { await ctx.close(); } } },
};
scen.archive = async (b) => { for (const vp of ['ipadP', 'ip13']) { const { ctx, page, errs } = await open(b, vp, { save: { cards: ['card.1', 'card.2', 'card.5', 'card.9'], orbit: { tests: [{ node: 'orbit.O1.0', L: 100, at: 1, targets: [10, 25, 40, 55, 70, 85], est: [12, 22, 43, 50, 72, 80], r2: .95, slope: 1, pae: .04, pass: true, valid: true }] } } }); try { await page.evaluate(() => window.__mars.archive()); await wait(500); await shot(page, `archive-${vp}`); await page.evaluate(() => window.__mars.badges()); await wait(400); await shot(page, `badges-${vp}`); console.log(vp, errs); } finally { await ctx.close(); } } };
async function runUntilModal(page, max = 16) { for (let i = 0; i < max; i++) { if (await page.locator('.xg-modal').count()) return true; await page.evaluate(() => window.__mars.answer(window.__mars.correct())).catch(() => {}); await wait(450); } return !!(await page.locator('.xg-modal').count()); }
scen.result = async (b) => {
  for (const vp of ['ip13', 'se', 'ip13L']) { const { ctx, page, errs } = await open(b, vp, { save: {} }); try {
    await page.evaluate(() => window.__mars.start('vault.K1.1')); await page.waitForSelector('.mb-mission .mb-stage'); const ok = await runUntilModal(page, 30); await wait(1600); await shot(page, `result-node-${vp}`);
    const r = await page.evaluate(() => { const m = document.querySelector('.xg-modal')?.getBoundingClientRect(); return m ? [Math.round(m.left), Math.round(m.right), innerWidth] : null; }); console.log(vp, 'node card', ok, r, errs); } finally { await ctx.close(); } }
  { const { ctx, page, errs } = await open(b, 'ipadP', { save: { onboarded: true, cert: { C1: { state: 'none', attempts: 0 }, C2: { state: 'none', attempts: 0 }, C3: { state: 'none', attempts: 0 } } } }); try {
    await page.evaluate(() => window.__mars.start('orbit.O1.0')); await page.waitForSelector('.mb-mission .mb-stage'); const ok = await runUntilModal(page, 40); await wait(1800); await shot(page, 'result-calib-ipadP'); console.log('calib', ok, errs); } finally { await ctx.close(); } }
};
scen.kitgames = async (b) => {   // the shared kit result card under OTHER games' own CSS (T1 regression check): rect inside the viewport + a screenshot
  for (const game of ['gear-fort', 'snake-battle', 'emoji-match', 'military-chess', 'sokoban']) for (const vp of ['ip13', 'se', 'ip13L']) {
    const ctx = await b.newContext({ ...VPS[vp], locale: 'zh-CN' }); await ctx.addInitScript({ path: MUTE }); const page = await ctx.newPage();
    try { await page.goto(`${BASE}/${game}/?test=1`, { waitUntil: 'domcontentloaded' }); await wait(1200);
      await page.evaluate(() => { const sc = document.createElement('div'); sc.className = 'xg-scrim xg-root'; const star = '<svg viewBox="0 0 100 100"><path d="M50 8l12 28 30 3-23 20 7 30-26-16-26 16 7-30L8 39l30-3z" fill="#f6b934"/></svg>'; sc.innerHTML = '<div class="xg-modal" role="dialog"><div class="xg-ribbon">这批订单全交了</div><div class="xg-result-stars">' + [0, 1, 2].map(() => '<div class="xg-rstar is-earned"><div class="xg-rstar__slot">' + star + '</div><div class="xg-rstar__fill">' + star + '</div></div>').join('') + '</div><h2 class="xg-modal__title">做得很棒！</h2><p class="xg-modal__text">新知识卡：祝融号、天问一号</p><div class="xg-result-stats"><div class="xg-stat"><b>6/6</b><span>一次就对</span></div></div><div class="xg-modal__actions"><button class="xg-btn xg-btn--primary xg-btn--lg"><span>回基地</span></button></div></div>'; document.body.appendChild(sc); });
      await wait(1700);
      const r = await page.evaluate(() => { const q = (s) => document.querySelector(s)?.getBoundingClientRect(); const m = q('.xg-modal'), rb = q('.xg-ribbon'); return m ? { card: [m.left, m.top, m.right, m.bottom].map(Math.round), ribbonTop: Math.round(rb?.top ?? 0), vw: innerWidth, vh: innerHeight } : null; });
      const bad = !r || r.card[0] < 0 || r.card[2] > r.vw || r.card[3] > r.vh || r.ribbonTop < 0; console.log(game, vp, JSON.stringify(r), bad ? 'OUTSIDE' : 'ok'); if (vp === 'ip13' || game === 'gear-fort') await shot(page, `kit-${game}-${vp}`);
    } catch (e) { console.log(game, vp, 'ERR', String(e).slice(0, 120)); } finally { await ctx.close(); } }
};
scen.hop = async (b) => { const { ctx, page, errs } = await open(b, 'ipadP', { save: {} }); try {
  await page.evaluate(() => { window.__marsFast = false; window.__mars.start('vault.K1.1'); }); await page.waitForSelector('.mb-mission .mb-stage'); await wait(500);
  const info = await page.evaluate(async () => { const t = window.__marsTray; if (!t) return 'no tray'; const out = []; for (let i = 0; i < 10; i++) { const r = t.apply({ op: 'pour', cart: 'rod' }); if (r === false) break; } out.push(JSON.stringify({ rods: t.state.rods, packEntry: t.state.packEntry })); const p = t.apply({ op: 'pack' }); out.push('apply returned ' + (p && p.then ? 'a promise' : String(p))); window.__hopP = p; return out.join(' | '); });
  console.log(info); await wait(250); await shot(page, 'hop-mid'); await page.waitForFunction(() => window.__marsTray.state.boxes === 1, null, { timeout: 4000 }); await wait(150); await shot(page, 'hop-done');
  console.log('boxes', await page.evaluate(() => window.__marsTray.state.boxes), 'drop class seen', await page.evaluate(() => !!document.querySelector('.tr-bin .is-drop')), errs); } finally { await ctx.close(); } };
scen.challenge = async (b) => { for (const vp of ['ipadL', 'ip13']) { const { ctx, page, errs } = await open(b, vp, { save: {} }); try {
  const ids = await page.evaluate(() => window.__mars.nodes()); const nodes = {}; for (const id of ids) nodes[id] = { st: 'done', stars: 3, plays: 2, ft: [1] };
  await page.evaluate((n) => window.__mars.setSave({ ...window.__mars.save, nodes: n, probes: { vault: { done: true }, factory: { done: true }, balance: { done: true } }, session: { index: 40, lastActiveAt: Date.now(), missions: 40 } }), nodes); await wait(600);
  console.log(vp, 'go label:', await page.locator('.mb-go').innerText(), '| sub:', await page.locator('.mb-go-sub').innerText(), '| rec rings:', await page.locator('.mb-site.is-rec').count(), 'disabled', await page.locator('.mb-go').isDisabled()); await shot(page, `challenge-map-${vp}`);
  await page.locator('.mb-go').click(); await page.waitForSelector('.mb-mission .mb-stage', { timeout: 8000 }); await wait(900); await shot(page, `challenge-mission-${vp}`);
  const ok = await runUntilModal(page, 30); await wait(1500); console.log(vp, 'challenge card', ok, await page.locator('.xg-modal__title').innerText().catch(() => '-'), 'stars', await page.locator('.xg-rstar').count(), errs); await shot(page, `challenge-result-${vp}`); } finally { await ctx.close(); } } };
scen.firstlight = async (b) => { const { ctx, page, errs } = await open(b, 'ip13', { skip: false }); try { await page.waitForSelector('.mb-onboard', { timeout: 10000 }); await page.evaluate(() => { window.__marsFast = false; });
  for (const v of [30, 62, 45]) { await wait(300); const gg = await page.evaluate((vv) => { const c = window.__nlCtl; return { x: c.flagToClientX(vv), y: c.trackClientY() }; }, v); await page.mouse.move(gg.x - 50, gg.y); await page.mouse.down(); await page.mouse.move(gg.x, gg.y, { steps: 6 }); await page.mouse.up(); await wait(150); await page.locator('.mb-ob-ok').click(); await wait(1100); }
  await wait(600); await shot(page, 'firstlight-1'); await wait(1500); await shot(page, 'firstlight-2'); console.log('errs', errs); } finally { await ctx.close(); } };
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['onboard']; const browser = await webkit.launch();
try { for (const n of names) { console.log('==', n); await scen[n](browser); } } finally { await browser.close(); }
