/**
 * 陆战棋 on phones (Dad, 2026-10-08): every screen fits phone portrait (iPhone 13 Safari 390×664,
 * iPhone SE 320×568) and phone landscape (844×390) — nothing outside the screen, no page scroll, no two
 * tap targets on top of each other, tap targets ≥ 44 px, words ≥ 13 px, and on a 390-wide portrait
 * phone the piece names on the board are ≥ 14 px. Runs on the phone projects only.
 */
import { expect, test, type Page } from '@playwright/test';

const URL = '/military-chess/?test=1&fast=1';
async function open(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForSelector('#app[data-ready]');
}
async function go(page: Page, r: Record<string, unknown>): Promise<void> {
  await page.evaluate((rr) => (window as any).__mc.app.go(rr), r);
  await page.waitForTimeout(900);
}
async function tap(page: Page, at: string): Promise<void> {
  const pt = await page.evaluate((a) => (window as any).__mc.point(a), at);
  await page.touchscreen.tap(pt.x, pt.y);
}
const FAN = { b11: 'r9^', b12: 'bF^', b1: 'rF^', e7: 'b5^', c3: 'r3', d10: 'b7', a6: 'r6^', d4: 'b2^', e10: 'b4', a1: 'rB', c7: 'bM^' };
async function match(page: Page, pieces: Record<string, string> = FAN): Promise<void> {
  await page.evaluate((p) => (window as any).__mc.position(p, { mode: 'fan', ladder: true, family: false }), pieces);
  await page.waitForFunction(() => ['idle', 'thinking'].includes((window as any).__mc.phase()));
  await page.waitForTimeout(500);
}

