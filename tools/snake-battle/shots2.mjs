#!/usr/bin/env node
// Stage-2 screenshot pass (spec §9.3 #2, #11–#15): first run, 挑战地图, story card, 简报, mission HUD
// (rings + rocks, targets, 星核, king), 关卡结算, 收藏馆, 纪录 — WebKit iPad (gen 7) both orientations, DPR 2.
//   node tools/snake-battle/shots2.mjs [port] [--only=portrait|landscape] [--shots=a,b]
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
const port = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '5304';
const OUT = `${os.homedir()}/kid-games-work/shots/snake-battle`;
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7);
const pick = (process.argv.find((a) => a.startsWith('--shots=')) ?? '').slice(8).split(',').filter(Boolean);
const want = (n) => !pick.length || pick.includes(n);
const browser = await webkit.launch();
const errors = [];
const ff = (page, sec) => page.evaluate((s) => { const m = window.__sb.match; for (let i = 0; i < s * 60 && !m.run?.done; i++) { m.snapPrev?.(); if (m.run) m.run.step(); else m.world.step(); m.world.drainEvents(() => {}); } }, sec);
try {
  for (const [orient, vp] of [['portrait', { width: 810, height: 1080 }], ['landscape', { width: 1080, height: 810 }]]) {
    if (only && only !== orient) continue;
    fs.mkdirSync(`${OUT}/${orient}`, { recursive: true });
    const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: vp });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${orient}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${orient}: ${e.message}`));
    const shot = (n) => page.screenshot({ path: `${OUT}/${orient}/${n}.png` });
    if (want('s2-firstrun')) {
      await page.goto(`http://localhost:${port}/snake-battle/?test=1&firstrun=1&nogate`);
      await page.waitForSelector('#app[data-ready]'); await page.waitForTimeout(1800);
      await shot('s2-firstrun');
    }
    await page.goto(`http://localhost:${port}/snake-battle/?test=1&nogate`);
    await page.waitForSelector('#app[data-ready]'); await page.waitForTimeout(800);
    // a save with progress: chapters 1–2 done with stars, chapter 3 in progress
    await page.evaluate(() => { const a = window.__sbApp; const d = a.save.data; d.firstRunDone = true; for (const id of ['c1m1','c1m2','c1m3','c1m4','c1m5','c1m6','c1m7','c1m8','c2m1','c2m2','c2m3','c2m4','c2m5','c2m6','c2m7','c2m8','c3m1','c3m2']) { const r = a.save.mission(id); r.clears = 1; r.attempts = 2; r.stars = 1 + (id.charCodeAt(3) + id.charCodeAt(1)) % 3; } d.life.kills = 23; d.life.cut = 4; d.life.meteors = 12; d.owned.push('skin:moonlight', 'skin:comet', 'trail:flame', 'badge:first-kill'); a.save.save(); a.showLobby(); });
    await page.waitForTimeout(700);
    if (want('s1-lobby2')) await shot('s1-lobby2');
    if (want('s7-map')) { await page.evaluate(() => { window.__sbApp.save.markSeen('story:c3'); window.__sbApp.showMap(3); }); await page.waitForTimeout(800); await shot('s7-map'); }
    if (want('s7-story')) { await page.evaluate(() => { window.__sbApp.showMap(4); }); await page.waitForTimeout(1500); await shot('s7-story'); await page.evaluate(() => document.querySelectorAll('.sb-story').forEach((n) => n.remove())); }
    if (want('s8-brief')) { await page.evaluate(() => { window.__sbApp.showMap(3); window.__sbApp.openMission('c3m3'); }); await page.waitForTimeout(900); await shot('s8-brief'); }
    if (want('s8-brief-boss')) { await page.evaluate(() => { document.querySelectorAll('.sb-brief').forEach((n) => n.remove()); window.__sbApp.openMission('c5m7'); }); await page.waitForTimeout(900); await shot('s8-brief-boss'); }
    const play = async (name, id, sec, steer) => {
      if (!want(name)) return;
      await page.evaluate((id) => { document.querySelectorAll('.sb-brief, .sb-story').forEach((n) => n.remove()); window.__sbApp.startMatch('mission', 'moon', { mission: id, seed: 777, countdown: false }); }, id);
      await page.waitForTimeout(600);
      if (steer) { await page.mouse.move(vp.width * steer[0], vp.height * steer[1]); await page.mouse.down(); await page.waitForTimeout(1200); }
      if (sec) await ff(page, sec);
      await page.waitForTimeout(900);
      await shot(name);
      if (steer) await page.mouse.up();
    };
    await play('s3-c1m4-rocks', 'c1m4', 0.5, [0.45, 0.25]);
    await play('s3-c2m6-beacon', 'c2m6', 3, null);
    await play('s3-c3m1-target', 'c3m1', 2, null);
    await play('s3-c4m1-cores', 'c4m1', 2, null);
    await play('s3-c5m1-outline', 'c5m1', 3, null);
    await play('s3-c3m7-race', 'c3m7', 20, null);
    await play('s3-c5m7-king', 'c5m7', 9, null);
    if (want('s3-c5m7-crown')) {
      // bring the king next to him (visual check of the crown, gems and the windup glow only)
      await page.evaluate(() => { const m = window.__sb.match, me = m.me, k = m.world.snakes.find((s) => s.king); k.crown = 2; k.spawn(me.x + 260, me.y - 160, Math.PI, 1200, m.world.t); k.protect = 0; k.brain.chargeState = 'wind'; k.brain.chargeT = 5; m.world.rebuildHash(); });
      await page.waitForTimeout(500); await shot('s3-c5m7-crown');
    }
    if (want('s3-sand')) { await play('s3-sand', 'c1m8', 100, null); }
    if (want('s9-result')) {
      await page.evaluate(() => { window.__sbApp.startMatch('mission', 'moon', { mission: 'c1m6', seed: 5, countdown: false }); });
      await page.waitForTimeout(500);
      await page.evaluate(() => { const m = window.__sb.match; m.me.stats.eaten = 999; });
      await page.waitForTimeout(3600); await shot('s9-result');
      await page.evaluate(() => document.querySelectorAll('.xg-scrim, .sb-unlock').forEach((n) => n.remove()));
    }
    if (want('s10-collection')) { await page.evaluate(() => { window.__sbApp.teardownMatch(); window.__sbApp.showCollection(); }); await page.waitForTimeout(700); await shot('s10-collection'); }
    if (want('s10-unlock')) { await page.evaluate(() => { window.__sbApp.save.data.cardQueue.push('skin:rocket'); window.__sbApp.drainCards(); }); await page.waitForTimeout(700); await shot('s10-unlock'); await page.evaluate(() => document.querySelectorAll('.sb-unlock').forEach((n) => n.remove())); }
    if (want('s11-records')) { await page.evaluate(() => { window.__sbApp.showRecords(); }); await page.waitForTimeout(600); await shot('s11-records'); }
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(errors.length ? `ERRORS:\n${errors.slice(0, 20).join('\n')}` : 'no page errors');
