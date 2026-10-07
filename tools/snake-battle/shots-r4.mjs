// QA r4 fix screenshots (WebKit iPad 9, both orientations): 3-2-1 with the snakes drawn, an out-is-failure S9 with
// the cause, the endless result with the cause (one end screen), the chapter-2 story before the brief, the lobby
// showcase + next-venue suggestion ring, the collection (big cards on a sparse tab), the landscape brief, the podium
// over a faded HUD, the H2 clip overlay. Files only — the kit auto-mutes under automation; nothing is played.
//   node tools/snake-battle/shots-r4.mjs   (dev server on :5304)
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const OUT = path.join(os.homedir(), 'kid-games-work/shots/snake-battle/r4fix');
const URL = 'http://localhost:5304/snake-battle/';
const errors = [];
const browser = await webkit.launch();
try {
  for (const [name, vp] of [['portrait', { width: 810, height: 1080 }], ['landscape', { width: 1080, height: 810 }]]) {
    const dir = path.join(OUT, name); fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'zh-CN' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/menu\.m4a|cancel/i.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    const shot = (f) => page.screenshot({ path: path.join(dir, f) });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    await page.goto(URL + '?test=1'); await page.waitForSelector('#app[data-ready]');
    await page.locator('.kit-start button').first().click(); await page.waitForSelector('.sb-lobby');
    // lobby: showcase + the next-venue suggestion (3 podiums in a row on the moon, mars open)
    await ev(() => { const a = window.__sbApp, d = a.save.data; d.firstRunDone = true; d.venues.moon.recentRanks = [2, 1, 3]; d.venues.moon.played = 6; d.venues.moon.podiums = 5; d.missions.c1m7 = { stars: 3, attempts: 1, failStreak: 0, clears: 1, bestT: 30, hintMax: 0, skipped: false, why: {} }; a.venue = 'moon'; a.showLobby(); });
    await page.waitForTimeout(2500); await shot('01-lobby-suggest.png');
    console.log(name, 'suggest ring on', await page.locator('.sb-venue.is-suggest').getAttribute('data-v').catch(() => 'none'));
    // 3-2-1: snakes drawn
    await ev(() => { void window.__sbApp.startMatch('timed', 'moon', { seed: 21 }); });
    await page.waitForFunction(() => window.__sb?.match?.state === 'countdown'); await page.waitForTimeout(1300); await shot('02-countdown.png');
    // podium over a faded HUD
    await page.waitForFunction(() => window.__sb?.match?.state === 'playing', null, { timeout: 9000 });
    await ev(() => { const m = window.__sb.match; while (m.world.t < 179.95) m.world.step(); });
    await page.waitForSelector('.sb-podium', { timeout: 15000 }); await page.waitForTimeout(1200); await shot('03-podium-faded-hud.png');
    // endless: one end screen with the cause
    await ev(() => { void window.__sbApp.startMatch('endless', 'moon', { seed: 5, countdown: false }); });
    await page.waitForFunction(() => window.__sb?.match?.state === 'playing');
    await page.waitForTimeout(1500);
    await ev(() => { const m = window.__sb.match, w = m.world, k = w.snakes.find((s) => !s.isPlayer && s.alive); w.kill(m.me, { killer: k, tag: 'body', x: m.me.x, y: m.me.y, s: 9999 }); });
    await page.waitForTimeout(1000); console.log(name, 'endless card at 1.0 s:', await page.locator('.sb-dc').count());
    await page.waitForSelector('.sb-podium', { timeout: 6000 }); await page.waitForTimeout(700); await shot('04-endless-result-cause.png');
    // out-is-failure S9 (2-4)
    await ev(() => { void window.__sbApp.startMatch('mission', 'moon', { mission: 'c2m4', countdown: false }); });
    await page.waitForFunction(() => window.__sb?.match?.state === 'playing');
    await page.waitForTimeout(800);
    await ev(() => { const m = window.__sb.match, w = m.world, k = w.snakes.find((s) => !s.isPlayer && s.alive); w.kill(m.me, { killer: k, tag: 'body', x: m.me.x, y: m.me.y, s: 9999 }); });
    await page.waitForSelector('.sb-cause', { timeout: 8000 }); await page.waitForTimeout(900); await shot('05-s9-fail-cause.png');
    // 下一关 into chapter 2: story first
    await ev(() => { const a = window.__sbApp, d = a.save.data; for (let i = 1; i <= 7; i++) d.missions[`c1m${i}`] = { stars: 3, attempts: 1, failStreak: 0, clears: 1, bestT: 30, hintMax: 0, skipped: false, why: {} }; d.seenTips = d.seenTips.filter((x) => x !== 'story:c2'); d.seenTips.push('story:c1'); d.cardQueue = []; a.save.save(); document.querySelectorAll('.xg-scrim').forEach((x) => x.remove()); a.teardownMatch(); a.showMap(1); void a.startMatch('mission', 'moon', { mission: 'c1m8', countdown: false }); });
    await page.waitForFunction(() => window.__sb?.match?.run);
    await ev(() => { const r = window.__sb.match.run; r.outcome = { ok: true }; r.done = true; });
    await page.getByRole('button', { name: '下一关' }).click({ timeout: 15000 });
    for (let k = 0; k < 8 && await page.locator('.sb-story').count() === 0; k++) { if (await page.locator('.sb-unlock').count()) { await page.waitForTimeout(450); await page.locator('.sb-unlock .xg-btn--primary').click(); } else await page.waitForTimeout(300); }
    await page.waitForTimeout(700); await shot('06-next-chapter-story.png');
    await page.locator('.sb-story').click(); await page.waitForSelector('.sb-brief'); await page.waitForTimeout(800); await shot('07-c2m1-brief-after-story.png');
    // H2 clip overlay (3-7)
    await ev(() => { const a = window.__sbApp, d = a.save.data; document.querySelectorAll('.sb-brief').forEach((x) => x.remove()); d.missions.c3m7 = { stars: 0, attempts: 2, failStreak: 2, clears: 0, bestT: null, hintMax: 1, skipped: false, why: {} }; a.showMap(3); document.querySelectorAll('.sb-story').forEach((x) => x.remove()); a.openMission('c3m7'); });
    await page.locator('.sb-brief').getByRole('button', { name: '看一招' }).click();
    await page.waitForFunction(() => window.__sb?.match?.demo && !window.__sb.app.preroll, null, { timeout: 8000 }); await page.waitForTimeout(1200); await shot('08-h2-clip.png');
    // collection: a sparse tab (trails) and a skin family
    await ev(() => { const a = window.__sbApp; a.teardownMatch(); a.showCollection(); });
    await page.waitForSelector('.sb-coll'); await page.waitForTimeout(500); await shot('09-collection.png');
    await page.locator('.sb-coll__tab').nth(3).click().catch(() => {}); await page.waitForTimeout(400); await shot('10-collection-tab4.png');
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
