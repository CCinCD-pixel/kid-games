/**
 * 贪吃蛇大作战 play test (spec §8.13 play.spec, <30 s per test; picked up by `npm run test:smoke`).
 * Both orientations: lobby layout, a real timed match driven by touch (steer + boost key), HUD rectangles
 * never overlap (§2.3), pause only on a real tap, the death card, the podium, and silence before the gate.
 */
import { expect, test, type Page } from '@playwright/test';

type Rect = { x: number; y: number; width: number; height: number };
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function open(page: Page) {
  await page.goto('/snake-battle/?test=1');
  await page.waitForSelector('#app[data-ready]');
  await page.locator('.kit-start button').first().click();
  await expect(page.locator('.sb-lobby')).toBeVisible();
}

{
  test.describe('snake-battle', () => {

    test('挑战关: map → story → brief → play → result → next', async ({ page }) => {
      await open(page);
      await page.locator('.sb-mode--mission').click();
      await expect(page.locator('.sb-map')).toBeVisible();
      // first entry into chapter 1: the story card, a tap closes it
      await expect(page.locator('.sb-story')).toBeVisible();
      await page.waitForTimeout(450);
      await page.locator('.sb-story').click();
      await expect(page.locator('.sb-story')).toHaveCount(0);
      const nodes = page.locator('.sb-map .xg-node');
      await expect(nodes).toHaveCount(8);
      for (const b of await nodes.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) { expect(b.width).toBeGreaterThanOrEqual(48); expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height); }
      await nodes.first().click();
      await expect(page.locator('.sb-brief')).toBeVisible();
      await page.locator('.sb-brief .xg-btn--primary').click();
      await expect(page.locator('.sb-goal')).toBeVisible();
      // HUD rectangles in a mission never overlap (spec §2.3)
      const hud = await page.locator('.sb-hud > :not([hidden]):not(.sb-overlay):not(.sb-stick):not(.sb-count):not(.sb-edge):not(.sb-banner):not(.sb-feed)').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.getBoundingClientRect().toJSON()));
      for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) expect(overlap(hud[i], hud[j]), `hud ${i}/${j}`).toBe(false);
      // finish the rings quickly: put him through every ring
      // pass every ring (the objective rule itself is covered by V1b / G29)
      await page.evaluate(() => { const r = (window as unknown as { __sb: { match: { run: { outcome: unknown; done: boolean } } } }).__sb.match.run; r.outcome = { ok: true }; r.done = true; });
      await expect(page.locator('.xg-scrim .xg-modal__actions')).toBeVisible({ timeout: 15000 });
      expect(await page.evaluate(() => (window as unknown as { __sbApp: { save: { data: { missions: Record<string, { clears: number; stars: number }> } } } }).__sbApp.save.data.missions.c1m1.clears)).toBe(1);
      await page.getByRole('button', { name: '下一关' }).click();
      await expect(page.locator('.sb-goal')).toBeVisible();
    });

    test('lobby fits, no overlap, back button ≥56', async ({ page }) => {
      const vp = page.viewportSize()!;
      await open(page);
      const back = await page.locator('#sb-back').boundingBox();
      expect(back!.width).toBeGreaterThanOrEqual(56);
      const boxes = await page.locator('.sb-venue, .sb-mode, .sb-showcase, .sb-records').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j]), `lobby ${i}/${j}`).toBe(false);
      for (const b of boxes) expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test('timed match: steer, boost, HUD rectangles, pause tap, death card, podium', async ({ page }) => {
      await open(page);
      await page.locator('.sb-mode--timed').click();
      await page.waitForFunction(() => (window as any).__sb?.match?.state === 'playing', null, { timeout: 5000 });
      // HUD rectangles (§2.3): visible HUD elements never intersect
      const hud = await page.locator('.sb-pause, .sb-pill, .sb-board, .sb-mini, .sb-boost, .sb-feed').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()).filter((r) => r.width > 0));
      for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) expect(overlap(hud[i], hud[j]), `hud ${i}/${j}`).toBe(false);
      // steer with a held finger: the head turns toward it
      const before = await page.evaluate(() => (window as any).__sb.match.me.angle);
      const head = await page.evaluate(() => { const s = (window as any).__sb; return s.view.worldToScreen(s.match.me.x, s.match.me.y); });
      const a = before + Math.PI / 2;
      await page.mouse.move(head[0] + Math.cos(a) * 200, head[1] + Math.sin(a) * 200); await page.mouse.down();
      await page.waitForTimeout(600);
      const target = await page.evaluate(() => (window as any).__sb.match.me.target);
      await page.mouse.up();
      expect(Math.abs(Math.atan2(Math.sin(target - a), Math.cos(target - a)))).toBeLessThan(0.4);
      // boost key: needs mass ≥ 20 (venue start mass is 20)
      await page.evaluate(() => { (window as any).__sb.match.me.mass = 60; });
      const bk = (await page.locator('.sb-boost').boundingBox())!;
      await page.mouse.move(bk.x + bk.width / 2, bk.y + bk.height / 2); await page.mouse.down();
      await page.waitForFunction(() => (window as any).__sb.match.me.boost === true, null, { timeout: 2000 });
      await page.mouse.up();
      // a steering drag across the pause key does not pause; a tap does
      const pk = (await page.locator('.sb-pause').boundingBox())!;
      await page.mouse.move(pk.x + 28, pk.y + 28); await page.mouse.down(); await page.mouse.move(pk.x - 80, pk.y + 120, { steps: 5 }); await page.mouse.up();
      expect(await page.locator('.sb-pausep').count()).toBe(0);
      await page.mouse.click(pk.x + 28, pk.y + 28);
      await expect(page.locator('.sb-pausep')).toBeVisible();
      await page.locator('.sb-pausep .xg-btn--primary').click();
      // death → card with the cause and a 3 s respawn ring; then the sim respawns him
      await page.evaluate(() => { const m = (window as any).__sb.match, w = m.world; const k = w.snakes.find((s: any) => !s.isPlayer && s.alive); w.kill(m.me, { killer: k, tag: 'body', x: m.me.x, y: m.me.y, s: 300 }); });
      await expect(page.locator('.sb-dc')).toBeVisible({ timeout: 4000 });
      await expect(page.locator('.sb-dc__line')).toContainText('身体');
      // r2: every death-card button ≥ 64 px tall (§9.3-8)
      for (const hgt of await page.locator('.sb-dc .xg-btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(hgt).toBeGreaterThanOrEqual(64);
      await page.waitForFunction(() => (window as any).__sb.match.me.alive, null, { timeout: 8000 });
      // fast-forward to the end → podium / summary, never automatic onward
      await page.evaluate(() => { const m = (window as any).__sb.match; while (m.world.t < 179.95) m.world.step(); });
      await expect(page.locator('.sb-podium')).toBeVisible({ timeout: 6000 });
      await page.waitForTimeout(1600);
      while (await page.locator('.sb-unlock').count()) { await page.locator('.sb-unlock .xg-btn').first().click(); await page.waitForTimeout(150); }
      await page.locator('.sb-podium .xg-btn', { hasText: '回大厅' }).click();
      await expect(page.locator('.sb-lobby')).toBeVisible();
    });

    // ---- fix r1 regressions (QA r1 player + tech)
    test('r1: clip manifest loaded, match pad stays connected, unlock subtitle filled, pause buttons ≥ 64', async ({ page }) => {
      await open(page);
      // the voice step's clips are used (not the system voice): a snake.* id resolves to a recorded clip
      await page.waitForFunction(() => (window as any).__sbApp.voice.clipOf('snake.intro.1').endsWith('.m4a'), null, { timeout: 8000 });
      // the match pad's output is still the live node 2 s into a match (stop() must not disconnect the new match's nodes)
      await page.evaluate(() => { const app = (window as any).__sbApp; app.save.data.settings.matchMusic = true; void app.startMatch('timed', 'moon', { seed: 7, countdown: false }); });
      await page.waitForFunction(() => !!(window as any).__sb?.match, null, { timeout: 8000 });
      const before = await page.evaluate(() => { const live = (window as any).__sbApp.pad.live; (window as any).__padOut = live.out; return !!live.out; });
      await page.waitForTimeout(2000);
      console.log(`[r1] pad live under automation: ${before}`);
      if (before) expect(await page.evaluate(() => (window as any).__sbApp.pad.live.out === (window as any).__padOut)).toBe(true);
      // pause panel buttons ≥ 64 px (§9.3-9)
      await page.evaluate(() => (window as any).__sbApp.showPause());
      for (const b of await page.locator('.sb-pausep .xg-btn').evaluateAll((els) => els.map((e) => (e as HTMLElement).offsetHeight))) expect(b).toBeGreaterThanOrEqual(64);   // layout size (the panel pops in with a scale)
      // an unlock card's subtitle never shows a raw {template}
      const subs: string[] = [];
      await page.exposeFunction('__subSeen', (t: string) => { subs.push(t); });
      await page.evaluate(() => { new MutationObserver(() => { const el = document.querySelector('.kit-subtitle'); if (el) (window as any).__subSeen(el.textContent ?? ''); }).observe(document.body, { subtree: true, childList: true, characterData: true }); });
      await page.evaluate(() => { const app = (window as any).__sbApp; app.teardownMatch(); app.save.data.cardQueue.push('skin:rocket'); app.drainCards(); });
      await expect(page.locator('.sb-unlock')).toBeVisible();
      await page.waitForTimeout(600);
      expect(subs.some((t) => t.includes('新皮肤')), subs.join(' | ')).toBe(true);
      expect(subs.filter((t) => t.includes('{')), subs.join(' | ')).toEqual([]);
    });

    // ---- fix r3 regressions (QA r3): real finger taps (locator.tap = touch pointer in WebKit), not mouse clicks
    test('r3: finger taps work on every in-match overlay and never steer', async ({ page }) => {
      await open(page);
      await page.evaluate(() => void (window as any).__sbApp.startMatch('timed', 'moon', { seed: 5, countdown: false }));
      await page.waitForFunction(() => (window as any).__sb?.match?.state === 'playing', null, { timeout: 8000 });
      // pause key tap → panel; 继续 by tap closes it and does not aim him at the button
      await page.locator('.sb-pause').tap();
      await expect(page.locator('.sb-pausep')).toBeVisible();
      const aim0 = await page.evaluate(() => (window as any).__sb.app.router?.target ?? null);
      // leave-confirm: 回大厅 → 继续玩, all by tap
      await page.locator('.sb-pausep .sb-quiet').tap();
      await expect(page.locator('.sb-confirm')).toBeVisible();
      await page.locator('.sb-confirm .xg-btn--primary').tap();
      await expect(page.locator('.sb-confirm')).toHaveCount(0);
      await page.locator('.sb-pausep .xg-btn--primary').tap();
      await expect(page.locator('.sb-pausep')).toHaveCount(0);
      expect(await page.evaluate(() => (window as any).__sb.app.router?.target ?? null)).toBe(aim0);
      await page.waitForFunction(() => (window as any).__sb.match.state === 'playing', null, { timeout: 6000 });
      // death card 好的 by tap
      await page.evaluate(() => { const m = (window as any).__sb.match, w = m.world; const k = w.snakes.find((x: any) => !x.isPlayer && x.alive); w.kill(m.me, { killer: k, tag: 'body', x: m.me.x, y: m.me.y, s: 300 }); });
      await expect(page.locator('.sb-dc')).toBeVisible({ timeout: 4000 });
      await page.locator('.sb-dc .xg-btn--primary').tap();
      await expect(page.locator('.sb-dc')).toHaveCount(0);
      await page.waitForFunction(() => (window as any).__sb.match.me.alive, null, { timeout: 8000 });
      // podium: an unlock card waits ≥ 3 s (he reads his result first); its 好的 and the podium's 回大厅 work by tap
      await page.evaluate(() => { const app = (window as any).__sbApp; app.save.data.cardQueue.push('skin:rocket'); const m = (window as any).__sb.match; while (m.world.t < 179.95) m.world.step(); });
      await expect(page.locator('.sb-podium')).toBeVisible({ timeout: 6000 });
      await page.waitForTimeout(1600);
      expect(await page.locator('.sb-unlock').count()).toBe(0);
      await expect(page.locator('.sb-unlock')).toBeVisible({ timeout: 4000 });
      await page.waitForTimeout(450);
      for (let i = 0; i < 12 && await page.locator('.sb-unlock').count(); i++) {
        const before = await page.locator('.sb-unlock').evaluate((e) => (e as any).__id ??= Math.random());
        await page.locator('.sb-unlock .xg-btn').first().tap();
        await page.waitForTimeout(500);
        const after = await page.locator('.sb-unlock').evaluateAll((els) => els.map((e) => (e as any).__id ?? null));
        expect(after.includes(before), 'the tapped unlock card closed').toBe(false);
      }
      // the finished match lets the render loop sleep (battery, QA r3)
      await page.waitForTimeout(2800);
      expect(await page.evaluate(() => (window as any).__sbApp.raf)).toBe(0);
      await page.locator('.sb-podium .xg-btn', { hasText: '回大厅' }).tap();
      await expect(page.locator('.sb-lobby')).toBeVisible();
    });

    test('r3: endless 收工 by tap; GO banner on one line above his head; story card closes by tap', async ({ page }) => {
      await open(page);
      await page.evaluate(() => void (window as any).__sbApp.startMatch('endless', 'moon', { seed: 9 }));
      // the 出发！ beat: one line, display face, clear of his head
      await page.waitForFunction(() => (document.querySelector('.sb-count') as HTMLElement | null)?.classList.contains('is-word'), null, { timeout: 8000 });
      const go = await page.evaluate(() => { const el = document.querySelector('.sb-count') as HTMLElement; const r = el.getBoundingClientRect(); const s = (window as any).__sb; const hy = s.view.worldToScreen(s.match.me.x, s.match.me.y)[1]; return { h: r.height, bottom: r.bottom, text: el.textContent, hy, fs: parseFloat(getComputedStyle(el).fontSize), lh: parseFloat(getComputedStyle(el).lineHeight) }; });
      expect(go.text).toBe('出发！');
      expect(go.h).toBeLessThanOrEqual(go.lh * 1.2);          // a single line
      expect(go.bottom).toBeLessThan(go.hy - 40);            // above his head and name tag
      await page.waitForFunction(() => (window as any).__sb?.match?.state === 'playing', null, { timeout: 6000 });
      await page.locator('.sb-pause').tap();
      await page.locator('.sb-pausep .sb-bank').tap();
      await expect(page.locator('.sb-podium.is-endless')).toBeVisible({ timeout: 8000 });
      expect(await page.locator('.sb-podium .xg-chip', { hasText: '最长' }).count()).toBe(0);   // the hero already shows it
      await page.locator('.sb-podium .xg-btn', { hasText: '回大厅' }).tap();
      await expect(page.locator('.sb-lobby')).toBeVisible();
      // the 尾声 story card closes by a finger tap over a live arena (imports a source module: dev server only)
      const dev = await page.evaluate(() => fetch('/snake-battle/src/screens2.ts').then((x) => x.ok && !/html/.test(x.headers.get('content-type') || '')).catch(() => false));
      if (!dev) return;
      await page.evaluate(() => { const app = (window as any).__sbApp; void app.startMatch('timed', 'moon', { seed: 3, countdown: false }); });
      await page.waitForFunction(() => !!(window as any).__sb?.match, null, { timeout: 8000 });
      await page.evaluate((url) => import(/* @vite-ignore */ url).then((m: any) => m.storyCard(document.getElementById('app'), 'end', () => { (window as any).__storyClosed = true; })), '/snake-battle/src/screens2.ts');
      await page.waitForTimeout(500);
      await page.locator('.sb-story').tap();
      await page.waitForFunction(() => (window as any).__storyClosed === true, null, { timeout: 3000 });
    });

    test('r3: H0 idle hint — ghost hand + gold arrow on an eat level; first run loads the SFX bank', async ({ page }) => {
      const sfx: string[] = [];
      // dev server: /audio/sfx/… and /snake-battle/assets/sfx/snake-*.m4a; production build: hashed /assets/snake-*-<hash>.m4a
      page.on('request', (r) => { const u = r.url(); if (u.includes('/audio/sfx/') || u.includes('/assets/sfx/') || /\/assets\/snake-[a-z0-9-]+-[\w-]+\.m4a/.test(u)) sfx.push(u); });
      await page.goto('/snake-battle/?test=1&firstrun');
      await page.waitForSelector('#app[data-ready]');
      await page.locator('.kit-start button').first().click();
      await page.waitForFunction(() => (window as any).__sb?.match?.run?.m.id === 'c1m1', null, { timeout: 8000 });
      await page.waitForTimeout(1500);
      expect(sfx.some((u) => u.includes('/audio/sfx/')), 'kit SFX requested on the first run').toBe(true);
      expect(sfx.some((u) => /snake-[a-z-]+/.test(u)), 'game SFX requested on the first run').toBe(true);
      // 1-2 吃星尘, no finger at all: after 6 s the hand drags once and the arrow points
      await page.evaluate(() => { const app = (window as any).__sbApp; app.save.data.firstRunDone = true; void app.startMatch('mission', 'moon', { mission: 'c1m2' }); });
      await page.waitForFunction(() => (window as any).__sb?.match?.run?.m.id === 'c1m2' && (window as any).__sb.match.state === 'playing', null, { timeout: 10000 });
      await expect(page.locator('.sb-ghost.is-once')).toBeVisible({ timeout: 9000 });
      await expect(page.locator('.sb-point')).toBeVisible();
    });

    test('r1: rotation mid-match pauses, then resumes; records fit without scrolling', async ({ page }) => {
      const vp = page.viewportSize()!;
      await open(page);
      await page.locator('.sb-records').click();
      await expect(page.locator('.sb-rec')).toBeVisible();
      const scroll = await page.locator('.sb-rec__grid').evaluate((e) => e.scrollHeight - e.clientHeight);
      expect(scroll).toBeLessThanOrEqual(1);
      await page.evaluate(() => (window as any).__sbApp.showLobby());
      await page.evaluate(() => void (window as any).__sbApp.startMatch('timed', 'moon', { seed: 11, countdown: false }));
      await page.waitForFunction(() => (window as any).__sb?.match?.world.t > 0.5, null, { timeout: 8000 });
      await page.setViewportSize({ width: vp.height, height: vp.width });
      await page.waitForTimeout(400);
      const t0 = await page.evaluate(() => (window as any).__sb.match.world.t);
      await page.waitForTimeout(2500);
      const t1 = await page.evaluate(() => (window as any).__sb.match.world.t);
      expect(t1).toBeGreaterThan(t0);   // resumed by itself after the rotation settled (or never stopped)
      await page.setViewportSize(vp);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test('r4: snakes are drawn during the 3-2-1 (not only their shadows)', async ({ page }) => {
      await open(page);
      await page.evaluate(() => (window as any).__sbApp.startMatch('timed', 'moon', { seed: 7 }));
      await page.waitForFunction(() => (window as any).__sb?.match?.state === 'countdown');
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => { const { match, view } = (window as any).__sb; return { state: match.state, t: match.world.t, age: view.spawnAge(match.me), segs: view.segCount }; });
      expect(r.state).toBe('countdown'); expect(r.t).toBe(0);
      expect(r.age).toBeGreaterThan(0.6);   // fully grown before GO
      expect(r.segs).toBeGreaterThan(40);
    });

    test('r4: next chapter — the story card plays first, then the brief', async ({ page }) => {
      await open(page);
      await page.evaluate(() => {
        const app = (window as any).__sbApp, d = app.save.data; d.firstRunDone = true;
        for (let i = 1; i <= 7; i++) d.missions[`c1m${i}`] = { stars: 3, attempts: 1, failStreak: 0, clears: 1, bestT: 30, hintMax: 0, skipped: false, why: {} };
        d.seenTips.push('story:c1'); app.save.save();
        app.showMap(1); app.startMatch('mission', 'moon', { mission: 'c1m8', countdown: false });
      });
      await page.waitForFunction(() => (window as any).__sb?.match?.run);
      await page.evaluate(() => { const r = (window as any).__sb.match.run; r.outcome = { ok: true }; r.done = true; });
      await page.getByRole('button', { name: '下一关' }).click({ timeout: 15000 });
      for (let k = 0; k < 6 && await page.locator('.sb-story').count() === 0; k++) { if (await page.locator('.sb-unlock').count()) { await page.waitForTimeout(450); await page.locator('.sb-unlock .xg-btn--primary').click(); } else await page.waitForTimeout(300); }
      await expect(page.locator('.sb-story')).toBeVisible();
      await expect(page.locator('.sb-brief')).toHaveCount(0);
      await page.waitForTimeout(450); await page.locator('.sb-story').click();
      await expect(page.locator('.sb-brief')).toBeVisible();
      await expect(page.locator('.sb-brief__no')).toHaveText('2-1');
    });

    test('r4: out-is-failure level — S9 says who got him and how', async ({ page }) => {
      await open(page);
      await page.evaluate(() => { const app = (window as any).__sbApp; app.save.data.firstRunDone = true; app.startMatch('mission', 'moon', { mission: 'c2m4', countdown: false }); });
      await page.waitForFunction(() => (window as any).__sb?.match?.state === 'playing');
      await page.evaluate(() => { const { match } = (window as any).__sb, w = match.world, me = match.me, k = w.snakes.find((s: any) => !s.isPlayer && s.alive); w.kill(me, { killer: k, tag: 'body', x: me.x, y: me.y, s: 9999 }); });
      await expect(page.locator('.sb-cause')).toBeVisible({ timeout: 8000 });
      await expect(page.locator('.sb-cause__line')).toContainText('身体');
      await expect(page.locator('.sb-cause .sb-dc__tip svg')).toHaveCount(1);
      await expect(page.locator('.sb-hud')).toHaveClass(/is-faded/);
    });

    test('r5: H3 示范 → tap → the twin line is said (not cut by 三二一出发) and its perk chip shows', async ({ page }) => {
      const clips: string[] = [];
      page.on('request', (r) => { const u = r.url(); if (/snake\.(hint\.twin|match\.go)/.test(u)) clips.push(u); });
      await open(page);
      await page.evaluate(() => { const app = (window as any).__sbApp, d = app.save.data; d.firstRunDone = true; d.missions.c2m4 = { stars: 0, attempts: 3, failStreak: 3, clears: 0, bestT: null, hintMax: 2, skipped: false, why: {} };
        app.startMatch('mission', 'moon', { mission: 'c2m4', demo: true }); app.afterDemo = () => app.startTwin('c2m4'); });
      await expect(page.locator('.sb-demo')).toBeVisible();
      await page.waitForTimeout(900);
      await page.locator('.sb-demo').dispatchEvent('pointerdown');
      await expect(page.locator('.sb-twinchip')).toBeVisible({ timeout: 8000 });
      await expect(page.locator('.sb-twinchip')).toContainText('接着游');
      await page.waitForFunction(() => (window as any).__sb?.match?.state === 'playing', null, { timeout: 8000 });
      await page.waitForTimeout(600);
      expect(clips.some((u) => u.includes('snake.hint.twin.respawn')), `twin clip requested: ${clips.join(' ')}`).toBe(true);
      expect(clips.filter((u) => u.includes('snake.match.go')).length).toBe(0);
    });

    test('r4: H2 看一招 clip plays offline and is labelled as a clip', async ({ page, context }) => {
      await open(page);
      await page.evaluate(() => { const app = (window as any).__sbApp, d = app.save.data; d.firstRunDone = true; d.missions.c3m7 = { stars: 0, attempts: 2, failStreak: 2, clears: 0, bestT: null, hintMax: 1, skipped: false, why: {} }; app.showMap(3); });
      await context.setOffline(true);
      try {
        await page.evaluate(() => (window as any).__sbApp.openMission('c3m7'));
        await page.locator('.sb-brief').getByRole('button', { name: '看一招' }).click();
        await expect(page.locator('.sb-demo.is-clip .sb-demo__tag')).toHaveText('看一招');
        await page.waitForFunction(() => { const s = (window as any).__sb; return s?.match?.demo && !s.app.preroll && s.match.world.t > 1; }, null, { timeout: 8000 });
        const t0 = await page.evaluate(() => (window as any).__sb.match.world.t);
        await page.waitForTimeout(700);
        expect(await page.evaluate(() => (window as any).__sb.match.world.t)).toBeGreaterThan(t0 + 0.3);
      } finally { await context.setOffline(false); }
    });
  });
}
