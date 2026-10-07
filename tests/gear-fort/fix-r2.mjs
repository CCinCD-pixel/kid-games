#!/usr/bin/env node
// 机关守城 · QA r2 fix tour (WebKit, iPad 9 sizes, both orientations): the new 1-1 hook (lid → strips → sleeves), copying
// the demo hand places the card, the drag cell (DOM) over boarded lanes, the 还差 N chip, the pause speed row, the 7-slot
// 卡槽 in landscape, 点读 (info card name + a tapped word), the 复盘 chain stopping on a tap, the K4 stopgap glyphs.
//   node tests/gear-fort/fix-r2.mjs [--port=5311] [--only=portrait|landscape] [--steps=hook,hand,…]
// One browser, always closed. Shots → ~/kid-games-work/shots/gear-fort/fix-r2/<project>/<name>.png. Kit pages auto-mute.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5311'); const ONLY = opt('only', ''); const STEPS = opt('steps', '').split(',').filter(Boolean);
const OUT = path.join(os.homedir(), 'kid-games-work/shots/gear-fort/fix-r2');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const BASE = `http://localhost:${PORT}/gear-fort/?test=1`;
const projects = [
  { name: 'portrait', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
  { name: 'landscape', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
].filter((p) => !ONLY || p.name.startsWith(ONLY));
const lv = () => ({ best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' });
const save = (ids, extra = {}) => JSON.stringify({ v: 1, updatedAt: Date.now(), data: { levels: Object.fromEntries(ids.map((id) => [id, lv()])), current: extra.current || '1-1', ...extra } });
const V1 = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10', '1-11'];
const results = {}; const fail = (k, v) => { (results.fail ||= []).push(`${k}: ${JSON.stringify(v)}`); };
const want = (s) => !STEPS.length || STEPS.includes(s);

async function open(page, s) {
  await page.goto(BASE);
  await page.evaluate((x) => { localStorage.clear(); indexedDB.deleteDatabase('kg-gear-fort'); if (x) localStorage.setItem('kg:v1:gear-fort', x); }, s);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
}
const shot = async (page, dir, name) => { fs.mkdirSync(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, name + '.png') }); };
const drag = async (page, a, b, n = 10) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); for (let i = 1; i <= n; i++) { await page.mouse.move(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n); await page.waitForTimeout(25); } };
const vlog = (page) => page.evaluate(() => window.__gfApp.voice.log.slice());

