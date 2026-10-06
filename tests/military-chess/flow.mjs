#!/usr/bin/env node
// Scenario runner for 陆战棋 visual QA: real taps on stations (page.mouse at the station's client point),
// screenshots at named moments. One WebKit browser, closed at the end. Kit pages auto-mute under automation.
//   node tests/military-chess/flow.mjs <scenario> [--port=5303] [--only=portrait|landscape] [--slow=N]
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5303');
const ONLY = opt('only', '');
const SLOW = opt('slow', '');
const names = args.filter((a) => !a.startsWith('--'));
const OUT = path.join(os.homedir(), 'kid-games-work/shots/military-chess');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }

const SCENARIOS = {
  // select a railway engineer: destinations, rail network preview
  async select(t) {
    await t.pos({ a2: 'r1', e2: 'r9', b7: 'b5', d9: 'b7', b1: 'rF', d12: 'bF', c11: 'bM', e11: 'b3', a12: 'bM', c3: 'r4' });
    await t.tap('a2');
    await t.wait(400);
    await t.shot('select-engineer');
  },
  async railmove(t) {
    await t.pos({ a2: 'r1', e2: 'r9', b7: 'b5', d9: 'b7', b1: 'rF', d12: 'bF', c11: 'bM', e11: 'b3', a12: 'bM', c3: 'r4' }, {}, 'slow=4');
    await t.tap('a2');
    await t.wait(300);
    await t.tap('e11');
    await t.wait(900);
    await t.shot('rail-collision-approach');
    await t.wait(2600);
    await t.shot('rail-collision-plate');
  },
  async bomb(t) {
    await t.pos({ c6: 'r9', c7: 'bB', b1: 'rF', d12: 'bF', a6: 'r4', e8: 'b5' }, {}, 'slow=4');
    await t.tap('c6');
    await t.wait(250);
    await t.tap('c7');
    await t.wait(3050);
    await t.shot('bomb-fx');
    await t.wait(4000);
    await t.shot('bomb-after-flag-shown');
  },
  async mine(t) {
    await t.pos({ a11: 'r1', a12: 'bM', b12: 'bF', b1: 'rF', e2: 'r8', e11: 'b3', c11: 'bM', b11: 'bM' }, {}, 'slow=3');
    await t.tap('a11');
    await t.wait(250);
    await t.tap('a12');
    await t.wait(2200);
    await t.shot('engineer-dig');
  },
  async flag(t) {
    await t.pos({ b11: 'r1', b12: 'bF', b1: 'rF', e7: 'b3', a12: 'bM', c12: 'bM' });
    await t.tap('b11');
    await t.wait(250);
    await t.tap('b12');
    await t.wait(1500);
    await t.shot('flag-capture');
    await t.wait(3500);
    await t.shot('result-family-win');
  },
  async count(t) {
    await t.pos({ a6: 'r9^', e7: 'b5^', c11: 'r3', d10: 'b7', b1: 'rF^', b12: 'bF^', a12: 'bM', e12: 'r2' }, { mode: 'fan', ladder: true, quiet: 39 });
    await t.tap('a6');
    await t.wait(250);
    await t.tap('a5');
    await t.wait(2600);
    await t.shot('count');
    await t.wait(3000);
    await t.shot('result-count');
  },
  async fan(t) {
    await t.page.evaluate(() => {
      const m = { v: 1, id: 'fanshot', mode: 'fan', setup: { firstMover: 0, fanSeed: 'mc:fan:shot', firstPlayer: 0 }, actions: [], opponent: { kind: 'family', seating: 'side', names: ['小步步', '爸爸'] }, kidSide: 0, kidSeat: 'near', tags: {}, hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: false };
      window.__mc.app.go({ name: 'match', setup: m });
    });
    await t.wait(500);
    for (const at of ['c6', 'c7', 'b6', 'b7', 'a6', 'd7', 'e6', 'a7', 'd6', 'e8']) {
      await t.tap(at);
      await t.wait(700);
    }
    await t.wait(600);
    await t.shot('fan-midgame');
  },
  async face(t) {
    await t.page.evaluate(() => {
      const m = { v: 1, id: 'faceshot', mode: 'ming', setup: { firstMover: 0, red: '527369B841371652M41BMFM32', blue: '234216571B835B9146M723MFM' }, actions: [], opponent: { kind: 'family', seating: 'face', names: ['小步步', '爸爸'] }, kidSide: 0, kidSeat: 'near', tags: {}, hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: false };
      window.__mc.app.go({ name: 'match', setup: m });
    });
    await t.wait(900);
    await t.shot('face-ming');
  },
  async facefan(t) {
    await t.page.evaluate(() => {
      const m = { v: 1, id: 'facefan', mode: 'fan', setup: { firstMover: 0, fanSeed: 'mc:fan:face', firstPlayer: 0 }, actions: [], opponent: { kind: 'family', seating: 'face', names: ['小步步', '爸爸'] }, kidSide: 0, kidSeat: 'near', tags: {}, hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: false };
      window.__mc.app.go({ name: 'match', setup: m });
    });
    await t.wait(500);
    for (const at of ['c6', 'c7', 'b6', 'b7', 'a6', 'd7']) {
      await t.tap(at);
      await t.wait(700);
    }
    await t.shot('face-fan');
  },
  async an(t) {
    // 暗棋 vs the dev mover: referee reveal
    await t.pos({ c6: 'r7', c7: 'b5', b1: 'rF', d12: 'bF', a6: 'r4', e8: 'b6', a12: 'bM' }, { mode: 'an', family: false }, 'opp=dev&slow=3');
    await t.tap('c6');
    await t.wait(250);
    await t.tap('c7');
    await t.wait(3700);
    await t.shot('an-referee');
  },
  async physical(t) {
    await t.page.evaluate(() => window.__mc.app.go({ name: 'physical' }));
    await t.wait(500);
    await t.shot('phy-colour');
    await t.click('att-0');
    await t.wait(400);
    await t.shot('phy-attacker');
    await t.click('key-9');
    await t.wait(500);
    await t.shot('phy-mask');
    await t.hold('hold', 800);
    await t.wait(400);
    await t.shot('phy-defender');
    await t.click('key-1');
    await t.wait(2600);
    await t.shot('phy-verdict');
  },
  async deny(t) {
    await t.pos({ b6: 'r7', c7: 'b5', b1: 'rF', d12: 'bF', a6: 'r4', e8: 'b6' });
    await t.tap('b6');
    await t.wait(200);
    await t.tap('b7');
    await t.wait(500);
    await t.shot('deny-mountain');
  },
  async home(t) {
    await t.page.evaluate(() => window.__mc.app.go({ name: 'home' }));
    await t.wait(700);
    await t.shot('home');
  },
};

