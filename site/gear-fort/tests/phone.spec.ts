/**
 * 机关守城 on a phone (Dad's feedback 2026-10-08). Held upright (shorter side < 600 px) the page shows 把手机横过来玩 over
 * everything — the start gate too — and goes on by itself when the phone is turned; a battle under it pauses. In
 * landscape (844×390, 667×375, Safari's 750×342, the iPhone SE's 568×320) every screen fits: the HUD controls stay on
 * screen and apart, tap targets ≥ 44 px, HUD text ≥ 13 px, and the kit modals (result, 设置) keep their buttons and
 * ribbon inside the screen.
 * Runs on the phone projects of tests/gear-fort/playwright.dev.config.ts (iPads skip this file).
 */
import { expect, test, type Page } from '@playwright/test';

const KEY = 'kg:v1:gear-fort';
const V1 = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10'];
const won = (ids: string[], extra: Record<string, unknown> = {}): string => JSON.stringify({ v: 1, updatedAt: Date.now(), data: {
  levels: Object.fromEntries(ids.map((id) => [id, { best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' }])), current: ids.length ? `1-${Math.min(11, ids.length + 1)}` : '1-1',
  story: ['prologue', 'dock', 'map.guide', 'tut.1-1'], ...extra } });

async function load(page: Page, save: string | null): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('/gear-fort/?test=1');
  await page.evaluate(([k, s]) => { localStorage.clear(); if (s) localStorage.setItem(k as string, s as string); }, [KEY, save]);
  await page.goto('/gear-fort/?test=1', { waitUntil: 'load' });
  return errors;
}
async function open(page: Page, save: string | null): Promise<string[]> {
  const errors = await load(page, save);
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  return errors;
}
/** rects of the selectors that are shown; every one inside the viewport */
async function boxes(page: Page, sels: string[]): Promise<{ sel: string; x: number; y: number; w: number; h: number }[]> {
  return page.evaluate((sels) => sels.flatMap((sel) => [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.offsetWidth > 0)
    .map((e) => { const r = e.getBoundingClientRect(); return { sel, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })), sels);
}
const inside = (b: { x: number; y: number; w: number; h: number }, W: number, H: number): boolean => b.x >= -1 && b.y >= -1 && b.x + b.w <= W + 1 && b.y + b.h <= H + 1;
const meet = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

test.describe('phone held upright: 把手机横过来玩', () => {
  test.beforeEach(({}, info) => { test.skip(!/iphone(13|se)$/.test(info.project.name), 'phone portrait projects'); });

  test('the card covers the start gate, goes on by itself when the phone turns; a battle pauses under it', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = await load(page, null);
    const vp = page.viewportSize()!; const card = page.locator('.gf-rotate');
    await expect(card).toBeVisible(); await expect(card).toContainText('把手机横过来玩');
    const r = await page.evaluate(() => { const c = document.querySelector('.gf-rotate')!.getBoundingClientRect(); const t = document.querySelector('.gf-rotate__t')!.getBoundingClientRect(); const s = document.querySelector('.gf-rotate__s')!.getBoundingClientRect();
      return { c: [c.left, c.top, c.width, c.height], t: [t.left, t.right, t.height], s: [s.left, s.right], sw: document.documentElement.scrollWidth, art: !!document.querySelector('.gf-rotate__mozi canvas') }; });
    expect(r.c).toEqual([0, 0, vp.width, vp.height]); expect(r.t[0]).toBeGreaterThanOrEqual(0); expect(r.t[1]).toBeLessThanOrEqual(vp.width);
    expect(r.t[2]).toBeLessThan(60); // one line
    expect(r.s[0]).toBeGreaterThanOrEqual(0); expect(r.s[1]).toBeLessThanOrEqual(vp.width); expect(r.sw).toBeLessThanOrEqual(vp.width); expect(r.art).toBe(true);
    await page.screenshot({ path: `${process.env.KG_SHOTS_DIR}/fb1-phone/${test.info().project.name}-rotate.png` });
    // a tap on the card reaches nothing under it
    await page.mouse.click(vp.width / 2, vp.height * 0.85); await page.waitForTimeout(300);
    await expect(page.locator('#app[data-ready]')).toHaveCount(0);
    // turn the phone: the card goes by itself, the start gate is there
    await page.setViewportSize({ width: vp.height, height: vp.width }); await expect(card).toBeHidden();
    await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 });
    await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__gf, null, { timeout: 8000 }); await page.evaluate(() => (window as any).__gf.skipHook());
    await page.waitForFunction(() => (window as any).__gf.S.tick > 10, null, { timeout: 8000 });
    // upright again mid-battle: the card is back and the battle stops on its pause layer
    await page.setViewportSize({ width: vp.width, height: vp.height }); await expect(card).toBeVisible();
    await expect(page.locator('.gf-pausel.is-on')).toHaveCount(1);
    const t0 = await page.evaluate(() => (window as any).__gf.S.tick); await page.waitForTimeout(700);
    expect(await page.evaluate(() => (window as any).__gf.S.tick)).toBe(t0);
    await page.setViewportSize({ width: vp.height, height: vp.width }); await expect(card).toBeHidden();
    await expect(page.locator('.gf-pausel.is-on')).toHaveCount(1); // 继续 is his
    expect(errors).toEqual([]);
  });
});

