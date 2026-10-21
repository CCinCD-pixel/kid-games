// QA round 1 regressions (2026-10-13): everything the first QA pass found that the original spec could not see. WebKit; ?test=1 keeps the save in memory.
//   A  layout contract: on 7 viewports every button of every screen is fully inside the screen, tappable (>= 44 px) and NOT covered (incl. by the subtitle bar)
//   B  rules: double tap, reveal, gate look, leave and return, pointer cancel, long press, corrupt save, storage, demo skip, new-rule demo, card reveal
import { expect, test, type Browser, type Page } from '@playwright/test';
import { instrument, shot, watch } from '../../../tests/smoke/helpers';

const VP = {
  'ipad-portrait': { viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, safe: '' },
  'ipad-landscape': { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, safe: '' },
  'iphone-390x664': { viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, safe: '&safe=47,0,34,0' },
  'iphone-se-320x568': { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, safe: '' },
  'iphone-844x390': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, safe: '&safe=0,47,21,47' },
  'iphone-667x375': { viewport: { width: 667, height: 375 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, safe: '&safe=0,47,21,47' },
  'iphone-568x320': { viewport: { width: 568, height: 320 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, safe: '' },
} as const;
type VpName = keyof typeof VP;
const BASE = '/memory-matrix/?test=1&fast=1';
type W = { __mm: any; __mmRound: any };   // eslint-disable-line @typescript-eslint/no-explicit-any

async function open(browser: Browser, name: VpName) {
  const { safe, ...rest } = VP[name]; void safe;
  const ctx = await browser.newContext({ ...rest, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  const page = await ctx.newPage(); await instrument(page);
  return { ctx, page, w: watch(page) };
}
const goto = async (page: Page, name: VpName, q: string) => { await page.goto(`${BASE}${q}${VP[name].safe}`); await page.waitForSelector('#app[data-ready]', { timeout: 15_000 }); };
const waitPhase = (page: Page, p: string) => page.waitForFunction((q) => (window as unknown as W).__mmRound?.phase() === q, p, { timeout: 25_000 });
const round = <T>(page: Page, f: (r: any) => T) => page.evaluate((src) => new Function('r', `return (${src})(r)`)((window as unknown as W).__mmRound), f.toString());   // eslint-disable-line @typescript-eslint/no-explicit-any
const mm = <T>(page: Page, f: (m: any) => T) => page.evaluate((src) => new Function('m', `return (${src})(m)`)((window as unknown as W).__mm), f.toString());   // eslint-disable-line @typescript-eslint/no-explicit-any

/** every live button: fully inside the screen, >= 44 px, and the element under its centre is the button itself (nothing, not even the subtitle bar, covers it) */
const reach = (page: Page, sel = 'button, .mm-lv, .mm-node, .mm-card') => page.evaluate((s) => {
  const out: string[] = [], ih = innerHeight, iw = innerWidth;
  for (const e of Array.from(document.querySelectorAll<HTMLElement>(s))) {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (r.width < 2 || cs.visibility === 'hidden' || cs.display === 'none' || e.closest('[hidden]') || (e as HTMLButtonElement).disabled || parseFloat(cs.opacity) === 0) continue;
    const top = document.elementFromPoint(Math.min(iw - 1, Math.max(0, r.left + r.width / 2)), Math.min(ih - 1, Math.max(0, r.top + r.height / 2)));
    const inside = r.left >= -0.5 && r.top >= -0.5 && r.right <= iw + 0.5 && r.bottom <= ih + 0.5, hit = !!top && (e === top || e.contains(top));
    if (!inside || !hit || Math.min(r.width, r.height) < 43.5) out.push(`${(e.className + '').slice(0, 28)} "${(e.textContent ?? '').trim().slice(0, 8)}" ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}${inside ? '' : ' OUTSIDE'}${hit ? '' : ' COVERED'}`);
  }
  return out;
}, sel);
const say = (page: Page) => mm(page, (m) => m.app.narrator.say('mm.s1.t3')).then(() => page.waitForTimeout(350));
const answers = (page: Page, wrong = false): Promise<[number, number][]> => page.evaluate((w) => {
  const r = (window as unknown as W).__mmRound, a = r.adapter(), st = r.plan().stim, out: [number, number][] = [], c = (e: Element): [number, number] => { const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
  if (st.sector === 's1') { const bad = [...Array(st.g * st.g).keys()].filter((i) => !st.cells.includes(i)); (w ? bad : st.cells).forEach((i: number) => { const b = a.board.screenRect(i); out.push([b.left + b.width / 2, b.top + b.height / 2]); }); }
  else if (st.sector === 's2') { (w ? [...st.target].reverse() : st.target).forEach((i: number) => out.push(a.board.screenPoint(a.pts[i][0], a.pts[i][1]))); }
  else if (st.sector === 's4') { (w ? st.copy : st.target).forEach((i: number) => { const b = a.board.screenRect(i); out.push([b.left + b.width / 2, b.top + b.height / 2]); }); }
  else st.residents.forEach((_: unknown, i: number) => { out.push(c(a.town.itemOf(w ? (i + 1) % st.n : i).el)); out.push(c(a.town.homeOf(i).hit)); });
  return out;
}, wrong);
async function solve(page: Page, delay = 90) { for (const [x, y] of await answers(page)) { await page.touchscreen.tap(x, y); await page.waitForTimeout(delay); } }
const sheetReady = (page: Page) => page.waitForSelector('.mm-sheet.is-in [data-act=next]', { timeout: 15_000 });

const NIGHT = { sector: 's1', valid: true, bad: false, gatesCleared: 1, wallBefore: 3, wallAfter: 5, upgraded: 7, cards: ['s1.d4', 's1.g5'], rounds: ['pass', 'pass', 'neutral', 'pass', 'miss', 'pass'].map((res) => ({ res, kind: 'round', showAnswer: false })) };

/* ============================================================================================================ A */
for (const name of Object.keys(VP) as VpName[]) {
  test.describe(`layout contract ${name}`, () => {
    test('station, sector page, atlas, card detail, settings: every button on screen, uncovered, >= 44 px, even while the subtitle shows', async ({ browser }) => {
      const { ctx, page, w } = await open(browser, name);
      try {
        await goto(page, name, '&state=late');
        await say(page); expect(await reach(page), 'station').toEqual([]); await shot(page, name, 'r1-station');
        await mm(page, (m) => m.toSector('s2')); await page.waitForTimeout(600); await say(page); expect(await reach(page), 'sector page').toEqual([]); await shot(page, name, 'r1-sector');
        await mm(page, (m) => m.toAtlas()); await page.waitForTimeout(600); await say(page); expect(await reach(page), 'atlas').toEqual([]); await shot(page, name, 'r1-atlas');
        await page.locator('.mm-card').first().tap(); await page.waitForTimeout(400); expect(await reach(page, '.mm-modal button'), 'card detail').toEqual([]);
        expect(await page.evaluate(() => /≥|夜航满数/.test(document.body.innerText)), 'no parent jargon in the child UI').toBe(false); await shot(page, name, 'r1-card');
        await mm(page, (m) => m.toStation()); await page.waitForTimeout(500); await mm(page, (m) => m.showSettings()); await page.waitForTimeout(400); await say(page); expect(await reach(page, '.mm-modal button, .mm-modal input'), 'settings').toEqual([]);
        expect(w.errors, w.errors.join('\n')).toEqual([]);
      } finally { await ctx.close(); }
    });
    test('result sheets (pass and miss), night card, star-gate modals: nothing leaves the screen or hides under the subtitle', async ({ browser }) => {
      const { ctx, page, w } = await open(browser, name);
      try {
        const vp = VP[name].viewport;
        await goto(page, name, '&sector=s1&D=5&seed=r1a'); await waitPhase(page, 'recall'); await solve(page); await sheetReady(page); await say(page);
        expect(await reach(page, '.mm-sheet button'), 'pass sheet').toEqual([]); await shot(page, name, 'r1-sheet-pass');
        await goto(page, name, '&sector=s1&D=5&seed=r1b'); await waitPhase(page, 'recall');
        for (const [x, y] of (await answers(page, true)).slice(0, 3)) { await page.touchscreen.tap(x, y); await page.waitForTimeout(100); }
        await sheetReady(page); await say(page); expect(await reach(page, '.mm-sheet button'), 'miss sheet').toEqual([]); await shot(page, name, 'r1-sheet-miss');
        await goto(page, name, '');
        for (const what of ['night card', 'gate intro', 'gate open', 'gate retry'] as const) {
          await page.evaluate(([k, night]) => { const m = (window as unknown as W).__mm; if (k === 'night card') void m.showNight(JSON.parse(night)); else if (k === 'gate intro') void m.showGateIntro(); else void m.showGateVerdict(k === 'gate open'); }, [what, JSON.stringify(NIGHT)]);
          await page.waitForSelector('.mm-modal .mm-panel', { timeout: 5000 }); await page.waitForTimeout(700); await say(page);
          expect(await reach(page, '.mm-modal button'), what).toEqual([]);
          const box = (await (await page.$('.mm-modal .mm-panel'))!.boundingBox())!;
          expect(box.y, `${what} panel top`).toBeGreaterThanOrEqual(-0.5); expect(box.y + box.height, `${what} panel bottom`).toBeLessThanOrEqual(vp.height + 0.5); expect(box.x).toBeGreaterThanOrEqual(-0.5); expect(box.x + box.width, `${what} panel right`).toBeLessThanOrEqual(vp.width + 0.5);
          await shot(page, name, `r1-modal-${what.replace(' ', '-')}`);
          await page.locator('.mm-modal .xg-btn').last().tap(); await page.waitForTimeout(400);
        }
        expect(w.errors, w.errors.join('\n')).toEqual([]);
      } finally { await ctx.close(); }
    });
    for (const [sector, D] of [['s4', 5], ['s2', 8]] as const) {
      test(`${sector} round after a slip: the five action buttons fit on one row / column, above the home indicator`, async ({ browser }) => {
        const { ctx, page } = await open(browser, name);
        try {
          await goto(page, name, `&sector=${sector}&D=${D}&seed=r1c`); await waitPhase(page, 'recall');
          const [x, y] = (await answers(page, true))[0]; await page.touchscreen.tap(x, y); await page.waitForTimeout(250);
          expect(await reach(page, '.mm-actions button'), 'actions').toEqual([]); await say(page); expect(await reach(page, '.mm-actions button'), 'actions under a subtitle').toEqual([]);
          await shot(page, name, `r1-${sector}-slip`);
        } finally { await ctx.close(); }
      });
    }
  });
}

/* ============================================================================================================ B */
const P: VpName = 'ipad-portrait';
test.describe('rules (QA round 1)', () => {
  for (const [sector, D] of [['s1', 5], ['s2', 6], ['s3', 5], ['s4', 5]] as const) {
    test(`${sector}: a stuttering finger (two taps on the same wrong thing) costs ONE lamp`, async ({ browser }) => {
      const { ctx, page } = await open(browser, P);
      try {
        await goto(page, P, `&sector=${sector}&D=${D}&seed=dbl`); await waitPhase(page, 'recall');
        const pts = await answers(page, true), at = sector === 's3' ? [pts[0], pts[1], pts[1]] : [pts[0], pts[0]];
        for (const [x, y] of at) { await page.touchscreen.tap(x, y); await page.waitForTimeout(40); }
        await page.waitForTimeout(300);
        expect(await round(page, (r) => r.out.slips)).toBe(1); expect(await round(page, (r) => r.phase())).toBe('recall');
      } finally { await ctx.close(); }
    });
  }
  test('s2: after a miss the reveal shows EVERY target star numbered in order (no hole where the slipped star was)', async ({ browser }) => {
    const { ctx, page } = await open(browser, P);
    try {
      await goto(page, P, '&sector=s2&D=6&seed=rev'); await waitPhase(page, 'recall');
      for (const [x, y] of (await answers(page, true)).slice(0, 2)) { await page.touchscreen.tap(x, y); await page.waitForTimeout(80); }
      await sheetReady(page); await page.waitForTimeout(900);          // longer than the old 700 ms stale timer
      const marks = await round(page, (r) => { const a = r.adapter(), t = r.plan().stim.target as number[]; return t.map((i, j) => { const it = a.board.items.get(`s${i}`); return `${it?.kind}:${it?.num === j + 1}`; }); });
      expect(marks.every((m: string) => m === 'lit:true'), marks.join()).toBe(true);
      await shot(page, P, 'r1-s2-reveal');
    } finally { await ctx.close(); }
  });
  test('star gate: only the free first look; the look button says no afterwards and the dots tell the truth', async ({ browser }) => {
    const { ctx, page } = await open(browser, P);
    try {
      await goto(page, P, '&sector=s1&night=1&gate=1&seed=gl');
      await page.click('.mm-gate [data-act=enter]'); await waitPhase(page, 'recall');
      await page.click('[data-act=look]'); await waitPhase(page, 'recall');
      await page.click('[data-act=look]'); await page.waitForTimeout(300);
      expect(await round(page, (r) => r.out.rwPre + r.out.rwMid)).toBe(1); expect(await page.locator('[data-act=look].is-locked').count()).toBe(1);
      await solve(page); await sheetReady(page);
      expect(await page.locator('.mm-dots .mm-dot.is-p').count(), 'the finished round shows as passed').toBe(1);
      expect(await page.locator('.mm-dots .mm-dot.is-c').count(), 'and no stale "current" cell is left on it').toBe(0);
    } finally { await ctx.close(); }
  });
  test('leave and return (the in-round 星图站 button): same puzzle, same wing, no counters, the look adds up', async ({ browser }) => {
    const { ctx, page } = await open(browser, P);
    try {
      await goto(page, P, '&sector=s2&night=1&state=late&seed=ab'); await waitPhase(page, 'recall');
      const sig = () => round(page, (r) => { const p = r.plan(); return `${p.D}:${p.seed}:${p.stim.dir}`; });
      const first = await sig(), nights = await mm(page, (m) => m.engine.sec('s2').nights + ':' + m.engine.sec('s2').cur + ':' + m.engine.sec('s2').swaps);
      for (let k = 1; k <= 3; k += 1) {
        await page.click('[data-act=station]'); await page.waitForSelector('.mm-station.is-in');
        expect(await mm(page, (m) => m.engine.sec('s2').carryRw), `carry after leave ${k}`).toBe(k);
        await mm(page, (m) => void m.nightFlow('s2')); await waitPhase(page, 'recall');
        expect(await sig(), `same puzzle after return ${k}`).toBe(first);
        expect(await mm(page, (m) => m.engine.sec('s2').nights + ':' + m.engine.sec('s2').cur + ':' + m.engine.sec('s2').swaps), 'counters').toBe(nights);
      }
    } finally { await ctx.close(); }
  });
  test('s3: a pointer cancel (iPad system gesture) removes the flying tile; a second finger starts no second drag', async ({ browser }) => {
    const { ctx, page } = await open(browser, P);
    try {
      await goto(page, P, '&sector=s3&D=5&seed=pc'); await waitPhase(page, 'recall');
      const out = await page.evaluate(async () => {
        const tiles = Array.from(document.querySelectorAll<HTMLElement>('.mm-visitor')), ev = (t: HTMLElement, type: string, id: number, dx = 0, dy = 0) => { const b = t.getBoundingClientRect(); t.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 7, bubbles: true, cancelable: true, clientX: b.left + b.width / 2 + dx, clientY: b.top + b.height / 2 + dy })); };
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms)), ghosts = () => document.querySelectorAll('.xg-drag-ghost').length;
        ev(tiles[0], 'pointerdown', 7); ev(tiles[0], 'pointermove', 7, 40, -40); const g1 = ghosts();
        ev(tiles[1], 'pointerdown', 8); ev(tiles[1], 'pointermove', 8, 40, -40); const g2 = ghosts();
        ev(tiles[0], 'pointercancel', 7); await wait(700);
        return { g1, g2, after: ghosts(), lifted: document.querySelectorAll('.mm-visitor.is-lifted').length };
      });
      expect(out).toEqual({ g1: 1, g2: 1, after: 0, lifted: 0 });
    } finally { await ctx.close(); }
  });
  test('a long press (> 0.6 s) on a star still counts as a tap', async ({ browser }) => {
    const { ctx, page } = await open(browser, P);
    try {
      await goto(page, P, '&sector=s1&D=5&seed=lp'); await waitPhase(page, 'recall');
      const [x, y] = (await answers(page))[0];
      await page.evaluate(async ([px, py]) => { const c = document.querySelector('.mm-board canvas') as HTMLElement, o = { pointerId: 3, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: px, clientY: py }; c.dispatchEvent(new PointerEvent('pointerdown', o)); await new Promise((r) => setTimeout(r, 950)); c.dispatchEvent(new PointerEvent('pointerup', o)); }, [x, y]);
      await page.waitForTimeout(200); expect(await round(page, (r) => r.adapter().found())).toBe(1);
    } finally { await ctx.close(); }
  });
  test('a corrupt save (L = 99, garbage counters) is repaired: 开始夜航 always starts a round', async ({ browser }) => {
    const { ctx, page, w } = await open(browser, P);
    try {
      await goto(page, P, '');
      await mm(page, (m) => m.loadSave({ v: 1, sectors: { s1: { open: true, nr: 'x', tracks: [{ L: 99, maxL: 99, cleared: 7, atG: -9 }] }, s2: { open: true, cur: 5, tracks: [{ L: 0 }, { L: 77 }] } } }));
      await page.waitForSelector('.mm-station.is-in'); await page.click('[data-act=go]'); await waitPhase(page, 'recall');
      expect(await round(page, (r) => r.plan().D)).toBeLessThanOrEqual(15);
      expect(w.errors, w.errors.join('\n')).toEqual([]);
    } finally { await ctx.close(); }
  });
  test('storage disabled (private window): the game plays from memory and the station tells the parent', async ({ browser }) => {
    const { safe, ...rest } = VP[P]; void safe;
    const ctx = await browser.newContext({ ...rest, locale: 'zh-CN' });
    const page = await ctx.newPage();
    try {
      await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }; });
      await page.goto('/memory-matrix/'); await page.click('.xg-start__btn, .kit-start button, button:has-text("开始")'); await page.waitForSelector('#app[data-ready]', { timeout: 15_000 });
      await expect(page.locator('.mm-warn')).toBeVisible(); expect(await page.textContent('.mm-warn')).toContain('不能保存');
      await page.click('[data-act=go]'); await page.waitForSelector('.mm-round', { timeout: 15_000 });
    } finally { await ctx.close(); }
  });
  test('automatic demonstration rounds can be skipped (kit 跳过), straight to the child\'s own round', async ({ browser }) => {
    const { ctx, page } = await open(browser, P);
    try {
      await goto(page, P, ''); await mm(page, (m) => { m.engine.sec('s1').queue = ['demo']; void m.nightFlow('s1'); });
      await page.waitForSelector('.mm-round[data-kind=demo] , .mm-round'); expect(await round(page, (r) => r.plan().kind)).toBe('demo');
      await page.waitForSelector('.xg-skip', { timeout: 6000 }); await page.click('.xg-skip');
      await waitPhase(page, 'recall'); expect(await round(page, (r) => r.plan().kind)).not.toBe('demo');
    } finally { await ctx.close(); }
  });
  test('the first visitors (s3) come with an automatic example that can be skipped; it is shown once only', async ({ browser }) => {
    const { ctx, page } = await open(browser, P);
    try {
      await goto(page, P, ''); await mm(page, (m) => { const t = m.engine.sec('s3').tracks[0]; m.engine.sec('s3').open = true; t.L = 3; t.placement = false; void m.nightFlow('s3'); });
      await page.waitForSelector('.mm-round'); expect(await round(page, (r) => r.plan().newRuleTag)).toBe('s3:far');
      await page.waitForSelector('.xg-skip', { timeout: 6000 }); await page.click('.xg-skip'); await waitPhase(page, 'recall');
      expect(await mm(page, (m) => m.engine.save.seenRules)).toContain('s3:far');
      await solve(page); await sheetReady(page); await page.click('.mm-sheet [data-act=next]'); await waitPhase(page, 'recall');
      expect(await round(page, (r) => r.plan().newRuleTag)).toBeNull();
    } finally { await ctx.close(); }
  });
  test('the first card is a moment: it tilts in BIG before the result sheet (not a 48 px thumbnail)', async ({ browser }) => {
    const { ctx, page } = await open(browser, P);
    try {
      await goto(page, P, '&sector=s1&night=1&seed=cr'); await waitPhase(page, 'recall'); await mm(page, (m) => { m.app.fast = false; });
      await solve(page); await page.waitForSelector('.mm-reveal-card img', { timeout: 8000 }); await page.waitForTimeout(1000);
      const b = (await (await page.$('.mm-reveal-card img'))!.boundingBox())!; expect(b.width).toBeGreaterThanOrEqual(150);
      expect(await page.textContent('.mm-reveal-card')).toContain('北斗七星'); await shot(page, P, 'r1-card-reveal');
      await sheetReady(page);
    } finally { await ctx.close(); }
  });
});
