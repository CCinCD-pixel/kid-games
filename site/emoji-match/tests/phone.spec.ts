/**
 * Dad's feedback 2026-10-08: (1) phones — every screen usable in phone portrait (390×664, 320×568) and
 * phone landscape (844×390): nothing outside the viewport, no overlapping buttons, tap targets ≥ 44 px,
 * text ≥ 13 px, the board as big as the screen allows; (2) 跳过 — the first-run cutscene, the masked
 * lessons, the first intro card, the arrival sequence and the puzzle's H3 demo can be skipped (kit pill,
 * after ~1.5 s), skipping counts as seen, and the parent's 跳过开场和教学 switch skips them outright.
 * Runs on the phone projects and on the iPad projects (no regression there).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { boot, goPlay, inside, overlap, press, settle, watchErrors, type Box } from './em';

const SHOTS = path.join(os.homedir(), 'kid-games-work/shots/fb1/emoji-match/spec');
async function snap(page: Page, info: TestInfo, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${name}.png`) });
}
const isPhone = (page: Page) => { const v = page.viewportSize()!; return Math.min(v.width, v.height) < 600; };
const ALL_SKY = ['dipper', 'polaris', 'cowherd', 'orion', 'sirius'];
const won = (n: number) => { const lv: Record<string, unknown> = {}; let k = 0; for (const ep of [1, 2, 3, 4]) for (let j = 1; j <= 10; j += 1) { k += 1; if (k <= n) lv[`${ep}-${String(j).padStart(2, '0')}`] = { stars: 3, bestLeft: 3, attempts: 1, wins: 1, failStreak: 0 }; } return lv; };
const veteran = { firstRunDone: true, levels: won(40), arrivals: [1, 2, 3, 4], sky: ALL_SKY, boosters: { drill: 3, tractor: 3, ion: 3 } };

/** every visible button: inside the viewport, ≥ 44 px, no two overlapping (except nested); text ≥ 13 px */
async function auditButtons(page: Page, scope = 'body'): Promise<string[]> {
  return page.evaluate((sel) => {
    const vw = innerWidth, vh = innerHeight, out: string[] = [];
    const root = document.querySelector(sel) ?? document.body;
    const vis = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 && !el.closest('[hidden],[inert],.is-leaving'); };
    const btns = [...root.querySelectorAll('button, .kit-back')].filter(vis);
    const name = (b: Element) => `${(b.className && typeof b.className === 'string' ? b.className.split(' ')[0] : b.tagName)}「${(b.textContent ?? '').trim().slice(0, 8)}」`;
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) out.push(`small ${name(b)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) out.push(`outside ${name(b)}`);
    }
    for (let i = 0; i < btns.length; i += 1) for (let j = i + 1; j < btns.length; j += 1) {
      const a = btns[i], b = btns[j]; if (a.contains(b) || b.contains(a)) continue;
      const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      if (p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1) out.push(`overlap ${name(a)} / ${name(b)}`);
    }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n: Node | null;
    while ((n = tw.nextNode())) { const el = n.parentElement; if (!el || !(n.textContent ?? '').trim() || !vis(el)) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 13) out.push(`tiny text「${(n.textContent ?? '').trim().slice(0, 8)}」 ${fs}px`); }
    if (document.documentElement.scrollWidth > vw + 1) out.push('horizontal scroll');
    return out;
  }, scope);
}

test.describe('phones: every screen fits', () => {
  test('play: 7×7, 9×9, puzzle and free — HUD inside, nothing overlapping, board big enough', async ({ page }, info) => {
    const errors = watchErrors(page);
    await boot(page, { save: veteran });
    for (const [id, mode] of [['1-06', 'play'], ['2-08', 'play'], ['p1', 'puzzle'], ['free', 'free']] as const) {
      await goPlay(page, id, { mode, seed: 7 });
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => window.__em.rects()!);
      const v = page.viewportSize()!;
      expect(r.tooSmall, `${id} too small`).toBe(false);
      expect(r.size).toBe(isPhone(page) ? 'phone' : 'tablet');
      // the board: as large as the shorter side allows (phones: ≥ 30 px cells on a 320 wide SE, 9 columns)
      if (isPhone(page)) expect(r.cell, `${id} cell`).toBeGreaterThanOrEqual(Math.min(v.width, v.height) < 340 ? 30 : 36);
      const named: [string, Box][] = [];
      for (const sel of ['.kit-back', '.em-pause', '.em-moves', '.em-head', '.em-stage', '.em-sub-lane', '.em-goal', '.em-tool']) {
        for (const [k, el] of (await page.locator(sel).all()).entries()) { if (await el.isVisible()) { const b = await el.boundingBox(); if (b) named.push([`${sel}#${k}`, b]); } }
      }
      for (const [n, b] of named) expect(inside(b, v.width, v.height), `${id} ${n} inside`).toBe(true);
      for (let a = 0; a < named.length; a += 1) for (let b = a + 1; b < named.length; b += 1) expect(overlap(named[a][1], named[b][1], 1), `${id} ${named[a][0]} × ${named[b][0]}`).toBe(false);
      expect(await auditButtons(page, '#app'), `${id} buttons`).toEqual([]);
      await snap(page, info, `play-${id}`);
    }
    expect(errors).toEqual([]);
  });

  test('menus: route, map, level card, hangar, pause, result — buttons ≥ 44 px, inside, apart', async ({ page }, info) => {
    const errors = watchErrors(page);
    await boot(page, { save: veteran });
    await page.evaluate(() => window.__em.goto({ s: 'route' }));
    await page.waitForTimeout(500);
    expect(await auditButtons(page, '#app')).toEqual([]);
    await snap(page, info, 'route');
    await page.evaluate(() => window.__em.goto({ s: 'map', ep: 2 }));
    await page.waitForTimeout(600);
    expect(await auditButtons(page, '#app')).toEqual([]);
    await page.evaluate(() => window.__em.goto({ s: 'card', id: '2-05' }));
    await page.waitForTimeout(600);
    expect(await auditButtons(page, '.em-card-scrim')).toEqual([]);
    await snap(page, info, 'card');
    await page.evaluate(() => window.__em.goto({ s: 'hangar', tab: 'tools' }));
    await page.waitForTimeout(600);
    // the hangar's book page may scroll inside itself on a phone; everything else must fit
    expect((await auditButtons(page, '#app')).filter((s) => !/outside em-item/.test(s))).toEqual([]);
    await snap(page, info, 'hangar');
    // QA fb1 r1: the page ends on screen and its last row scrolls into view (phone landscape clipped it)
    for (const tab of ['cards', 'sky', 'badges', 'tools']) {
      await page.evaluate((t) => window.__em.goto({ s: 'hangar', tab: t }), tab);
      await page.waitForTimeout(500);
      const g = await page.evaluate(() => {
        const pg = document.querySelector<HTMLElement>('.em-hangar__page')!;
        pg.scrollTop = 1e5;
        const r = pg.getBoundingClientRect(), last = [...pg.querySelectorAll('.em-item')].pop()!.getBoundingClientRect();
        return { bottom: r.bottom, lastBottom: last.bottom, vh: innerHeight };
      });
      expect(g.bottom, `${tab} page ends on screen`).toBeLessThanOrEqual(g.vh + 0.5);
      expect(g.lastBottom, `${tab} last row reachable`).toBeLessThanOrEqual(g.bottom + 0.5);
    }
    // a hangar line keeps playing after its card closes: the floating subtitle is a compact pill on
    // screen (not a squeezed column), clear of the book's tabs, and taps go through it
    // the hangar's cards (a badge, a constellation) fit the screen with 好的 on it, clear of 🏠
    // (phone landscape: the stacked badge card ran 40 px off the bottom)
    const cardFits = async (what: string) => {
      const m = (await page.locator('.xg-scrim .xg-modal').boundingBox())!, ok = (await page.locator('.xg-scrim .xg-modal [data-act="ok"]').boundingBox())!;
      const v = page.viewportSize()!;
      expect(inside(m, v.width, v.height), `${what} card on screen`).toBe(true);
      expect(inside(ok, v.width, v.height), `${what} 好的 on screen`).toBe(true);
      expect(overlap(m, (await page.locator('.kit-back').boundingBox())!), `${what} card clear of 🏠`).toBe(false);
    };
    await page.evaluate(() => { window.__em.setSave({ grants: ['veteran'] }); window.__em.goto({ s: 'hangar', tab: 'badges' }); });
    await page.waitForTimeout(500);
    await page.locator('.em-item[data-item="badge:veteran"]').scrollIntoViewIfNeeded(); // last row: the page scrolls on a phone
    await page.waitForTimeout(300);
    await press(page, '.em-item[data-item="badge:veteran"]');
    await page.waitForSelector('.xg-scrim .xg-modal');
    await page.waitForTimeout(700); // the card's entrance has settled
    await cardFits('badge');
    await press(page, '.xg-scrim .xg-modal [data-act="ok"]');
    await expect(page.locator('.xg-scrim')).toHaveCount(0, { timeout: 3000 });
    await page.evaluate(() => window.__em.goto({ s: 'hangar', tab: 'sky' }));
    await page.waitForTimeout(500);
    await press(page, '.em-hangar__page .em-item');
    await page.waitForSelector('.xg-scrim .xg-modal');
    await page.waitForTimeout(700); // the card's entrance has settled
    await cardFits('sky');
    await press(page, '.xg-scrim .xg-modal [data-act="ok"]');
    await expect(page.locator('.xg-scrim')).toHaveCount(0, { timeout: 3000 });
    await expect.poll(() => page.evaluate(() => { const b = document.querySelector('.em-subbar'); return !!b && !b.hasAttribute('hidden') && Number(getComputedStyle(b).opacity) > 0.5; }), { timeout: 3000 }).toBe(true);
    const bar = (await page.locator('.em-subbar').boundingBox())!;
    const vp = page.viewportSize()!;
    expect(inside(bar, vp.width, vp.height), 'subtitle on screen').toBe(true);
    expect(bar.height, 'subtitle: at most three lines').toBeLessThanOrEqual(isPhone(page) ? 110 : 130);
    expect(bar.width, 'subtitle: not squeezed into a column').toBeGreaterThan(Math.min(240, vp.width * 0.5));
    for (const t of await page.locator('.em-tab').all()) expect(overlap(bar, (await t.boundingBox())!), 'subtitle clear of the tabs').toBe(false);
    expect(await page.locator('.em-subbar').evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
    await goPlay(page, '1-06', { seed: 3 });
    await press(page, '.em-pause');
    await page.waitForSelector('.xg-scrim .xg-modal');
    await page.waitForTimeout(500);
    expect(await auditButtons(page, '.xg-scrim')).toEqual([]);
    const ribbon = await page.locator('.xg-scrim .xg-ribbon').boundingBox();
    const home = await page.locator('.kit-back').boundingBox();
    expect(overlap(ribbon!, home!), 'pause ribbon clear of 🏠').toBe(false);
    expect(ribbon!.y).toBeGreaterThanOrEqual(0);
    await snap(page, info, 'pause');
    expect(errors).toEqual([]);
  });
});