test.describe('phone held upright mid-scene', () => {
  test.beforeEach(({}, info) => { test.skip(!/iphone13$/.test(info.project.name), 'one phone'); });

  test('a story scene waits under 把手机横过来玩 (QA fb1 r1): its clock stops, and it goes on when the phone is turned back', async ({ page }) => {
    test.setTimeout(60_000);
    const vp = page.viewportSize()!; await page.setViewportSize({ width: vp.height, height: vp.width });
    const errors = await open(page, won(['1-1'], { story: ['map.guide', 'tut.1-1'] }));
    void page.evaluate(() => (window as any).__gfApp.story('dock')).catch(() => {});
    await page.waitForFunction(() => (window as any).__gfStory, null, { timeout: 8000 }); await page.waitForTimeout(500);
    // near the end of shot 1, then upright: unpaused it would move on within dur + 4 s
    await page.evaluate(() => { const s = (window as any).__gfStory; s.seek(0, s.dur() - 0.3); });
    await page.setViewportSize(vp); await expect(page.locator('.gf-rotate')).toBeVisible();
    await page.waitForTimeout(5500);
    expect(await page.evaluate(() => (window as any).__gfStory.shot())).toBe(0);
    await page.setViewportSize({ width: vp.height, height: vp.width }); await expect(page.locator('.gf-rotate')).toBeHidden();
    await page.waitForFunction(() => (window as any).__gfStory.shot() > 0, null, { timeout: 15000 });
    expect(errors).toEqual([]);
  });
});

