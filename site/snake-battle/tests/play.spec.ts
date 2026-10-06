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
      const boxes = await page.locator('.sb-venue, .sb-mode, .sb-showcase').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
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
      await page.waitForFunction(() => (window as any).__sb.match.me.alive, null, { timeout: 8000 });
      // fast-forward to the end → podium / summary, never automatic onward
      await page.evaluate(() => { const m = (window as any).__sb.match; while (m.world.t < 179.95) m.world.step(); });
      await expect(page.locator('.sb-podium')).toBeVisible({ timeout: 6000 });
      await page.waitForTimeout(1600);
      while (await page.locator('.sb-unlock').count()) { await page.locator('.sb-unlock .xg-btn').first().click(); await page.waitForTimeout(150); }
      await page.locator('.sb-podium .xg-btn', { hasText: '回大厅' }).click();
      await expect(page.locator('.sb-lobby')).toBeVisible();
    });
  });
}
