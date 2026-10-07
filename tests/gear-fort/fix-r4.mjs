#!/usr/bin/env node
// 机关守城 · QA r4 fix tour (WebKit, iPad 9 sizes, both orientations): 「墨子，怎么办？」 concept bubble = the voiced line,
// the 2-11 Boss bar after the owl is down, every story shot at the END of its camera move (seek hook), the 亮招 preview
// (1-8 fixed deck, 1-6 急报), the 图谱 牒 tab (locked tile says where it opens), the 图谱 page listen buttons.
//   node tests/gear-fort/fix-r4.mjs [--port=5311] [--only=portrait|landscape] [--steps=ask,boss,story,preview,almanac]
// One browser, always closed. Shots → ~/kid-games-work/shots/gear-fort/fix-r4/<project>/<name>.png. Kit pages auto-mute.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5311'); const ONLY = opt('only', ''); const STEPS = opt('steps', '').split(',').filter(Boolean);
const STORIES = opt('stories', 'prologue,v1end,v2open,v2end').split(',');
const OUT = path.join(os.homedir(), 'kid-games-work/shots/gear-fort/fix-r4');
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

    await step('ask', async () => {
      R.ask = {};
      for (const id of ['1-3', '2-10']) {
        await open(page, save(upto(id), { current: id }));
        await page.evaluate((id) => window.__gfApp.play(id, window.__gfApp.level(id).loadout || window.__gfApp.level(id).pool.slice(0, window.__gfApp.level(id).slots)), id); await page.waitForFunction(() => window.__gf?.S.tick > 5, null, { timeout: 15000 });
        await page.locator('.gf-mozi__a, .gf-mozi').first().click().catch(() => {});
        await page.waitForTimeout(900);
        R.ask[id] = await page.evaluate(() => { const b = document.querySelector('.gf-bubble--mozi, .gf-mozi__b, [class*="mozi"] .t'); return b ? { text: b.textContent, line: b.closest('[data-line]')?.dataset.line ?? b.parentElement?.dataset.line } : null; });
        await shot(page, dir, `a-ask-${id}`);
      }
    });
    await step('boss', async () => {
      await open(page, save(upto('2-11'), { current: '2-11' }));
      await page.evaluate(() => window.__gfApp.play('2-11', window.__gfApp.level('2-11').loadout || window.__gfApp.level('2-11').pool.slice(0, window.__gfApp.level('2-11').slots))); await page.waitForFunction(() => window.__gf?.S.tick > 5, null, { timeout: 15000 });
      R.bossWait = await page.evaluate(() => ({ cloud: document.querySelector('.gf-boss__cloud')?.className, cls: document.querySelector('.gf-boss')?.className }));
      await page.evaluate(() => { const g = window.__gf; g.S.boss = { ...(g.S.boss || {}), done: true }; for (const e of g.S.enemies) if (e.boss) { e.hp = 0; e.gone = true; } g.S.enemies = g.S.enemies.filter((e) => !e.boss); });
      await page.waitForTimeout(700);
      R.bossDone = await page.evaluate(() => ({ cloud: document.querySelector('.gf-boss__cloud')?.className, cls: document.querySelector('.gf-boss')?.className, dots: [...document.querySelectorAll('.gf-boss__dots i')].map((d) => d.className).join('|') }));
      await page.evaluate(() => window.__gf.pause?.()); await page.waitForTimeout(300); await shot(page, dir, 'b-boss-done');
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
          await page.waitForTimeout(1100);
          await page.evaluate((k) => { const s = window.__gfStory; s.seek(k, s.dur() - 0.03); }, k); // end of the camera move
          await page.waitForTimeout(250); await shot(page, dir, `s-${sid}-${k}-end`);
          if (await page.evaluate((k) => window.__gfStory.shot() !== k, k)) break;
        }
        await page.evaluate(() => window.__gfStory.end()); await page.waitForTimeout(400);
        await page.evaluate(() => { delete window.__gfStory; });
      }
    });
    await step('preview', async () => {
      for (const id of (process.env.PV || '1-8,1-6,1-10,2-9,2-10').split(',')) {
        await open(page, save(upto(id), { current: id }));
        await page.evaluate((id) => window.__gfApp.preview?.(id), id); await page.waitForTimeout(1300); await shot(page, dir, `p-preview-${id}`);
        R['gap-' + id] = await page.evaluate(() => { const go = [...document.querySelectorAll('button')].find((b) => /开始推演/.test(b.textContent)); const bonus = document.querySelector('.gf-pv__bonus'); const f = document.querySelector('.gf-pv__feat'); if (!go || !bonus) return null; return { gap: Math.round(go.getBoundingClientRect().top - bonus.getBoundingClientRect().bottom), goBottom: Math.round(go.getBoundingClientRect().bottom), vh: innerHeight, feat: f ? (f.hidden ? 'hidden' : Math.round(f.getBoundingClientRect().height)) : 'none' }; });
      }
    });
    await step('almanac', async () => {
      await open(page, save(upto('2-6'), { current: '2-6', almanac: {} })); await page.locator('.gf-bigcard--alm').click(); await page.waitForTimeout(900); await shot(page, dir, 'f-almanac');
      await page.locator('.gf-alm__tile:not(.is-locked)').first().click(); await page.waitForTimeout(700); await shot(page, dir, 'f-almanac-page');
      R.say = await page.evaluate(() => [...document.querySelectorAll('.gf-say')].map((b) => { const r = b.getBoundingClientRect(); const x = r.left - 3, y = r.top - 3; const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e?.closest('.gf-say') === b ? 'ok' : (e?.className || e?.tagName); }; return [hit(r.left - 3, r.top - 3), hit(r.right + 3, r.bottom + 3), hit(r.left + 20, r.top - 3), Math.round(r.width)]; }));
    });
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify(results, null, 1));
