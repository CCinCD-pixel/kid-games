// QA r5 fix screenshots (WebKit iPad 9, both orientations): lobby with the locked-venue routes + teal 无尽 + the
// landscape column, chapter tabs (土星 / 黑洞 icons), the chapter-4 story art, the H1 brief note, the 3-1 lead arrow,
// S9 with a met-but-unearned ★★★ chip and the 1★ "下次试试" line, the death card (persona-aware tip, 16 px chip),
// records, the H3 demo halo and the twin perk chip. Files only — the kit auto-mutes under automation.
//   node tools/snake-battle/shots-r5.mjs   (dev server on :5304)
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const OUT = path.join(os.homedir(), 'kid-games-work/shots/snake-battle/r5fix');
const URL = 'http://localhost:5304/snake-battle/';
const errors = [];
const rec = (o) => ({ stars: 1, attempts: 1, failStreak: 0, clears: 1, bestT: 40, hintMax: 0, skipped: false, why: {}, ...o });
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
    await ev(() => { const a = window.__sbApp, d = a.save.data; d.firstRunDone = true; for (let i = 1; i <= 3; i++) d.missions['c1m' + i] = { stars: 2, attempts: 1, failStreak: 0, clears: 1, bestT: 30, hintMax: 0, skipped: false, why: {} }; a.venue = 'moon'; a.showLobby(); });
    await page.waitForTimeout(1500); await shot('01-lobby-locked.png');
    // chapters 1-3 open: map ch3 tabs; all open: ch5
    await ev((r) => { const a = window.__sbApp, d = a.save.data; for (let c = 1; c <= 2; c++) for (let i = 1; i <= 8; i++) d.missions[`c${c}m${i}`] = r; a.lobby?.dispose(); a.lobby = null; a.showMap(3); }, rec({}));
    await page.waitForTimeout(1200); await page.locator('.sb-story').click().catch(() => {}); await page.waitForTimeout(800); await shot('02-map-ch3.png');
    await ev((r) => { const a = window.__sbApp, d = a.save.data; for (let c = 3; c <= 4; c++) for (let i = 1; i <= 8; i++) d.missions[`c${c}m${i}`] = r; d.seenTips = d.seenTips.filter((t) => !t.startsWith('story')); a.closeMenus?.(); document.querySelectorAll('.sb-map, .sb-scrim').forEach((n) => n.remove()); a.showMap(4); }, rec({}));
    await page.waitForTimeout(1200); await shot('03-story-c4.png');
    await page.locator('.sb-story').click().catch(() => {}); await page.waitForTimeout(700);
    await ev(() => { const a = window.__sbApp; document.querySelectorAll('.sb-map, .sb-scrim').forEach((n) => n.remove()); a.showMap(5); });
    await page.waitForTimeout(1200); await page.locator('.sb-story').click().catch(() => {}); await page.waitForTimeout(700); await shot('04-map-ch5.png');
    // brief 3-1 with H1 (2 misses)
    await ev(() => { const a = window.__sbApp, d = a.save.data; d.missions.c3m1 = { stars: 0, attempts: 1, failStreak: 1, clears: 0, bestT: null, hintMax: 0, skipped: false, why: {} }; document.querySelectorAll('.sb-scrim').forEach((n) => n.remove()); a.openMission('c3m1'); });
    await page.waitForTimeout(1200); await shot('05-brief-c3m1-h1.png');
    // 3-1 play with the arrow up
    await ev(() => { void window.__sbApp.startMatch('mission', 'moon', { mission: 'c3m1', countdown: false }); });
    await page.waitForFunction(() => window.__sb?.match?.state === 'playing'); await page.waitForTimeout(2500);
    await ev(() => { const { hud, match } = window.__sb; hud.pointUntil = match.world.t + 3; });
    await page.waitForTimeout(500); await shot('06-c3m1-lead-arrow.png');
    // S9: 1★ clear with ★★★ condition met but not ★★
    await ev(async () => { const s2 = await import('/snake-battle/src/screens2.ts'), ms = await import('/snake-battle/src/sim/mission.ts'); window.__sb.hud.root.classList.add('is-faded'); void s2.missionResult({ m: ms.MISSION_BY_ID.c3m1, ok: true, stars: 1, star2: false, star3: true, praise: 'snake.praise.c2.1', retry: 'snake.retry.1', canSkip: false, hasNext: true, twin: false }); });
    await page.waitForTimeout(1600); await shot('07-s9-1star-met3.png');
    await ev(() => document.querySelectorAll('.xg-scrim').forEach((n) => n.remove()));
    // timed: death card by a forager cut (persona-neutral tip)
    await ev(() => { void window.__sbApp.startMatch('timed', 'moon', { seed: 21, countdown: false }); });
    await page.waitForFunction(() => window.__sb?.match?.state === 'playing'); await page.waitForTimeout(1500);
    await ev(() => { const { match } = window.__sb, w = match.world, me = match.me, k = w.snakes.find((s) => !s.isPlayer && s.alive && s.persona !== 'hunter'); w.kill(me, { killer: k, tag: 'cut', x: me.x, y: me.y, s: 9999 }); });
    await page.waitForSelector('.sb-dc', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1200); await shot('08-deathcard-cut.png');
    console.log(name, 'death tip:', await page.locator('.sb-dc__tiptext').textContent().catch(() => '?'));
    // records
    await ev(() => { const a = window.__sbApp; a.teardownMatch(); document.querySelectorAll('.sb-dc, .xg-scrim, .sb-scrim').forEach((n) => n.remove()); document.body.classList.remove('sb-playing', 'sb-card'); a.showRecords(); });
    await page.waitForTimeout(1200); await shot('09-records.png');
    // H3 demo halo → tap → twin chip
    await ev(() => { const a = window.__sbApp, d = a.save.data; document.querySelectorAll('.sb-scrim, .xg-scrim').forEach((n) => n.remove()); d.missions.c2m4 = { stars: 0, attempts: 3, failStreak: 3, clears: 0, bestT: null, hintMax: 2, skipped: false, why: {} }; void a.startMatch('mission', 'moon', { mission: 'c2m4', demo: true }); a.afterDemo = () => a.startTwin('c2m4'); });
    await page.waitForTimeout(3500); await shot('10-h3-demo-halo.png');
    await page.locator('.sb-demo').dispatchEvent('pointerdown');
    await page.waitForSelector('.sb-twinchip', { timeout: 8000 }); await page.waitForTimeout(900); await shot('11-twin-chip.png');
    await ctx.close();
  }
} finally { await browser.close(); }
console.log('errors:', errors.length ? errors.join('\n') : 'none');
