/**
 * 机关守城 · flow (spec §2.4, §9.9, §10.1): both orientations. First visit goes straight into 1-1; the first card
 * can be placed ≤ 8 s after the start gate; the first machine is dismantled ≤ 35 s of game time after a placement
 * at 墨子's hint cell; no console errors; no page overflow; the HUD stays inside the viewport. Also: the 驿马 rack
 * (1-6), the Boss bar (1-11), the assist offers after 3 losses, the ghost replay and the 图谱 open without errors.
 */
import { expect, test, type Page } from '@playwright/test';

const KEY = 'kg:v1:gear-fort';
const won = (ids: string[], extra: Record<string, unknown> = {}): string => JSON.stringify({ v: 1, updatedAt: Date.now(), data: {
  levels: Object.fromEntries(ids.map((id) => [id, { best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' }])), current: ids.length ? `1-${Math.min(11, ids.length + 1)}` : '1-1', ...extra } });
const V1 = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10'];

async function open(page: Page, save: string | null): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('/gear-fort/?test=1');
  await page.evaluate(([k, s]) => { localStorage.clear(); if (s) localStorage.setItem(k as string, s as string); }, [KEY, save]);
  await page.goto('/gear-fort/?test=1', { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  return errors;
}
async function noOverflow(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight; const out: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>('.gf-hud > *')) { if (getComputedStyle(e).display === 'none' || !e.offsetWidth) continue; const b = e.getBoundingClientRect(); if (b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1) out.push(`${e.className} ${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`); }
    return { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, W, H, out };
  });
  expect(r.sw).toBeLessThanOrEqual(r.W); expect(r.sh).toBeLessThanOrEqual(r.H); expect(r.out).toEqual([]);
}

test('first visit: 1-1 at once, first place ≤ 8 s, first machine gone ≤ 35 s', async ({ page }) => {
  test.setTimeout(90_000);
  const t0 = Date.now(); const errors = await open(page, null);
  await page.waitForSelector('.gf-card[data-card="shooter"]', { timeout: 8000 });
  await page.waitForFunction(() => { const g = (window as any).__gf; return g && g.S.tick >= 1 && g.S.grain >= 50; }, null, { timeout: 8000 });
  // drag the card to 墨子's hint cell (第 3 路 第 2 格): drop cell = 0.6 tile above the finger
  const card = await page.locator('.gf-card[data-card="shooter"]').boundingBox();
  const cell = await page.evaluate(() => (window as any).__gf.cell(2, 1));
  const tile = await page.evaluate(() => { const c = document.querySelector('.gf-stage') as HTMLCanvasElement; return c ? 0 : 0; });
  void tile;
  const geoH = await page.evaluate(() => { const g = (window as any).__gf; return g.cell(3, 1).y - g.cell(2, 1).y; });
  await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2); await page.mouse.down();
  await page.mouse.move(cell.x, cell.y - geoH * 0.3 + geoH * 0.6, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => (window as any).__gf.S.units.length > 0, null, { timeout: 3000 });
  expect(Date.now() - t0).toBeLessThan(8000 + 6000); // ≤ 8 s of the child's time; +6 s for page load in CI
  const placedTick = await page.evaluate(() => (window as any).__gf.S.tick);
  expect(placedTick / 20).toBeLessThanOrEqual(8);
  await page.evaluate(() => (window as any).__gf.setSpeed(3));
  await page.waitForFunction(() => (window as any).__gf.S.stats && ((window as any).__gf.S.ev || []).some((e: any) => e.type === 'gone' && !e.log), null, { timeout: 40_000 });
  const goneTick = await page.evaluate(() => ((window as any).__gf.S.ev || []).find((e: any) => e.type === 'gone' && !e.log).tick ?? (window as any).__gf.S.tick);
  expect(goneTick / 20).toBeLessThanOrEqual(35);
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('1-6 rack: 驿马 brings cards; 鲁班按手 before the first 大波', async ({ page }) => {
  const errors = await open(page, won(V1.slice(0, 5)));
  await page.locator('.xg-node').nth(5).click(); await page.locator('.gf-pv__go').click();
  await page.waitForSelector('.gf-tray--rack');
  await page.evaluate(() => (window as any).__gf.setSpeed(12));
  await page.waitForFunction(() => (window as any).__gf.S.belt.length >= 2, null, { timeout: 20_000 });
  await expect(page.locator('.gf-tray--rack .gf-card[data-card]')).toHaveCount(await page.evaluate(() => (window as any).__gf.S.belt.length));
  await page.waitForSelector('.gf-warn', { timeout: 30_000 });
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('1-11 Boss bar replaces the bamboo scroll', async ({ page }) => {
  const errors = await open(page, won(V1));
  await page.locator('.xg-node').nth(10).click(); await page.locator('.gf-pv__go').click();
  await expect(page.locator('.gf-boss')).toBeVisible(); await expect(page.locator('.gf-scroll')).toBeHidden();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('3 losses → debrief offers ghost + both assist tiers; ghost replay plays and returns', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page, won(['1-1', '1-2'], { lossStreak: { '1-3': 2 } }));
  await page.locator('.xg-node').nth(2).click(); await page.locator('.gf-pv__go').click();
  await page.waitForFunction(() => !!(window as any).__gf?.S);
  await page.evaluate(() => { const g = (window as any).__gf; g.S.logs = [1, 1, 1, 1, 1]; g.setSpeed(20); });
  await page.waitForSelector('.gf-debrief', { timeout: 60_000 });
  await expect(page.locator('.gf-helpcard')).toHaveCount(3);
  await noOverflow(page);
  await page.locator('.gf-helpcard[data-a="ghost"]').click();
  await page.waitForSelector('.gf-battle.is-ghost', { timeout: 8000 });
  await page.evaluate(() => (window as any).__gf.setSpeed(20));
  await page.waitForSelector('.gf-debrief', { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('图谱 opens from the map; a met page reads', async ({ page }) => {
  const errors = await open(page, won(V1.slice(0, 4)));
  await page.locator('.gf-bigcard--alm').click();
  await expect(page.locator('.gf-alm__tile:not(.is-locked)').first()).toBeVisible();
  await page.locator('.gf-alm__tile:not(.is-locked)').first().click();
  await expect(page.locator('.gf-alm__page.is-on')).toBeVisible();
  expect(errors).toEqual([]);
});

test('after a win: 宋城 close-up → 序幕 + 码头 (first 1-1) → map; 驿站 after 1-3 with 讲给爸爸听 and two equal buttons', async ({ page }) => {
  const errors = await open(page, won([]));
  await page.waitForTimeout(800); // first visit = 1-1 battle; finish it through the app hook
  await page.evaluate(() => (window as unknown as { __gfApp: { win(id: string, s: number): void } }).__gfApp.win('1-1', 2));
  await expect(page.locator('.gf-repair canvas')).toBeVisible();
  await page.getByRole('button', { name: '回地图' }).click();
  await expect(page.locator('.gf-story--prologue')).toBeVisible(); await page.locator('.gf-skip').click();
  await expect(page.locator('.gf-story--dock')).toBeVisible(); await page.locator('.gf-skip').click();
  await expect(page.locator('.gf-song')).toContainText('1/22');
  // 1-3 is the first 驿站
  await page.evaluate(() => (window as unknown as { __gfApp: { win(id: string, s: number): void } }).__gfApp.win('1-3', 3));
  await page.getByRole('button', { name: '回地图' }).click();
  await expect(page.locator('.gf-inn')).toBeVisible();
  const [a, b] = await page.locator('.gf-inn__acts button').evaluateAll((bs) => bs.map((x) => x.getBoundingClientRect().width));
  expect(Math.abs(a - b)).toBeLessThan(2);
  await page.mouse.click(200, 200); await page.mouse.click(200, 200); // tap through the two lines
  await expect(page.locator('.gf-inn__ui.is-ask .gf-ask')).toContainText('讲给爸爸听');
  await page.getByRole('button', { name: /今天就到这里/ }).click();
  await expect(page.locator('.gf-map')).toBeVisible();
  const story = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:gear-fort')!).data.story as string[]);
  expect(story).toEqual(expect.arrayContaining(['prologue', 'dock', 'inn.1-3']));
  expect(errors).toEqual([]);
});

// ───── QA r1 fixes ─────
test('1-1 hook: the kernel waits at tick 0, a tap skips it', async ({ page }) => {
  const errors = await open(page, null);
  await page.waitForFunction(() => !!(window as any).__gf);
  expect(await page.evaluate(() => (window as any).__gf.hooking)).toBe(true);
  await page.waitForTimeout(600); expect(await page.evaluate(() => (window as any).__gf.S.tick)).toBe(0);
  await page.locator('.gf-hook').dispatchEvent('pointerdown');
  await page.waitForFunction(() => !(window as any).__gf.hooking && (window as any).__gf.S.tick > 0, null, { timeout: 3000 });
  expect(errors).toEqual([]);
});

test('input: a 2nd finger or a cancelled gesture places nothing (spec §2.7)', async ({ page }) => {
  const errors = await open(page, won(['1-1', '1-2'], { current: '1-3' }));
  await page.evaluate(() => (window as any).__gfApp.battle((window as any).__gfApp.level('1-3'), ['shooter', 'farm', 'wall']));
  await page.waitForFunction(() => (window as any).__gf?.S.tick > 2);
  const r = await page.evaluate(async () => {
    const g = (window as any).__gf; const card = document.querySelector('.gf-card[data-card="shooter"]')!; const b = card.getBoundingClientRect(); const c = g.cell(2, 3);
    const pe = (t: string, id: number, x: number, y: number, prim: boolean, target: EventTarget = window): boolean => target.dispatchEvent(new PointerEvent(t, { pointerId: id, isPrimary: prim, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
    pe('pointerdown', 11, b.x + b.width / 2, b.y + b.height / 2, true, card); pe('pointermove', 12, c.x, c.y + 30, false); pe('pointerup', 12, c.x, c.y + 30, false);
    await new Promise((res) => setTimeout(res, 250)); const a = g.S.units.length;
    pe('pointermove', 11, c.x, c.y + 30, true); pe('pointercancel', 11, c.x, c.y + 30, true);
    await new Promise((res) => setTimeout(res, 250)); return { a, b: g.S.units.length, ghosts: document.querySelectorAll('.gf-dragghost').length };
  });
  expect(r).toEqual({ a: 0, b: 0, ghosts: 0 });
  expect(errors).toEqual([]);
});

test('图谱: 牒/机关/Boss/锦囊 tabs, every tile on screen, tabs ≥ 48 px', async ({ page }) => {
  const all = [...V1, '1-11', '2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8', '2-9', '2-10', '2-11'];
  const errors = await open(page, won(all, { current: '2-11' }));
  await page.locator('.gf-bigcard--alm').click();
  for (const t of ['card', 'machine', 'boss', 'jn']) {
    await page.locator(`.gf-alm__tab[data-tab="${t}"]`).click();
    const r = await page.evaluate(() => { const W = innerWidth, H = innerHeight; const ts = [...document.querySelectorAll('.gf-alm__tile')]; return { n: ts.length, off: ts.filter((e) => { const b = e.getBoundingClientRect(); return b.left < 0 || b.top < 0 || b.right > W || b.bottom > H; }).length }; });
    expect(r.n, t).toBeGreaterThan(0); expect(r.off, t).toBe(0);
  }
  const tabH = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.gf-alm__tab')].map((e) => e.getBoundingClientRect().height)));
  expect(tabH).toBeGreaterThanOrEqual(48);
  await page.locator('.gf-back').click(); await expect(page.locator('.gf-map')).toBeVisible();
  const mapTabH = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.gf-tabs button')].map((e) => e.getBoundingClientRect().height)));
  expect(mapTabH).toBeGreaterThanOrEqual(48);
  // the map is the resting screen: no idle requestAnimationFrame loop once the 宋城 plaque has settled
  await page.waitForTimeout(3500);
  const raf = await page.evaluate(() => new Promise<number>((res) => { let n = 0; const o = window.requestAnimationFrame; window.requestAnimationFrame = (f) => { n++; return o.call(window, f); }; setTimeout(() => { window.requestAnimationFrame = o; res(n); }, 1500); }));
  expect(raf).toBeLessThanOrEqual(3);
  expect(errors).toEqual([]);
});

test('assisted loss → 从第 N 面战鼓重来 keeps the tier; the game is logged for calibration', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page, won(['1-1', '1-2'], { current: '1-3' }));
  await page.evaluate(() => (window as any).__gfApp.play('1-3', ['shooter', 'farm', 'wall'], 2));
  await page.waitForFunction(() => (window as any).__gf?.tier === 2);
  await page.evaluate(() => (window as any).__gf.setSpeed(20));
  await page.waitForFunction(() => { const g = (window as any).__gf; return g.S.flags.length && g.S.tick > g.S.flags[0] + 2; }, null, { timeout: 40_000 });
  await page.evaluate(() => { const g = (window as any).__gf; g.S.logs = [9, 9, 9, 9, 9]; });
  await page.waitForSelector('.gf-debrief [data-a="checkpoint"]', { timeout: 60_000 });
  expect(await page.locator('.gf-db__panel p').count()).toBeGreaterThanOrEqual(2);
  const reps = await page.evaluate(() => (window as any).__gfReplays());
  expect(reps.length).toBeGreaterThanOrEqual(1);
  const last = reps[reps.length - 1]; expect(last.level).toBe('1-3'); expect(last.result).toBe('lose'); expect(last.assist).toBe(2);
  expect(JSON.stringify(last).length).toBeLessThanOrEqual(8 * 1024);
  await page.locator('.gf-debrief [data-a="checkpoint"]').click();
  await page.waitForFunction(() => (window as any).__gf?.S.tick > 0);
  expect(await page.evaluate(() => (window as any).__gf.tier)).toBe(2);
  await expect(page.locator('.gf-speed__b.is-on')).toHaveText('慢');
  expect(errors).toEqual([]);
});

// ── QA r2 regressions ──────────────────────────────────────────────────────────────────────────────────────
test('r2: copying the demo hand exactly places the card on 第 3 路 第 2 格 (drop = 0.6 tile above the finger)', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await open(page, null);
  await page.waitForFunction(() => (window as any).__gf, null, { timeout: 8000 }); await page.evaluate(() => (window as any).__gf.skipHook());
  await page.waitForFunction(() => { const h = document.querySelector<HTMLElement>('.gf-hand'); return !!h && getComputedStyle(h).display === 'block' && !!h.dataset.tip; }, null, { timeout: 20_000 });
  const g = await page.evaluate(() => { const hud = document.querySelector('.gf-hud')!.getBoundingClientRect(); const [x, y] = document.querySelector<HTMLElement>('.gf-hand')!.dataset.tip!.split(',').map(Number); const c = document.querySelector('.gf-card[data-card="shooter"]')!.getBoundingClientRect();
    return { tip: { x: hud.left + x, y: hud.top + y }, card: { x: c.left + c.width / 2, y: c.top + c.height / 2 } }; });
  await page.mouse.move(g.card.x, g.card.y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(g.card.x + ((g.tip.x - g.card.x) * i) / 10, g.card.y + ((g.tip.y - g.card.y) * i) / 10);
  await expect(page.locator('.gf-cellhint.is-ok')).toHaveAttribute('data-cell', '2,1,1'); // the green cell is drawn with the ghost, over the open lane
  await page.mouse.up();
  await page.waitForFunction(() => (window as any).__gf.S.units.some((u: any) => u.k === 'shooter' && u.lane === 2 && u.col === 1), null, { timeout: 3000 });
  expect(errors).toEqual([]);
});

test('r2: pause layer — the speed row is one row of ≥ 48 px buttons inside the panel; the 4 actions are one size', async ({ page }) => {
  const errors = await open(page, won(['1-1', '1-2'], { current: '1-3' }));
  await page.evaluate(() => (window as any).__gfApp.battle((window as any).__gfApp.level('1-3'), ['shooter', 'farm', 'wall']));
  await page.waitForFunction(() => (window as any).__gf?.S.tick > 2); await page.evaluate(() => (window as any).__gf.pause());
  const r = await page.evaluate(() => { const pn = document.querySelector('.gf-pausel__panel')!.getBoundingClientRect();
    const sp = [...document.querySelectorAll('.gf-pausel__speed .gf-speed__b')].map((b) => b.getBoundingClientRect());
    const acts = [...document.querySelectorAll('.gf-pausel__panel > .xg-btn')].map((b) => b.getBoundingClientRect());
    return { n: sp.length, minH: Math.min(...sp.map((b) => b.height)), inside: sp.every((b) => b.bottom <= pn.bottom + 1 && b.right <= pn.right + 1 && b.left >= pn.left - 1), oneRow: new Set(sp.map((b) => Math.round(b.top))).size, sizes: new Set(acts.map((b) => `${Math.round(b.width)}x${Math.round(b.height)}`)).size };
  });
  expect(r).toEqual({ n: 3, minH: expect.any(Number), inside: true, oneRow: 1, sizes: 1 }); expect(r.minH).toBeGreaterThanOrEqual(48);
  expect(errors).toEqual([]);
});

test('r2: a tap on the 复盘 ends its narration chain — nothing of it plays on the next screen', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page, won(['1-1', '1-2'], { lossStreak: { '1-3': 2 } }));
  await page.locator('.xg-node').nth(2).click(); await page.locator('.gf-pv__go').click();
  await page.waitForFunction(() => !!(window as any).__gf?.S);
  await page.evaluate(() => { const g = (window as any).__gf; g.S.logs = [1, 1, 1, 1, 1]; g.setSpeed(20); });
  await page.waitForSelector('.gf-debrief', { timeout: 60_000 }); await page.waitForTimeout(300);
  const n0 = await page.evaluate(() => (window as any).__gfApp.voice.log.length);
  await page.locator('.gf-debrief [data-a="map"]').click(); await page.waitForTimeout(3500);
  const after: string[] = await page.evaluate((n) => (window as any).__gfApp.voice.log.slice(n), n0);
  expect(after.filter((x) => /^fort\.(fail|tip|good|result)\./.test(x))).toEqual([]);
  expect(errors).toEqual([]);
});

test('r2: 🏠 mid-battle asks first; 接着推演 from the map opens on the pause layer at the same tick', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await open(page, won(['1-1', '1-2'], { current: '1-3' }));
  await page.locator('.xg-node').nth(2).click(); await page.locator('.gf-pv__go').click();
  await page.waitForFunction(() => (window as any).__gf?.S.tick > 40, null, { timeout: 15_000 });
  const home = await page.locator('.kit-back').boundingBox(); expect(Math.min(home!.width, home!.height)).toBeGreaterThanOrEqual(56);
  await page.locator('.kit-back').click();
  await expect(page.locator('.gf-pausel__home')).toBeVisible(); // asked first, still in the game
  const tick = await page.evaluate(() => (window as any).__gf.S.tick);
  await page.locator('.gf-pausel__home [data-h="go"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/gear-fort'), { timeout: 10_000 });
  await page.goto('/gear-fort/?test=1', { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.locator('.gf-resume [data-a="yes"]').click({ timeout: 10_000 });
  await page.waitForFunction(() => (window as any).__gf?.S, null, { timeout: 10_000 });
  await expect(page.locator('.gf-pausel.is-on')).toBeVisible();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as any).__gf.S.tick)).toBe(tick); // paused: the clock waits for the child
  expect(errors).toEqual([]);
});

test('r2: 选牒 with 7 slots (2-10, 2-11): every slot inside the deck panel', async ({ page }) => {
  const V2 = ['2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8', '2-9'];
  for (const [id, done] of [['2-10', V2], ['2-11', [...V2, '2-10']]] as const) {
    await open(page, won([...V1, '1-11', ...done], { current: id }));
    await page.locator('.xg-node--current').first().click(); await page.waitForSelector('.gf-pv__slots .gf-slot', { timeout: 10_000 });
    const r = await page.evaluate(() => { const pn = document.querySelector('.gf-pv__deck')!.getBoundingClientRect(); const ss = [...document.querySelectorAll('.gf-pv__slots .gf-slot')].map((s) => s.getBoundingClientRect());
      return { n: ss.length, out: ss.filter((s) => s.right > pn.right - 2 || s.left < pn.left + 2 || s.top < pn.top).length, minW: Math.round(Math.min(...ss.map((s) => s.width))) }; });
    expect(r.n, id).toBe(7); expect(r.out, id).toBe(0); expect(r.minW, id).toBeGreaterThanOrEqual(40);
  }
});

// ───────── QA round 3 ─────────
test('r3: platform smoke marker is up before the start gate is tapped', async ({ page }) => {
  await page.goto('/gear-fort/?test=1', { waitUntil: 'load' });
  await page.waitForSelector('#app[data-gate], #app[data-ready]', { state: 'attached', timeout: 15_000 });
});

test('r3: 1-1 collect demo — tapping the hand\'s fingertip collects the bag (+20 粮); the drag demo hides on a card press', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page, null);
  await page.waitForFunction(() => (window as any).__gf, null, { timeout: 10_000 }); await page.evaluate(() => (window as any).__gf.skipHook());
  await page.waitForFunction(() => { const h = document.querySelector<HTMLElement>('.gf-hand'); return h && getComputedStyle(h).display === 'block' && h.dataset.kind === 'drag'; }, null, { timeout: 20_000 });
  const card = (await page.locator('.gf-card[data-card="shooter"]').boundingBox())!;
  const lift = await page.evaluate(() => { const hud = document.querySelector('.gf-hud')!.getBoundingClientRect(); const [x, y] = document.querySelector<HTMLElement>('.gf-hand')!.dataset.tip!.split(',').map(Number); return { x: hud.left + x, y: hud.top + y }; });
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2); await page.mouse.down(); await page.waitForTimeout(120);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.gf-hand')!).display)).toBe('none'); // the child took over
  for (let i = 1; i <= 10; i++) await page.mouse.move(card.x + card.width / 2 + ((lift.x - card.x - card.width / 2) * i) / 10, card.y + card.height / 2 + ((lift.y - card.y - card.height / 2) * i) / 10);
  await page.mouse.up(); await page.waitForTimeout(200);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.gf-hand')!).display)).toBe('none'); // no demo left over the placed card
  await page.waitForFunction(() => (window as any).__gf.S.units.some((u: any) => u.k === 'shooter' && u.lane === 2 && u.col === 1), null, { timeout: 3000 });
  await page.evaluate(() => (window as any).__gf.setSpeed(3));
  await page.waitForFunction(() => { const h = document.querySelector<HTMLElement>('.gf-hand'); return h && getComputedStyle(h).display === 'block' && h.dataset.kind === 'tap'; }, null, { timeout: 40_000 });
  await page.evaluate(() => (window as any).__gf.setSpeed(1));
  await page.waitForTimeout(900); // the bag has landed
  const tip = await page.evaluate(() => { const hud = document.querySelector('.gf-hud')!.getBoundingClientRect(); const [x, y] = document.querySelector<HTMLElement>('.gf-hand')!.dataset.tip!.split(',').map(Number); return { x: hud.left + x, y: hud.top + y, g: (window as any).__gf.S.grain }; });
  await page.mouse.click(tip.x, tip.y);
  await page.waitForFunction((g0) => (window as any).__gf.S.grain >= g0 + 20, tip.g, { timeout: 3000 });
  expect(errors).toEqual([]);
});

test('r3: 接着推演 after a 战鼓 keeps 「从第 1 面战鼓重来」 (suspend resume restores the checkpoint)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page, won(['1-1', '1-2'], { current: '1-3' }));
  await page.locator('.xg-node').nth(2).click(); await page.locator('.gf-pv__go').click();
  await page.waitForFunction(() => (window as any).__gf?.S.tick > 20, null, { timeout: 15_000 });
  for (let l = 0; l < 5; l++) for (const c of [0, 1]) { await page.evaluate(([l, c]) => { const g = (window as any).__gf; g.S.grain = 5000; for (const k of Object.keys(g.S.cdReady)) g.S.cdReady[k] = 0; g.place('shooter', l, c); }, [l, c]); await page.waitForTimeout(90); }
  await page.evaluate(() => (window as any).__gf.setSpeed(12));
  await page.waitForFunction(() => (window as any).__gf.S.tick > 1520, null, { timeout: 60_000 });
  await page.locator('.kit-back').click(); await page.locator('.gf-pausel__home [data-h="go"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/gear-fort'), { timeout: 10_000 });
  await page.goto('/gear-fort/?test=1', { waitUntil: 'load' }); // a fresh page: the snapshots come back from IndexedDB
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.locator('.gf-resume [data-a="yes"]').click({ timeout: 10_000 });
  await expect(page.locator('.gf-pausel.is-on [data-a="cp"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('r3: no idle 60 fps loop — pause layer and 驿站 stop drawing', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); (window as any).__rafN = 0; window.requestAnimationFrame = (cb) => raf((t) => { (window as any).__rafN++; cb(t); }); });
  const errors = await open(page, won(['1-1', '1-2'], { current: '1-3' }));
  const rate = async (ms = 2000): Promise<number> => { const a = await page.evaluate(() => (window as any).__rafN); await page.waitForTimeout(ms); const b = await page.evaluate(() => (window as any).__rafN); return ((b - a) * 1000) / ms; };
  await page.evaluate(() => (window as any).__gfApp.play('1-3', ['shooter', 'farm', 'wall']));
  await page.waitForFunction(() => (window as any).__gf?.S.tick > 20, null, { timeout: 15_000 });
  await page.evaluate(() => (window as any).__gf.pause()); await page.waitForTimeout(800);
  expect(await rate()).toBeLessThanOrEqual(2);
  await page.locator('.gf-pausel [data-a="go"]').click(); await page.waitForTimeout(300);
  expect(await rate(1000)).toBeGreaterThan(20); // running again
  await page.evaluate(() => (window as any).__gfApp.inn('1-11'));
  await page.waitForSelector('.gf-inn', { timeout: 10_000 });
  expect(await rate(1000)).toBeLessThanOrEqual(20); // the campfire flickers at ≤ 15 fps (inn's own timer; rAF only for a resize)
  await expect.poll(() => rate(2000), { timeout: 60_000, intervals: [2000] }).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
