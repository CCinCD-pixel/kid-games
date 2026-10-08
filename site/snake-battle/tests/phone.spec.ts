/**
 * Phones + 跳过 (Dad's feedback 2026-10-08).
 * - Phone portrait (iPhone 13 390×664, iPhone SE 320×568) and phone landscape (844×390): lobby, settings, the timed
 *   HUD (rectangles inside the view, never overlapping), pause, death card, map, brief, collection and records —
 *   no horizontal overflow, every reachable control inside the view and ≥ 44 px, no text under 13 px.
 * - 跳过: the first-run levels show the kit pill after ~1.5 s (not before); tapping it opens the lobby with the first run
 *   marked done; the parent's 跳过开场和教学 skips the first run and the chapter story cards; story cards carry the
 *   pill; 设置 → 新手教学 · 再玩一次 replays the tutorial.
 * QA fb1 r1: the first-run pill leaves when a level ends (never over S9 / an unlock card) and hides under panels; an
 *   unlock card removed by a screen change goes back to the queue (no soft-lock); on phones the narration bar covers no
 *   control (lobby, map) and hides over 设置 / 纪录; a skipped line leaves at once; a 4-digit endless peak fits the card;
 *   the landscape map's "you are here" token clears the back key.
 * The phone cases run once (iPad portrait project); they set their own viewport.
 */
import { expect, test, type Page } from '@playwright/test';