/** in-page audit in CSS px (the stage scale included); scroll panels (家长面板) are checked as a whole */
async function audit(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const W = innerWidth, H = innerHeight;
    const shown = (el: Element): boolean => {
      for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const inScroller = (el: Element): boolean => !!el.closest('.mc-pscroll, .mc-parent .mc-pform');
    const name = (el: Element): string => ((el as HTMLElement).dataset?.testid || el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).toString().trim().slice(0, 20);
    const outside = (r: DOMRect): boolean => r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = n.textContent?.trim();
      const el = n.parentElement;
      if (!t || !el || el.closest('svg, script, style, .xg-ghost-hand') || !shown(el)) continue;
      // the stage scale from a box wide enough that offsetWidth rounding does not matter (a one-character
      // span at a fractional x reads 17 for 16 and made 13.1 px look like 12.4)
      let box: HTMLElement | null = el;
      while (box && box.offsetWidth < 40 && box.parentElement) box = box.parentElement;
      const k = box && box.offsetWidth ? box.getBoundingClientRect().width / box.offsetWidth : 1;
      const px = parseFloat(getComputedStyle(el).fontSize) * k;
      if (px < 12.9) out.push(`small text "${t.slice(0, 10)}" ${px.toFixed(1)}px`);
      if (!inScroller(el) && outside(el.getBoundingClientRect())) out.push(`outside "${t.slice(0, 10)}"`);
    }
    const btns = [...document.querySelectorAll('button, a[href], [role="button"], input, select')].filter(
      (b) => shown(b) && getComputedStyle(b).pointerEvents !== 'none' && !(b as HTMLButtonElement).disabled && !inScroller(b),
    );
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) out.push(`small target ${name(b)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (outside(r)) out.push(`target outside ${name(b)}`);
    }
    // the caption bubble comes and goes while a line is said: it is not part of the layout check
    const solid = btns.filter((b) => !b.closest('.mc-caption'));
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      if (a.contains(b) || b.contains(a)) continue;
      const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      if (p.left < q.right - 2 && q.left < p.right - 2 && p.top < q.bottom - 2 && q.top < p.bottom - 2) out.push(`overlap ${name(a)} / ${name(b)}`);
    }
    for (const s of document.querySelectorAll('.mc-pscroll')) if (outside(s.getBoundingClientRect())) out.push('scroll panel outside');
    if (document.documentElement.scrollWidth > W + 1 || document.documentElement.scrollHeight > H + 1) out.push('page scrolls');
    return out;
  });
}

const SCREENS: Array<[string, Record<string, unknown>]> = [
  ['营地', { name: 'home' }],
  ['对战', { name: 'ladder' }],
  ['和爸爸下', { name: 'family' }],
  ['学堂', { name: 'academy' }],
  ['残局', { name: 'endgames' }],
  ['勋章柜', { name: 'medals' }],
  ['规则卡', { name: 'rules', from: 'home' }],
  ['家长面板', { name: 'parent' }],
  ['翻翻棋入门 F-1', { name: 'item', id: 'F-1' }],
  ['棋盘题 L1-3', { name: 'item', id: 'L1-3' }],
  ['排军衔 L1-1', { name: 'item', id: 'L1-1' }],
  ['比大小 L1-2', { name: 'item', id: 'L1-2' }],
];

/**
 * Each phone case runs on its own phone project (tests/military-chess/playwright.dev.config.ts) and, in the
 * platform smoke (tests/smoke, iPad projects only), once on the iPad portrait project with the phone viewport.
 */
const PHONES = [
  ['phone-390x664', { width: 390, height: 664 }],
  ['phone-se-320x568', { width: 320, height: 568 }],
  ['phone-land-844x390', { width: 844, height: 390 }],
] as const;

for (const [pname, viewport] of PHONES) test.describe(`陆战棋 · phones · ${pname}`, () => {
  test.use({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test.beforeEach(({}, info) => test.skip(info.project.name !== pname && info.project.name !== 'portrait-810x1080', 'one phone per project'));

  test('every menu screen and lesson fits the phone (no clipping, overlap or tiny targets)', async ({ page }) => {
    await open(page);
    const bad: string[] = [];
    for (const [label, r] of SCREENS) {
      await go(page, r);
      // the phone stage (390 across in portrait / 390 tall in landscape), not the letterboxed iPad one
      expect(await page.evaluate(() => document.documentElement.dataset.mcPhone), label).toBe('1');
      for (const issue of await audit(page)) bad.push(`${label}: ${issue}`);
    }
    expect(bad).toEqual([]);
  });

  test('a 翻翻棋 game: the board fills the screen, piece names are readable, the HUD fits', async ({ page }) => {
    await open(page);
    await match(page);
    expect(await audit(page)).toEqual([]);
    const vw = page.viewportSize()!;
    const box = await page.locator('.mc-board').first().boundingBox();
    if (vw.width < vw.height) expect(box!.width).toBeGreaterThan(vw.width * 0.95);
    else expect(box!.height).toBeGreaterThan(vw.height * 0.95);
    // piece names (two characters on a face-up tile) — ≥ 14 px on a 390-wide portrait phone, ≥ 13 elsewhere
    const min = await page.evaluate(() => {
      let m = Infinity;
      for (const t of document.querySelectorAll('.mc-board .mc-piece text')) {
        if (!/[一-鿿]/.test(t.textContent ?? '')) continue;
        const ctm = (t as SVGGraphicsElement).getScreenCTM();
        const px = parseFloat(t.getAttribute('font-size') || getComputedStyle(t).fontSize) * (ctm ? Math.hypot(ctm.a, ctm.b) : 1);
        m = Math.min(m, px);
      }
      return m;
    });
    expect(min).toBeGreaterThanOrEqual(pname === 'phone-390x664' ? 14 : 12.9);
    // the menu sheet fits as well
    await page.locator('[data-testid="menu"]').click();
    await page.waitForTimeout(500);
    const sheet = await page.locator('[data-testid="menu-sheet"] .mc-sheet').boundingBox();
    expect(sheet!.y).toBeGreaterThanOrEqual(0);
    expect(sheet!.y + sheet!.height).toBeLessThanOrEqual(vw.height + 1);
  });

  test('规则卡: the read-aloud bubble never covers the card, 翻过来 or the dots; the art stays under the title (QA fb1 r2)', async ({ page }) => {
    await open(page);
    await go(page, { name: 'rules', from: 'home' });
    const bad: string[] = [];
    // a landscape phone is also checked at the iPhone SE's 568×320 (the narrowest card)
    const sizes = page.viewportSize()!.width > page.viewportSize()!.height ? [null, { width: 568, height: 320 }] : [null];
    for (const size of sizes) {
    if (size) {
      await page.setViewportSize(size);
      await page.waitForTimeout(600);
    }
    for (let k = 1; k <= 8; k++) {
      for (const back of [false, true]) {
        await page.evaluate(([kk, bb]) => {
          const s = (window as any).__mc.app.screen();
          s.k = kk - 1;
          s.flipped = bb;
          s.render();
          // the longest rule line, shown as it is while a card is read
          s.caption.show('炸弹碰谁都一起下场，地雷只怕工兵和炸弹');
        }, [k, back] as const);
        await page.waitForTimeout(350);
        const out = await page.evaluate(() => {
          const res: string[] = [];
          const R = (sel: string): DOMRect | null => document.querySelector(sel)?.getBoundingClientRect() ?? null;
          const hit = (p: DOMRect | null, q: DOMRect | null): boolean => !!p && !!q && p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1;
          const card = R('[data-testid="rule-card"]')!, cap = R('.mc-caption.is-on'), flip = R('[data-testid="rule-flip"]')!;
          const h2 = R('.mc-rulecard h2')!, art = R('.mc-rulecard__art'), dots = R('.mc-ruledots'), words = R('.mc-rulecard__t');
          const inside = (r: DOMRect): boolean => r.left >= card.left - 1 && r.right <= card.right + 1 && r.top >= card.top - 1 && r.bottom <= card.bottom + 1;
          if (!cap) res.push('no caption');
          if (hit(cap, card)) res.push('caption over the card');
          if (hit(cap, flip)) res.push('caption over 翻过来');
          if (hit(cap, dots)) res.push('caption over the dots');
          for (const id of ['rule-prev', 'rule-next']) if (hit(cap, R(`[data-testid="${id}"]`))) res.push(`caption over ${id}`);
          if (!inside(flip)) res.push('翻过来 outside the card');
          if (art && art.top < h2.bottom + 2) res.push(`art up into the title (${Math.round(art.top)} < ${Math.round(h2.bottom)})`);
          if (art && !inside(art)) res.push('art outside the card');
          if (hit(art, words)) res.push('art over the words');
          if (hit(dots, h2)) res.push('dots over the title');
          if (hit(R('.mc-rules > .mc-h1'), card)) res.push('card over the screen title');
          if (hit(R('.mc-rulecard__n'), art) || hit(R('.mc-rulecard__n'), R('.mc-rulecard__back'))) res.push('number badge over the art / words');
          if (hit(flip, words) || hit(flip, R('.mc-rulecard__front-note')) || hit(flip, R('.mc-rulecard__back'))) res.push('翻过来 over the words');
          for (const sel of ['.mc-rulecard__t', '.mc-rulecard__front-note', '.mc-rulecard__back', '.mc-rulecard__note']) {
            const e = document.querySelector(sel);
            if (e && !inside(e.getBoundingClientRect())) res.push(`${sel} outside the card`);
            if (e && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)) res.push(`${sel} spills out of its box`);
          }
          return res;
        });
        for (const o of out) bad.push(`${size ? '568×320 ' : ''}card ${k}${back ? ' (back)' : ''}: ${o}`);
      }
    }
    }
    expect(bad).toEqual([]);
    expect(await audit(page)).toEqual([]);
  });

  test('the result screen fits (flag win: rule line and actions on screen)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { (window as any).__mc.app.save.settings.coachAlerts = 'off'; });
    await match(page, { ...FAN, c7: 'b6^' });
    await tap(page, 'b11');
    await tap(page, 'b12');
    await page.waitForFunction(() => (window as any).__mc.screen() === 'result', null, { timeout: 15_000 });
    await page.waitForTimeout(1200);
    await expect(page.locator('[data-testid="flag-rule"]')).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });

  test('the result screen fits with new cards + the next robot, three moments and the handicap offer (QA fb1)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { (window as any).__mc.app.save.settings.coachAlerts = 'off'; });
    await match(page, { ...FAN, c7: 'b6^' });
    await tap(page, 'b11');
    await tap(page, 'b12');
    await page.waitForFunction(() => (window as any).__mc.screen() === 'result', null, { timeout: 15_000 });
    const variants = [
      { newCards: ['bomb', 'camp'], unlocked: 2 },
      { newCards: ['bomb', 'camp', 'hq', 'fair', 'mine'], unlocked: 2 },
      { newCards: ['bomb', 'camp'], unlocked: null, winnerPlayer: 1, result: { winner: 1, reason: 'no-moves' }, offer: 1 },
    ];
    for (const patch of variants) {
      await page.evaluate((pp) => {
        const w = window as any;
        w.__mc.app.go({ name: 'result', data: { ...w.__mc.app.screen().data, ...pp } });
        // a test game has one key moment: three, with the longest captions
        const s = w.__mc.app.screen();
        const m0 = s.moments[0];
        s.moments = [{ ...m0, line: 'mc.rep.mine' }, { ...m0, line: 'mc.rep.bomb.kid' }, { ...m0, line: 'mc.rep.final' }];
        s.layout(s.o, s.safeTop);
      }, patch);
      await page.waitForTimeout(700);
      const label = JSON.stringify(patch).slice(0, 40);
      expect(await audit(page), label).toEqual([]);
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        const W = innerWidth, H = innerHeight;
        const R = (e: Element) => e.getBoundingClientRect();
        const hit = (p: DOMRect, q: DOMRect) => p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1;
        const tiles = [...document.querySelectorAll('.mc-rtile')].map(R);
        const blocks = [...document.querySelectorAll('.mc-result__acts .xg-btn, .mc-moment')].map(R);
        for (const t of tiles) {
          if (t.left < 0 || t.top < 0 || t.right > W || t.bottom > H) out.push('tile off screen');
          if (blocks.some((b) => hit(t, b))) out.push('tile over a button / moment');
        }
        for (const c of document.querySelectorAll('.mc-moment')) {
          const cr = R(c);
          for (const s of c.querySelectorAll('.mc-moment__cap .mc-nb')) {
            const r = R(s);
            if (r.left < cr.left - 1 || r.right > cr.right + 1 || r.bottom > cr.bottom + 1) out.push(`moment words spill: ${s.textContent}`);
          }
        }
        return out;
      });
      expect(bad, label).toEqual([]);
      expect(await page.locator('.mc-rtile').count(), label).toBeGreaterThanOrEqual(2);
    }
  });
});
