// Phone screenshots + layout audit (Dad's feedback 2026-10-08): every screen in phone portrait (iPhone 13 390×664,
// iPhone SE 320×568) and phone landscape (844×390), plus the iPad sizes for regression. For each screen it saves a
// PNG and prints the audit: horizontal overflow, visible tap targets < 44 px, text < 13 px, controls cut off by the
// viewport and overlapping buttons. Files only — the kit auto-mutes under automation.
//   node tools/snake-battle/phone-shots.mjs [only-profile-substring]   (dev server on :5304)
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const OUT = path.join(os.homedir(), 'kid-games-work/shots/fb1/snake-battle');
const URL = `http://localhost:${process.env.SB_PORT || 5304}/snake-battle/`;
const only = process.argv[2] || '';
const phone = { deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' };
const PROFILES = [
  ['iphone13', { ...devices['iPhone 13'], locale: 'zh-CN' }],
  ['iphonese', { ...devices['iPhone SE'], locale: 'zh-CN' }],
  ['landscape844', { ...phone, viewport: { width: 844, height: 390 } }],
  ['ipad-portrait', { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 }, locale: 'zh-CN' }],
  ['ipad-landscape', { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 }, locale: 'zh-CN' }],
].filter(([n]) => n.includes(only));
const errors = []; const problems = [];