test.describe('phone landscape', () => {
  test.beforeEach(({}, info) => { test.skip(!/land/.test(info.project.name), 'phone landscape projects'); });

  test('1-1: the HUD is on screen, nothing overlaps, targets ≥ 44 px, text ≥ 13 px; a drag places the card', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = await open(page, null); const vp = page.viewportSize()!;
    await page.waitForFunction(() => (window as any).__gf, null, { timeout: 8000 }); await page.evaluate(() => (window as any).__gf.skipHook());
    await page.waitForTimeout(2600);
    const ctl = ['.kit-back', '.gf-bin', '.gf-tray', '.gf-shovel', '.gf-box', '.gf-pause', '.gf-scroll', '.gf-mozi', '.gf-replay', '.gf-star3', '.gf-speed', '.gf-luban'];
    const b = await boxes(page, ctl);
    expect(b.length).toBe(ctl.length);
    for (const x of b) expect(inside(x, vp.width, vp.height), `${x.sel} on screen`).toBe(true);
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) expect(meet(b[i], b[j]), `${b[i].sel} × ${b[j].sel}`).toBe(false);
    const g = await page.evaluate(() => { const q = (window as any).__gf.stage.geo; return { x: q.bx, y: q.by, w: q.bw, h: q.bh, tw: q.w, th: q.h, phone: q.phone }; });
    // (a 4-inch phone held sideways is 568 px wide: the sand table's cells are 42 px there — 9½ tiles between the columns)
    expect(g.phone).toBe(true); expect(g.tw).toBeGreaterThanOrEqual(vp.width < 600 ? 42 : 44); expect(g.th).toBeGreaterThanOrEqual(vp.width < 600 ? 42 : 44);
    for (const x of b) expect(meet(x, g), `${x.sel} off the board`).toBe(false);
    // the board takes most of the screen: ≥ 45 % of its area at 844×390
    if (vp.width >= 800) expect((g.w * g.h) / (vp.width * vp.height)).toBeGreaterThan(0.45);
    const small = await boxes(page, ['.gf-card', '.gf-tool', '.gf-speed__b', '.gf-replay', '.gf-mozi', '.gf-star3', '.gf-box']);
    for (const x of small) expect(Math.min(x.w, x.h), `${x.sel} ≥ 44 px`).toBeGreaterThanOrEqual(44);
    const tiny = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.gf-hud *')].filter((e) => e.offsetWidth > 0 && getComputedStyle(e).display !== 'none' && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && parseFloat(getComputedStyle(e).fontSize) < 13).map((e) => `${e.className}:${getComputedStyle(e).fontSize}:${e.textContent}`));
    expect(tiny).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
    // drag the card to 第 3 路 第 2 格 (drop = 0.6 tile above the finger)
    const card = await page.locator('.gf-card[data-card="shooter"]').boundingBox();
    const cell = await page.evaluate(() => (window as any).__gf.cell(2, 1));
    await page.waitForFunction(() => (window as any).__gf.S.grain >= 80 || (window as any).__gf.S.grain >= 50, null, { timeout: 5000 });
    await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2); await page.mouse.down();
    await page.mouse.move(cell.x, cell.y + g.th * 0.6 - g.th * 0.3, { steps: 8 }); await page.mouse.up();
    await page.waitForFunction(() => (window as any).__gf.S.units.length > 0, null, { timeout: 3000 });
    await page.screenshot({ path: `${process.env.KG_SHOTS_DIR}/fb1-phone/${test.info().project.name}-1-1.png` });
    expect(errors).toEqual([]);
  });

  test('short screens too (QA fb1 r1): one speed button that cycles, the tools apart, the 附加题 slip whole, 鲁班 off lane 1', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = await open(page, won(V1.slice(0, 7))); const vp = page.viewportSize()!;
    await page.evaluate(() => (window as any).__gfApp.play('1-8', ['bank', 'shooter', 'wall', 'lobber', 'spikes', 'pit']));
    await page.waitForFunction(() => (window as any).__gf, null, { timeout: 8000 }); await page.evaluate(() => (window as any).__gf.skipHook?.()); await page.waitForTimeout(900);
    // the speed: one button showing the current speed; a tap moves on 1× → 1.5× → 慢 → 1×
    const shown = (): Promise<string[]> => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.gf-hud .gf-speed__b')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.dataset.s!));
    const seq: string[] = [];
    for (let i = 0; i < 4; i++) { const v = await shown(); expect(v.length).toBe(1); seq.push(v[0]); await page.locator('.gf-hud .gf-speed__b.is-on').click(); await page.waitForTimeout(150); }
    expect(seq).toEqual(['1', '1.5', '0.75', '1']);
    // 鲁班 · ⏸ · 机关匣 · 铲子 · speed: on screen, apart, ≥ 44 px
    const t = await boxes(page, ['.gf-luban', '.gf-pause', '.gf-box', '.gf-shovel', '.gf-speed']); expect(t.length).toBe(5);
    for (let i = 0; i < t.length; i++) { expect(inside(t[i], vp.width, vp.height), t[i].sel).toBe(true); expect(Math.min(t[i].w, t[i].h)).toBeGreaterThanOrEqual(44); for (let j = i + 1; j < t.length; j++) expect(meet(t[i], t[j]), `${t[i].sel} × ${t[j].sel}`).toBe(false); }
    // the 附加题 slip: everything shown in it stays inside it
    const s3 = await page.evaluate(() => { const c = document.querySelector('.gf-star3')!.getBoundingClientRect(); return [...document.querySelectorAll<HTMLElement>('.gf-star3 > *')].filter((e) => getComputedStyle(e).display !== 'none' && e.offsetWidth > 0).map((e) => { const r = e.getBoundingClientRect(); return `${e.className}:${r.top >= c.top - 1 && r.bottom <= c.bottom + 1 && r.left >= c.left - 1 && r.right <= c.right + 1}`; }); });
    expect(s3.length).toBeGreaterThan(1); for (const x of s3) expect(x).toMatch(/:true$/);
    // …and its live count is never cut (the condition may end in … on the narrowest phones: a tap shows it whole)
    const n = await page.evaluate(() => { const e = document.querySelector<HTMLElement>('.gf-star3__n')!; return { shown: getComputedStyle(e).display !== 'none', text: e.textContent, sw: e.scrollWidth, cw: e.clientWidth }; });
    expect(n.shown).toBe(true); expect(n.text).toMatch(/\d\/\d/); expect(n.sw).toBeLessThanOrEqual(n.cw + 1);
    // 鲁班's longest line: one row over the bamboo scroll, clear of lane 1, taps go through it
    await page.evaluate(() => (window as any).__gf.luban('fort.luban.win')); await page.waitForTimeout(500);
    const lb = await page.evaluate(() => { const b = document.querySelector<HTMLElement>('.gf-bubble--luban')!; const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right, h: r.height, by: (window as any).__gf.stage.geo.by, pe: getComputedStyle(b).pointerEvents }; });
    expect(lb.bottom).toBeLessThanOrEqual(lb.by); expect(lb.h).toBeLessThan(40); expect(lb.pe).toBe('none'); expect(lb.right).toBeLessThanOrEqual(vp.width);
    // a tap on the slip: 墨子's bubble shows the whole condition while it is read
    await page.locator('.gf-star3').click(); await expect(page.locator('.gf-bubble--mozi')).toContainText('礌石');
    await page.screenshot({ path: `${process.env.KG_SHOTS_DIR}/fb1-phone/${test.info().project.name}-1-8-short.png` });
    expect(errors).toEqual([]);
  });

  test('a 7-card deck (2-10) keeps two tray columns and a 44-px board; the pause layer fits', async ({ page }) => {
    const all = [...V1, '1-11', '2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8', '2-9'];
    const errors = await open(page, won(all, { current: '2-10', story: ['prologue', 'dock', 'map.guide', 'map.night', 'v1end', 'v2open', 'tut.1-1'] })); const vp = page.viewportSize()!;
    await page.evaluate(() => (window as any).__gfApp.play('2-10', ['bank', 'shooter', 'radial', 'wall', 'lobber', 'gust', 'hook']));
    await page.waitForFunction(() => (window as any).__gf, null, { timeout: 8000 }); await page.waitForTimeout(800);
    const b = await boxes(page, ['.gf-tray', '.gf-card', '.gf-speed', '.gf-luban', '.gf-star3', '.gf-box']);
    for (const x of b) expect(inside(x, vp.width, vp.height), `${x.sel} on screen`).toBe(true);
    const cards = b.filter((x) => x.sel === '.gf-card'); expect(cards.length).toBe(7);
    expect(new Set(cards.map((c) => c.x)).size).toBe(2);
    for (const c of cards) expect(Math.min(c.w, c.h)).toBeGreaterThanOrEqual(44);
    // (568 wide, two card columns: 36-px cells — the most a 4-inch phone has between the tray and the tools; the cards stay ≥ 44)
    const g = await page.evaluate(() => (window as any).__gf.stage.geo); expect(Math.min(g.w, g.h)).toBeGreaterThanOrEqual(vp.width < 600 ? 36 : 44);
    await page.evaluate(() => (window as any).__gf.pause()); await page.waitForTimeout(400);
    const p = await boxes(page, ['.gf-pausel__panel', '.gf-pausel__panel .xg-btn', '.gf-pausel__speed .gf-speed__b']);
    for (const x of p) { expect(inside(x, vp.width, vp.height), `${x.sel} on screen`).toBe(true); if (x.sel !== '.gf-pausel__panel') expect(x.h).toBeGreaterThanOrEqual(44); }
    expect(p.filter((x) => x.sel === '.gf-pausel__speed .gf-speed__b').length).toBe(3);
    await page.screenshot({ path: `${process.env.KG_SHOTS_DIR}/fb1-phone/${test.info().project.name}-2-10-pause.png` });
    expect(errors).toEqual([]);
  });

  test('menus fit: map, 亮招 + 选牒, 设置, 图谱, the result card', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = await open(page, won(V1.slice(0, 7))); const vp = page.viewportSize()!;
    const check = async (sels: string[], what: string, minTap = 44): Promise<void> => {
      const b = await boxes(page, sels); expect(b.length, what).toBeGreaterThan(0);
      for (const x of b) { expect(inside(x, vp.width, vp.height), `${what}: ${x.sel} on screen ${JSON.stringify(x)}`).toBe(true); expect(Math.min(x.w, x.h), `${what}: ${x.sel} ≥ ${minTap}`).toBeGreaterThanOrEqual(minTap); }
      expect(await page.evaluate(() => document.documentElement.scrollWidth), what).toBeLessThanOrEqual(vp.width);
    };
    await page.waitForTimeout(600);
    await check(['.gf-map .xg-node', '.gf-map__gear', '.gf-bigcard', '.gf-tabs button', '.gf-song'], 'map');
    // 亮招 + 选牒 (1-8 chooses 6 of 8)
    await page.locator('.xg-node').nth(7).click(); await page.waitForTimeout(1400);
    await check(['.gf-pv__go', '.gf-slot', '.gf-poolcard', '.gf-pv__bonus', '.gf-back'], 'preview');
    await page.screenshot({ path: `${process.env.KG_SHOTS_DIR}/fb1-phone/${test.info().project.name}-preview.png` });
    await page.locator('.gf-back').click(); await page.waitForTimeout(700);
    // 设置: the ribbon stays on screen, every row and replay button reachable
    await page.locator('.gf-map__gear').click(); await page.waitForTimeout(500);
    await check(['.gf-set__row', '.gf-set__chips .xg-btn', '.gf-set .xg-modal__close'], 'settings');
    const rib = await boxes(page, ['.gf-set .xg-ribbon']); expect(inside(rib[0], vp.width, vp.height)).toBe(true);
    await page.screenshot({ path: `${process.env.KG_SHOTS_DIR}/fb1-phone/${test.info().project.name}-settings.png` });
    await page.locator('.gf-set .xg-modal__close').click(); await page.waitForTimeout(400);
    // 图谱
    await page.locator('.gf-bigcard--alm').click(); await page.waitForTimeout(700);
    await check(['.gf-alm__tabs button', '.gf-back'], 'almanac');
    await page.locator('.gf-back').click(); await page.waitForTimeout(600);
    // the result card after 1-5 (宋城 close-up + 学会了): buttons and ribbon on screen
    await page.evaluate(() => (window as any).__gfApp.win('1-8', 3)); await page.waitForTimeout(1500);
    await check(['.gf-resultp .xg-btn[data-act]'], 'result');
    const rr = await boxes(page, ['.gf-resultp .xg-ribbon', '.gf-resultp', '.gf-resultp .xg-result-stars']); for (const x of rr) expect(inside(x, vp.width, vp.height), `result ${x.sel}`).toBe(true);
    await page.screenshot({ path: `${process.env.KG_SHOTS_DIR}/fb1-phone/${test.info().project.name}-result.png` });
    expect(errors).toEqual([]);
  });
});
