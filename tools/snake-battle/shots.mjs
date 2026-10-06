#!/usr/bin/env node
// Screenshot pass (spec §9.3 subset for stage 1): WebKit, iPad (gen 7) portrait 810×1080 + landscape 1080×810, DPR 2.
//   node tools/snake-battle/shots.mjs [port] [--only=name]
// Writes ~/kid-games-work/shots/snake-battle/<orientation>/<name>.png. Pages load the kit → auto-muted.
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
const port = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '5304';
const OUT = `${os.homedir()}/kid-games-work/shots/snake-battle`;
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7);
const base = `http://localhost:${port}/snake-battle/?test=1`;
const browser = await webkit.launch();
const errors = [];
try {
  for (const [orient, vp] of [['portrait', { width: 810, height: 1080 }], ['landscape', { width: 1080, height: 810 }]]) {
    if (only && !only.startsWith(orient)) continue;
    fs.mkdirSync(`${OUT}/${orient}`, { recursive: true });
    const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: vp });
    await ctx.addInitScript({ path: new URL('../qa/mute-audio.js', import.meta.url).pathname });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${orient}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${orient}: ${e.message}`));
    await page.goto(base);
    await page.waitForSelector('#app[data-ready]');
    const gate = page.locator('.kit-gate button, .kit-start button, button:has-text("开始")').first();
    if (await gate.count()) await gate.click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${orient}/s1-lobby.png` });
    // timed match on the moon
    await page.evaluate(() => window.__sbApp?.startMatch('timed', 'moon', { seed: 4242 }));
    await page.waitForTimeout(2600);
    // steer: hold a finger to the upper right of the head for a while
    const box = { x: vp.width * 0.75, y: vp.height * 0.3 };
    await page.mouse.move(box.x, box.y); await page.mouse.down();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${orient}/s3-timed-early.png` });
    await page.mouse.up();
    // fast-forward: grow him and run 40 s of sim to get a busy field
    await page.evaluate(() => { const m = window.__sb.match; m.me.mass = 260; for (let i = 0; i < 2400; i++) m.world.step(); m.world.drainEvents(() => {}); });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${orient}/s3-timed-mid.png` });
    // death card
    await page.evaluate(() => { const m = window.__sb.match, w = m.world; const k = w.snakes.find((s) => !s.isPlayer && s.alive); w.kill(m.me, { killer: k, tag: 'body', x: m.me.x, y: m.me.y, s: 200 }); });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${OUT}/${orient}/s5-deathcard.png` });
    // podium: jump to the end
    await page.evaluate(() => { const m = window.__sb.match; while (m.world.t < 179.9) m.world.step(); m.world.drainEvents(() => {}); });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${OUT}/${orient}/s6-podium.png` });
    // black hole venue, endless
    await page.evaluate(() => window.__sbApp?.startMatch('endless', 'blackhole', { seed: 77, countdown: false }));
    await page.evaluate(() => { const m = window.__sb.match; m.me.mass = 120; for (let i = 0; i < 1200; i++) m.world.step(); m.world.drainEvents(() => {}); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${orient}/s3-endless-blackhole.png` });
    for (const v of ['mars', 'jupiter']) {
      await page.evaluate((v) => window.__sbApp?.startMatch('timed', v, { seed: 9, countdown: false }), v);
      await page.evaluate(() => { const m = window.__sb.match; for (let i = 0; i < 900; i++) m.world.step(); m.world.drainEvents(() => {}); });
      await page.waitForTimeout(1300);
      await page.screenshot({ path: `${OUT}/${orient}/s3-timed-${v}.png` });
    }
    // pause panel
    await page.evaluate(() => window.__sbApp?.showPause());
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${orient}/s4-pause.png` });
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
