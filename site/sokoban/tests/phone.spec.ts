/**
 * Phones + 跳过 (Dad's feedback 2026-10-08).
 * - Phone portrait (iPhone 13 390×664, iPhone SE 320×568) and phone landscape (844×390): a level (HUD,
 *   board, keys, strip), the map, the hangar (装扮 / 本领), a 侦探题, the result card and every modal
 *   moment (chapter done, 收尾卡, 跳级考试, 货单板, finale) — no horizontal overflow, every reachable
 *   control inside the view and ≥ 44 px, no text under 13 px, the board clear of the HUD and the keys.
 * - 跳过: the opening shows the kit pill after ~1.5 s (not before), tapping it opens 0-1 with the opening
 *   seen; 0-1's ghost-hand teaching, chapter intro lines, the 自动绕路 upgrade show, a route's first
 *   (long) launch and the finale all carry the pill; the parent's 跳过开场和教学 skips them as if tapped
 *   (nothing lost: arrows on, chapter seen); 机库 → 本领 → 再看一遍 replays the opening and 0-1 —
 *   both even with the switch on (asked for on purpose).
 * The phone cases run once (iPad portrait project); they set their own viewport.
 */
import { expect, test, type Page } from '@playwright/test';

const touch = { deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;
const PHONES: [string, { width: number; height: number }][] = [['iphone13', { width: 390, height: 664 }], ['iphonese', { width: 320, height: 568 }], ['landscape844', { width: 844, height: 390 }]];

type W = { __sok: Record<string, (...a: unknown[]) => unknown> };
const sok = (page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as W).__sok[f as string](...(a as unknown[])), [fn, args] as const);
async function open(page: Page, q: string) {
  await page.goto(`/sokoban/?test=1&${q}`);
  await page.waitForSelector('#app[data-ready]');
}
const screen = (page: Page) => page.evaluate(() => document.getElementById('app')!.dataset.screen);

