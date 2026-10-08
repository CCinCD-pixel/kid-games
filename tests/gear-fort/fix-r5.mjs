#!/usr/bin/env node
// 机关守城 · QA r4 fix tour (WebKit, iPad 9 sizes, both orientations): 「墨子，怎么办？」 concept bubble = the voiced line,
// the 2-11 Boss bar after the owl is down, every story shot at the END of its camera move (seek hook), the 亮招 preview
// (1-8 fixed deck, 1-6 急报), the 图谱 牒 tab (locked tile says where it opens), the 图谱 page listen buttons.
//   node tests/gear-fort/fix-r5.mjs [--port=5311] [--only=portrait|landscape] [--steps=ask,boss,story,preview,almanac]
// One browser, always closed. Shots → ~/kid-games-work/shots/gear-fort/fix-r5/<project>/<name>.png. Kit pages auto-mute.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5311'); const ONLY = opt('only', ''); const STEPS = opt('steps', '').split(',').filter(Boolean);
const STORIES = opt('stories', 'prologue,v2open,v2end').split(',');
const OUT = path.join(os.homedir(), 'kid-games-work/shots/gear-fort/fix-r5');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const BASE = `http://localhost:${PORT}/gear-fort/?test=1`;
const projects = [
  { name: 'portrait', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
  { name: 'landscape', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
].filter((p) => !ONLY || p.name.startsWith(ONLY));
const lv = () => ({ best: 3, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' });
const ALL = [...Array.from({ length: 11 }, (_, i) => `1-${i + 1}`), ...Array.from({ length: 11 }, (_, i) => `2-${i + 1}`)];
const upto = (id) => ALL.slice(0, ALL.indexOf(id));
const save = (ids, extra = {}) => JSON.stringify({ v: 1, updatedAt: Date.now(), data: { levels: Object.fromEntries(ids.map((id) => [id, lv()])), current: extra.current || '1-1', story: ['prologue', 'dock', 'v1end', 'v2open'], ...extra } });
const want = (s) => !STEPS.length || STEPS.includes(s);
const results = {};

async function open(page, s) {
  await page.goto(BASE);
  await page.evaluate((x) => { localStorage.clear(); indexedDB.deleteDatabase('kg-gear-fort'); if (x) localStorage.setItem('kg:v1:gear-fort', x); }, s);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
}
const shot = async (page, dir, name) => { fs.mkdirSync(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, name + '.png') }); };
const boost = (page) => page.evaluate(() => { const g = window.__gf; g.S.grain = 5000; for (const k of Object.keys(g.S.cdReady)) g.S.cdReady[k] = 0; });

const browser = await webkit.launch();
try {
  for (const p of projects) {
    const dir = path.join(OUT, p.name); const R = (results[p.name] = { errors: [] });
    const ctx = await browser.newContext(p.ctx); const page = await ctx.newPage();
    page.on('pageerror', (e) => R.errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') R.errors.push(m.text()); });
    const step = async (name, f) => { if (!want(name)) return; try { await f(); } catch (e) { R[name] = 'FAIL ' + String(e.message || e).slice(0, 300); } };

    await step('drop', async () => {
      await open(page, null);
      await page.waitForFunction(() => window.__gf, null, { timeout: 8000 }); await page.evaluate(() => window.__gf.skipHook());
      await page.waitForFunction(() => { const h = document.querySelector('.gf-hand'); return !!h && getComputedStyle(h).display === 'block' && !!h.dataset.tip; }, null, { timeout: 20000 });
      const g = await page.evaluate(() => { const hud = document.querySelector('.gf-hud').getBoundingClientRect(); const [x, y] = document.querySelector('.gf-hand').dataset.tip.split(',').map(Number); const c = document.querySelector('.gf-card[data-card="shooter"]').getBoundingClientRect();
        return { tip: { x: hud.left + x, y: hud.top + y }, card: { x: c.left + c.width / 2, y: c.top + c.height / 2 } }; });
      const ty = g.tip.y - 50; // the finger 50 px high: its drop point is in the boarded-up lane 2
      await page.mouse.move(g.card.x, g.card.y); await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(g.card.x + ((g.tip.x - g.card.x) * i) / 10, g.card.y + ((ty - g.card.y) * i) / 10);
      R.dropHint = await page.evaluate(() => document.querySelector('.gf-cellhint')?.className + ' ' + document.querySelector('.gf-cellhint')?.dataset.cell);
      await shot(page, dir, 'a-drop-high'); await page.mouse.up(); await page.waitForTimeout(500);
      R.dropUnits = await page.evaluate(() => window.__gf.S.units.map((u) => [u.k, u.lane, u.col]));
    });
    await step('firstwin', async () => {
      await open(page, JSON.stringify({ v: 1, updatedAt: Date.now(), data: { levels: {}, current: '1-1' } }));
      await page.waitForTimeout(800);
      await page.evaluate(() => window.__gfApp.win('1-1', 2));
      await page.getByRole('button', { name: '下一关' }).click();
      await page.locator('.gf-story--prologue').waitFor(); await page.locator('.gf-story .xg-skip').click();
      await page.locator('.gf-story--dock').waitFor(); await page.waitForTimeout(400); await page.locator('.gf-story .xg-skip').click();
      await page.waitForTimeout(1500); await shot(page, dir, 'b-after-chain');
      R.firstwin = await page.evaluate(() => ({ map: !!document.querySelector('.gf-map'), preview: !!document.querySelector('.gf-pv__table') }));
    });
    await step('luban', async () => {
      await open(page, save(upto('2-10'), { current: '2-10' }));
      await page.evaluate(() => window.__gfApp.play('2-10', window.__gfApp.level('2-10').loadout || window.__gfApp.level('2-10').pool.slice(0, window.__gfApp.level('2-10').slots))); await page.waitForFunction(() => window.__gf?.S.tick > 5, null, { timeout: 15000 });
      await page.evaluate(() => { const b = document.querySelector('.gf-bubble--luban'); b.querySelector('.t').textContent = '墨子先生，先赢了我的机关沙盘再说！'; b.classList.add('is-on'); });
      await page.waitForTimeout(500);
      R.luban = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const a = r('.gf-bubble--luban'), b = r('.gf-star3'); const ov = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); return { overlap: ov, bubble: [a.left, a.top, a.width, a.height].map(Math.round), slip: [b.left, b.top, b.width, b.height].map(Math.round), H: innerHeight }; });
      await page.evaluate(() => window.__gf.pause?.()); await page.waitForTimeout(200); await page.evaluate(() => document.querySelector('.gf-pausel, .gf-pause')?.setAttribute('style', 'display:none'));
      await shot(page, dir, 'c-luban-bubble');
    });
    await step('preview', async () => {
      for (const id of (process.env.PV || '1-2,1-8,2-10').split(',')) {
        await open(page, save(upto(id), { current: id }));
        await page.evaluate((id) => window.__gfApp.preview?.(id), id); await page.waitForTimeout(2400); await shot(page, dir, `d-preview-${id}`);
        R['pv-' + id] = await page.evaluate(() => { const t = document.querySelector('.gf-pv__table').getBoundingClientRect(); const ms = [...document.querySelectorAll('.gf-pv__m')].map((m) => m.getBoundingClientRect()); const sp = [...document.querySelectorAll('.gf-pv__m span')].map((m) => m.getBoundingClientRect());
          let clash = 0; for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) if (sp[i].right > sp[j].left + 1 && sp[j].right > sp[i].left + 1 && sp[i].bottom > sp[j].top + 1 && sp[j].bottom > sp[i].top + 1) clash++;
          return { n: ms.length, out: ms.filter((m) => m.left < t.left - 1 || m.right > t.right + 1 || m.top < t.top - 1 || m.bottom > t.bottom + 1).length, clash, rows: new Set(ms.map((m) => Math.round(m.top / 20))).size, overlapM: ms.filter((m, i) => i && m.left < ms[i - 1].right - 1).length, figH: Math.round(ms[0]?.height || 0) }; });
      }
      // the new 铜盾甲兵 card next to 盾甲兵
      await page.locator('.gf-pv__m', { hasText: '铜盾甲兵' }).click().catch(() => {}); await page.waitForTimeout(700); await shot(page, dir, 'd-info-shielder_m');
    });
    await step('almanac', async () => {
      await open(page, save(ALL, { current: '2-11' })); await page.locator('.gf-bigcard--alm').click(); await page.waitForTimeout(700);
      R.tabs = await page.evaluate(() => [...document.querySelectorAll('.gf-alm__tab')].map((t) => t.textContent.trim()));
      await page.locator('.gf-alm__tab[data-tab="machine"]').click(); await page.waitForTimeout(500); await shot(page, dir, 'e-alm-machines');
      await page.locator('.gf-alm__tile:not(.is-locked)').first().click(); await page.waitForTimeout(700); await shot(page, dir, 'e-alm-page');
      R.say = await page.evaluate(() => [...document.querySelectorAll('.gf-alm__page.is-on .gf-say, .gf-say')].filter((b) => b.offsetWidth).map((b) => { const r = b.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; let ok = 0; for (const dx of [-23.5, 0, 23.5]) for (const dy of [-23.5, 0, 23.5]) { if (!dx && !dy) continue; const e = document.elementFromPoint(cx + dx, cy + dy); if (e && e.closest('.gf-say') === b) ok++; } return ok; }));
    });
    await step('puzzle', async () => {
      await open(page, save(ALL, { current: '2-11' })); await page.locator('.gf-bigcard--pz').click(); await page.waitForTimeout(700);
      await page.locator('.gf-pz:not(.is-locked)').nth(2).click(); await page.waitForTimeout(1500); await shot(page, dir, 'f-pz-board');
      R.pzMarks = await page.evaluate(() => document.querySelectorAll('.gf-scroll__m').length);
    });
    await step('story', async () => {
      await open(page, save(ALL, { current: '2-11' }));
      for (const sid of STORIES) {
        page.evaluate((sid) => window.__gfApp.story(sid), sid).catch(() => {});
        await page.waitForFunction(() => window.__gfStory, null, { timeout: 8000 });
        const N = await page.evaluate(() => window.__gfStory.n);
        for (let k = 0; k < N; k++) {
          const ok = await page.evaluate((k) => { const s = window.__gfStory; try { s.seek(k, 0.1); return s.shot() === k; } catch { return false; } }, k);
          if (!ok) break;
          await page.waitForTimeout(900);
          await page.evaluate((k) => { const s = window.__gfStory; s.seek(k, s.dur() - 0.03); }, k);
          await page.waitForTimeout(250); await shot(page, dir, `g-${sid}-${k}`);
          if (await page.evaluate((k) => window.__gfStory.shot() !== k, k)) break;
        }
        await page.evaluate(() => window.__gfStory.end()); await page.waitForTimeout(400);
        await page.evaluate(() => { delete window.__gfStory; });
      }
    });
    await step('voice', async () => {
      await open(page, save(ALL, { current: '2-11' })); await page.waitForTimeout(1500);
      R.voice = await page.evaluate(async () => { const v = window.__gfApp.voice; const ids = Object.keys(window.__gfApp.voice.narrator.manifest).filter((k) => v.hasClip(k)).slice(0, 40); let maxMs = 0, maxN = 0;
        for (const id of ids) { void v.say(id, { interrupt: true }); await new Promise((r) => setTimeout(r, 250)); const q = v.retained(); maxMs = Math.max(maxMs, q.ms); maxN = Math.max(maxN, q.n); }
        v.stop(); return { played: ids.length, maxMs, maxN, now: v.retained() }; });
    });
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(results, null, 1));