const projects = [
  { name: 'portrait', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
  { name: 'landscape', ctx: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
].filter((p) => !ONLY || p.name.startsWith(ONLY));

const browser = await webkit.launch();
try {
  for (const p of projects) {
    const context = await browser.newContext({ ...p.ctx, locale: 'zh-CN' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const dir = path.join(OUT, p.name);
    fs.mkdirSync(dir, { recursive: true });
    const load = async (extra = '') => {
      await page.goto(`http://localhost:${PORT}/military-chess/?test=1${SLOW ? '&slow=' + SLOW : ''}${extra ? '&' + extra : ''}`, { waitUntil: 'load' });
      await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
      await page.waitForTimeout(300);
    };
    const t = {
      page,
      wait: (ms) => page.waitForTimeout(ms),
      shot: async (n) => { await page.screenshot({ path: path.join(dir, `${n}.png`), scale: 'css' }); console.log(`${p.name}/${n}.png`); },
      pos: async (pieces, o = {}, extra = '') => { await load(extra); await page.evaluate(([pc, oo]) => window.__mc.position(pc, oo), [pieces, o]); await page.waitForTimeout(400); },
      tap: async (at) => { const pt = await page.evaluate((a) => window.__mc.point(a), at); if (!pt) throw new Error('no board for ' + at); await page.mouse.click(pt.x, pt.y); },
      click: async (id) => { await page.click(`[data-testid="${id}"]`); },
      hold: async (id, ms) => { const b = await page.locator(`[data-testid="${id}"]`).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); },
    };
    for (const n of names) {
      await load();
      await SCENARIOS[n](t);
    }
    if (errors.length) console.log('ERRORS', p.name, errors.slice(0, 12));
    await context.close();
  }
} finally {
  await browser.close();
}