/** layout problems on the current screen (top layer only: what a finger can reach) */
function audit() {
  const W = innerWidth, H = innerHeight, out: string[] = [];
  if (document.documentElement.scrollWidth > W + 1) out.push(`h-overflow ${document.documentElement.scrollWidth}>${W}`);
  const vis = (e: Element) => { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]'); };
  const inScroll = (e: Element) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return true; } return false; };
  const top = (e: Element) => { const r = e.getBoundingClientRect(); return [[.5, .5], [.2, .5], [.8, .5], [.5, .2], [.5, .8]].some(([fx, fy]) => { const x = r.left + r.width * fx, y = r.top + r.height * fy; if (x < 0 || y < 0 || x >= W || y >= H) return false; const hit = document.elementFromPoint(x, y); return !!hit && (e.contains(hit) || hit.contains(e)); }); };
  const layers = [...document.querySelectorAll('.xg-scrim, .sok-finale')].filter(vis);
  const topLayer = layers[layers.length - 1];
  const off = (r: DOMRect) => r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1;
  const name = (e: Element) => `${(e.className as unknown as string).toString().split(' ')[0] || e.tagName}:${(e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, '').slice(0, 8)}`;
  const btns = [...document.querySelectorAll('button, .xg-btn, .xg-skip')].filter(vis).filter((e) => top(e) || (off(e.getBoundingClientRect()) && !inScroll(e) && (!topLayer || topLayer.contains(e))));
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    if (r.width < 44 - 0.5 || r.height < 44 - 0.5) out.push(`small ${name(b)} ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
    if (!inScroll(b) && off(r)) out.push(`cut ${name(b)}`);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const e = n.parentElement;
    if (!n.textContent?.trim() || !e || !vis(e) || e.closest('svg') || (topLayer && !topLayer.contains(e))) continue;
    if (parseFloat(getComputedStyle(e).fontSize) < 13) out.push(`tiny ${name(e)}`);
    const r = e.getBoundingClientRect();
    if ((r.right > W + 2 || r.left < -2) && !inScroll(e)) out.push(`text-cut ${name(e)}`);
    if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).textOverflow === 'ellipsis') out.push(`ellipsis ${name(e)}`);
  }
  return [...new Set(out)];
}
const fits = async (page: Page, what: string) => expect(await page.evaluate(audit), what).toEqual([]);

/** The play screen's pieces never overlap each other and stay inside the view. */
async function playRects(page: Page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    const r = (s: string) => { const e = document.querySelector<HTMLElement>(s); if (!e || e.hidden || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return { s, x: b.left, y: b.top, r: b.right, b: b.bottom }; };
    const board = r('.sok-input')!;
    const others = ['.sok-plate', '.sok-pushes', '.sok-hintbtn', '.kit-back, .kit-back-adopted', '.sok-act--undo', '.sok-act--restart', '.sok-act--map'].map(r).filter((x): x is NonNullable<typeof x> => !!x);
    const hit = (a: typeof board, b: typeof board) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
    const bad: string[] = [];
    for (const o of [board, ...others]) if (o.x < -1 || o.y < -1 || o.r > W + 1 || o.b > H + 1) bad.push(`out ${o.s}`);
    for (const o of others) if (hit(board, o)) bad.push(`board×${o.s}`);
    for (let i = 0; i < others.length; i += 1) for (let j = i + 1; j < others.length; j += 1) if (hit(others[i], others[j])) bad.push(`${others[i].s}×${others[j].s}`);
    return { bad, area: (board.r - board.x) * (board.b - board.y) / (W * H) };
  });
}

test.describe('phones', () => {
  test.beforeEach(({}, ti) => test.skip(ti.project.name !== 'portrait-810x1080', 'phone cases run once'));
  for (const [pname, viewport] of PHONES) {
    test.describe(pname, () => {
      test.use({ viewport, ...touch });

      test(`${pname}: levels, map, hangar and 侦探题 fit`, async ({ page }) => {
        test.setTimeout(60_000);
        for (const id of ['0-1', '2-4', '4-7', 'C10']) {
          await open(page, `level=${id}`);
          await page.waitForTimeout(500);
          await fits(page, `level ${id}`);
          const g = await playRects(page);
          expect(g.bad, `level ${id} rects`).toEqual([]);
          // the board gets the room: at least a third of a portrait phone, a half of a landscape one
          expect(g.area, `level ${id} board area`).toBeGreaterThan(viewport.width > viewport.height ? 0.45 : 0.33);
        }
        // a push undone shows every key (撤销 · 重做 · 重来 · 地图)
        await open(page, 'level=0-2');
        await sok(page, 'solve');
        await page.waitForTimeout(300);
        await open(page, 'level=1-2');
        await page.waitForTimeout(400);
        await sok(page, 'replay', 'R');
        await page.waitForTimeout(300);
        await fits(page, 'level 1-2 with keys');
        expect((await playRects(page)).bad).toEqual([]);
        await sok(page, 'unlockAll', { rewards: true });
        for (const tab of [0, 2, 4, 'classic']) {
          await sok(page, 'map', tab);
          await page.waitForTimeout(500);
          await fits(page, `map ${tab}`);
        }
        await sok(page, 'hangar');
        await page.waitForTimeout(500);
        await fits(page, 'hangar 装扮');
        for (const i of [1, 2]) {
          await page.locator('.sok-hangar__tabs button').nth(i).click();
          await page.waitForTimeout(400);
          await fits(page, `hangar tab ${i}`);
        }
        await page.locator('[data-testid=again-opening]').scrollIntoViewIfNeeded();
        await expect(page.locator('[data-testid=again-opening]')).toBeInViewport();
        await open(page, 'level=3-3');
        await page.waitForTimeout(900);
        await fits(page, '侦探题');
      });

      test(`${pname}: result card and modal moments fit`, async ({ page }) => {
        test.setTimeout(60_000);
        await open(page, 'level=0-2');
        await sok(page, 'solve');
        await expect(page.locator('[data-testid=result]')).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(600);
        await fits(page, 'result');
        for (const [name, arg] of [['chapter', 2], ['wrap', undefined], ['cert', undefined], ['orders', undefined], ['finale', undefined]] as const) {
          await open(page, 'screen=map');
          await sok(page, 'unlockAll', { rewards: true });
          await sok(page, 'map', 2);
          void page.evaluate(([n, a]) => (window as unknown as W).__sok.overlay(n, a), [name, arg] as const).catch(() => {});
          await page.waitForTimeout(1200);
          await fits(page, name);
        }
      });

      test(`${pname}: the map's chapter card holds its lines (none cut at its edges, no "·" ending a line)`, async ({ page }) => {
        await open(page, 'screen=map');
        await sok(page, 'unlockAll', { rewards: true });
        for (const tab of [0, 1, 2, 3, 4, 'classic'] as const) {
          await sok(page, 'map', tab);
          const bad = await page.evaluate(async () => {
            await document.fonts.ready;
            const card = document.querySelector('.sok-chcard')!;
            const cr = card.getBoundingClientRect();
            const out: string[] = [];
            for (const e of card.querySelectorAll('.sok-chcard__ch, .sok-chcard__nm, .sok-chcard__goal, .xg-pips, .sok-chcard__dest > *')) {
              if (!e.getClientRects().length) continue;
              const r = e.getBoundingClientRect();
              if (r.top < cr.top + 1 || r.bottom > cr.bottom - 1 || r.right > cr.right - 1) out.push(`cut ${(e.getAttribute('class') ?? e.tagName).split(' ')[0]}`);
            }
            const ch = card.querySelector('.sok-chcard__ch'), nm = card.querySelector('.sok-chcard__nm'), dot = card.querySelector('.sok-chcard__dot');
            if (ch && nm && dot?.getClientRects().length && nm.getBoundingClientRect().top > ch.getBoundingClientRect().top + 4) out.push('· ends a line');
            return out;
          });
          expect(bad, `tab ${tab}`).toEqual([]);
        }
      });
    });
  }
});

