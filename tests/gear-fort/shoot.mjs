#!/usr/bin/env node
// 机关守城 screenshot tour (spec §9.9): WebKit, iPad 9 viewports (portrait 810×1080 + landscape 1080×810).
//   node tests/gear-fort/shoot.mjs [--port=5311] [--only=portrait|landscape] [--steps=a,b]
// One browser, always closed. Shots → ~/kid-games-work/shots/gear-fort/<project>/<name>.png. Pages load the kit → auto-muted.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5311'); const ONLY = opt('only', ''); const STEPS = opt('steps', '');
const OUT = path.join(os.homedir(), 'kid-games-work/shots/gear-fort');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const URL = `http://localhost:${PORT}/gear-fort/?test=1`;
const projects = [
  { name: 'landscape', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
  { name: 'portrait', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
].filter((p) => !ONLY || p.name.startsWith(ONLY));
const won0 = (ids) => JSON.stringify({ v: 1, updatedAt: Date.now(), data: { ...{}, levels: Object.fromEntries(ids.map((id) => [id, { best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' }])), current: '1-' + (ids.length + 1), counters: { walker: { shooter: 5 }, shielder: { lobber: 3 }, ram: { spikes: 2 } } } });
const won = (ids, extra = {}) => { const o = JSON.parse(won0(ids)); Object.assign(o.data, extra); return JSON.stringify(o); };
const V1 = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10'];

async function open(page, save) {
  await page.goto(`http://localhost:${PORT}/gear-fort/?test=1`);
  await page.evaluate((s) => { localStorage.clear(); if (s) localStorage.setItem('kg:v1:gear-fort', s); }, save);
  await page.goto(URL, { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  await page.waitForTimeout(600);
}
const steps = {
  async zoo(page, shot) { // volume-2 art review: every new card and machine on one board (+ the owl), day then night
    for (const night of [false, true]) {
      await open(page, won([...V1, '1-11'], { current: '2-1' }));
      await page.evaluate((night) => { const base = window.__gfApp.level('2-11'); const lv = { ...base, id: 'zoo', name: 'zoo', type: 'practice', boss: night ? base.boss : undefined, flags: [], star3: {}, voice: undefined, env: { night }, start: 9000, jitter: 0, belt: undefined,
        spawns: [[10, 0, 'flyer', 1], [14, 1, 'smoker', 1], [12, 2, 'ladder', 1], [16, 3, 'drummer', 1], [10, 4, 'shielder_m', 1], [30, 4, 'walker', 1], [22, 0, 'flyer', 1], ...(night ? [[6, 2, 'boss:owl', 1]] : [])] };
        window.__gfApp.battle(lv, ['bank', 'radial', 'gust', 'hook', 'farm', 'wall']); }, night);
      await page.waitForTimeout(900);
      await page.evaluate(() => { const g = window.__gf; for (const [c, l, k] of [['bank', 0, 0], ['farm', 0, 2], ['radial', 1, 1], ['gust', 2, 0], ['wall', 2, 3], ['hook', 3, 2], ['farm', 4, 0], ['radial', 4, 1]]) { g.S.grain = 9000; g.S.cdReady = {}; g.place(c, l, k); } });
      await page.evaluate(() => window.__gf.setSpeed(3)); await page.waitForTimeout(2600); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(500); await shot(`s6${night ? 5 : 0}-zoo-${night ? 'night' : 'day'}-a`);
      await page.evaluate(() => window.__gf.setSpeed(3)); await page.waitForTimeout(3200); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(400); await shot(`s6${night ? 6 : 1}-zoo-${night ? 'night' : 'day'}-b`);
    }
  },
  async v2map(page, shot) { // volume 2 opens after 1-11: the road turns from day to night the first time (3 s, §4.13)
    await open(page, won([...V1, '1-11'], { current: '2-1' })); await page.waitForTimeout(500); await shot('s50-map-v2-dusk'); await page.waitForTimeout(3400); await shot('s51-map-v2-night');
    await page.locator('.gf-tabs button').first().click(); await page.waitForTimeout(600); await shot('s52-map-v1-day');
  },
  async puzzle(page, shot) { // 锦囊谜题: list → P1-02 → lay out the reference solution → 开始推演 → result
    await open(page, won([...V1, '1-11'], { current: '2-1' })); await page.locator('.gf-bigcard--pz').click(); await page.waitForTimeout(800); await shot('s55-puzzles');
    await page.locator('.gf-pz').nth(1).click(); await page.waitForTimeout(1500); await shot('s56-pz-setup-empty');
    await page.evaluate(() => { const g = window.__gf; g.place('lobber', 1, 0); g.place('shooter', 3, 0); g.place('pit', 3, 6); }); await page.waitForTimeout(600); await shot('s57-pz-setup');
    await page.evaluate(() => { window.__gf.go(); window.__gf.setSpeed(1); }); await page.waitForTimeout(9000); await shot('s58-pz-run');
    await page.evaluate(() => window.__gf.setSpeed(12)); await page.waitForSelector('.xg-scrim', { timeout: 90000 }).catch(() => {}); await page.waitForTimeout(1800); await shot('s59-pz-result');
  },
  async first(page, shot) { // first visit → 1-1 straight away
    await open(page, null); await page.waitForTimeout(2200); await shot('s01-1-1-intro');
    await page.evaluate(() => window.__gf.place('shooter', 2, 1)); await page.waitForTimeout(300); await shot('s02-1-1-placed');
    await page.evaluate(() => window.__gf.setSpeed(3)); await page.waitForTimeout(5200); await shot('s03-1-1-fight');
    await page.evaluate(() => window.__gf.place('shooter', 2, 2)); await page.waitForTimeout(6500); await shot('s04-1-1-wave');
    await page.evaluate(() => window.__gf.setSpeed(12)); await page.waitForSelector('.xg-scrim', { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(1600); await shot('s05-1-1-result');
    await page.getByRole('button', { name: '回地图' }).click().catch(() => {}); await page.waitForTimeout(900); await shot('s06-map');
  },
  async preview(page, shot) {
    await open(page, won(V1.slice(0, 7))); await page.waitForTimeout(500); await shot('s10-map-7');
    await page.locator('.xg-node').nth(7).click(); await page.waitForTimeout(1600); await shot('s11-preview-1-8');
    await page.locator('.gf-pv__m').first().click(); await page.waitForTimeout(500); await shot('s12-preview-info'); await page.locator('.gf-info').click();
    await page.locator('.gf-pv__go').click(); await page.waitForTimeout(1200);
    await page.evaluate(() => { const g = window.__gf; for (const [c, l, k] of [['farm', 0, 0], ['farm', 1, 0], ['farm', 2, 0], ['shooter', 0, 1], ['shooter', 1, 1], ['lobber', 2, 1], ['shooter', 3, 1], ['shooter', 4, 1], ['wall', 2, 4], ['pit', 3, 5]]) { g.S.grain += 200; g.place(c, l, k); } g.setSpeed(3); });
    await page.waitForTimeout(9000); await shot('s13-1-8-fight');
    await page.evaluate(() => window.__gf.setSpeed(6)); await page.waitForTimeout(9000); await shot('s14-1-8-later');
  },
  async boss(page, shot) {
    await open(page, won(V1)); await page.locator('.xg-node').nth(10).click(); await page.waitForTimeout(1500); await shot('s20-preview-1-11');
    await page.locator('.gf-pv__go').click(); await page.waitForTimeout(800);
    await page.evaluate(() => { const g = window.__gf; for (const [c, l, k] of [['farm', 0, 0], ['farm', 1, 0], ['lobber', 2, 1], ['lobber', 2, 2], ['shooter', 1, 1], ['shooter', 3, 1], ['wall', 2, 4], ['spikes', 2, 5], ['shooter', 0, 1], ['shooter', 4, 1]]) { g.S.grain += 300; g.place(c, l, k); } g.setSpeed(8); });
    await page.waitForFunction(() => window.__gf.S.enemies.some((e) => e.boss), null, { timeout: 60000 }); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(1500); await shot('s21-1-11-boss');
    await page.evaluate(async () => { const g = window.__gf; for (let l = 0; l < 5; l++) for (const [c, k] of [['shooter', 1], ['wall', 6], ['lobber', 0]]) { g.S.grain = 3000; g.S.cdReady = {}; g.place(c, l, k); await new Promise((r) => setTimeout(r, 60)); } g.S.logs = [0, 0, 0, 0, 0]; g.setSpeed(6); });
    await page.waitForFunction(() => window.__gf.S.enemies.some((e) => e.boss && (e.boss.tele ?? 0) > 0) || window.__gf.S.result, null, { timeout: 90000 }).catch(() => {}); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(450); await shot('s21b-1-11-charge-tele');
    await page.evaluate(() => { const e = window.__gf.S.enemies.find((q) => q.boss); if (e) { e.hp = e.p2At; e.boss.phase = 2; e.boss.shellAt = window.__gf.S.tick; e.boss.crack = Math.floor(e.crackMax * 0.45); e.mat = 'metal'; } window.__gf.setSpeed(1); }); await page.waitForTimeout(1200); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(600); await shot('s21b-1-11-shell');
    await page.evaluate(() => window.__gf.pause()); await page.waitForTimeout(500); await shot('s22-pause');
  },
  async rack(page, shot) { // 1-6: 驿马 brings cards to the rack; 鲁班按手 10 s before each 大波
    await open(page, won(V1.slice(0, 5))); await page.locator('.xg-node').nth(5).click(); await page.waitForTimeout(1500); await shot('s15-preview-1-6');
    await page.locator('.gf-pv__go').click(); await page.waitForTimeout(800);
    await page.evaluate(() => window.__gf.setSpeed(10)); await page.waitForFunction(() => window.__gf.S.belt.length >= 4, null, { timeout: 40000 });
    await page.evaluate(() => { const g = window.__gf; g.place(g.S.belt[0], 2, 1); g.setSpeed(1); }); await page.waitForTimeout(900); await shot('s16-1-6-rack');
    await page.evaluate(() => window.__gf.setSpeed(10)); await page.waitForSelector('.gf-warn', { timeout: 60000 }); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(700); await shot('s17-1-6-warn');
  },
  async help(page, shot) { // 3rd loss → 复盘 with 幽灵 + two assist tiers; then the ghost replay
    await open(page, won(['1-1', '1-2'], { lossStreak: { '1-3': 2 } })); await page.locator('.xg-node').nth(2).click(); await page.waitForTimeout(900); await page.locator('.gf-pv__go').click(); await page.waitForTimeout(600);
    await page.evaluate(() => { const g = window.__gf; g.S.logs = [1, 1, 1, 1, 1]; g.setSpeed(20); }); await page.waitForSelector('.gf-debrief', { timeout: 60000 }); await page.waitForTimeout(900); await shot('s30-debrief-help');
    await page.locator('.gf-helpcard[data-a="ghost"]').click(); await page.waitForTimeout(3500); await shot('s31-ghost');
    await page.evaluate(() => window.__gf.setSpeed(20)); await page.waitForSelector('.gf-debrief', { timeout: 60000 });
    await page.locator('.gf-helpcard[data-a="assist2"]').click(); await page.waitForTimeout(1200); await shot('s32-assist2-preview');
    await page.locator('.gf-pv__go').click(); await page.waitForTimeout(600); await page.evaluate(() => window.__gf.setSpeed(6)); await page.waitForTimeout(4000); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(1500); await shot('s33-assist2-battle');
  },
  async machines(page, shot) { // vol-1 machines up close: 铜甲力士 (1-9), 蚁傅 swarm (1-7), a 盾 splitting in two (1-4)
    const go = async (i, setup) => { await open(page, won(V1.slice(0, i))); await page.locator('.xg-node').nth(i).click(); await page.waitForTimeout(1200); await page.locator('.gf-pv__go').click(); await page.waitForTimeout(700); await page.evaluate(setup); };
    await go(8, () => { const g = window.__gf; g.S.grain = 2000; for (const [c, l, k] of [['farm', 0, 0], ['farm', 4, 0], ['beam', 2, 1], ['lobber', 2, 2], ['shooter', 1, 1], ['shooter', 3, 1], ['wall', 2, 5]]) { g.S.cdReady = {}; g.place(c, l, k); } g.setSpeed(10); });
    await page.waitForFunction(() => window.__gf.S.enemies.some((e) => e.k === 'brute' && e.x < 60000), null, { timeout: 60000 }); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(1600); await shot('s23-1-9-brute');
    await go(6, () => { const g = window.__gf; g.S.grain = 2000; for (const [c, l, k] of [['farm', 0, 0], ['burner', 2, 1], ['shooter', 1, 1], ['shooter', 3, 1], ['wall', 2, 4]]) { g.S.cdReady = {}; g.place(c, l, k); } g.setSpeed(10); });
    await page.waitForFunction(() => window.__gf.S.enemies.filter((e) => e.k === 'ant' && e.x < 70000).length >= 5, null, { timeout: 60000 }); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(900); await shot('s24-1-7-ants');
    await go(3, () => { const g = window.__gf; g.S.grain = 2000; for (const [c, l, k] of [['farm', 0, 0], ['wall', 1, 3]]) { g.S.cdReady = {}; g.place(c, l, k); } g.setSpeed(10); });
    await page.waitForFunction(() => window.__gf.S.enemies.some((e) => e.k === 'shielder' && e.x < 62000 && e.sh > 0), null, { timeout: 60000 });
    await page.evaluate(() => { const g = window.__gf; g.setSpeed(1); const e = g.S.enemies.find((q) => q.k === 'shielder' && q.x < 62000 && q.sh > 0); e.sh = 1; window.__sid = e.id; g.S.grain = 2000; g.S.cdReady = {}; g.place('shooter', e.lane, 1); }); await page.waitForFunction(() => { const e = window.__gf.S.enemies.find((q) => q.id === window.__sid); return !e || e.sh <= 0; }, null, { timeout: 30000 }); await page.waitForTimeout(160); await shot('s25-1-4-shield-split');
  },
  async strip(page, shot) { // §6.7 art gate: an 8-frame action strip of one lane (shoot · hit-flash · ram run-up + impact · break apart · parts to the box)
    await open(page, won(V1.slice(0, 4))); await page.locator('.xg-node').nth(4).click(); await page.waitForTimeout(1200); await page.locator('.gf-pv__go').click(); await page.waitForTimeout(700);
    await page.evaluate(async () => { const g = window.__gf; for (const [c, l, k] of [['shooter', 2, 1], ['wall', 2, 3], ['lobber', 2, 0], ['farm', 0, 0]]) { g.S.grain = 2000; g.S.cdReady = {}; g.place(c, l, k); await new Promise((r) => setTimeout(r, 70)); } g.setSpeed(10); });
    await page.waitForFunction(() => window.__gf.S.enemies.some((e) => e.k === 'ram' && e.lane === 2 && e.x < 62000), null, { timeout: 60000 }); await page.evaluate(() => window.__gf.setSpeed(1));
    const clip = await page.evaluate(() => { const c = document.querySelector('.gf-battle canvas') || document.querySelector('canvas'); const r = c.getBoundingClientRect(); const g = window.__gf.stage.geo; return { x: r.left + g.bx - 4, y: r.top + g.by + g.h * 1.25, width: Math.min(r.width - g.bx, g.x0 + g.w * 8.6 - g.bx), height: g.h * 1.9 }; });
    for (let i = 0; i < 8; i++) { await page.screenshot({ path: path.join(OUT, 'strip', `${page.viewportSize().width}-f${i}.png`), clip }); await page.waitForTimeout(260); }
  },
  async perf(page, shot) { // §9.8 peak-load scene (1-10 big wave, 40 units on the board) — render cost per frame, drawImage calls
    await open(page, won(V1.slice(0, 9))); await page.locator('.xg-node').nth(9).click(); await page.waitForTimeout(1200); await page.locator('.gf-pv__go').click(); await page.waitForTimeout(700);
    await page.evaluate(async () => { const g = window.__gf; const deck = (g.S.loadout || ['shooter', 'farm', 'wall', 'lobber', 'burner', 'beam']).filter((d) => d !== 'farm' && d !== 'wall'); let i = 0;
      for (let l = 0; l < 5; l++) for (let c = 0; c < 8; c++) { g.S.grain = 9999; g.S.cdReady = {}; g.place(c === 0 ? 'farm' : c === 7 ? 'wall' : deck[i++ % deck.length], l, c); await new Promise((r) => setTimeout(r, 70)); } g.setSpeed(10); });
    await page.waitForFunction(() => window.__gf.S.tick > 92 * 20, null, { timeout: 150000 }); await page.evaluate(() => window.__gf.setSpeed(1)); await page.waitForTimeout(4500);
    const r = await page.evaluate(() => window.__gf.perf()); await shot('s26-perf-peak');
    fs.mkdirSync(path.join(OUT, '..', 'perf'), { recursive: true }); fs.writeFileSync(path.join(OUT, '..', 'perf', `perf-${page.viewportSize().width}.json`), JSON.stringify(r)); console.log('perf', JSON.stringify(r));
  },
  async cost(page, shot) { // §9.8 frame cost of the non-battle canvases: story shots, the inn, the 宋城 plaque (20 fps) and big view (30 fps)
    await open(page, won([...V1, '1-11'], { current: '2-1' }));
    for (const [id, n] of [['prologue', 5], ['dock', 3], ['v1end', 4], ['v2open', 2], ['v2end', 4]]) {
      await page.evaluate((id) => { window.__gfApp.story(id); }, id); await page.waitForTimeout(400);
      await page.waitForFunction(() => !!window.__gfStory && !!document.querySelector('.gf-story'), null, { timeout: 6000 });
      for (let i = 0; i < n; i++) { await page.evaluate((i) => window.__gfStory.jump(i), i); await page.waitForTimeout(1500); }
      await page.evaluate(() => window.__gfStory.end()); await page.waitForTimeout(400);
    }
    await page.evaluate(() => window.__gfApp.inn('1-3')); await page.waitForTimeout(4000);
    const c0 = await page.evaluate(() => window.__gfCost());
    await open(page, won([...V1, '1-11', '2-1', '2-2'], { current: '2-3', story: ['map.night', 'prologue', 'dock', 'v1end', 'v2open'] })); await page.waitForTimeout(3000);
    await page.locator('.gf-song').click(); await page.waitForTimeout(3000);
    const c = { ...c0, ...(await page.evaluate(() => window.__gfCost())) }; await shot('s28-cost-songview');
    fs.mkdirSync(path.join(OUT, '..', 'perf'), { recursive: true }); fs.writeFileSync(path.join(OUT, '..', 'perf', `cost-${page.viewportSize().width}.json`), JSON.stringify(c)); console.log('cost', JSON.stringify(c));
  },
  async fold(page, shot) { // §6.4 Boss 折叠 in battle: 铜犀 → 犁 (1-11), 木鸢 → 风筝 (2-11), frames through the 2.5 s fold + exit
    for (const [id, prev] of [['1-11', V1], ['2-11', [...V1, '1-11', '2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8', '2-9', '2-10']]]) {
      await open(page, won(prev, { current: id, story: ['prologue', 'dock', 'map.night', 'v1end', 'v2open'] }));
      await page.evaluate((id) => { const lv = window.__gfApp.level(id); window.__gfApp.battle({ ...lv, spawns: lv.spawns.filter((s) => String(s[2]).startsWith('boss:')).map((s) => [40, s[1], s[2], 1]) }, ['shooter', 'farm', 'wall', 'lobber', 'beam', 'burner']); }, id);
      await page.waitForFunction(() => window.__gf && window.__gf.S.enemies.some((e) => e.boss), null, { timeout: 15000 });
      await page.evaluate(() => { const g = window.__gf; g.setSpeed(1); const b = g.S.enemies.find((e) => e.boss); b.x = 52000; }); await page.waitForTimeout(1500);
      await page.evaluate(() => { const b = window.__gf.S.enemies.find((e) => e.boss); b.hp = 0; b.sh = 0; });
      for (const [i, ms] of [[0, 250], [1, 450], [2, 500], [3, 600], [4, 700], [5, 900]]) { await page.waitForTimeout(ms); await shot(`s29-fold-${id}-${i}`); }
    }
  },
  async stories(page, shot) { // §6.3b narrative scenes: one frame from every shot (jump through them), both orientations
    await open(page, won([...V1, '1-11'], { current: '2-1' }));
    for (const [id, n] of [['prologue', 5], ['dock', 3], ['v1end', 4], ['v2open', 2], ['v2end', 4]]) {
      await page.evaluate((id) => { window.__gfApp.story(id); }, id); await page.waitForTimeout(400);
      await page.waitForFunction(() => !!window.__gfStory && !!document.querySelector('.gf-story'), null, { timeout: 6000 });
      for (let i = 0; i < n; i++) { await page.evaluate((i) => window.__gfStory.jump(i), i); await page.waitForTimeout(i === 0 && id.endsWith('end') ? 2600 : 1700); await shot(`s7${id === 'prologue' ? 0 : id === 'dock' ? 1 : id === 'v1end' ? 2 : id === 'v2open' ? 3 : 4}${i}-story-${id}-${i + 1}`); }
      await page.evaluate(() => window.__gfStory.end()); await page.waitForTimeout(500);
    }
  },
  async inn(page, shot) { // §5.8 驿站 (two of eight: 1-3 night, 2-11 dawn) + 讲给爸爸听 card
    for (const [lv, ids] of [['1-3', V1.slice(0, 3)], ['2-11', [...V1, '1-11', '2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8', '2-9', '2-10', '2-11']]]) {
      await open(page, won(ids)); await page.evaluate((lv) => window.__gfApp.inn(lv), lv); await page.waitForTimeout(1500); await shot(`s80-inn-${lv}-talk`);
      for (let i = 0; i < 3; i++) { await page.mouse.click(300, 300); await page.waitForTimeout(700); }
      await page.waitForTimeout(1200); await shot(`s81-inn-${lv}-ask`);
    }
  },
  async repair(page, shot) { // §5.7 result page close-up of the part just repaired, then the 墨家旗 on the tray
    await open(page, won(V1.slice(0, 4))); await page.evaluate(() => window.__gfApp.win('1-5', 3)); await page.waitForTimeout(1300); await shot('s85-repair-zoom');
    await page.waitForTimeout(2600); await shot('s86-repair-tray');
    const all = [...V1, '1-11', '2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8', '2-9'];
    await open(page, won(all, { levels: Object.fromEntries(all.map((id) => [id, { best: 3, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' }])), current: '2-10', story: ['map.night', 'prologue', 'dock', 'v1end', 'v2open'] }));
    await page.waitForTimeout(800); await shot('s87-map-song-night');
    await page.locator('.gf-song').click(); await page.waitForTimeout(900); await shot('s88-songview');
    await page.locator('.gf-songview .xg-modal__close').click(); await page.waitForTimeout(300);
    await page.evaluate(() => window.__gfApp.win('2-10', 3)); await page.waitForTimeout(1500); await shot('s89-repair-sunrise');
  },
  async settings(page, shot) {
    await open(page, won(V1.slice(0, 2))); await page.locator('.gf-map__gear').click(); await page.waitForTimeout(500);
    await page.locator('.gf-set__row').nth(1).click(); await page.waitForTimeout(400); await shot('s90-settings');
  },
  async vol2(page, shot) { // real volume-2 levels under a scripted defence: flyers, smoke, fog, ladders, drummer, dawn, the owl
    const V2 = ['2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8', '2-9', '2-10'];
    const plan = (process.env.GF_V2 ? JSON.parse(process.env.GF_V2) : { '2-2': [6, 12], '2-4': [8, 14], '2-5': [8, 16], '2-6': [10, 18], '2-8': [8, 16], '2-10': [40, 70], '2-11': [12, 30, 60] });
    for (const [id, times] of Object.entries(plan)) {
      const prev = V2.slice(0, V2.indexOf(id) < 0 ? V2.length : V2.indexOf(id));
      await open(page, won([...V1, '1-11', ...prev], { current: id, story: ['prologue', 'dock', 'map.night', 'v1end', 'v2open'] }));
      await page.evaluate((id) => { const lv = window.__gfApp.level(id); const deck = lv.loadout || ['bank', 'shooter', 'radial', 'wall', 'lobber', 'gust', 'hook', 'farm'].slice(0, lv.slots || 6); window.__gfApp.battle(lv, deck); }, id);
      await page.waitForTimeout(1200);
      const jobs = await page.evaluate(() => { const g = window.__gf; const L = g.S.L; const d = g.S.loadout; const night = !!(L.env && L.env.night); const out = [];
        const want = [[night ? 'bank' : 'farm', 0], ['shooter', 1], ['radial', 2], ['lobber', 2], ['burner', 3], ['hook', 3], ['gust', 4], ['wall', 5]];
        L.lanes.forEach((on, lane) => { if (on) for (const [c, col] of want) if (d.includes(c)) out.push([c, lane, col]); }); return out; });
      for (const [c, lane, col] of jobs) { await page.evaluate(([c, lane, col]) => { const g = window.__gf; g.S.grain = 9000; g.S.cdReady = {}; g.place(c, lane, col); }, [c, lane, col]); await page.waitForTimeout(70); }
      let t0 = 0;
      for (const [k, t] of times.entries()) { await page.evaluate(() => window.__gf.setSpeed(4)); await page.waitForTimeout(Math.max(0, (t - t0) * 1000 / 4)); t0 = t; await page.evaluate(() => { window.__gf.setSpeed(1); window.__gf.collectAll(); }); await page.waitForTimeout(450); await shot(`s1${id.replace('-', '')}-${'abc'[k]}`); }
    }
  },
  async almanac2(page, shot) { // every page open after volume 2 (铜盾甲兵 after 2-10), the 锦囊页, numbers mode
    const all = [...V1, '1-11', '2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8', '2-9', '2-10', '2-11'];
    await open(page, won(all, { current: '2-11', jinnang: { econ: { seen: true, mastered: '1-2' }, counter: { seen: true, mastered: '1-4' } }, settings: { music: true, musicInLevel: false, shake: true, numbers: true, speed: 1 } }));
    await page.locator('.gf-bigcard--alm').click(); await page.waitForTimeout(800); await shot('s95-almanac-all');
    const n = await page.evaluate(() => ({ tiles: document.querySelectorAll('.gf-alm__tile').length, locked: document.querySelectorAll('.gf-alm__tile.is-locked').length, jn: document.querySelectorAll('.gf-jn').length }));
    console.log('almanac', JSON.stringify(n));
    await page.evaluate(() => document.querySelector('.gf-jn')?.scrollIntoView()); await page.waitForTimeout(400); await shot('s96-almanac-jinnang');
    await page.locator('.gf-alm__tile').nth(15).click(); await page.waitForTimeout(900); await shot('s97-almanac-shielder_m');
  },
  async almanac(page, shot) {
    await open(page, won(V1)); await page.locator('.gf-bigcard--alm').click(); await page.waitForTimeout(700); await shot('s40-almanac');
    await page.locator('.gf-alm__tile:not(.is-locked)').nth(3).click(); await page.waitForTimeout(800); await shot('s41-almanac-page');
  },
  async resume(page, shot) { // pause → 回地图 → "接着推演第 N 关？"
    await open(page, won(V1.slice(0, 3))); await page.locator('.xg-node').nth(3).click(); await page.waitForTimeout(900); await page.locator('.gf-pv__go').click(); await page.waitForTimeout(2500);
    await page.evaluate(() => window.__gf.pause()); await page.waitForTimeout(400); await page.getByRole('button', { name: '回地图' }).click(); await page.waitForTimeout(1200); await shot('s42-resume');
  },
};
fs.mkdirSync(path.join(OUT, 'strip'), { recursive: true });
const browser = await webkit.launch();
try {
  for (const p of projects) {
    const context = await browser.newContext({ ...p.ctx, locale: 'zh-CN' });
    const page = await context.newPage(); const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const dir = path.join(OUT, p.name); fs.mkdirSync(dir, { recursive: true });
    const taken = []; const shot = (n) => { taken.push(n); return page.screenshot({ path: path.join(dir, n + '.png') }); };
    for (const [name, fn] of Object.entries(steps)) { if (STEPS && !STEPS.split(',').includes(name)) continue; try { await fn(page, shot); } catch (e) { errors.push(`${name}: ${e.message}`); } }
    const info = await page.evaluate(() => ({ calls: window.__gf?.stage?.drawCalls, w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth })).catch(() => ({}));
    console.log(p.name, JSON.stringify(info), errors.length ? 'ERRORS:\n  ' + errors.slice(0, 12).join('\n  ') : 'no errors');
    if (taken.length) { // one contact sheet per orientation, to review many shots at once
      const sp = await context.newPage(); const cols = p.name === 'landscape' ? 3 : 4; const tw = p.name === 'landscape' ? 520 : 380;
      const cells = taken.map((n) => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(dir, n + '.png')).toString('base64')}"><figcaption>${n}</figcaption></figure>`).join('');
      await sp.setViewportSize({ width: cols * (tw + 12) + 12, height: 800 });
      await sp.setContent(`<style>body{margin:0;background:#222;color:#eee;font:14px sans-serif;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:12px;padding:12px}figure{margin:0}img{width:${tw}px;display:block}</style>${cells}`);
      await sp.waitForTimeout(300); await sp.screenshot({ path: path.join(OUT, `sheet-${p.name}${STEPS ? '-' + STEPS.replace(/,/g, '+') : ''}.png`), fullPage: true }); await sp.close();
    }
    await context.close();
  }
} finally { await browser.close(); }
