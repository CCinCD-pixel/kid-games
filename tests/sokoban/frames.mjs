// Capture animation frames (non-test mode) for review: entrance, walk, push, lock-in, dead, undo, finale.
//   node tests/sokoban/frames.mjs <level> <scenario> [--landscape]
import { webkit, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
const level = process.argv[2] || '0-1';
const scen = process.argv[3] || 'enter';
const land = process.argv.includes('--landscape');
const out = path.join(os.homedir(), 'kid-games-work/shots/sokoban/frames', `${level}-${scen}`);
fs.mkdirSync(out, { recursive: true });
const browser = await webkit.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: land ? { width: 1080, height: 810 } : { width: 810, height: 1080 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(() => { try { localStorage.setItem('kg:v1:sokoban', JSON.stringify({ v: 1, updatedAt: 1, data: { tutorialDone: true, levels: { '0-1': { best: 1, stars: 3, clean: true, firstClean: true, plays: 1, hintMax: 0 } }, quiz: {}, cert: { offered: false, passed: false }, chaptersSeen: [0, 1, 2], taught: [], named: [], onceLines: ['sok.unlock.classic'], arrows: 'locked', launched: { total: 1, byDest: { tiangong: 1, moon: 0, mars: 0 }, random: 0 }, random: { nextSeed: 1, recent: [], byTier: [0,0,0,0], poolIdx: [0,0,0,0] }, cosmetics: { owned: [], equipped: {} }, cards: [], settings: { swipe: 'auto', autoRoute: true }, finale: {}, stats: { pushes: 0, undos: 0, redos: 0, restarts: 0, deadEvents: 0, deadDelayed: 0, selfRescues: 0, activeMs: 0 } } })); } catch {} });
  await page.goto(`http://localhost:5301/sokoban/?level=${level}&fresh=1`);
  await page.waitForSelector('.kit-start__go');
  await page.click('.kit-start__go');
  const snap = async (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  if (scen === 'enter') {
    for (let i = 0; i < 12; i += 1) { await snap(`f${String(i).padStart(2, '0')}`); await page.waitForTimeout(90); }
  } else {
    await page.waitForTimeout(1800);
    const steps = JSON.parse(process.argv[4] || '[]');
    let k = 0;
    for (const st of steps) {
      if (st.cell !== undefined) { const p = await page.evaluate((c) => window.__sok ? null : null, st.cell); void p; }
      if (st.tap) await page.touchscreen.tap(st.tap[0], st.tap[1]);
      if (st.click) await page.click(st.click);
      for (let i = 0; i < (st.frames ?? 6); i += 1) { await page.waitForTimeout(st.every ?? 35); await snap(`s${String(k).padStart(2, '0')}-${String(i).padStart(2, '0')}`); }
      k += 1;
    }
  }
  console.log('frames in', out);
} finally { await browser.close(); }