// ------------------------------------------------------------------ 跳过

const skipPill = (page: Page) => page.locator('.xg-skip');
async function tapSkip(page: Page) {
  await expect(skipPill(page)).toHaveAttribute('data-state', 'shown', { timeout: 4000 });
  await skipPill(page).click();
}
const save = (page: Page) => sok(page, 'save') as Promise<{ tutorialDone: boolean; arrows: string; chaptersSeen: number[] }>;

test.describe('跳过', () => {
  test.beforeEach(({}, ti) => test.skip(ti.project.name !== 'portrait-810x1080', 'skip cases run once'));

  test('the opening: the pill waits ~1.5 s, then 跳过 opens 0-1 with the opening seen', async ({ page }) => {
    await open(page, 'anim=real');
    expect(await screen(page)).toBe('opening');
    await page.waitForTimeout(700);
    await expect(skipPill(page)).toHaveAttribute('data-state', 'waiting');
    await tapSkip(page);
    await expect.poll(() => screen(page)).toBe('play');
    await expect(page.locator('.sok-play')).toHaveAttribute('data-level', '0-1');
    expect((await save(page)).tutorialDone).toBe(true);
    // a reload no longer shows the opening
    await open(page, 'anim=real');
    await page.waitForTimeout(300);
    expect(await screen(page)).toBe('play');
  });

  test('0-1 teaching: 跳过 stops the hand and the lines, the level stays to play', async ({ page }) => {
    await open(page, 'anim=real&level=0-1');
    await expect(page.locator('.sok-play')).toHaveAttribute('data-skipping', '');
    await tapSkip(page);
    await expect(page.locator('.sok-play')).not.toHaveAttribute('data-skipping', '');
    expect((await save(page)).tutorialDone).toBe(true);
    expect(await screen(page)).toBe('play');
    expect((await sok(page, 'marks') as [string, Record<string, unknown>][]).some(([k, v]) => k === 'skip' && v.id === '0-1')).toBe(true);
  });

  test('a long launch (first on the route) carries 跳过 → the result card', async ({ page }) => {
    test.setTimeout(40_000);
    await open(page, 'anim=real&level=0-1');
    await page.waitForTimeout(500);
    // play the level (the teaching pill goes at the first push; the launch's own pill comes with the win
    // and stays through the flight and the arrival line)
    void sok(page, 'solve');
    await expect(page.locator('[data-testid=launch]')).toBeAttached({ timeout: 10_000 });
    // only a shown pill: a teaching pill still fading out ('leaving') is never the one tapped
    const shown = page.locator('.xg-skip[data-state="shown"]');
    await expect(shown).toHaveCount(1, { timeout: 4000 });
    await shown.click();
    await expect(page.locator('[data-testid=result]')).toBeVisible({ timeout: 3000 });
    const marks = await sok(page, 'marks') as [string, Record<string, unknown>][];
    expect(marks.some(([k, v]) => k === 'skip' && v.id === '0-1' && v.what === 'launch')).toBe(true);
  });

  test('the 自动绕路 upgrade show and chapter intro lines carry 跳过; the upgrade is granted either way', async ({ page }) => {
    // a chapter's first level: its intro line has the pill (chapter 2, never entered); 跳过 stops it
    await open(page, 'anim=real&slowmo=4&level=2-1');
    await expect(skipPill(page)).toBeAttached();
    expect((await save(page)).chaptersSeen).toContain(2);
    await tapSkip(page);
    await expect(page.locator('.sok-play')).not.toHaveAttribute('data-skipping', '');
    await expect(skipPill(page)).toHaveCount(0);
    // the upgrade show (chapter 2 is arrows country): granted at once, 跳过 frees the board
    await sok(page, 'setArrows', 'celebrate');
    await sok(page, 'load', '2-2');
    await expect.poll(async () => (await save(page)).arrows).toBe('on');
    await expect(skipPill(page)).toBeAttached();
    await tapSkip(page);
    await expect(skipPill(page)).toHaveCount(0);
    await expect(page.locator('.sok-play')).not.toHaveAttribute('data-skipping', '');
    expect((await sok(page, 'state') as { mode: string }).mode).toBe('arrows');
  });

  test('the finale: 跳过 goes straight to the certificate with 好 ready', async ({ page }) => {
    await open(page, 'anim=real&screen=map');
    void page.evaluate(() => (window as unknown as W).__sok.overlay('finale')).catch(() => {});
    await expect(page.locator('[data-testid=finale-ok]')).toBeDisabled();
    await tapSkip(page);
    await expect(page.locator('[data-testid=finale-ok]')).toBeEnabled({ timeout: 1500 });
    await expect(page.locator('.sok-finale__cert')).toHaveClass(/is-in/);
  });

  test('the parent switch 跳过开场和教学 skips them all as if tapped (nothing lost)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: true })));
    await open(page, 'anim=real');
    await expect.poll(() => screen(page)).toBe('play');
    await expect(page.locator('.sok-play')).toHaveAttribute('data-level', '0-1');
    await page.waitForTimeout(1800);
    await expect(skipPill(page)).toHaveCount(0);
    const s = await save(page);
    expect(s.tutorialDone).toBe(true);
    expect(s.chaptersSeen).toContain(0);
    expect(await sok(page, 'lines')).not.toContain('sok.ch0.intro');
    await sok(page, 'setArrows', 'celebrate');
    await sok(page, 'load', '2-1');
    await page.waitForTimeout(1800);
    await expect(skipPill(page)).toHaveCount(0);
    expect((await save(page)).arrows).toBe('on');
  });

  test('机库 → 本领 → 再看一遍: the opening (back to the hangar) and 0-1', async ({ page }) => {
    await open(page, 'anim=real&screen=map');
    await sok(page, 'unlockAll', {});
    await sok(page, 'hangar');
    await page.locator('.sok-hangar__tabs button').nth(2).click();
    await page.locator('[data-testid=again-opening]').click();
    await expect.poll(() => screen(page)).toBe('opening');
    await tapSkip(page);
    await expect.poll(() => screen(page)).toBe('hangar');
    await page.locator('.sok-hangar__tabs button').nth(2).click();
    await page.locator('[data-testid=again-lesson]').click();
    await expect.poll(() => screen(page)).toBe('play');
    await expect(page.locator('.sok-play')).toHaveAttribute('data-level', '0-1');
    await expect(skipPill(page)).toBeAttached();
  });

  test('跳过开场和教学 on: 再看一遍 → 第一课 still teaches (and its 再来一次); a plain 0-1 does not (QA fb1 r1)', async ({ page }) => {
    test.setTimeout(40_000);
    await page.addInitScript(() => localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: true })));
    await open(page, 'anim=real&screen=map');
    // every reward owned: no 新装备 card between the result card and the replay
    await sok(page, 'unlockAll', { rewards: true });
    // asked for on purpose: the teaching (and its pill) plays despite the parent switch, like 开场 does
    await sok(page, 'hangar');
    await page.locator('.sok-hangar__tabs button').nth(2).click();
    await page.locator('[data-testid=again-lesson]').click();
    await expect.poll(() => screen(page)).toBe('play');
    await expect(page.locator('.sok-play')).toHaveAttribute('data-level', '0-1');
    await expect(page.locator('.sok-play')).toHaveAttribute('data-skipping', '');
    await expect(skipPill(page)).toHaveAttribute('data-state', 'shown', { timeout: 4000 });
    // played through: 再来一次 brings the teaching again
    void sok(page, 'solve');
    await page.locator('.xg-scrim [data-act="again"]').click({ timeout: 15_000 });
    await expect(page.locator('[data-testid=result]')).toHaveCount(0);
    await expect(page.locator('.sok-play')).toHaveCount(1);
    await expect(page.locator('.sok-play')).toHaveAttribute('data-level', '0-1');
    await tapSkip(page);
    const marks = await sok(page, 'marks') as [string, Record<string, unknown>][];
    expect(marks.some(([k, v]) => k === 'skip' && v.id === '0-1' && v.what === 'teach')).toBe(true);
    // 0-1 entered the ordinary way: the switch still skips its teaching
    await sok(page, 'load', '0-1');
    await page.waitForTimeout(1800);
    await expect(skipPill(page)).toHaveCount(0);
    await expect(page.locator('.sok-play')).not.toHaveAttribute('data-skipping', '');
  });
});