function audit() {
  const W = innerWidth, H = innerHeight, out = [];
  if (document.documentElement.scrollWidth > W + 1) out.push(`h-overflow ${document.documentElement.scrollWidth}>${W}`);
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]'); };
  const sel = 'button, [role=button], .xg-btn, .sb-venue, .sb-mode, .sb-node, .xg-node, .sb-chtab, .sb-ccard, .xg-skip, .kit-skip';
  const inScroll = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return true; } return false; };
  // only what the finger can reach: the element (or its child) is the topmost thing at one of its points
  const top = (e) => { const r = e.getBoundingClientRect(); const pts = [[.5, .5], [.2, .5], [.8, .5], [.5, .2], [.5, .8]]; return pts.some(([fx, fy]) => { const x = r.left + r.width * fx, y = r.top + r.height * fy; if (x < 0 || y < 0 || x >= W || y >= H) return false; const hit = document.elementFromPoint(x, y); return !!hit && (e.contains(hit) || hit.contains(e)); }); };
  const all = [...document.querySelectorAll(sel)].filter(vis);
  const layers = [...document.querySelectorAll('.xg-scrim, .sb-scrim, .sb-panel, .kit-start')].filter(vis); const topLayer = layers[layers.length - 1];
  const off = (e) => { const r = e.getBoundingClientRect(); return r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1; };
  const btns = all.filter((e) => top(e) || (off(e) && !inScroll(e) && (!topLayer || topLayer.contains(e))));
  const name = (e) => (e.className && typeof e.className === 'string' ? e.className.split(' ')[0] : e.tagName) + ':' + (e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, '').slice(0, 10);
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    if (b.closest('.sb-coll__grid, .sb-rec__grid, .sb-scroll')) { if (r.width < 44 || r.height < 44) out.push(`small ${name(b)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`); continue; }
    if (r.width < 44 || r.height < 44) out.push(`small ${name(b)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
    if (!inScroll(b) && (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)) out.push(`cut ${name(b)} (${r.left.toFixed(0)},${r.top.toFixed(0)})-(${r.right.toFixed(0)},${r.bottom.toFixed(0)})`);
  }
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i], b = btns[j]; if (a.contains(b) || b.contains(a)) continue;
    const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
    const ix = Math.min(p.right, q.right) - Math.max(p.left, q.left), iy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
    if (ix > 2 && iy > 2) out.push(`overlap ${name(a)} × ${name(b)}`);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; const small = new Set();
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim(); if (!t) continue; const e = n.parentElement; if (!e || !vis(e)) continue;
    if (e.closest('svg, .sb-hud .sb-tag, .sb-names')) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 13) small.add(`${name(e)}=${fs}`);
    const r = e.getBoundingClientRect();
    if ((r.right > W + 2 || r.left < -2) && !inScroll(e)) out.push(`text-cut ${name(e)}`);
    if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible' && e.children.length === 0) out.push(`ellipsis ${name(e)}`);
  }
  if (small.size) out.push('tiny-text ' + [...small].slice(0, 6).join(', '));
  return out;
}

const browser = await webkit.launch();
try {
  for (const [pname, opts] of PROFILES) {
    const dir = path.join(OUT, pname); fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${pname}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/menu\.m4a|cancel|Failed to load resource/i.test(m.text())) errors.push(`${pname}: ${m.text()}`); });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const shot = async (f) => { await page.screenshot({ path: path.join(dir, f + '.png') }); const a = await ev(audit); if (a.length) problems.push(`${pname}/${f}: ${a.join(' | ')}`); };
    const clear = () => ev(() => { const a = window.__sbApp; a.teardownMatch(); a.closeMenus?.(); document.querySelectorAll('.sb-dc, .xg-scrim, .sb-scrim, .sb-panel, .sb-podium, .sb-map, .sb-coll, .sb-rec').forEach((x) => x.remove()); document.body.classList.remove('sb-playing', 'sb-card'); });
    // 1. first run: gate, then c1m1 with the ghost hand + 跳过
    await page.goto(URL + '?test=1&firstrun=1'); await page.waitForSelector('#app[data-ready]');
    await page.waitForTimeout(600); await shot('00-gate');
    await page.locator('.kit-start button').first().click();
    await page.waitForTimeout(2600); await shot('01-firstrun-c1m1');
    // 2. lobby (with some progress)
    await ev(() => { const a = window.__sbApp, d = a.save.data; d.firstRunDone = true; for (let i = 1; i <= 3; i++) d.missions['c1m' + i] = { stars: 2, attempts: 1, failStreak: 0, clears: 1, bestT: 30, hintMax: 0, skipped: false, why: {} }; d.life.timedPlayed = 2; a.venue = 'moon'; a.showLobby(); });
    await page.waitForTimeout(1300); await shot('02-lobby');
    await page.locator('.sb-gear, [aria-label="设置"]').first().click().catch(() => {});
    await page.waitForTimeout(700); await shot('03-settings');
    await clear();
    // 3. timed match HUD + pause + death card
    await ev(() => { void window.__sbApp.startMatch('timed', 'moon', { seed: 21, countdown: false }); });
    await page.waitForFunction(() => window.__sb?.match?.state === 'playing'); await page.waitForTimeout(2500); await shot('04-timed-hud');
    await ev(() => { const { match } = window.__sb, w = match.world, me = match.me, k = w.snakes.find((s) => !s.isPlayer && s.alive); w.kill(me, { killer: k, tag: 'body', x: me.x, y: me.y, s: 9999 }); });
    await page.waitForSelector('.sb-dc.is-in', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(900); await shot('06-deathcard');
    await page.waitForFunction(() => window.__sb.match.me.alive, null, { timeout: 8000 }).catch(() => {});
    await ev(() => window.__sbApp.showPause()); await page.waitForTimeout(700); await shot('05-pause');
    await ev(() => { const a = window.__sbApp; a.pausePanel?.remove(); a.pausePanel = null; });
    // podium: end the match
    await ev(() => { const m = window.__sb.match; m.finish(); });
    await page.waitForSelector('.sb-podium', { timeout: 9000 }).catch(() => {}); await page.waitForTimeout(2200); await shot('07-podium');
    await clear();
    // 4. endless HUD
    await ev(() => { void window.__sbApp.startMatch('endless', 'moon', { seed: 5, countdown: false }); });
    await page.waitForFunction(() => window.__sb?.match?.state === 'playing'); await page.waitForTimeout(2000); await shot('08-endless-hud');
    await clear();
    // 5. map + story + brief + race-mission HUD + S9
    await ev(() => { const a = window.__sbApp; a.save.data.seenTips = a.save.data.seenTips.filter((t) => !t.startsWith('story')); a.showMap(1); });
    await page.waitForTimeout(2100); await shot('09-story-c1');
    await page.locator('.sb-story').click().catch(() => {}); await page.waitForTimeout(700); await shot('10-map-c1');
    await ev(() => { window.__sbApp.openMission('c1m4'); }); await page.waitForTimeout(1200); await shot('11-brief-c1m4');
    await clear();
    await ev(() => { void window.__sbApp.startMatch('mission', 'moon', { mission: 'c1m7', countdown: false }); });
    await page.waitForFunction(() => window.__sb?.match?.state === 'playing'); await page.waitForTimeout(2200); await shot('12-race-mission-hud');
    await ev(async () => { const s2 = await import('/snake-battle/src/screens2.ts'), ms = await import('/snake-battle/src/sim/mission.ts'); window.__sb.hud.root.classList.add('is-faded'); void s2.missionResult({ m: ms.MISSION_BY_ID.c1m7, ok: true, stars: 2, star2: true, star3: false, praise: 'snake.praise.c1.1', retry: 'snake.retry.1', canSkip: false, hasNext: true, twin: false }); });
    await page.waitForTimeout(1800); await shot('13-s9');
    await clear();
    // 6. collection, records, unlock card
    await ev(() => window.__sbApp.showCollection()); await page.waitForTimeout(1000); await shot('14-collection');
    await page.locator('.sb-ccard').first().click().catch(() => {}); await page.waitForTimeout(900); await shot('15-collection-big');
    await clear();
    await ev(() => window.__sbApp.showRecords()); await page.waitForTimeout(1000); await shot('16-records');
    await clear();
    await ev(() => { const a = window.__sbApp; a.showLobby(); a.save.data.cardQueue.push('skin:saturn'); a.drainCards(); });
    await page.waitForTimeout(1200); await shot('17-unlock');
    await ctx.close();
  }
} finally { await browser.close(); }
console.log('problems:\n' + (problems.length ? problems.join('\n') : 'none'));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
