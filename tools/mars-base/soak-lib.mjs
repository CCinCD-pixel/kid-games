/**
 * V11 soak toolkit of 火星基地: "memory stays flat over repeated play". Shared by tools/mars-base/perf.mjs (budget scene 5) and
 * site/mars-base/e2e/soak.spec.ts (one soak per screen type + one per stage type).  Chromium only (CDP `Memory.getDOMCounters`).
 *
 *   gate (per soak, after GC, cycle 5 -> cycle 28):  DOM nodes growth <= 60,  JS event listeners growth <= 60,  JS heap growth <= 3 MB
 *
 * TWO HARNESS TRAPS that produced a phantom "13 453-node leak" in sessions 3-4 (the app itself was flat; fixed here for good):
 *   1. a Playwright ElementHandle pins its DOM tree until it is disposed: `await page.waitForSelector('.mb-map')` in a loop keeps EVERY screen the
 *      loop ever showed alive (+447 nodes / +13 listeners per map, +550 per mission). Wait with `present()` (handle-free) in a soak.
 *   2. things that legitimately live a second or two after a screen is gone (kit robot sparkle / typewriter timers <= 1.6 s, a build scene fading out)
 *      are still in the DOM counters if you count right after the last cycle. `mark()` therefore waits `settleMs` and then collects garbage twice.
 * `leakControl()` plants a real leak (a held handle) and the gate must catch it: the soak spec runs it so the gate cannot go blind.
 */

export const SOAK = { cycles: 28, warm: 5, maxNodes: 60, maxListeners: 60, maxHeapMB: 3, settleMs: 2500 };
export const LIT = { state: 'lit', attempts: 1, at: 1 };
export const NONE = { state: 'none', attempts: 0 };
/** a save that skips the onboarding, has the probes done and every badge lit (every node is a plain mission) */
export const playSave = () => ({ onboarded: true, session: { index: 3, lastActiveAt: Date.now(), missions: 3 }, cert: { C1: LIT, C2: LIT, C3: LIT }, probes: { vault: { done: true }, factory: { done: true }, balance: { done: true } } });

/** handle-free "wait until a selector matches" (trap 1) */
export async function present(page, selector, timeout = 8000) {
  const h = await page.waitForFunction((s) => !!document.querySelector(s), selector, { timeout });
  await h.dispose();
}
/** handle-free "wait until a page predicate holds" */
export async function until(page, fn, arg, timeout = 8000) {
  const h = await page.waitForFunction(fn, arg, { timeout });
  await h.dispose();
}
const hook = (page, fn, arg) => page.evaluate(fn, arg);

/** let short-lived timers expire, collect garbage twice, read the counters (trap 2) */
export async function mark(page, cdp, settleMs = SOAK.settleMs) {
  await page.waitForTimeout(settleMs);
  await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage');
  const c = await cdp.send('Memory.getDOMCounters'); const hu = await cdp.send('Runtime.getHeapUsage');
  return { nodes: c.nodes, listeners: c.jsEventListeners, heapMB: +(hu.usedSize / 1048576).toFixed(2) };
}

/** run `cycle(i)` `cycles` times; the counters are read after cycle `warm` (caches, lazy chunks and decoded assets settle) and at the end */
export async function soak(page, cdp, name, cycle, o = {}) {
  const { cycles = SOAK.cycles, warm = SOAK.warm, settleMs = SOAK.settleMs } = o;
  let at = null;
  for (let i = 1; i <= cycles; i++) { await cycle(i); if (i === warm) at = await mark(page, cdp, settleMs); }
  const end = await mark(page, cdp, settleMs);
  return { name, cycles, warm, at, end, dNodes: end.nodes - at.nodes, dListeners: end.listeners - at.listeners, dHeapMB: +(end.heapMB - at.heapMB).toFixed(2) };
}
export const verdict = (r) => ({ ...r, ok: r.dNodes <= SOAK.maxNodes && r.dListeners <= SOAK.maxListeners && r.dHeapMB <= SOAK.maxHeapMB });
export const describe = (r) => `${r.name}: nodes ${r.dNodes >= 0 ? '+' : ''}${r.dNodes} (limit ${SOAK.maxNodes}), listeners ${r.dListeners >= 0 ? '+' : ''}${r.dListeners} (limit ${SOAK.maxListeners}), heap ${r.dHeapMB} MB (limit ${SOAK.maxHeapMB}) over ${r.cycles} cycles${r.ok === false ? '  <-- FAIL' : ''}`;

