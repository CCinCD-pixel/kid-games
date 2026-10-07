#!/usr/bin/env node
// Fix-r2 screenshot + probe pass: every screen touched by the QA r2 fixes, WebKit iPad (gen 7) both orientations, DPR 2.
//   node tools/snake-battle/shots-r2.mjs [port]   → ~/kid-games-work/shots/snake-battle/r2/<orient>/*.png
// Pages load the kit → auto-muted under automation (kit/automute.ts). SILENCE RULE: nothing is played.
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
const port = process.argv[2] ?? '5304';
const OUT = `${os.homedir()}/kid-games-work/shots/snake-battle/r2`;
const browser = await webkit.launch();
const errors = [], notes = [];
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
    const note = (k, v) => { notes.push(`${orient} ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`); };
    const step = async (name, fn) => { try { await fn(); } catch (e) { errors.push(`${orient} step ${name}: ${e.message}`); } };
    const sub = () => app(() => { const s = document.querySelector('.kit-subtitle'); return s && !s.hidden && getComputedStyle(s).display !== 'none' ? s.textContent : ''; });

    await page.goto(`http://localhost:${port}/snake-battle/?test=1&nogate`);
    await page.waitForSelector('#app[data-ready]'); await W(800);
    await app(() => { const a = window.__sbApp; a.save.data.firstRunDone = true; for (const k of ['story:c1', 'story:c2', 'story:c5']) a.save.markSeen(k); a.save.save(); });

    await step('h2-clip', async () => {
      await app(() => void window.__sbApp.startMatch('mission', 'moon', { mission: 'c2m1', demo: true, clip: true })); await W(1800);
      await shot('01-h2-clip'); note('h2 subtitle visible', await sub());
      note('demo tag vs subtitle', await app(() => { const t = document.querySelector('.sb-demo__tag')?.getBoundingClientRect(); const g = document.querySelector('.sb-goal')?.getBoundingClientRect(); return { tagTop: Math.round(t?.top ?? -1), tagBottom: Math.round(t?.bottom ?? -1), goalBottom: Math.round(g?.bottom ?? -1) }; }));
      await W(7000); note('h2 clip ended', await app(() => !window.__sbApp.match));
    });
    await step('brief-h3', async () => {
      await app(() => { const a = window.__sbApp; a.showMap(1); const r = a.save.mission('c1m4'); r.attempts = 3; r.failStreak = 3; r.hintMax = 2; a.save.save(); a.openMission('c1m4'); }); await W(1500);
      await shot('02-brief-h3-buttons'); await app(() => document.querySelectorAll('.sb-brief').forEach((n) => n.remove()));
    });
    await step('endless-result', async () => {
      await app(() => void window.__sbApp.startMatch('endless', 'moon', { seed: 4, countdown: false })); await W(1500);
      await app(() => window.__sb.match.bank()); await W(2600); await shot('03-endless-result');
      note('endless panel', await app(() => { const p = document.querySelector('.sb-podium .sb-panel')?.getBoundingClientRect(); return { h: Math.round(p?.height ?? 0), steps: document.querySelectorAll('.sb-podium .sb-steps').length, hero: document.querySelectorAll('.sb-podium .sb-hero').length }; }));
    });
    await step('podium-2nd', async () => {
      await app(() => void window.__sbApp.startMatch('timed', 'moon', { seed: 7, countdown: false })); await W(1200);
      await app(() => { const m = window.__sb.match, ai = m.world.snakes.find((s) => !s.isPlayer && s.alive); ai.mass = 900; m.me.mass = 700; m.world.t = 179.5; });
      await W(4200); await shot('04-podium'); note('podium subtitle', await sub());
      note('podium rank dup', await app(() => ({ title: document.querySelector('.sb-podium__title')?.textContent, bigRank: document.querySelectorAll('.sb-rank').length })));
    });
    await step('unlock-tap', async () => {
      await app(() => { const a = window.__sbApp; a.save.data.cardQueue.push('skin:rocket'); a.drainCards(); }); await W(700); await shot('05-unlock-card');
      const r = await app(() => document.querySelector('.sb-unlock__card')?.getBoundingClientRect().toJSON());
      if (r) await page.mouse.click(r.x + r.width / 2, r.y + 40);
      await W(500); note('unlock closed by card tap', await app(() => !document.querySelector('.sb-unlock')));
      await app(() => window.__sbApp.showLobby());
    });
    await step('pause+death', async () => {
      await app(() => void window.__sbApp.startMatch('timed', 'moon', { seed: 9, countdown: false })); await W(1200);
      await app(() => { const m = window.__sb.match, w = m.world; const k = w.snakes.find((s) => !s.isPlayer && s.alive); w.kill(m.me, { killer: k, tag: 'body', x: m.me.x, y: m.me.y, s: 300 }); });
      await W(2600); await shot('06-death-card');
      note('death ok button', await app(() => { const b = [...document.querySelectorAll('.sb-dc .xg-btn')].map((e) => `${e.textContent}:${Math.round(e.getBoundingClientRect().height)}`); return b.join(' '); }));
      await app(() => window.__sbApp.showPause()); await W(600); await shot('07-pause'); note('pause subtitle', await sub());
      await app(() => window.__sbApp.teardownMatch());
    });
    await step('king-guards', async () => {
      await app(() => void window.__sbApp.startMatch('mission', 'moon', { mission: 'c5m7', countdown: false })); await W(1500);
      await app(() => { const m = window.__sb.match, run = m.run, w = run.w, king = w.snakes.find((s) => s.king); const orig = w.step.bind(w);
        w.step = () => { orig(); king.crown = king.crownMax - 1; w.emit({ type: 'gem', id: king.id, by: run.me.id, left: king.crown }); w.step = orig; };
        for (const g of [0, 1]) void g; });
      await W(1200);
      await app(() => { const m = window.__sb.match; for (const s of m.world.snakes.filter((x) => x.missionPersona === 'guard')) { s.x = m.me.x + 160; s.y = m.me.y + (s.id % 2 ? 120 : -120); s.protect = 2; } });
      await W(400); await shot('08-king-guards');
      note('mission snake names', await app(() => window.__sb.match.world.snakes.filter((s) => !s.isPlayer).map((s) => s.name).join(',')));
      await app(() => window.__sbApp.teardownMatch());
    });
    await step('s9-next', async () => {
      await app(() => { const a = window.__sbApp; a.showMap(1); void a.startMatch('mission', 'moon', { mission: 'c1m1', countdown: false }); }); await W(1200);
      await app(() => { const r = window.__sb.match.run, pts = r.m.objective.points, p = pts[pts.length - 1]; r.me.m.ring = pts.length - 1; r.me.x = p[0]; r.me.y = p[1]; });
      await W(2600); await shot('09-s9-result'); note('S9 subtitle', await sub());
      await app(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('下一关'))?.click()); await W(2200);
      await shot('10-next-level'); note('next level subtitle', await sub()); note('next mission', await app(() => window.__sbApp.match?.run?.m.id ?? 'none'));
      await app(() => { window.__sbApp.teardownMatch(); document.querySelectorAll('.sb-brief').forEach((n) => n.remove()); });
    });
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(notes.join('\n'));
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