const browser = await webkit.launch();
try {
  for (const p of projects) {
    const dir = path.join(OUT, p.name); const R = (results[p.name] = {});
    const ctx = await browser.newContext(p.ctx); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const step = async (name, f) => { if (!want(name)) return; try { await f(); } catch (e) { fail(`${p.name} ${name}`, String(e.message || e).slice(0, 200)); } };

    await step('hook', async () => {
      await open(page, null); await page.waitForFunction(() => window.__gf?.hooking, null, { timeout: 8000 });
      for (const t of [250, 450, 450, 500, 650, 700]) { await page.waitForTimeout(t); await shot(page, dir, `a0-hook-${(await page.evaluate(() => Math.round(performance.now())))}`); }
      await page.waitForFunction(() => !window.__gf.hooking, null, { timeout: 5000 });
    });
    await step('hand', async () => { // copy the demo hand exactly: the card lands on 第 3 路 第 2 格
      if (!want('hook')) { await open(page, null); await page.waitForFunction(() => window.__gf, null, { timeout: 8000 }); await page.evaluate(() => window.__gf.skipHook()); }
      await page.waitForFunction(() => { const h = document.querySelector('.gf-hand'); return h && getComputedStyle(h).display === 'block' && h.dataset.tip; }, null, { timeout: 20000 });
      await page.waitForTimeout(1000); await shot(page, dir, 'b1-demo-hand');
      const g = await page.evaluate(() => { const hud = document.querySelector('.gf-hud').getBoundingClientRect(); const [x, y] = document.querySelector('.gf-hand').dataset.tip.split(',').map(Number); const c = document.querySelector('.gf-card[data-card="shooter"]').getBoundingClientRect(); return { tip: { x: hud.left + x, y: hud.top + y }, card: { x: c.left + c.width / 2, y: c.top + c.height / 2 } }; });
      await drag(page, g.card, g.tip); await page.waitForTimeout(150); R.hoverAtTip = await page.evaluate(() => document.querySelector('.gf-cellhint').dataset.cell || null);
      await shot(page, dir, 'b2-at-tip'); await page.mouse.up(); await page.waitForTimeout(400);
      R.units = await page.evaluate(() => window.__gf.S.units.map((u) => `${u.k}@${u.lane},${u.col}`));
      if (!R.units.includes('shooter@2,1')) fail(`${p.name} hand`, R.units);
    });
    await step('hover', async () => { // 1-2 (boarded lanes): over a board → ✕, then over an open cell → green, same frame as the ghost
      await open(page, save(['1-1'], { current: '1-2' }));
      await page.evaluate(() => window.__gfApp.battle(window.__gfApp.level('1-2'), ['shooter', 'farm'])); await page.waitForFunction(() => window.__gf?.S.tick > 2);
      const g = await page.evaluate(() => { const hud = document.querySelector('.gf-hud').getBoundingClientRect(); const G = window.__gf; const L = G.S.L.lanes; const lh = G.cell(1, 0).y - G.cell(0, 0).y; const off = L.findIndex((x) => !x); const on = L.findIndex((x) => x);
        const c = document.querySelector('.gf-card[data-card="shooter"]').getBoundingClientRect(); const f = (l, col) => { const q = G.cell(l, col); return { x: hud.left + q.x, y: hud.top + q.y - lh * 0.45 + lh * 1.15 }; };
        return { card: { x: c.left + c.width / 2, y: c.top + c.height / 2 }, bad: f(off, 2), good: f(on, 2), off, on }; });
      await await page.evaluate(() => { window.__gf.S.grain = 900; }); await page.waitForTimeout(100); await drag(page, g.card, g.bad); R.overBad = await page.evaluate(() => document.querySelector('.gf-cellhint').dataset.cell); await shot(page, dir, 'c1-over-board');
      await drag(page, g.bad, g.good, 6); R.overGood = await page.evaluate(() => document.querySelector('.gf-cellhint').className + ' ' + document.querySelector('.gf-cellhint').dataset.cell); await shot(page, dir, 'c2-over-open');
      await page.mouse.up(); await page.waitForTimeout(200);
      if (!String(R.overGood).includes('is-ok')) fail(`${p.name} hover`, R);
    });
    await step('poor', async () => { // 1-11 with no grain: every card readable, a 还差 N chip at the bottom
      await open(page, save(V1.slice(0, 10), { current: '1-11' }));
      await page.evaluate(() => window.__gfApp.battle(window.__gfApp.level('1-11'), ['shooter', 'farm', 'wall', 'lobber', 'spikes', 'pit'])); await page.waitForFunction(() => window.__gf?.S.tick > 2);
      await page.evaluate(() => { window.__gf.S.grain = 15; }); await page.waitForTimeout(300); await shot(page, dir, 'd1-poor-tray');
      R.poor = await page.evaluate(() => [...document.querySelectorAll('.gf-card.is-poor .gf-card__short')].map((s) => { const b = s.getBoundingClientRect(), c = s.closest('.gf-card').getBoundingClientRect(); return Math.round((b.height * b.width) / (c.height * c.width) * 100); }));
      // pause: the speed row is one row of ≥ 56 px buttons inside the panel; the four actions are one size
      await page.evaluate(() => window.__gf.pause()); await page.waitForTimeout(400); await shot(page, dir, 'd2-pause');
      R.pause = await page.evaluate(() => { const pn = document.querySelector('.gf-pausel__panel').getBoundingClientRect(); return { speed: [...document.querySelectorAll('.gf-pausel__speed .gf-speed__b')].map((b) => { const r = b.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}${r.bottom <= pn.bottom && r.right <= pn.right ? '' : '!out'}`; }), acts: [...document.querySelectorAll('.gf-pausel__panel > .xg-btn')].map((b) => `${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`) }; });
      if (R.pause.speed.some((s) => s.includes('!out') || +s.split('x')[1] < 48)) fail(`${p.name} pause`, R.pause);
    });
    await step('preview', async () => { // 2-10: 7 slots inside the panel (landscape); tap a machine → its name is read
      await open(page, save([...V1, '2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8', '2-9'], { current: '2-10' }));
      await page.locator('.xg-node--current').first().click(); await page.waitForSelector('.gf-pv__slots', { timeout: 10000 }); await page.waitForTimeout(3800);
      await shot(page, dir, 'e1-preview-2-10');
      R.slots = await page.evaluate(() => { const pn = document.querySelector('.gf-pv__deck').getBoundingClientRect(); const ss = [...document.querySelectorAll('.gf-pv__slots .gf-slot')]; return { n: ss.length, w: Math.round(ss[0]?.getBoundingClientRect().width || 0), out: ss.filter((s) => s.getBoundingClientRect().right > pn.right - 2).length }; });
      if (R.slots.out) fail(`${p.name} slots`, R.slots);
      const n0 = (await vlog(page)).length; await page.locator('.gf-pv__m').first().click(); await page.waitForTimeout(600); await shot(page, dir, 'e2-info');
      R.infoSaid = (await vlog(page)).slice(n0); if (!R.infoSaid.some((x) => x.startsWith('fort.w.'))) fail(`${p.name} info name`, R.infoSaid);
    });
    await step('read', async () => { // 点读: tap 鲁班 in 墨子's bubble → fort.w.鲁班; long-press a 选牒 card is covered by the preview step
      await open(page, save(['1-1'], { current: '1-2' }));
      await page.evaluate(() => window.__gfApp.battle(window.__gfApp.level('1-3'), ['shooter', 'farm'])); await page.waitForFunction(() => window.__gf?.S.tick > 2);
      const at = await page.waitForFunction(() => { const t = document.querySelector('.gf-mozi__bubble .t, .gf-bubble--mozi .t, [data-line] .t'); const n = t?.firstChild; if (!n || !n.data) return null; const i = n.data.search(/鲁班|墨子|木甲兵|连弩车|檑木/); if (i < 0) return null; const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, text: n.data }; }, null, { timeout: 12000 }).then((h) => h.jsonValue()).catch(() => null);
      if (!at) { fail(`${p.name} read`, 'no word in a bubble'); return; }
      const n0 = (await vlog(page)).length; await page.mouse.click(at.x, at.y); await page.waitForTimeout(300); R.read = { text: at.text, said: (await vlog(page)).slice(n0) };
      await shot(page, dir, 'f1-read'); if (!R.read.said.some((x) => x.startsWith('fort.w.'))) fail(`${p.name} read`, R.read);
    });
    await step('debrief', async () => { // a quick tap on 回地图 ends the 复盘 chain: nothing of it plays on the map
      await open(page, save(['1-1', '1-2'], { current: '1-3', lossStreak: { '1-3': 2 } }));
      await page.locator('.xg-node').nth(2).click(); await page.locator('.gf-pv__go').click(); await page.waitForFunction(() => !!window.__gf?.S);
      await page.evaluate(() => { const g = window.__gf; g.S.logs = [1, 1, 1, 1, 1]; g.setSpeed(20); });
      await page.waitForSelector('.gf-debrief', { timeout: 60000 }); await page.waitForTimeout(400); await shot(page, dir, 'g1-debrief');
      const n0 = (await vlog(page)).length; await page.locator('.gf-debrief [data-a="map"]').click(); await page.waitForTimeout(4000);
      R.afterMap = (await vlog(page)).slice(n0); if (R.afterMap.some((x) => /^fort\.(fail|tip|good|result)/.test(x))) fail(`${p.name} debrief chain`, R.afterMap);
    });
    await step('fonts', async () => { // the K4 stopgap: 弩 蒺 藜 礌 檑 牒 枭 鸢 驿 橐 come from the WenKai / KuaiLe faces (pixels differ from the fallback)
      R.fonts = await page.evaluate(async () => { const out = {}; for (const fam of ['XG WenKai', 'XG KuaiLe']) { const faces = await document.fonts.load(`32px "${fam}"`, '弩蒺藜礌檑牒枭鸢驿橐'); const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
        const px = (f) => { x.clearRect(0, 0, 64, 64); x.font = f; x.fillText('弩', 8, 48); return x.getImageData(0, 0, 64, 64).data.join(','); };
        out[fam] = { faces: faces.length, differs: px(`40px "${fam}", serif`) !== px('40px serif') }; } return out; });
      if (!R.fonts['XG WenKai'].differs || !R.fonts['XG KuaiLe'].differs) fail(`${p.name} fonts`, R.fonts);
    });
    await step('screens', async () => { // 图谱 (portrait fill), a portrait one-row tray, the result (3 equal buttons, learned tile), 🏠 confirm
      await open(page, save(V1.slice(0, 4))); await page.locator('.gf-bigcard--alm').click(); await page.waitForSelector('.gf-alm__tile'); await page.waitForTimeout(500); await shot(page, dir, 'h1-almanac');
      await open(page, save(['1-1', '1-2'], { current: '1-3' }));
      await page.evaluate(() => window.__gfApp.battle(window.__gfApp.level('1-3'), ['shooter', 'farm', 'wall'])); await page.waitForFunction(() => window.__gf?.S.tick > 30);
      await shot(page, dir, 'h2-battle-1-3');
      await page.locator('.kit-back').click(); await page.waitForSelector('.gf-pausel__home'); await page.waitForTimeout(300); await shot(page, dir, 'h3-home-confirm');
      await open(page, save(['1-1', '1-2', '1-3', '1-4'], { current: '1-5' }));
      await page.evaluate(() => window.__gfApp.win('1-5', 2)); await page.waitForSelector('.gf-resultp', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1500); await shot(page, dir, 'h4-result');
      R.resultBtns = await page.evaluate(() => [...document.querySelectorAll('.gf-resultp .xg-btn[data-act]')].map((b) => `${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`));
    });
    R.errors = errors.slice(0, 5); if (errors.length) fail(`${p.name} errors`, errors.slice(0, 3));
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(results, null, 1));
process.exit(results.fail ? 1 : 0);
