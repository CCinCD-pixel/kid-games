#!/usr/bin/env node
// Fix-r1 screenshot pass: every screen touched by the QA r1 fixes, WebKit iPad (gen 7) both orientations, DPR 2.
//   node tools/snake-battle/shots-r1.mjs [port]   → ~/kid-games-work/shots/snake-battle/r1/<orient>/*.png
// Pages load the kit → auto-muted under automation (kit/automute.ts). SILENCE RULE: nothing is played.
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
const port = process.argv[2] ?? '5304';
const OUT = `${os.homedir()}/kid-games-work/shots/snake-battle/r1`;
const browser = await webkit.launch();
const errors = [];
const W = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (const [orient, vp] of [['portrait', { width: 810, height: 1080 }], ['landscape', { width: 1080, height: 810 }]]) {
    fs.mkdirSync(`${OUT}/${orient}`, { recursive: true });
    const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: vp });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${orient}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${orient}: ${e.message}`));
    const shot = (n) => page.screenshot({ path: `${OUT}/${orient}/${n}.png` });
    const app = (fn, arg) => page.evaluate(fn, arg);

    // first run: ghost hand ~1.2 s into the idle loop
    await page.goto(`http://localhost:${port}/snake-battle/?test=1&firstrun=1&nogate`);
    await page.waitForSelector('#app[data-ready]'); await W(1200); await shot('01-firstrun-hand');

    await page.goto(`http://localhost:${port}/snake-battle/?test=1&nogate`);
    await page.waitForSelector('#app[data-ready]'); await W(900); await shot('02-lobby');
    // lobby rects (纪录 vs mode tiles)
    const rects = await app(() => [...document.querySelectorAll('.sb-mode, .sb-records')].map((e) => { const r = e.getBoundingClientRect(); return `${e.className.split(' ').pop()} ${Math.round(r.top)}-${Math.round(r.bottom)}`; }));
    console.log(orient, 'lobby', rects.join(' | '));

    await app(() => window.__sbApp.showMap(2)); await W(1400); await shot('03-story-c2');
    await app(() => document.querySelectorAll('.sb-story').forEach((n) => n.click())); await W(600);
    // first visit of c2m1 (new element hunter): brief auto-plays the 看一招 clip (keyT now recorded)
    await app(() => window.__sbApp.openMission('c2m1')); await W(2800); await shot('04-brief-c2m1-clip');
    await app(() => document.querySelectorAll('.sb-brief').forEach((n) => n.remove()));
    // retry with a new hint level: H1 card over the chapter map, not black
    await app(() => { const a = window.__sbApp; const r = a.save.mission('c2m3'); r.attempts = 2; r.failStreak = 2; r.hintMax = 1; a.save.save(); a.retryMission('c2m3'); }); await W(1500); await shot('05-retry-hint-over-map');
    await app(() => document.querySelectorAll('.sb-brief').forEach((n) => n.remove()));
    // H3 demo: the 领航员 ghost snake
    await app(() => void window.__sbApp.startMatch('mission', 'moon', { mission: 'c2m1', demo: true })); await W(3500); await shot('06-h3-demo');
    await app(() => window.__sbApp.teardownMatch());
    // settings (双击加速 row + control picture)
    await app(() => { window.__sbApp.showLobby(); document.querySelector('.sb-lobby .sb-gear, .sb-settings-btn, [aria-label="设置"]')?.click(); }); await W(700);
    if (!(await page.locator('.sb-settings').count())) await app(() => { const s = window.__sbApp; import('/snake-battle/src/screens.ts').then((m) => m.settingsPanel(s.root, s.save, () => {})); });
    await W(700); await shot('07-settings');
    await app(() => document.querySelectorAll('.sb-settings').forEach((n) => n.remove()));
    // timed match → pause panel; death card with persona chip
    await app(() => void window.__sbApp.startMatch('timed', 'moon', { seed: 7, countdown: false })); await W(1500);
    await app(() => window.__sbApp.showPause()); await W(600); await shot('08-pause');
    await app(() => { const a = window.__sbApp; a.pausePanel?.remove(); a.pausePanel = null; a.match.resume?.(); });
    await app(() => { const m = window.__sb.match, w = m.world; const k = w.snakes.find((s) => !s.isPlayer && s.alive && s.persona === 'hunter') ?? w.snakes.find((s) => !s.isPlayer && s.alive); w.kill(m.me, { killer: k, tag: 'cut', x: m.me.x, y: m.me.y, s: 300 }); });
    await W(2600); await shot('09-death-card');
    // unlock card over the (finished) arena
    await app(() => { const a = window.__sbApp; a.save.data.cardQueue.push('skin:rocket'); a.drainCards(); }); await W(900); await shot('10-unlock-over-arena');
    await app(() => window.__sbApp.teardownMatch());
    // context lost → 5 s → reload card
    await app(() => void window.__sbApp.startMatch('timed', 'moon', { seed: 9, countdown: false })); await W(1000);
    await app(() => window.__sb.view.R.onLost()); await W(5400); await shot('11-ctx-lost');
    await app(() => window.__sbApp.teardownMatch());
    await app(() => window.__sbApp.showRecords()); await W(700); await shot('12-records');
    await app(() => window.__sbApp.showLobby()); await app(() => window.__sbApp.showMap(1)); await W(1200);
    await app(() => document.querySelectorAll('.sb-story').forEach((n) => n.click())); await W(700); await shot('13-map-c1');
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
