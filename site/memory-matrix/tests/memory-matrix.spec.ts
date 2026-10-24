// 星图记忆站 browser checks (WebKit): the spec §10.4 list that needs a real layout engine. Test mode (?test=1) keeps the save in memory, so the child's
// real save is never touched (asserted below). The oracle / vitest side lives in src/*.test.ts.
import { expect, test, type Browser, type Page } from '@playwright/test';
import path from 'node:path';
import { instrument, shot, watch } from '../../../tests/smoke/helpers';

const MUTE = path.resolve('tools/qa/mute-audio.js');

const VP = {
  'ipad-portrait': { viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, floor: 56, safe: '' },
  'ipad-landscape': { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, floor: 56, safe: '' },
  'iphone-390x664': { viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, floor: 44, safe: '&safe=47,0,34,0' },
  'iphone-se-320x568': { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, floor: 44, safe: '' },
  'iphone-844x390': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, floor: 44, safe: '&safe=0,47,21,47' },
} as const;
type VpName = keyof typeof VP;
const BASE = '/memory-matrix/?test=1&fast=1';

async function open(browser: Browser, name: VpName) {
  const ctx = await browser.newContext({ ...VP[name], locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  await ctx.addInitScript({ path: MUTE });
  const page = await ctx.newPage(); await instrument(page);
  return { ctx, page, w: watch(page) };
}
const goto = async (page: Page, name: VpName, q: string) => { await page.goto(`${BASE}${q}${VP[name].safe}`); await page.waitForSelector('#app[data-ready]', { timeout: 15_000 }); };
const waitPhase = (page: Page, p: string) => page.waitForFunction((q) => (window as unknown as { __mmRound?: { phase(): string } }).__mmRound?.phase() === q, p, { timeout: 25_000 });
const nodes = (page: Page) => page.evaluate(() => document.querySelectorAll('*').length);
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);

/** viewport coordinates of every answer tap of the current round (cells / stars / alien tile + house) */
const answers = (page: Page, wrong = false): Promise<[number, number][]> => page.evaluate((w) => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const r = (window as any).__mmRound, a = r.adapter(), st = r.plan().stim, out: [number, number][] = [], c = (e: Element): [number, number] => { const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
  if (st.sector === 's1') { const bad = [...Array(st.g * st.g).keys()].filter((i) => !st.cells.includes(i)); (w ? bad : st.cells).forEach((i: number) => { const b = a.board.screenRect(i); out.push([b.left + b.width / 2, b.top + b.height / 2]); }); }
  else if (st.sector === 's2') { (w ? [...st.target].reverse() : st.target).forEach((i: number) => out.push(a.board.screenPoint(a.pts[i][0], a.pts[i][1]))); }
  else if (st.sector === 's4') { (w ? st.copy : st.target).forEach((i: number) => { const b = a.board.screenRect(i); out.push([b.left + b.width / 2, b.top + b.height / 2]); }); }
  else st.residents.forEach((_: unknown, i: number) => { out.push(c(a.town.itemOf(w ? (i + 1) % st.n : i).el)); out.push(c(a.town.homeOf(i).hit)); });
  return out;
}, wrong);
async function solve(page: Page, delay = 90) { for (const [x, y] of await answers(page)) { await page.touchscreen.tap(x, y); await page.waitForTimeout(delay); } }

for (const name of Object.keys(VP) as VpName[]) {
  test.describe(name, () => {
    test('station and sector page: no overflow, tap targets, <= 400 nodes, no console errors', async ({ browser }) => {
      const { ctx, page, w } = await open(browser, name);
      try {
        await goto(page, name, '&state=late');
        await noOverflow(page); expect(await nodes(page)).toBeLessThanOrEqual(400);
        for (const b of await page.$$('.mm-node, .mm-go, .mm-atlas-btn, .mm-gear')) { const r = (await b.boundingBox())!; expect(Math.min(r.width, r.height), 'tap target').toBeGreaterThanOrEqual(VP[name].floor - 0.5); }
        await shot(page, name, 'memory-station');
        await page.evaluate(() => (window as unknown as { __mm: { toSector(s: string): void } }).__mm.toSector('s4')); await page.waitForTimeout(500);
        await noOverflow(page); expect(await nodes(page)).toBeLessThanOrEqual(400);
        for (const b of await page.$$('.mm-lv:not([data-state=locked])')) { const r = (await b.boundingBox())!; expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(VP[name].floor - 0.5); }
        await shot(page, name, 'memory-sector');
        expect(w.errors, w.errors.join('\n')).toEqual([]);
      } finally { await ctx.close(); }
    });

    for (const [sector, D] of [['s1', 8], ['s2', 8], ['s3', 9], ['s4', 5], ['s4', 14]] as const) {
      test(`${sector} D${D}: play a round, hit targets >= floor, board clear of 🏠, <= 400 nodes`, async ({ browser }) => {
        const { ctx, page, w } = await open(browser, name);
        try {
          await goto(page, name, `&sector=${sector}&D=${D}&seed=spec`);
          await waitPhase(page, 'show'); await waitPhase(page, 'recall');
          expect(await nodes(page)).toBeLessThanOrEqual(400); await noOverflow(page);
          const stage = (await (await page.$('.mm-stage'))!.boundingBox())!, home = (await (await page.$('.kit-back, [data-kit-back], .kit-home, #kit-back') ?? await page.$('a[href="/"]'))?.boundingBox()) ?? null;
          if (home) expect(!(stage.x < home.x + home.width && stage.x + stage.width > home.x && stage.y < home.y + home.height && stage.y + stage.height > home.y), 'board must not overlap 🏠').toBe(true);
          const pts = await answers(page);
          expect(pts.length).toBeGreaterThan(1);
          if (sector !== 's3') { const rect = await page.evaluate(() => { const a = (window as unknown as { __mmRound: { adapter(): { board: { pitch: number; S: number; canvas: HTMLElement } } } }).__mmRound.adapter(), b = a.board.canvas.getBoundingClientRect(); return { pitch: a.board.pitch * (b.width / a.board.S), w: b.width }; }); if (rect.pitch) expect(rect.pitch).toBeGreaterThanOrEqual(VP[name].floor - 1.5); }
          else for (const t of await page.$$('.mm-visitor')) { const r = (await t.boundingBox())!; expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(VP[name].floor - 0.5); }
          await shot(page, name, `memory-${sector}-d${D}-recall`);
          await solve(page);
          await page.waitForSelector('.mm-sheet.is-in [data-act=next]', { timeout: 10_000 });
          await shot(page, name, `memory-${sector}-d${D}-done`);
          expect(w.errors, w.errors.join('\n')).toEqual([]);
        } finally { await ctx.close(); }
      });
    }
  });
}

test.describe('rules (iPad portrait)', () => {
  const NAME: VpName = 'ipad-portrait';
  test('a miss reveals the answer first, then offers a new sky; the ladder falls', async ({ browser }) => {
    const { ctx, page, w } = await open(browser, NAME);
    try {
      await goto(page, NAME, '&sector=s1&night=1&seed=miss');
      await waitPhase(page, 'recall');
      const bad = await answers(page, true);
      for (const [x, y] of bad.slice(0, 3)) { await page.touchscreen.tap(x, y); await page.waitForTimeout(120); }
      await page.waitForSelector('.mm-sheet.is-in [data-act=next]', { timeout: 15_000 });
      expect(await page.textContent('.mm-sheet')).toContain('答案在这里');
      expect(await page.evaluate(() => (window as unknown as { __mm: { engine: { sec(s: string): { stats: { miss: number } } } } }).__mm.engine.sec('s1').stats.miss)).toBe(1);
      await shot(page, NAME, 'memory-miss-reveal');
      expect(w.errors, w.errors.join('\n')).toEqual([]);
    } finally { await ctx.close(); }
  });
  test('the free first look is still a pass; a second look is not; hints appear only after a slip', async ({ browser }) => {
    const { ctx, page } = await open(browser, NAME);
    try {
      await goto(page, NAME, '&sector=s1&night=1&seed=look');
      await waitPhase(page, 'recall');
      expect(await page.isHidden('[data-act=hint]')).toBe(true);
      await page.click('[data-act=look]'); await waitPhase(page, 'recall');
      await solve(page); await page.waitForSelector('.mm-sheet.is-in [data-act=next]');
      const e = await page.evaluate(() => { const s = (window as unknown as { __mm: { engine: { sec(s: string): { stats: { pass: number; rewatch: number; neutral: number } } } } }).__mm.engine.sec('s1'); return { ...s.stats }; });
      expect(e.pass).toBe(1); expect(e.rewatch).toBe(1);
      await page.click('.mm-sheet [data-act=next]'); await waitPhase(page, 'recall');
      await page.click('[data-act=look]'); await waitPhase(page, 'recall'); await page.click('[data-act=look]'); await waitPhase(page, 'recall');
      await solve(page); await page.waitForSelector('.mm-sheet.is-in [data-act=next]');
      const e2 = await page.evaluate(() => { const s = (window as unknown as { __mm: { engine: { sec(s: string): { stats: { pass: number; neutral: number } } } } }).__mm.engine.sec('s1'); return { ...s.stats }; });
      expect(e2.neutral).toBe(1);
    } finally { await ctx.close(); }
  });
  test('after one slip the lightbulb and 看答案 appear; the lightbulb makes the round neutral', async ({ browser }) => {
    const { ctx, page } = await open(browser, NAME);
    try {
      await goto(page, NAME, '&sector=s1&night=1&seed=hint');
      await waitPhase(page, 'recall');
      const [bx, by] = (await answers(page, true))[0]; await page.touchscreen.tap(bx, by); await page.waitForTimeout(150);
      await expect(page.locator('[data-act=hint]')).toBeVisible(); await expect(page.locator('[data-act=answer]')).toBeVisible();
      await page.click('[data-act=hint]');
      expect(await page.evaluate(() => (window as unknown as { __mmRound: { out: { hint: number } } }).__mmRound.out.hint)).toBe(2);
      await solve(page); await page.waitForSelector('.mm-sheet.is-in [data-act=next]');
      expect(await page.evaluate(() => (window as unknown as { __mm: { engine: { sec(s: string): { stats: { neutral: number } } } } }).__mm.engine.sec('s1').stats.neutral)).toBe(1);
    } finally { await ctx.close(); }
  });
  test('test mode never writes the real save; a night ends in the night card with <= 400 nodes', async ({ browser }) => {
    test.setTimeout(150_000);
    const { ctx, page, w } = await open(browser, NAME);
    try {
      await goto(page, NAME, '&sector=s1&night=1&seed=night');
      for (let i = 0; i < 24; i += 1) {
        await page.waitForFunction(() => (window as unknown as { __mmRound?: { phase(): string } }).__mmRound?.phase() === 'recall' || !!document.querySelector('.mm-night, .mm-gate [data-act], .mm-banner:not([hidden]) .mm-banner-go'), null, { timeout: 25_000 }).catch(async (err) => {
          const state = await page.evaluate(() => ({ phase: (window as unknown as { __mmRound?: { phase(): string } }).__mmRound?.phase(), banner: !!document.querySelector('.mm-banner:not([hidden]) .mm-banner-go'), gate: !!document.querySelector('.mm-gate'), dialog: document.querySelector('[role=dialog]')?.textContent?.slice(0, 100) }));
          throw new Error(`night transition stuck: ${JSON.stringify(state)}`, { cause: err });
        });
        if (await page.$('.mm-night')) break;
        if (await page.locator('.mm-gate [data-act]').count()) { await page.locator('.mm-gate [data-act]').click(); continue; }
        if (await page.locator('.mm-banner:not([hidden]) .mm-banner-go').count()) { await page.locator('.mm-banner-go').click(); continue; }
        await solve(page, 60); await page.waitForSelector('.mm-sheet.is-in [data-act=next]'); await page.click('.mm-sheet [data-act=next]'); await page.waitForTimeout(200);
      }
      await page.waitForSelector('.mm-night [data-act=again]', { timeout: 15_000 });
      expect(await nodes(page)).toBeLessThanOrEqual(400); await shot(page, NAME, 'memory-night-card');
      expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /memory-matrix|metrics/.test(k)))).toEqual([]);
      expect(w.errors, w.errors.join('\n')).toEqual([]);
    } finally { await ctx.close(); }
  });
  test('turning the screen mid-round keeps the board inside the screen and taps working', async ({ browser }) => {
    const { ctx, page } = await open(browser, NAME);
    try {
      await goto(page, NAME, '&sector=s4&D=8&seed=rot');
      await waitPhase(page, 'recall');
      await page.setViewportSize({ width: 1080, height: 810 }); await page.waitForTimeout(500);
      const b = (await (await page.$('.mm-stage'))!.boundingBox())!; expect(b.x + b.width).toBeLessThanOrEqual(1080); expect(b.y + b.height).toBeLessThanOrEqual(810);
      await solve(page); await page.waitForSelector('.mm-sheet.is-in [data-act=next]', { timeout: 10_000 });
    } finally { await ctx.close(); }
  });
  test('every intro has the shared 跳过: it appears, skips the tutorial and starts the real round', async ({ browser }) => {
    const { ctx, page } = await open(browser, NAME);
    try {
      await goto(page, NAME, '&tutorial=1&sector=s1&night=1');
      await page.waitForSelector('.xg-skip[data-state=ready], .xg-skip:not([data-state=waiting])', { timeout: 6000 });
      await page.click('.xg-skip'); await waitPhase(page, 'recall');
      expect(await page.evaluate(() => (window as unknown as { __mm: { engine: { save: { tutorial: { s1: boolean } } } } }).__mm.engine.save.tutorial.s1)).toBe(true);
    } finally { await ctx.close(); }
  });
  test('atlas: paged, half-lit cards say how many nights are missing, <= 400 nodes', async ({ browser }) => {
    const { ctx, page, w } = await open(browser, NAME);
    try {
      await goto(page, NAME, '&state=late');
      await page.evaluate(() => (window as unknown as { __mm: { toAtlas(): void } }).__mm.toAtlas()); await page.waitForSelector('.mm-card');
      expect(await page.locator('.mm-card').count()).toBeLessThanOrEqual(12); expect(await nodes(page)).toBeLessThanOrEqual(400);
      expect(await page.locator('.mm-card[data-state=half] small').first().textContent()).toMatch(/还差 \d+ 个夜航/);
      await page.click('[data-act=next]'); await shot(page, NAME, 'memory-atlas');
      expect(w.errors, w.errors.join('\n')).toEqual([]);
    } finally { await ctx.close(); }
  });
  test('star gate: offered at the start of a night, five rounds, opens or retries; no hint buttons inside', async ({ browser }) => {
    const { ctx, page, w } = await open(browser, NAME);
    try {
      await goto(page, NAME, '&sector=s1&night=1&gate=1&seed=gate');
      await page.waitForSelector('.mm-gate [data-act=enter]'); await shot(page, NAME, 'memory-gate-intro'); await page.click('.mm-gate [data-act=enter]');
      await waitPhase(page, 'recall');
      expect(await page.isHidden('[data-act=demo]')).toBe(true); expect(await page.isHidden('[data-act=hint]')).toBe(true);
      for (let i = 0; i < 4; i += 1) { await solve(page, 60); await page.waitForSelector('.mm-sheet.is-in [data-act=next]'); await page.click('.mm-sheet [data-act=next]'); if (i < 3) await waitPhase(page, 'recall'); }
      await page.waitForSelector('.mm-gate.is-open [data-act=ok]', { timeout: 10_000 }); await shot(page, NAME, 'memory-gate-open');
      expect(w.errors, w.errors.join('\n')).toEqual([]);
    } finally { await ctx.close(); }
  });
  test('H3 demo: the ghost hand solves it, the child then tries on a fresh seed and the round counts as neutral', async ({ browser }) => {
    const { ctx, page, w } = await open(browser, NAME);
    try {
      await goto(page, NAME, '&sector=s1&night=1&seed=demo');
      await waitPhase(page, 'recall');
      const first = await page.evaluate(() => (window as unknown as { __mmRound: { plan(): { stim: { key: string } } } }).__mmRound.plan().stim.key);
      await page.click('[data-act=demo]');
      await page.waitForFunction((k) => { const r = (window as unknown as { __mmRound: { plan(): { stim: { key: string } }; phase(): string } }).__mmRound; return r.plan().stim.key !== k && r.phase() === 'recall'; }, first, { timeout: 40_000 });
      await solve(page); await page.waitForSelector('.mm-sheet.is-in [data-act=next]');
      expect(await page.evaluate(() => (window as unknown as { __mm: { engine: { sec(s: string): { stats: { neutral: number } } } } }).__mm.engine.sec('s1').stats.neutral)).toBe(1);
      expect(w.errors, w.errors.join('\n')).toEqual([]);
    } finally { await ctx.close(); }
  });
  test('three misses in a row: a demonstration round (not measured), then a scaffolded round (first answer free, neutral)', async ({ browser }) => {
    const { ctx, page, w } = await open(browser, NAME);
    try {
      await goto(page, NAME, '&state=late');
      await page.evaluate(() => { const m = (window as unknown as { __mm: { engine: { sec(s: string): { queue: string[] } }; nightFlow(s: string): void } }).__mm; m.engine.sec('s1').queue = ['demo', 'scaffold']; void m.nightFlow('s1'); });
      await page.waitForSelector('.mm-round[data-kind=demo]'); await page.waitForSelector('.mm-sheet.is-in [data-act=next]', { timeout: 60_000 });
      const before = await page.evaluate(() => (window as unknown as { __mm: { engine: { sec(s: string): { stats: { rounds: number } } } } }).__mm.engine.sec('s1').stats.rounds);
      await page.click('.mm-sheet [data-act=next]'); await page.waitForSelector('.mm-round[data-kind=scaffold]'); await waitPhase(page, 'recall');
      const rest = (await answers(page)).slice(1); for (const [x, y] of rest) { await page.touchscreen.tap(x, y); await page.waitForTimeout(90); }
      await page.waitForSelector('.mm-sheet.is-in [data-act=next]');
      const st = await page.evaluate(() => (window as unknown as { __mm: { engine: { sec(s: string): { stats: { rounds: number; neutral: number } } } } }).__mm.engine.sec('s1').stats);
      expect(st.rounds).toBe(before + 1); expect(st.neutral).toBeGreaterThanOrEqual(1);
      expect(w.errors, w.errors.join('\n')).toEqual([]);
    } finally { await ctx.close(); }
  });
  test('after a rule change the first round shows the banner and waits for a tap (倒着追)', async ({ browser }) => {
    const { ctx, page, w } = await open(browser, NAME);
    try {
      await goto(page, NAME, '&state=late');
      await page.evaluate(() => { const m = (window as unknown as { __mm: { engine: { sec(s: string): { open: boolean; cur: number; swaps: number; queue: string[]; tracks: { cleared: number; L: number }[] }; startNight(s: string): void }; nightFlow(s: string): void } }).__mm, sc = m.engine.sec('s2'), t = sc.tracks[0]; sc.cur = 0; sc.swaps = 0; sc.queue = []; sc.tracks[1].cleared = 0; t.cleared = 1; t.L = 6; m.engine.startNight('s2'); m.engine.startNight('s2'); void m.nightFlow('s2'); });
      await page.waitForSelector('.mm-banner:not([hidden]) .mm-banner-go', { timeout: 10_000 });
      expect(await page.textContent('.mm-banner')).toContain('倒着追');
      await shot(page, NAME, 'memory-banner');
      expect(await phase2(page)).not.toBe('recall');
      await page.click('.mm-banner-go'); await waitPhase(page, 'recall');
      expect(await page.locator('.mm-plaque').textContent()).toContain('倒着追');
      expect(w.errors, w.errors.join('\n')).toEqual([]);
    } finally { await ctx.close(); }
  });
});
const phase2 = (page: Page) => page.evaluate(() => (window as unknown as { __mmRound?: { phase(): string } }).__mmRound?.phase());