test.describe('跳过: intros and lessons', () => {
  test('masked lesson: 跳过 appears after ~1.5 s, opens the board, counts as seen', async ({ page }, info) => {
    const errors = watchErrors(page);
    await boot(page, { save: { firstRunDone: true } });
    await goPlay(page, '1-01', { seed: 1 });
    expect((await page.evaluate(() => window.__em.mask()))?.length).toBeGreaterThan(0);
    // invisible and untappable at first
    await expect(page.locator('.xg-skip[data-state="waiting"]')).toHaveCount(1);
    await expect(page.locator('.xg-skip[data-state="shown"]')).toBeVisible({ timeout: 4000 });
    const skip = (await page.locator('.xg-skip').boundingBox())!;
    expect(skip.height).toBeGreaterThanOrEqual(44);
    const v = page.viewportSize()!;
    expect(inside(skip, v.width, v.height)).toBe(true);
    // it owns the top-right corner during the lesson: the pause button steps aside where they would meet
    const pause = await page.locator('.em-pause').boundingBox();
    if (pause && await page.locator('.em-pause').isVisible()) expect(overlap(skip, pause)).toBe(false);
    await snap(page, info, 'lesson-skip');
    await page.locator('.xg-skip').click();
    await expect.poll(() => page.evaluate(() => window.__em.mask())).toBeNull();
    expect(await page.evaluate(() => window.__em.ghost())).toBe(false);
    expect(await page.evaluate(() => window.__em.lessonMove())).toBeNull();
    await expect(page.locator('.em-pause')).toBeVisible();
    expect((await page.evaluate(() => window.__em.save())).intros).toContain('lesson:1-01');
    // the whole board plays now: any legal move works
    const ok = await page.evaluate(async () => { const m = window.__em.bestMove(); return m ? window.__em.play(m) : false; });
    expect(ok).toBe(true);
    await settle(page);
    // seen: coming back does not mask again (even before an attempt was counted on another level)
    await goPlay(page, '1-01', { seed: 2 });
    expect(await page.evaluate(() => window.__em.mask())).toBeNull();
    await expect(page.locator('.xg-skip')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('parent switch 跳过开场和教学: no lesson mask, no first intro card (grant kept), no arrival sequence', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page, { save: { firstRunDone: true, levels: won(11) } });
    await page.evaluate(() => localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: true })));
    // lesson
    await goPlay(page, '1-02', { seed: 1 });
    expect(await page.evaluate(() => window.__em.mask())).toBeNull();
    await page.waitForTimeout(1900);
    await expect(page.locator('.xg-skip')).toHaveCount(0);
    // first intro card of a booster level: skipped, but the booster is granted and the card is marked seen
    const before = (await page.evaluate(() => window.__em.save())).boosters.drill as number;
    await page.evaluate(() => window.__em.goto({ s: 'card', id: '2-02' }));
    await press(page, '.em-card [data-act="go"]');
    await page.waitForFunction(() => window.__em.state()?.id === '2-02' && window.__em.state()?.ready === true);
    await expect(page.locator('.em-intro-scrim')).toHaveCount(0);
    const s = await page.evaluate(() => window.__em.save());
    expect(s.intros).toContain('boosterDrill');
    expect(s.boosters.drill).toBeGreaterThan(before);
    // arrival: rewards settled, straight back to the route
    await page.evaluate((lv) => window.__em.setSave({ levels: lv, arrivals: [], sky: [] }), won(10));
    await page.evaluate(() => window.__em.goto({ s: 'arrival', ep: 1 }));
    await expect.poll(() => page.evaluate(() => window.__em.screen()?.s)).toBe('route');
    const a = await page.evaluate(() => window.__em.save());
    expect(a.arrivals).toContain(1);
    expect(a.cosmetics.thrusters).toBeTruthy();
    await page.evaluate(() => localStorage.removeItem('kg:settings:v1'));
    expect(errors).toEqual([]);
  });

  test('first intro card and arrival carry 跳过; skipping keeps every reward', async ({ page }, info) => {
    const errors = watchErrors(page);
    await boot(page, { save: { firstRunDone: true, levels: won(11) } });
    await page.evaluate(() => window.__em.goto({ s: 'card', id: '2-02' }));
    await press(page, '.em-card [data-act="go"]');
    await page.waitForSelector('.em-intro-scrim');
    await expect(page.locator('.xg-skip[data-state="shown"]')).toBeVisible({ timeout: 4000 });
    await page.waitForTimeout(500); // the card's entrance has settled
    // QA fb1 r1: the 🏠 and 跳过 pills stay clear of the card (phone landscape put them on its corners)
    const card = (await page.locator('.em-intro').boundingBox())!;
    expect(overlap(card, (await page.locator('.xg-skip').boundingBox())!), '跳过 clear of the intro card').toBe(false);
    expect(overlap(card, (await page.locator('.kit-back').boundingBox())!), '🏠 clear of the intro card').toBe(false);
    const vi = page.viewportSize()!;
    expect(inside(card, vi.width, vi.height), 'intro card on screen').toBe(true);
    await snap(page, info, 'intro-skip');
    await page.locator('.xg-skip').click();
    await page.waitForFunction(() => window.__em.state()?.id === '2-02' && window.__em.state()?.ready === true);
    expect((await page.evaluate(() => window.__em.save())).intros).toContain('boosterDrill');
    // replayable: the level card's "i" opens it again (no 跳过 there — the child asked for it)
    await page.evaluate(() => window.__em.goto({ s: 'card', id: '2-02' }));
    await press(page, '.em-card [data-act="info"]');
    await page.waitForSelector('.em-intro-scrim');
    await page.waitForTimeout(1800);
    await expect(page.locator('.xg-skip')).toHaveCount(0);
    await press(page, '.em-intro [data-act="ok"]');
    // arrival
    await page.evaluate((lv) => window.__em.setSave({ levels: lv, arrivals: [1], sky: [] }), won(20));
    const tools0 = (await page.evaluate(() => window.__em.save())).boosters;
    await page.evaluate(() => window.__em.goto({ s: 'arrival', ep: 2 }));
    await expect(page.locator('.xg-skip[data-state="shown"]')).toBeVisible({ timeout: 4000 });
    await snap(page, info, 'arrival-skip');
    await page.locator('.xg-skip').click();
    await expect.poll(() => page.evaluate(() => window.__em.screen()?.s)).toBe('route');
    const s = await page.evaluate(() => window.__em.save());
    expect(s.arrivals).toContain(2);
    expect(s.cosmetics.legs).toBeTruthy();
    expect(Object.values(s.boosters as Record<string, number>).reduce((x, y) => x + y, 0)).toBeGreaterThan(Object.values(tools0 as Record<string, number>).reduce((x, y) => x + y, 0));
    expect(s.sky.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('first-run cutscene: 跳过 goes straight to the 1-01 board, and it plays only once', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    await page.goto('/emoji-match/?test=1&firstrun=1');
    await page.waitForSelector('[data-testid="em-cutscene"]', { timeout: 20000 });
    await expect(page.locator('.xg-skip[data-state="shown"]')).toBeVisible({ timeout: 4000 });
    await page.locator('.xg-skip').click();
    await page.waitForFunction(() => window.__em.state()?.id === '1-01' && window.__em.state()?.ready === true);
    await expect(page.locator('[data-testid="em-cutscene"]')).toHaveCount(0, { timeout: 2000 });
    expect((await page.evaluate(() => window.__em.save())).intros).toContain('cutscene');
    // QA fb1 r1: reopened before the lesson was done → straight back to the 1-01 lesson, no cutscene
    await page.reload();
    await page.waitForSelector('#app[data-ready]', { timeout: 20000 });
    await page.waitForFunction(() => window.__em.state()?.id === '1-01' && window.__em.state()?.ready === true);
    await expect(page.locator('[data-testid="em-cutscene"]')).toHaveCount(0);
    expect((await page.evaluate(() => window.__em.mask()))?.length).toBeGreaterThan(0);
    // lesson skipped too → the onboarding is behind the child: the next open is the route, like any day
    await expect(page.locator('.xg-skip[data-state="shown"]')).toBeVisible({ timeout: 4000 });
    await page.locator('.xg-skip').click();
    await expect.poll(() => page.evaluate(() => window.__em.mask())).toBeNull();
    await page.reload();
    await page.waitForSelector('#app[data-ready]', { timeout: 20000 });
    await expect.poll(() => page.evaluate(() => window.__em.screen()?.s)).toBe('route');
    await expect(page.locator('[data-testid="em-cutscene"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