// ---- screen cycles: each one shows the screen, uses it a little, leaves it (back on the map) ----------------------------------------------------------
const toMap = (page) => present(page, '.mb-map');
const back = async (page) => { await page.locator('.mb-ch-back').click(); await toMap(page); };
const resetPlaySave = async (page) => { await hook(page, (save) => window.__mars.setSave(save), playSave()); await toMap(page); };
/** the item on screen is delivered (right) and the next item (or the end of the mission) is awaited */
export async function deliverOne(page) {
  const k = await page.evaluate(() => window.__mars.item()?.key ?? null);
  await page.evaluate(() => { const m = window.__mars; m.answer(m.correct()); });
  await until(page, (prev) => !document.querySelector('.mb-mission') || window.__mars.item()?.key !== prev, k, 8000);
  return !!(await page.locator('.mb-mission').count());
}
/** after a mission ended: dismiss whatever comes (result card 回基地, the 想跳过下一个订单吗 offer, the build scene) until the map is back */
export async function landOnMap(page, timeout = 15_000) {
  const t0 = Date.now();
  for (;;) {
    const st = await page.evaluate(() => ({ map: !!document.querySelector('.mb-map'), over: !!document.querySelector('.mb-build, .xg-modal, .kit-modal'), home: !!document.querySelector('.xg-modal [data-act="home"]'), no: !!document.querySelector('.kit-modal [data-act="no"]'), any: !!document.querySelector('.kit-modal button') }));
    if (st.map && !st.over) return;
    if (st.home) await page.locator('.xg-modal [data-act="home"]').click({ timeout: 2000 }).catch(() => undefined);
    else if (st.no) await page.locator('.kit-modal [data-act="no"]').click({ timeout: 2000 }).catch(() => undefined);
    else if (st.any) await page.locator('.kit-modal button').last().click({ timeout: 2000 }).catch(() => undefined);
    if (Date.now() - t0 > timeout) throw new Error('the map did not come back after the mission');
    await page.waitForTimeout(80);
  }
}
export const SCREENS = {
  map: (page) => async () => { await hook(page, () => window.__mars.goMap()); await toMap(page); },
  chapter: (page) => async (i) => { await hook(page, (z) => window.__mars.chapter(z), ['vault', 'factory', 'orbit', 'cert'][i % 4]); await present(page, '.mb-chapter .xg-node'); await back(page); },
  badges: (page) => async () => { await hook(page, () => window.__mars.badges()); await present(page, '.mb-badges .mb-plaque'); await back(page); },
  archive: (page) => async () => { await hook(page, () => window.__mars.archive()); await present(page, '.mb-archive .mb-arch-body'); await back(page); },
  parent: (page) => async () => { await hook(page, () => window.__mars.parent()); await present(page, '.mb-parent .mb-par-body'); await page.locator('.mb-par-toggle').first().click(); await page.locator('.mb-par-toggle').first().click(); await back(page); },
  /** a mission opened and left at once (the first stage only) */
  missionLeave: (page, node = 'cert.C1.1') => async () => { await resetPlaySave(page); await hook(page, (n) => window.__mars.start(n), node); await present(page, '.mb-mission .mb-stage > *'); await page.waitForTimeout(120); await page.locator('.mb-map-btn').click(); await toMap(page); await until(page, () => !window.__mars.app.missionBusy); },
  /** a mission with `items` orders delivered (every stage swap runs), then left */
  missionPlay: (page, node = 'factory.P2.5', items = 3) => async () => {
    await resetPlaySave(page);
    await hook(page, (n) => window.__mars.start(n), node); await present(page, '.mb-mission .mb-stage > *'); await until(page, () => !!window.__mars.item());
    for (let k = 0; k < items; k++) { if (!(await deliverOne(page))) break; }
    if (await page.locator('.mb-map-btn').count()) await page.locator('.mb-map-btn').click();
    await landOnMap(page);
    await until(page, () => !window.__mars.app.missionBusy);
  },
  /** a whole short mission: orders -> result card -> build scene -> map */
  missionFull: (page, node) => async () => {
    await hook(page, (n) => window.__mars.start(n), node); await present(page, '.mb-mission .mb-stage > *'); await until(page, () => !!window.__mars.item());
    for (let g = 0; g < 40 && (await deliverOne(page)); g++);
    await landOnMap(page);
    await until(page, () => !window.__mars.app.missionBusy);
  },
  /** 一起验货 (needs a save with unlit badges): the wall mission opened and left */
  wall: (page) => async () => { await hook(page, () => { void window.__mars.app.runWall(); }); await present(page, '.mb-mission .mb-stage > *'); await page.waitForTimeout(120); await page.locator('.mb-map-btn').click(); await toMap(page); },
  /** the build scene overlay (appended to <body>) */
  build: (page) => async () => { await hook(page, () => { const m = window.__mars; void m.build({ part: { id: 'x', name: 'x' }, tierUps: [{ site: 'orbit', from: 1, to: 2 }], levelUp: 2 }, 'orbit'); }); await page.waitForTimeout(150); await until(page, () => !document.querySelector('.mb-build'), undefined, 10_000); },
};

