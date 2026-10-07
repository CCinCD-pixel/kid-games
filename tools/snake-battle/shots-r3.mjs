// QA r3 fix screenshots (WebKit iPad 9, both orientations): gate snake, lobby, 出发！ frame, H0 hand + arrow,
// H1 / H2 brief cards, death card chip (sleeper), podium before / after the unlock card, endless result.
//   node tools/snake-battle/shots-r3.mjs   (dev server on :5304)
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const OUT = path.join(os.homedir(), 'kid-games-work/shots/snake-battle/r3');
const URL = 'http://localhost:5304/snake-battle/';
const browser = await webkit.launch();
try {
  for (const [name, vp] of [['portrait', { width: 810, height: 1080 }], ['landscape', { width: 1080, height: 810 }]]) {
    const dir = path.join(OUT, name); fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'zh-CN' });
    const page = await ctx.newPage();
    const shot = (f) => page.screenshot({ path: path.join(dir, f) });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    await page.goto(URL + '?test=1'); await page.waitForSelector('#app[data-ready]');
    await page.waitForTimeout(3500); await shot('00-gate.png');
    await page.locator('.kit-start button').first().click(); await page.waitForSelector('.sb-lobby'); await page.waitForTimeout(800); await shot('01-lobby.png');
    // 出发！ frame
    await ev(() => { void window.__sbApp.startMatch('timed', 'moon', { seed: 21 }); });
    await page.waitForFunction(() => document.querySelector('.sb-count')?.classList.contains('is-word'), null, { timeout: 9000 });
    await page.waitForTimeout(150); await shot('02-go.png');
    // H0 on 1-2 (eat): idle 6 s
    await ev(() => { const a = window.__sbApp; a.save.data.firstRunDone = true; void a.startMatch('mission', 'moon', { mission: 'c1m2' }); });
    await page.waitForSelector('.sb-ghost.is-once', { timeout: 14000 }); await page.waitForTimeout(900); await shot('03-h0-hand-arrow.png');
    // death card on a sleeper (1-3)
    await ev(() => { void window.__sbApp.startMatch('mission', 'moon', { mission: 'c1m3', countdown: false }); });
    await page.waitForFunction(() => window.__sb?.match?.state === 'playing', null, { timeout: 9000 });
    const chip = await ev(() => { const m = window.__sb.match, w = m.world; const k = w.snakes.find((s) => !s.isPlayer && s.missionPersona === 'sleeper'); if (!k) return 'no sleeper'; w.kill(m.me, { killer: k, tag: 'body', x: m.me.x, y: m.me.y, s: 300 }); return k.missionPersona; });
    await page.waitForTimeout(1600); await shot('04-death-sleeper.png');
    console.log(name, 'killer', chip, 'chip:', await page.locator('.sb-dc__persona').textContent().catch(() => '(no card)'));
    // H1 / H2 briefs (2-1 after 1 / 2 misses)
    for (const [n, f] of [[1, '05-brief-h1.png'], [2, '06-brief-h2.png']]) {
      await ev((n) => { const a = window.__sbApp; a.teardownMatch(); a.showMap(2); document.querySelectorAll('.sb-story').forEach((x) => x.remove()); const r = a.save.mission('c2m1'); r.attempts = n; r.failStreak = n; r.clears = 0; r.hintMax = n - 1; a.openMission('c2m1'); }, n);
      await page.waitForSelector('.sb-brief'); await page.waitForTimeout(900); await shot(f);
    }
    // podium: the unlock card waits until he has seen his result
    await ev(() => { const a = window.__sbApp; document.querySelectorAll('.sb-brief').forEach((x) => x.remove()); a.save.data.cardQueue.push('skin:moonlight'); void a.startMatch('timed', 'moon', { seed: 4, countdown: false }); });
    await page.waitForFunction(() => window.__sb?.match?.state === 'playing', null, { timeout: 9000 });
    await ev(() => { const m = window.__sb.match; while (m.world.t < 179.95) m.world.step(); });
    await page.waitForSelector('.sb-podium', { timeout: 8000 }); await page.waitForTimeout(2200); await shot('07-podium-2s.png');
    await page.waitForTimeout(1800); await shot('08-podium-unlock.png');
    // endless result
    await ev(() => { const a = window.__sbApp; document.querySelectorAll('.sb-unlock').forEach((x) => x.remove()); a.drainCards = () => {}; void a.startMatch('endless', 'moon', { seed: 8, countdown: false }); });
    await page.waitForFunction(() => window.__sb?.match?.state === 'playing', null, { timeout: 9000 });
    await page.waitForTimeout(1500); await ev(() => { window.__sb.match.me.mass = 180; window.__sb.match.me.stats.peak = 180; window.__sbApp.showPause(); });
    await page.locator('.sb-pausep .sb-bank').tap(); await page.waitForSelector('.sb-podium.is-endless', { timeout: 9000 }); await page.waitForTimeout(1200); await shot('09-endless-result.png');
    await ctx.close();
  }
} finally { await browser.close(); }
console.log('shots →', OUT);
