#!/usr/bin/env node
// Style contact sheet (spec §6.11): the ?dev=style board, every skin in a live match (2× crop around his
// head while boosting, so the trail shows too), the persona line-up, and each floor (decals + far layer),
// WebKit iPad (gen 7), DPR 2. Writes ~/kid-games-work/shots/snake-battle/style/ and tiles the skin crops
// into skins-sheet.png with ffmpeg (files only — nothing is played).
//   node tools/snake-battle/contact-sheet.mjs [port] [--only=board,skins,trails,personas,floors]
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const port = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '5304';
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
const OUT = `${os.homedir()}/kid-games-work/shots/snake-battle/style`;
fs.mkdirSync(OUT, { recursive: true });
const SKINS = JSON.parse(fs.readFileSync(new URL('../../content/snake-battle/collection.json', import.meta.url))).skins.map((s) => s.id);
const TRAILS = ['stardust', 'flame', 'aurora', 'meteor', 'cloud', 'lightning'];
const browser = await webkit.launch();
const errors = [];
try {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (want('board')) {
    await page.goto(`http://localhost:${port}/snake-battle/?dev=style`);
    await page.waitForSelector('#app[data-ready]', { state: 'attached' }); await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/board.png`, fullPage: true });
    const h = await page.evaluate(() => document.querySelector('.sb-style').scrollHeight);
    for (let y = 0, i = 0; y < h; y += 1080, i++) { await page.evaluate((yy) => { document.querySelector('.sb-style').scrollTop = yy; }, y); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/board-${i}.png` }); }
  }
  await page.goto(`http://localhost:${port}/snake-battle/?test=1&nogate`);
  await page.waitForSelector('#app[data-ready]'); await page.waitForTimeout(600);
  await page.evaluate(() => { const d = window.__sbApp.save.data; d.firstRunDone = true; });
  if (want('skins')) {
    for (let i = 0; i < SKINS.length; i++) {
      const id = SKINS[i], trail = TRAILS[i % 6];
      await page.evaluate(({ id, trail, crown }) => {
        const a = window.__sbApp, d = a.save.data; d.equipped = { skin: id, trail }; if (crown && !d.owned.includes('crown')) d.owned.push('crown'); d.settings.crown = crown;
        a.teardownMatch?.(); void a.startMatch('timed', 'moon', { seed: 11, countdown: false });
      }, { id, trail, crown: id === 'basnake' });
      await page.waitForTimeout(500);
      await page.evaluate(() => { const m = window.__sb.match, me = m.me; me.spawn(0, 0, -0.5, 260, m.world.t); me.protect = 0; m.world.rebuildHash(); m.input.boost = true; m.input.target = -0.5; window.__sb.view.zoomMul = 1.9; });
      await page.waitForTimeout(1300);
      const [x, y] = await page.evaluate(() => { const { view, match } = window.__sb; return view.worldToScreen(match.me.x, match.me.y); });
      await page.screenshot({ path: `${OUT}/skin-${String(i).padStart(2, '0')}.png`, clip: { x: Math.max(0, x - 120), y: Math.max(0, y - 120), width: 240, height: 240 } });
    }
    // tile 6×3 with ffmpeg xstack (each crop is 480×480 at DPR 2)
    try {
      const ins = SKINS.flatMap((_, i) => ['-i', `${OUT}/skin-${String(i).padStart(2, '0')}.png`]);
      const lay = SKINS.map((_, i) => `${(i % 6) * 486}_${Math.floor(i / 6) * 486}`).join('|');
      const scl = SKINS.map((_, i) => `[${i}:v]scale=480:480[s${i}]`).join(';') + ';' + SKINS.map((_, i) => `[s${i}]`).join('') + `xstack=inputs=${SKINS.length}:layout=${lay}:fill=0x1b1f30`;
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...ins, '-filter_complex', scl, '-frames:v', '1', `${OUT}/skins-sheet.png`]);
    } catch (e) { errors.push(`ffmpeg: ${e.message}`); }
  }
  if (want('trails')) {   // each boost trail behind him (crop around his tail), tiled 3×2
    for (let i = 0; i < TRAILS.length; i++) {
      await page.evaluate(({ trail }) => { const a = window.__sbApp, d = a.save.data; d.equipped = { skin: 'venus', trail }; a.teardownMatch?.(); void a.startMatch('timed', 'moon', { seed: 11, countdown: false }); }, { trail: TRAILS[i] });
      await page.waitForTimeout(500);
      await page.evaluate(() => { const m = window.__sb.match, me = m.me; me.spawn(0, 0, 2.6, 90, m.world.t); me.protect = 0; m.world.rebuildHash(); window.__sb.view.zoomMul = 1.15; });
      const bb = await page.locator('.sb-boost').boundingBox();   // hold the real boost key (the router owns input.boost)
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
      await page.waitForTimeout(1100);
      const [x, y] = await page.evaluate(() => { const { view, match } = window.__sb; const me = match.me, q = me.idx(Math.min(me.n - 1, Math.floor(me.L / 5))); return view.worldToScreen(me.px[q], me.py[q]); });
      await page.screenshot({ path: `${OUT}/trail-${i}.png`, clip: { x: Math.min(810 - 300, Math.max(0, x - 150)), y: Math.min(1080 - 300, Math.max(0, y - 150)), width: 300, height: 300 } });
      await page.mouse.up();
    }
    try {
      const ins = TRAILS.flatMap((_, i) => ['-i', `${OUT}/trail-${i}.png`]);
      const lay = TRAILS.map((_, i) => `${(i % 3) * 606}_${Math.floor(i / 3) * 606}`).join('|');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...ins, '-filter_complex', TRAILS.map((_, i) => `[${i}:v]`).join('') + `xstack=inputs=6:layout=${lay}:fill=0x1b1f30`, '-frames:v', '1', `${OUT}/trails-sheet.png`]);
    } catch (e) { errors.push(`ffmpeg: ${e.message}`); }
  }
  if (want('personas')) {
    await page.evaluate(() => { const a = window.__sbApp; a.teardownMatch?.(); void a.startMatch('timed', 'mars', { seed: 5, countdown: false }); });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const m = window.__sb.match, me = m.me, seen = new Set();
      me.spawn(0, 0, 0, 120, m.world.t); me.protect = 0;
      let k = 0;
      for (const s of m.world.snakes) { if (s === me || seen.has(s.persona)) continue; seen.add(s.persona); const a = (k / 6) * Math.PI * 2; s.spawn(Math.cos(a) * 230, Math.sin(a) * 300, a + Math.PI / 2, 160, m.world.t); s.protect = 0; k++; }
      m.world.rebuildHash();
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/personas.png` });
  }
  if (want('floors')) {
    for (const [v, mission] of [['moon'], ['mars'], ['jupiter'], ['blackhole'], ['saturn', 'c4m3']]) {
      await page.evaluate(({ v, mission }) => { const a = window.__sbApp; a.teardownMatch?.(); document.querySelectorAll('.sb-brief, .sb-story').forEach((n) => n.remove()); void a.startMatch(mission ? 'mission' : 'timed', mission ? 'moon' : v, { seed: 3, countdown: false, ...(mission ? { mission } : {}) }); }, { v, mission });
      await page.waitForTimeout(700);
      await page.evaluate(() => { const m = window.__sb.match; const R = m.arenaR; m.me.spawn(R * 0.62, -R * 0.62, -0.78, 60, m.world.t); m.world.rebuildHash(); });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/floor-${v}.png` });
    }
  }
  await ctx.close();
} finally { await browser.close(); }
if (errors.length) { console.log('ERRORS:\n' + errors.slice(0, 20).join('\n')); process.exitCode = 1; } else console.log('contact sheet OK →', OUT);