/** a planted leak: every cycle keeps a handle on the screen it showed. The gate MUST fail on this (the spec asserts it). */
export function leakControl(page) {
  const held = [];
  return async () => { await page.evaluate(() => window.__mars.goMap()); held.push(await page.waitForSelector('.mb-map .mb-site')); };
}

// ---- stage soak: every distinct operating surface is mounted, poked and destroyed 28 times in a row (test hook `stageCycles`) ---------------------------
export const stageSigs = (page) => page.evaluate(() => window.__mars.stageSigs());
/** one soak per stage signature (the page loop is synchronous: `warm` cycles, mark, the rest, mark) */
export async function stageSoak(page, cdp, sig, o = {}) {
  const { cycles = SOAK.cycles, warm = SOAK.warm, settleMs = 1500 } = o; const errors = [];
  errors.push(...await page.evaluate(([s, n]) => window.__mars.stageCycles(s, n), [sig, warm]));
  const at = await mark(page, cdp, settleMs);
  errors.push(...await page.evaluate(([s, n]) => window.__mars.stageCycles(s, n), [sig, cycles - warm]));
  const end = await mark(page, cdp, settleMs);
  return { name: `stage ${sig}`, cycles, warm, at, end, dNodes: end.nodes - at.nodes, dListeners: end.listeners - at.listeners, dHeapMB: +(end.heapMB - at.heapMB).toFixed(2), errors };
}

/**
 * ALL stage types in one soak: `warm` passes over every signature, mark, the other passes, mark. Stage animations (hint ghost hands, tray settle tweens) end a few seconds
 * after destroy(), so the marks wait `settleMs` (6 s); a failing aggregate is bisected per signature by `stageSoak` (spec: MARS_SOAK_BISECT=1).
 */
export async function stageSoakAll(page, cdp, o = {}) {
  const { cycles = SOAK.cycles, warm = SOAK.warm, settleMs = 6000 } = o; const errors = [];
  errors.push(...await page.evaluate((n) => window.__mars.stageRounds(n), warm));
  const at = await mark(page, cdp, settleMs);
  errors.push(...await page.evaluate((n) => window.__mars.stageRounds(n), cycles - warm));
  const end = await mark(page, cdp, settleMs);
  return { name: 'all stage types', cycles, warm, at, end, dNodes: end.nodes - at.nodes, dListeners: end.listeners - at.listeners, dHeapMB: +(end.heapMB - at.heapMB).toFixed(2), errors: [...new Set(errors)] };
}