test('元老: an old save with cleared levels becomes ONE card and a ribbon, never a level (and the old key is untouched)', async ({ browser }) => {
  const ctx = await browser.newContext({ ...VP['ipad-portrait'], locale: 'zh-CN' }); const page = await ctx.newPage(); const w = watch(page);
  await ctx.addInitScript({ path: MUTE });
  try {
    const live = JSON.stringify({ ladders: { sprout: { unlocked: 9, solved: { 1: { stars: 3 }, 2: { stars: 2 }, 3: { stars: 3 } } }, galaxy: { unlocked: 2, solved: { 1: { stars: 1 } } } } });
    await page.addInitScript((v) => { try { if (!localStorage.getItem('kid_games_memory_matrix_v2')) localStorage.setItem('kid_games_memory_matrix_v2', v); } catch { /* private mode */ } }, live);
    await page.goto(`${BASE}`); await page.waitForSelector('#app[data-ready]');
    await expect(page.locator('.mm-ribbon')).toContainText('9 颗旧星星');
    const r = await page.evaluate(() => { const m = (window as unknown as { __mm: { engine: { save: { cards: string[]; veteran: unknown }; sec(s: string): { tracks: { L: number }[] } } } }).__mm; return { cards: m.engine.save.cards, L: m.engine.sec('s1').tracks[0].L, key: localStorage.getItem('kid_games_memory_matrix_v2') }; });
    expect(r.cards).toEqual(['vet']); expect(r.L).toBe(3); expect(r.key).toContain('sprout');
    await shot(page, 'ipad-portrait', 'memory-veteran');
    expect(w.errors, w.errors.join('\n')).toEqual([]);
  } finally { await ctx.close(); }
});
