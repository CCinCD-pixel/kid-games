/**
 * 星晶消消乐 screenshot list (spec §9.3) with the automatic assertions of each row, both orientations
 * (WebKit, iPad 9, DPR 2, touch). Shots → ~/kid-games-work/shots/emoji-match/<portrait|landscape>/s*.png
 * (play.spec.ts shoots rows 2, 11, 12, 13 and 17). V15 on the real page: every HUD element, the board
 * panel and the 🏠 corner are pairwise disjoint and inside the viewport; cell ≥ 76 (portrait 9×9) /
 * ≥ 80 (landscape 9×9); no horizontal overflow.
 */
import { expect, test, type Page } from '@playwright/test';
import { boot, goPlay, inside, land, overlap, press, settle, shot, tapCell, watchErrors, type Box } from './em';

const ALL_INTROS = ['swap', 'rocket', 'tap', 'prop', 'bomb', 'energy', 'orb', 'comboRR', 'dust', 'boosterDrill', 'dust2', 'comboBB', 'comboRB', 'crate', 'boosterTractor', 'crate2', 'comboPP', 'comboP', 'ice', 'boosterIon', 'ice2', 'comboOR'];
const won = (ids: string[], stars = 3) => Object.fromEntries(ids.map((id) => [id, { stars, bestLeft: 3, attempts: 1, wins: 1, failStreak: 0 }]));
const upTo = (last: string) => { const out: string[] = []; for (let e = 1; e <= 4; e += 1) for (let n = 1; n <= 10; n += 1) { const id = `${e}-${String(n).padStart(2, '0')}`; out.push(id); if (id === last) return out; } return out; };