const touch = { deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;
const PHONES: [string, { width: number; height: number }][] = [['iphone13', { width: 390, height: 664 }], ['iphonese', { width: 320, height: 568 }], ['landscape844', { width: 844, height: 390 }]];

async function boot(page: Page, q = '?test=1&nogate') {
  await page.goto('/snake-battle/' + q);
  await page.waitForSelector('#app[data-ready]');
}
const app = (page: Page, fn: string) => page.evaluate(`(() => { const a = window.__sbApp; ${fn} })()`);

/** layout problems on the current screen (top layer only: what a finger can reach) */
function audit() {
  const W = innerWidth, H = innerHeight, out: string[] = [];
  if (document.documentElement.scrollWidth > W + 1) out.push(`h-overflow ${document.documentElement.scrollWidth}>${W}`);
  const vis = (e: Element) => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]'); };
  const inScroll = (e: Element) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return true; } return false; };
  const top = (e: Element) => { const r = e.getBoundingClientRect(); return [[.5, .5], [.2, .5], [.8, .5], [.5, .2], [.5, .8]].some(([fx, fy]) => { const x = r.left + r.width * fx, y = r.top + r.height * fy; if (x < 0 || y < 0 || x >= W || y >= H) return false; const hit = document.elementFromPoint(x, y); return !!hit && (e.contains(hit) || hit.contains(e)); }); };
  const layers = [...document.querySelectorAll('.xg-scrim, .sb-scrim, .sb-panel')].filter(vis); const topLayer = layers[layers.length - 1];
  const off = (r: DOMRect) => r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1;
  const name = (e: Element) => `${(e.className as string).toString().split(' ')[0] || e.tagName}:${(e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, '').slice(0, 8)}`;
  const btns = [...document.querySelectorAll('button, .xg-btn, .sb-boost, .xg-skip')].filter(vis).filter((e) => top(e) || (off(e.getBoundingClientRect()) && !inScroll(e) && (!topLayer || topLayer.contains(e))));
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    if (r.width < 44 - 0.5 || r.height < 44 - 0.5) out.push(`small ${name(b)} ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
    if (!inScroll(b) && off(r)) out.push(`cut ${name(b)}`);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n: Node | null;
  while ((n = walker.nextNode())) {
    const e = n.parentElement; if (!n.textContent?.trim() || !e || !vis(e) || e.closest('svg') || (topLayer && !topLayer.contains(e))) continue;
    if (parseFloat(getComputedStyle(e).fontSize) < 13) out.push(`tiny ${name(e)}`);
    const r = e.getBoundingClientRect(); if ((r.right > W + 2 || r.left < -2) && !inScroll(e)) out.push(`text-cut ${name(e)}`);
  }
  return [...new Set(out)];
}
const fits = async (page: Page, what: string) => expect(await page.evaluate(audit), what).toEqual([]);
/** what the (shown) narration bar sits on: controls, map nodes and their titles, the map token */
function covered() {
  const bar = document.querySelector('.kit-subtitle') as HTMLElement | null;
  if (!bar || bar.hidden || getComputedStyle(bar).display === 'none') return ['bar not shown'];
  const b = bar.getBoundingClientRect(), out: string[] = [];
  if (b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight) out.push('bar outside the view');
  for (const e of document.querySelectorAll('button, .xg-btn, .xg-node, .sb-node__title, .xg-node__marker, .sb-venue, .sb-mode, .sb-records')) {
    if (bar.contains(e)) continue;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('[hidden]')) continue;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.left < b.right - 1 && b.left < r.right - 1 && r.top < b.bottom - 1 && b.top < r.bottom - 1) out.push(`${String(e.className).split(' ')[0]}:${(e.textContent || '').replace(/\s+/g, '').slice(0, 6)}`);
  }
  return out;
}

test.describe('phones', () => {
  test.beforeEach(({}, ti) => test.skip(ti.project.name !== 'portrait-810x1080', 'phone cases run once'));
  for (const [pname, viewport] of PHONES) {
    test.describe(pname, () => {
      test.use({ viewport, ...touch });

      test(`${pname}: lobby, settings, map, brief, collection, records fit`, async ({ page }) => {
        await boot(page);
        await app(page, `a.save.data.firstRunDone = true; a.save.data.missions.c1m1 = { stars: 2, attempts: 1, failStreak: 0, clears: 1, bestT: 30, hintMax: 0, skipped: false, why: {} }; a.showLobby();`);
        await page.waitForSelector('.sb-lobby'); await page.waitForTimeout(500);
        await fits(page, 'lobby');
        await page.locator('.sb-gear').click(); await page.waitForSelector('.sb-settings'); await page.waitForTimeout(400);
        await fits(page, 'settings');
        await expect(page.locator('.sb-set__tut')).toBeVisible();
        await app(page, `document.querySelectorAll('.sb-scrim').forEach((n) => n.remove()); a.save.markSeen('story:c1'); a.showMap(1);`);
        await page.waitForSelector('.sb-map .xg-node'); await page.waitForTimeout(400);
        // map nodes never overlap each other
        const nodes = await page.locator('.sb-map .xg-node').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
          const [a, b] = [nodes[i], nodes[j]]; expect(Math.min(a[2], b[2]) - Math.max(a[0], b[0]) <= 2 || Math.min(a[3], b[3]) - Math.max(a[1], b[1]) <= 2, `nodes ${i}/${j}`).toBe(true);
        }
        await fits(page, 'map');
        await app(page, `a.openMission('c1m2');`); await page.waitForSelector('.sb-brief'); await page.waitForTimeout(500);
        await fits(page, 'brief');
        await app(page, `document.querySelectorAll('.sb-scrim').forEach((n) => n.remove()); a.showCollection();`); await page.waitForSelector('.sb-coll'); await page.waitForTimeout(400);
        await fits(page, 'collection');
        await app(page, `a.closeMenus(); a.showRecords();`); await page.waitForSelector('.sb-rec__grid'); await page.waitForTimeout(400);
        await fits(page, 'records');
      });

      test(`${pname}: timed HUD inside the view and never overlapping; pause and death card fit`, async ({ page }) => {
        await boot(page);
        await app(page, `a.save.data.firstRunDone = true; void a.startMatch('timed', 'moon', { seed: 21, countdown: false });`);
        await page.waitForFunction(() => (window as any).__sb?.match?.state === 'playing'); await page.waitForTimeout(1500);
        const rects = await page.evaluate(() => ['.sb-pill', '.sb-board', '.sb-mini', '.sb-boost', '.sb-pause', '.sb-pus', '.sb-feed'].map((s) => { const e = document.querySelector(s) as HTMLElement | null; if (!e || e.hidden || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { n: s, x: r.left, y: r.top, r: r.right, b: r.bottom } : null; }).filter(Boolean) as { n: string; x: number; y: number; r: number; b: number }[]);
        expect(rects.length).toBeGreaterThanOrEqual(5);
        for (const a of rects) expect(a.x >= 0 && a.y >= 0 && a.r <= viewport.width && a.b <= viewport.height, `${a.n} inside`).toBe(true);
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j]; expect(a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1, `${a.n} × ${b.n}`).toBe(false);
        }
        const boost = await page.locator('.sb-boost').boundingBox(); expect(boost!.width).toBeGreaterThanOrEqual(44);
        // the camera pulls back on a phone
        expect(await page.evaluate(() => (window as any).__sb.view.screenK)).toBeLessThan(1);
        await page.evaluate(() => { const { match } = (window as any).__sb, w = match.world, me = match.me, k = w.snakes.find((s: any) => !s.isPlayer && s.alive); w.kill(me, { killer: k, tag: 'body', x: me.x, y: me.y, s: 9999 }); });
        await page.waitForSelector('.sb-dc.is-in'); await page.waitForTimeout(500);
        await fits(page, 'death card');
        await page.waitForFunction(() => (window as any).__sb.match.me.alive, null, { timeout: 8000 });
        await app(page, `a.showPause();`); await page.waitForSelector('.sb-pausep'); await page.waitForTimeout(400);
        await fits(page, 'pause');
      });

      test(`${pname}: the narration bar covers no control and hides over 设置 / 纪录; a 4-digit endless peak fits`, async ({ page }) => {
        await boot(page);
        const say = (t: string) => app(page, `a.sub.onCue({ text: ${JSON.stringify(t)} });`);
        await app(page, `a.save.data.firstRunDone = true; a.save.markSeen('story:c1'); a.save.save(); a.showLobby();`);
        await page.waitForSelector('.sb-lobby'); await page.waitForTimeout(400);
        await say('玩了好几局，看看远处吧。'); await page.waitForTimeout(300);   // the longest lobby lines are 13 字
        expect(await page.evaluate(covered), 'lobby').toEqual([]);
        await page.locator('.sb-gear').click(); await page.waitForSelector('.sb-settings'); await say('准备好了，去比赛吧！');
        await expect(page.locator('.kit-subtitle')).toBeHidden();
        await app(page, `document.querySelectorAll('.sb-scrim').forEach((n) => n.remove()); a.showMap(1);`);
        await page.waitForSelector('.sb-map .xg-node__marker'); await page.waitForTimeout(400);
        await say('蛇王守着的烛龙灯，归你了！'); await page.waitForTimeout(300);
        expect(await page.evaluate(covered), 'map').toEqual([]);
        // the "you are here" token never sits on the back key or a chapter tab (landscape: 1-1 is right under them)
        expect(await page.evaluate(() => { const m = document.querySelector('.xg-node__marker')!.getBoundingClientRect(); return [...document.querySelectorAll('.sb-map .sb-backbtn, .sb-chtab')].filter((e) => { const r = e.getBoundingClientRect(); return r.left < m.right && m.left < r.right && r.top < m.bottom && m.top < r.bottom; }).map((e) => e.className); }), 'map token').toEqual([]);
        await app(page, `a.showRecords();`); await page.waitForSelector('.sb-rec__grid'); await say('准备好了，去比赛吧！');
        await expect(page.locator('.kit-subtitle')).toBeHidden();
        // endless result: the peak length stays on the card (it was cut on a 320 px phone)
        await app(page, `void a.startMatch('endless', 'moon', { seed: 7, countdown: false });`);
        await page.waitForFunction(() => (window as any).__sb?.match?.state === 'playing');
        await page.evaluate(() => { const m = (window as any).__sb.match; m.me.stats.peak = 1234; m.bank(); });
        await page.waitForSelector('.sb-podium.is-endless'); await page.waitForTimeout(1200);
        await fits(page, 'endless result');
        expect(await page.evaluate(() => { const p = document.querySelector('.sb-podium .sb-panel')!.getBoundingClientRect(); return [...document.querySelectorAll('.sb-hero__len b, .sb-hero__head')].map((e) => { const r = e.getBoundingClientRect(); return r.left >= p.left - 0.5 && r.right <= p.right + 0.5; }); })).toEqual([true, true]);
        expect(await page.locator('.sb-hero__len b').textContent()).toBe('1234');
      });
    });
  }
});

test.describe('跳过', () => {
  test('first run: 跳过 appears after ~1.5 s, a tap opens the lobby and marks the first run done', async ({ page }) => {
    await boot(page, '?test=1&nogate&firstrun=1');
    await page.waitForFunction(() => (window as any).__sb?.match?.run?.m.id === 'c1m1');
    await page.waitForTimeout(500);
    await expect(page.locator('.xg-skip[data-state="shown"]')).toHaveCount(0);
    await page.waitForSelector('.xg-skip[data-state="shown"]', { timeout: 3000 });
    const r = await page.locator('.xg-skip').boundingBox(); expect(r!.height).toBeGreaterThanOrEqual(44);
    const pause = await page.locator('.sb-pause').boundingBox(); expect(r!.y).toBeGreaterThanOrEqual(pause!.y + pause!.height);   // under the pause key
    await page.locator('.xg-skip').click();
    await page.waitForSelector('.sb-lobby');
    expect(await page.evaluate(() => { const a = (window as any).__sbApp; return [a.save.data.firstRunDone, !!a.match, document.querySelectorAll('.xg-skip[data-state="shown"]').length]; })).toEqual([true, false, 0]);
  });

  test('parent 跳过开场和教学: no first run, no story card', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: true })));
    await boot(page, '?test=1&nogate&firstrun=1');
    await page.waitForSelector('.sb-lobby');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => { const a = (window as any).__sbApp; return [a.save.data.firstRunDone, !!a.match]; })).toEqual([true, false]);
    await app(page, `a.showMap(1);`); await page.waitForSelector('.sb-map'); await page.waitForTimeout(500);
    await expect(page.locator('.sb-story')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__sbApp.save.seen('story:c1'))).toBe(true);
  });

  test('story card carries 跳过; 设置 → 新手教学 · 再玩一次 replays the tutorial', async ({ page }) => {
    await boot(page);
    await app(page, `a.save.data.firstRunDone = true; a.showMap(1);`);
    await page.waitForSelector('.sb-story');
    await page.waitForSelector('.xg-skip[data-state="shown"]', { timeout: 3000 });
    await app(page, `a.sub.onCue({ text: '星际竞技场开张了，出发！' });`);
    await page.locator('.xg-skip').click();
    // the skipped line leaves with the voice — it never lingers over the 1-1 node
    expect(await page.evaluate(() => (document.querySelector('.kit-subtitle') as HTMLElement).hidden)).toBe(true);
    await expect(page.locator('.sb-story')).toHaveCount(0);
    await app(page, `a.showLobby();`); await page.waitForSelector('.sb-lobby');
    await page.locator('.sb-gear').click(); await page.locator('.sb-set__tut').click();
    await page.waitForFunction(() => (window as any).__sb?.match?.run?.m.id === 'c1m1');
    await expect(page.locator('.sb-ghost')).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).__sbApp.firstRun)).toBe(true);
    await page.waitForSelector('.xg-skip[data-state="shown"]', { timeout: 3000 });
    await page.locator('.xg-skip').click();
    await page.waitForSelector('.sb-lobby');
    expect(await page.evaluate(() => (window as any).__sbApp.firstRun)).toBe(false);
  });

  test('first run: 跳过 leaves when a level ends — never over S9 or an unlock card; 好的 goes on to 1-2 with a new pill', async ({ page }) => {
    await boot(page, '?test=1&nogate&firstrun=1');
    await page.waitForFunction(() => (window as any).__sb?.match?.run?.m.id === 'c1m1');
    await app(page, `a.save.data.cardQueue.push('skin:loco'); a.save.save();`);
    await page.waitForSelector('.xg-skip.sb-skip[data-state="shown"]', { timeout: 3000 });
    const vp = page.viewportSize()!; await page.touchscreen.tap(vp.width * 0.4, vp.height * 0.6); await page.waitForTimeout(300);   // 1-1 waits for his first touch
    await page.evaluate(() => { const r = (window as any).__sb.match.run; r.outcome = { ok: true }; r.done = true; });
    await expect(page.locator('.xg-scrim .xg-modal__actions')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.xg-skip')).toHaveCount(0);
    await page.getByRole('button', { name: '下一关' }).click();
    await expect(page.locator('.sb-unlock')).toBeVisible();
    await expect(page.locator('.xg-skip')).toHaveCount(0);
    await page.waitForTimeout(450); await page.locator('.sb-unlock .xg-btn--primary').click();
    await page.waitForFunction(() => (window as any).__sb?.match?.run?.m.id === 'c1m2');
    await page.waitForSelector('.xg-skip.sb-skip[data-state="shown"]', { timeout: 3000 });
    // under the pause panel the pill is hidden and untappable
    await app(page, `a.showPause();`); await page.waitForSelector('.sb-pausep');
    await expect(page.locator('.xg-skip.sb-skip')).toHaveCSS('visibility', 'hidden');
  });

  test('an unlock card removed by a screen change goes back to the queue; later results still move on', async ({ page }) => {
    await boot(page);
    await app(page, `a.save.data.firstRunDone = true; a.save.data.cardQueue.push('skin:loco'); a.save.save(); a.showLobby();`);
    await expect(page.locator('.sb-unlock')).toBeVisible();
    await app(page, `a.save.markSeen('story:c1'); a.showMap(1);`); await page.waitForSelector('.sb-map');
    expect(await page.evaluate(() => [document.querySelectorAll('.sb-unlock').length, (window as any).__sbApp.save.data.cardQueue[0]])).toEqual([0, 'skin:loco']);
    await app(page, `a.showLobby();`); await expect(page.locator('.sb-unlock')).toBeVisible();
    await page.waitForTimeout(450); await page.locator('.sb-unlock .xg-btn--primary').click();
    await app(page, `void a.startMatch('mission', 'moon', { mission: 'c1m1', countdown: false });`);
    await page.waitForFunction(() => (window as any).__sb?.match?.run);
    await page.evaluate(() => { const r = (window as any).__sb.match.run; r.outcome = { ok: true }; r.done = true; });
    await page.getByRole('button', { name: '下一关' }).click({ timeout: 15000 });
    await page.waitForFunction(() => (window as any).__sb?.match?.run?.m.id === 'c1m2');
    await expect(page.locator('.sb-hud')).toBeVisible();
  });
});