async function boxes(page: Page, sels: string[]): Promise<{ sel: string; box: Box }[]> {
  return page.evaluate((ss) => ss.flatMap((s) => [...document.querySelectorAll(s)].filter((e) => (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === 'fixed').map((e, k) => { const r = e.getBoundingClientRect(); return { sel: `${s}#${k}`, box: { x: r.x, y: r.y, width: r.width, height: r.height } }; })), sels);
}
/** V15 on the page: HUD + panel + 🏠 pairwise disjoint, inside the viewport, no horizontal overflow */
async function assertLayout(page: Page, minCell: number): Promise<void> {
  const vp = page.viewportSize()!;
  const r = (await page.evaluate(() => window.__em.rects()))!;
  const panel = { sel: 'panel', box: { x: r.panel.x, y: r.panel.y, width: r.panel.w, height: r.panel.h } };
  const items = [panel, ...(await boxes(page, ['.kit-back', '.em-chip__txt', '.em-pause', '.em-moves', '.em-goal', '.em-tools .em-tool', '.em-sub-lane', '.em-head']))];
  for (const it of items) expect(inside(it.box, vp.width, vp.height), `${it.sel} inside the viewport ${JSON.stringify(it.box)}`).toBe(true);
  for (let a = 0; a < items.length; a += 1) for (let b = a + 1; b < items.length; b += 1) {
    expect(overlap(items[a].box, items[b].box), `${items[a].sel} × ${items[b].sel}`).toBe(false);
  }
  expect(r.cell).toBeGreaterThanOrEqual(minCell);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test('S0 start gate: illustration layer + a big 开始', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/emoji-match/');
  await page.waitForSelector('.kit-start__go', { timeout: 15000 });
  await page.waitForTimeout(700);
  expect((await page.locator('.kit-start__go').boundingBox())!.height).toBeGreaterThanOrEqual(64);
  expect(await page.locator('.em-gate-art').count()).toBe(1);
  await shot(page, info, 's00-gate');
  expect(errors).toEqual([]);
});

test('S4 first clear: debris + collect flight mid-way, goal 10 → 7', async ({ page }, info) => {
  await boot(page, { scale: 1 });
  await goPlay(page, '1-01', { seed: 1 });
  const lm = (await page.evaluate(() => window.__em.lessonMove()))!;
  const p = page.evaluate((m) => window.__em.play(m), lm);
  await page.waitForTimeout(330);
  await page.evaluate(() => window.__em.pause());
  await shot(page, info, 's03-first-clear-mid');
  await page.evaluate(() => window.__em.resume());
  await p; await settle(page);
  expect((await page.evaluate(() => window.__em.goals()))[0]).toBe('7');
});

test('S1 route: new save, episode 3 in progress, v1 complete (5–9 建造中)', async ({ page }, info) => {
  const vp = page.viewportSize()!;
  for (const [name, levels, arrivals] of [['new', {}, []], ['ep3', won(upTo('3-04')), [1, 2]], ['done', won(upTo('4-10')), [1, 2, 3, 4]]] as const) {
    await boot(page, { save: { levels, arrivals, firstRunDone: true } });
    await page.evaluate(() => window.__em.goto({ s: 'route' }));
    await page.waitForTimeout(700);
    const stops = await boxes(page, ['.em-stop']);
    expect(stops.length).toBe(9);
    for (const s of stops) expect(inside(s.box, vp.width, vp.height), s.sel).toBe(true);
    expect((await page.locator('.em-continue').boundingBox())!.height).toBeGreaterThanOrEqual(64);
    // V15-style (QA r1): no stop (planet + name) sits under 继续 / 机库 / 自由星海, and the buttons are disjoint
    const btns = await boxes(page, ['.em-continue', '.em-route__hangar', '.em-route__free']);
    for (let a = 0; a < btns.length; a += 1) {
      expect(inside(btns[a].box, vp.width, vp.height), btns[a].sel).toBe(true);
      for (let b = a + 1; b < btns.length; b += 1) expect(overlap(btns[a].box, btns[b].box), `${btns[a].sel} × ${btns[b].sel}`).toBe(false);
      stops.forEach((s, k) => expect(overlap(s.box, btns[a].box), `stop ${k + 1} × ${btns[a].sel}`).toBe(false));
    }
    await shot(page, info, `s04-route-${name}`);
  }
});

test('S2 maps: episodes 1 and 4 — 11 nodes in view, ≥ 48 px, the puzzle node is not a star', async ({ page }, info) => {
  const vp = page.viewportSize()!;
  for (const ep of [1, 4]) {
    await boot(page, { save: { levels: won(upTo(ep === 1 ? '1-06' : '4-05')), arrivals: ep === 4 ? [1, 2, 3] : [] } });
    await page.evaluate((e) => window.__em.goto({ s: 'map', ep: e }), ep);
    await page.waitForTimeout(800);
    const nodes = await boxes(page, ['.xg-node, .em-node, .kit-node', '.em-pnode']);
    expect(nodes.length).toBeGreaterThanOrEqual(11);
    for (const n of nodes) { expect(inside(n.box, vp.width, vp.height), n.sel).toBe(true); expect(Math.min(n.box.width, n.box.height), n.sel).toBeGreaterThanOrEqual(48); }
    expect(await page.locator('.em-pnode .xg-star, .em-pnode [data-shape="star"]').count()).toBe(0);
    await shot(page, info, `s05-map-ep${ep}`);
  }
});

test('S3 level card: three goals + the 3rd-tier assist preview, no overflow', async ({ page }, info) => {
  await boot(page, { save: { levels: { ...won(upTo('4-09')), '4-10': { stars: 0, bestLeft: 0, attempts: 6, wins: 0, failStreak: 6 } }, intros: ALL_INTROS, arrivals: [1, 2, 3] } });
  await page.evaluate(() => window.__em.goto({ s: 'card', id: '4-10' }));
  await page.waitForSelector('.em-card__go', { timeout: 8000 });
  await page.waitForTimeout(600);
  const card = (await page.locator('.xg-modal').first().boundingBox())!;
  const vp = page.viewportSize()!;
  expect(inside(card, vp.width, vp.height)).toBe(true);
  expect(await page.locator('.xg-modal .em-assist-row, .xg-modal .em-card__assist').count()).toBeGreaterThan(0);
  await shot(page, info, 's06-card-4-10-assist3');
});

test('S3a intro cards: rocket step 2, crate2 step 2, the ion cannon — subtitles ≤ 15 characters', async ({ page }, info) => {
  for (const [id, card, waitMs] of [['1-02', 'rocket', 3200], ['3-03', 'crate2', 3600], ['4-02', 'boosterIon', 2600]] as const) {
    const prev = upTo(id).slice(0, -1);
    await boot(page, { save: { levels: won(prev), intros: ALL_INTROS.slice(0, ALL_INTROS.indexOf(card)), arrivals: [1, 2, 3].filter((e) => prev.includes(`${e}-10`)), boosters: { drill: 2, tractor: 2, ion: 0 } } });
    await page.evaluate((i) => window.__em.goto({ s: 'card', id: i }), id);
    await press(page, '.em-card__go');
    await page.waitForSelector('.em-intro', { timeout: 8000 });
    await page.waitForTimeout(waitMs);
    const sub = await page.evaluate(() => document.querySelector('.em-intro .kit-subtitle__text')?.textContent ?? '');
    expect([...sub].length, sub).toBeLessThanOrEqual(15);
    expect(sub.length).toBeGreaterThan(0);
    await shot(page, info, `s07-intro-${card}`);
  }
});

test('S4 boards: 9×9, holes + star gate, irregular, three goals, 7×7 with tools — V15 on the page', async ({ page }, info) => {
  const errors = watchErrors(page);
  const minCell = land(info) ? 80 : 76;
  for (const [id, cellMin] of [['2-10', minCell], ['3-08', minCell], ['4-09', minCell], ['4-10', minCell], ['4-02', 76]] as const) {
    await boot(page, { save: { levels: won(upTo(id).slice(0, -1)), intros: ALL_INTROS, boosters: { drill: 3, tractor: 3, ion: 3 }, arrivals: [1, 2, 3] } });
    await goPlay(page, id, { seed: 1 });
    await page.waitForTimeout(500);
    await assertLayout(page, cellMin);
    if (id === '4-02') expect(await page.locator('.em-tools .em-tool').count()).toBe(3);
    await shot(page, info, `s08-board-${id}`);
  }
  expect(errors).toEqual([]);
});

test('S4 moments: a special is born; a rocket combo mid-way; 2-10 refill mid-way stays inside the panel', async ({ page }, info) => {
  await boot(page, { scale: 1, save: { intros: ALL_INTROS } });
  await goPlay(page, '1-02', { seed: 1 });
  const lm = (await page.evaluate(() => window.__em.lessonMove()))!;
  let p = page.evaluate((m) => window.__em.play(m), lm);
  await page.waitForTimeout(420); await page.evaluate(() => window.__em.pause());
  await shot(page, info, 's09-special-born');
  await page.evaluate(() => window.__em.resume()); await p; await settle(page);
  await goPlay(page, '1-08', { seed: 1 });
  const cm = (await page.evaluate(() => window.__em.lessonMove()))!;
  p = page.evaluate((m) => window.__em.play(m), cm);
  await page.waitForTimeout(380); await page.evaluate(() => window.__em.pause());
  await shot(page, info, 's09-combo-mid');
  await page.evaluate(() => window.__em.resume()); await p; await settle(page);
  await goPlay(page, '2-10', { seed: 1 });
  const bm = await page.evaluate(() => window.__em.bestMove());
  p = page.evaluate((m) => window.__em.play(m!), bm);
  await page.waitForTimeout(700); await page.evaluate(() => window.__em.pause());
  await shot(page, info, 's09-refill-2-10');
  await page.evaluate(() => window.__em.resume()); await p; await settle(page);
});

test('S4 tool aim: ion cannon direction keys ≥ 64 px', async ({ page }, info) => {
  await boot(page, { save: { levels: won(upTo('4-01')), intros: ALL_INTROS, boosters: { drill: 2, tractor: 2, ion: 2 } } });
  await goPlay(page, '4-02', { seed: 1 });
  await press(page, '.em-tool[data-id="ion"]');
  await page.waitForTimeout(300);
  for (const k of await page.locator('.em-dirkey').all()) expect(Math.min(...Object.values((await k.boundingBox())!).slice(2) as number[])).toBeGreaterThanOrEqual(64);
  await shot(page, info, 's10-aim-ion');
});

test('S5 pause panel and the restart confirmation (with the assist preview)', async ({ page }, info) => {
  await boot(page, { save: { levels: { ...won(upTo('1-08')), '1-09': { stars: 0, bestLeft: 0, attempts: 3, wins: 0, failStreak: 1 } }, intros: ALL_INTROS.slice(0, 8) } });
  await goPlay(page, '1-09', { seed: 2 });
  for (let k = 0; k < 9; k += 1) { await page.evaluate(async () => { const l = window.__em.legal().filter((m) => m.t === 'swap'); await window.__em.play(l[0]); }); await settle(page); }
  await press(page, '.em-pause');
  await page.waitForSelector('.xg-modal', { timeout: 5000 });
  await page.waitForTimeout(400);
  await shot(page, info, 's11-pause-panel');
  await press(page, '.xg-modal [data-act="restart"]');
  await page.waitForTimeout(500);
  await shot(page, info, 's11-restart-confirm');
  expect(await page.locator('.xg-modal').count()).toBeGreaterThan(0);
});

test('S9 hangar: ship, cards, sky, badges, tools', async ({ page }, info) => {
  await boot(page, { save: { levels: won(upTo('3-10')), arrivals: [1, 2, 3], cosmetics: { thrusters: '#FF9A3C', legs: '#E8C35A', arm: '#F4F1EA' }, puzzles: { p1: { solved: true, attempts: 1, maxHint: 0 }, p2: { solved: true, attempts: 3, maxHint: 3 } }, grants: ['veteran'], intros: ALL_INTROS.slice(0, 16), boosters: { drill: 4, tractor: 2, ion: 0 }, sky: ['dipper', 'polaris', 'cowherd', 'orion', 'sirius'] } });
  await page.evaluate(() => window.__em.goto({ s: 'hangar' }));
  await page.waitForTimeout(700);
  const vp = page.viewportSize()!;
  for (const tab of ['cards', 'sky', 'badges', 'tools']) {
    await press(page, `.em-tab[data-tab="${tab}"]`);
    await page.waitForTimeout(300);
    const it = await boxes(page, ['.em-tabs', '.em-hangar__mods', '.em-hangar__page']);
    for (const x of it) expect(inside(x.box, vp.width, vp.height), x.sel).toBe(true);
    expect(overlap(it.find((x) => x.sel.startsWith('.em-tabs'))!.box, it.find((x) => x.sel.startsWith('.em-hangar__mods'))!.box)).toBe(false);
    await shot(page, info, `s14-hangar-${tab}`);
  }
});

test('S10 free mode and S11 puzzle p2 with H1 / H2 (undo / restart / hint ≥ 64 px)', async ({ page }, info) => {
  await boot(page, { save: { levels: won(upTo('2-05')), arrivals: [1], intros: ALL_INTROS.slice(0, 11) } });
  await goPlay(page, 'free', { mode: 'free' });
  for (let k = 0; k < 3; k += 1) { await page.evaluate(async () => { await window.__em.play(window.__em.bestMove()!); }); await settle(page); }
  await shot(page, info, 's15-free');
  await goPlay(page, 'p2', { mode: 'puzzle' });
  for (const id of ['undo', 'restart', 'hint']) { const b = (await page.locator(`.em-tool[data-id="${id}"]`).boundingBox())!; expect(Math.min(b.width, b.height), id).toBeGreaterThanOrEqual(64); }
  await press(page, '.em-tool[data-id="hint"]'); await page.waitForTimeout(500);
  await shot(page, info, 's16-puzzle-h1');
  await press(page, '.em-tool[data-id="hint"]'); await page.waitForTimeout(1200);
  await shot(page, info, 's16-puzzle-h2');
});

test('dev boards: ?dev=style and ?dev=sound render', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/emoji-match/?dev=style');
  await page.waitForSelector('#app[data-ready]', { timeout: 20000 });
  await shot(page, info, 's18-dev-style');
  await page.goto('/emoji-match/?dev=sound');
  await page.waitForSelector('.kit-start__go', { timeout: 15000 });
  await page.locator('.kit-start__go').click();
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  expect(await page.locator('.em-sound__btn').count()).toBeGreaterThan(50);
  await page.locator('.em-sound__btn.is-scene').first().click();
  await page.waitForTimeout(500);
  await shot(page, info, 's18-dev-sound');
  expect(errors).toEqual([]);
});

test('tap-select: tap one gem, then its neighbour = a swap', async ({ page }) => {
  await boot(page, { save: { intros: ALL_INTROS } });
  await goPlay(page, '1-06', { seed: 21 });
  const m = await page.evaluate(() => window.__em.legal().find((x) => x.t === 'swap'));
  await tapCell(page, m!.a);
  await page.waitForTimeout(150);
  await tapCell(page, m!.b!);
  await page.waitForFunction(() => window.__em.state()!.movesUsed === 1, null, { timeout: 8000 });
});
