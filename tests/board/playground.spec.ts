// 棋盘引擎端到端（WebKit；游乐场 /dev/board/）：点选 / 拖动 / 锁 / 动画 / 升变 / 易位 / 过路兵 / f2f / 翻转 / 竞态。
import { expect, test, type Page } from '@playwright/test';
import { boardPage } from '../../engines/board/test/pw';
import { SHOTS_DIR } from './playwright.config';

/* eslint-disable @typescript-eslint/no-explicit-any */
const SAFE = '24,0,20,0';
const errs = new WeakMap<Page, string[]>();
async function open(page: Page, q: string): Promise<ReturnType<typeof boardPage>> {
  const list: string[] = errs.get(page) ?? []; if (!errs.has(page)) { errs.set(page, list); page.on('pageerror', (e) => list.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); }); }
  list.length = 0; await page.goto(`/dev/board/?mute=1&safe=${SAFE}${q.includes('bot=') ? '' : '&bot=0'}&${q}`, { waitUntil: 'networkidle' }); const b = boardPage(page); await b.waitReady(); await b.waitIdle(); return b;
}
const errsOf = (page: Page): string[] => errs.get(page) ?? [];

test.describe('点选与走子', () => {
  test('初始：32 子、视图 = 状态、在视口内、页面不可滚动、无报错', async ({ page }) => {
    for (const g of ['xq', 'chess']) { const b = await open(page, `game=${g}`); expect((await b.state()).pieces.length).toBe(32); expect(await b.viewMatchesState()).toBeNull(); expect(await b.expectInViewport()).toBeNull(); expect(await b.expectNoOverflow()).toBeNull(); expect(errsOf(page)).toEqual([]); }
  });
  test('国象：点 g1 → 马的合法点；点另一己方子 = 改选', async ({ page }) => {
    const b = await open(page, 'game=chess'); await b.tapSq('g1'); let m = await b.legalMarks(); expect(m.select).toEqual(['g1']); expect(m.legal.join()).toBe('f3,h3');
    await b.tapSq('b1'); m = await b.legalMarks(); expect(m.select).toEqual(['b1']); expect(m.legal.join()).toBe('a3,c3');
  });
  test('点选 4 级：非法格给原因、不走子；点自己 = 取消选择', async ({ page }) => {
    const b = await open(page, 'game=chess'); await b.tapSq('g1'); await b.tapSq('g4'); let s = await b.state(); expect(s.events.some((e) => e.startsWith('illegal:'))).toBe(true); expect(s.encoded).toEqual([]); expect(s.selected).not.toBeNull();
    await b.tapSq('g1'); s = await b.state(); expect(s.selected).toBeNull(); expect(s.mode).toBe('idle');
  });
  test('点—点走子：e2 → e4，动画结束后视图 = 状态，落子事件触发一次', async ({ page }) => {
    const b = await open(page, 'game=chess'); await b.tapSq('e2'); await b.tapSq('e4'); await b.waitIdle(); const s = await b.state();
    expect(s.encoded).toEqual(['e2e4']); expect(s.events.filter((e) => e.startsWith('landed'))).toHaveLength(1); expect(await b.viewMatchesState()).toBeNull(); expect(s.mode).toBe('idle'); expect(errsOf(page)).toEqual([]);
  });
  test('象棋：炮 b3 吃马 b10（隔炮架）→ 被吃子离场、托盘文字更新', async ({ page }) => {
    const b = await open(page, 'game=xq'); await b.tapSq('b3'); const m = await b.legalMarks(); expect(m.capture).toContain('b10'); await b.tapSq('b10'); await b.waitIdle();
    const s = await b.state(); expect(s.pieces.length).toBe(31); expect(await b.viewMatchesState()).toBeNull(); expect(s.events.some((e) => e.startsWith('captured'))).toBe(true); await expect(page.locator('#tray1')).toContainText('马');
  });
});

test.describe('拖动', () => {
  test('拖到合法格 = 走子；拖到非法格 / 棋盘外 = 飞回不走', async ({ page }) => {
    const b = await open(page, 'game=chess'); await b.dragSq('g1', 'f3'); await b.waitIdle(); let s = await b.state(); expect(s.encoded).toEqual(['g1f3']); expect(await b.viewMatchesState()).toBeNull();
    await b.dragSq('g8', 'g5'); await b.waitIdle(); await page.waitForTimeout(250); s = await b.state(); expect(s.encoded).toEqual(['g1f3']); expect(await b.viewMatchesState()).toBeNull();
    await b.dragSq('g8', null); await page.waitForTimeout(300); s = await b.state(); expect(s.encoded).toEqual(['g1f3']); expect(await b.viewMatchesState()).toBeNull();
  });
  test('pointercancel / lostpointercapture → 回到 selected，棋子飞回，不走子', async ({ page }) => {
    const b = await open(page, 'game=chess'); for (const end of ['cancel', 'lost'] as const) { await b.dragSq('e2', 'e4', { end }); await page.waitForTimeout(260); const s = await b.state(); expect(s.encoded).toEqual([]); expect(s.mode).toBe('selected'); expect(await b.viewMatchesState()).toBeNull(); }
  });
  test('第二根手指被忽略（计数 +1，不改变选择）', async ({ page }) => {
    const b = await open(page, 'game=chess'); await b.tapSq('g1'); const before = await b.state(); await b.secondFinger('b1'); const after = await b.state(); expect(after.ignoredTaps).toBe(before.ignoredTaps + 1); expect(after.selected).toBe(before.selected);
  });
  test('松手后从落点滑向目标格（fromPx：不先弹回起点）', async ({ page }) => {
    const b = await open(page, 'game=chess'); const e4 = await b.center('e4'); const cell = await page.evaluate(() => (window as any).__board.view.cellPx as number);
    await b.dragSq('e2', null, { toPx: { x: e4.x, y: e4.y + cell * 0.3 } });
    const c = await page.evaluate(() => { const el = document.querySelector('.bk-piece.is-lifted, .bk-piece[aria-label*="e4"]') as HTMLElement | null; const pcs = [...document.querySelectorAll('.bk-piece')].map((e) => (e as HTMLElement).getBoundingClientRect()); void el; return pcs.map((r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })); });
    const near = c.filter((p) => Math.hypot(p.x - e4.x, p.y - e4.y) < cell * 1.0); expect(near.length).toBeGreaterThanOrEqual(1);       // 有一个子正在 e4 附近（从落点滑来，而不是在 e2）
    await b.waitIdle(); expect((await b.state()).encoded).toEqual(['e2e4']);
  });
});

test.describe('特殊着法', () => {
  test('升变：到底线弹出选择框（≥76px，4 个）；Esc 取消 → 兵回原位；选马 → 升变', async ({ page }) => {
    const b = await open(page, 'game=chess&fen=8/P6k/8/8/8/8/6p1/K7 w - - 0 1'); await b.tapSq('a7'); await b.tapSq('a8'); const btns = page.locator('.bk-promo-btn'); await expect(btns).toHaveCount(4); const box = await btns.first().boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(76);
    await page.keyboard.press('Escape'); await expect(btns).toHaveCount(0); let s = await b.state(); expect(s.encoded).toEqual([]); expect(await b.viewMatchesState()).toBeNull();
    await b.tapSq('a8'); await expect(btns).toHaveCount(4); await btns.nth(3).tap(); await b.waitIdle(); s = await b.state(); expect(s.encoded[0]).toMatch(/^a7a8[qrbn]$/); expect(await b.viewMatchesState()).toBeNull(); expect(s.events.some((e) => e.startsWith('promoted'))).toBe(true);
  });
  test('王车易位：王与车同阶段并行滑行，结束后视图 = 状态', async ({ page }) => {
    const b = await open(page, 'game=chess&fen=r3k2r/ppp2ppp/2np1n2/4p3/4P3/2N2N2/PPPP1PPP/R3K2R w KQkq - 0 1'); await b.tapSq('e1'); const m = await b.legalMarks(); expect(m.legal).toContain('g1'); await b.tapSq('g1'); await b.waitIdle(); const s = await b.state();
    expect(s.encoded).toEqual(['e1g1']); expect(s.events.filter((e) => e.startsWith('landed'))).toHaveLength(2); expect(s.events.some((e) => e.startsWith('castled'))).toBe(true); expect(await b.viewMatchesState()).toBeNull();
  });
  test('吃过路兵：被吃的兵不在落点，视图同步', async ({ page }) => {
    const b = await open(page, 'game=chess&fen=rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3'); await b.tapSq('e5'); await b.tapSq('d6'); await b.waitIdle(); const s = await b.state(); expect(s.encoded).toEqual(['e5d6']); expect(s.pieces.length).toBe(31); expect(await b.viewMatchesState()).toBeNull();
  });
  test('一步杀：「将死」印章出现；终局后输入被拒', async ({ page }) => {
    const b = await open(page, 'game=chess&fen=r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'); await b.tapSq('h5'); await b.tapSq('f7'); await expect(page.locator('.bk-stamp')).toBeVisible(); await b.waitIdle(); await page.waitForTimeout(300);
    await expect(page.locator('#status')).toContainText('白方胜'); await b.tapSq('a2'); expect((await b.state()).selected).toBeNull();
  });
});

test.describe('锁与竞态', () => {
  test('动画期间连点（80/150/220/300/450ms）：不排队、不双走、视图 = 状态', async ({ page }) => {
    for (const gap of [80, 150, 220, 300, 450]) {
      const b = await open(page, 'game=chess'); await b.tapSq('e2'); await b.tapSq('e4'); await page.waitForTimeout(gap); await b.tapSq('e7'); await b.tapSq('e5'); await b.waitIdle(); await page.waitForTimeout(100);
      const s = await b.state(); expect(s.encoded.length).toBeLessThanOrEqual(2); expect(s.encoded[0]).toBe('e2e4'); expect(await b.viewMatchesState()).toBeNull(); expect(errsOf(page)).toEqual([]);
    }
  });
  test('动画中旋转屏幕：finishAnimations 后位置正确', async ({ page }) => {
    const b = await open(page, 'game=chess'); await b.tapSq('b1'); await b.tapSq('c3'); await page.waitForTimeout(60); const vs = page.viewportSize()!; await page.setViewportSize({ width: vs.height, height: vs.width }); await b.waitIdle(); await page.waitForTimeout(300);
    expect(await b.viewMatchesState()).toBeNull(); expect(await b.expectInViewport()).toBeNull(); await page.setViewportSize(vs);
  });
  test('悔棋：沿原路倒滑，状态与视图恢复；空历史悔棋不出错', async ({ page }) => {
    const b = await open(page, 'game=chess'); await b.tapSq('e2'); await b.tapSq('e4'); await b.waitIdle(); await page.locator('#b-undo').tap(); await b.waitIdle(); await page.waitForTimeout(100); const s = await b.state(); expect(s.encoded).toEqual([]); expect(await b.viewMatchesState()).toBeNull(); await page.locator('#b-undo').tap(); expect(errsOf(page)).toEqual([]);
  });
});

test.describe('朝向与面对面', () => {
  test('翻转棋盘：e1 移到顶部，点选命中新位置', async ({ page }) => {
    const b = await open(page, 'game=chess'); const before = await b.center('e1'); await page.evaluate(() => (window as any).__board.view.setOrientation('second-bottom')); const after = await b.center('e1'); expect(after.y).toBeLessThan(before.y); expect(await b.viewMatchesState()).toBeNull();
    await b.tapSq('e2'); const m = await b.legalMarks(); expect(m.select).toEqual(['e2']); expect(m.legal.join()).toBe('e3,e4');
  });
  test('f2f：后手方棋子字形旋转 180°，棋盘本体不转', async ({ page }) => {
    await open(page, 'game=xq&f2f=1'); const r = await page.evaluate(() => { const blk = document.querySelector('.bk-piece[aria-label^="黑"]') as HTMLElement; const red = document.querySelector('.bk-piece[aria-label^="红"]') as HTMLElement; const g = (e: HTMLElement): string => getComputedStyle(e.querySelector('.bk-toy-glyph') as HTMLElement).transform; return { black: g(blk), red: g(red), degBlack: blk.style.getPropertyValue('--bk-deg'), board: (document.querySelector('.bk-board') as HTMLElement).dataset.bkOrientation }; });
    expect(r.degBlack).toBe('180deg'); expect(r.black).not.toBe(r.red); expect(r.board).toBe('first-bottom'); await page.screenshot({ path: `${SHOTS_DIR}/pw-f2f-xq-${test.info().project.name}.png` });
  });
});

test.describe('会话：电脑对手（真 Worker）、面对面同意流程、复盘', () => {
  test('电脑（真 Worker）：孩子走 → 机器人回应（合法）→ 回到可操作；兜底没有启用', async ({ page }) => {
    const b = await open(page, 'game=chess&bot=1'); await b.tapSq('e2'); await b.tapSq('e4'); await page.waitForFunction(() => (window as any).__board.game.encoded().length === 2, null, { timeout: 15000 }); await b.waitIdle();
    const s = await b.state(); expect(s.encoded[0]).toBe('e2e4'); expect(await b.viewMatchesState()).toBeNull(); expect(await page.evaluate(() => (window as any).__board.ai.fallbackActive)).toBe(false); expect(await page.evaluate(() => (window as any).__board.ai.generations)).toBeGreaterThanOrEqual(1);
    await b.tapSq('d2'); expect((await b.state()).selected).not.toBeNull();       // 又能操作
  });
  test('机器人思考中悔棋：取消 AI（迟到的回复不落子），棋盘回到初始', async ({ page }) => {
    const b = await open(page, 'game=chess&bot=1&think=1500'); await b.tapSq('e2'); await b.tapSq('e4'); await page.waitForTimeout(450); expect((await b.state()).locked).toBe(true); await page.locator('#b-undo').tap(); await b.waitIdle(); await page.waitForTimeout(2200);
    const s = await b.state(); expect(s.encoded).toEqual([]); expect(await b.viewMatchesState()).toBeNull(); expect(errsOf(page)).toEqual([]);
  });
  test('面对面悔棋：对方侧弹卡片（朝向对方），期间棋盘全锁；先不用 / 撤回 / 同意', async ({ page }) => {
    const b = await open(page, 'game=chess&f2f=1'); await b.tapSq('e2'); await b.tapSq('e4'); await b.waitIdle();
    await page.locator('#b-undo').tap(); const ask = page.locator('.bk-f2f-card[data-seat="1"]:not(.is-wait)'); await expect(ask).toBeVisible(); expect(await ask.evaluate((e) => getComputedStyle(e).transform)).toMatch(/matrix\(-?[\d.]+, -?[\d.e-]+, -?[\d.e-]+, /);
    const tall = await ask.locator('.bk-f2f-btn').first().boundingBox(); expect(tall!.height).toBeGreaterThanOrEqual(60);
    await b.tapSq('e7'); expect((await b.state()).selected).toBeNull();                                                  // 全锁
    await ask.locator('.bk-f2f-btn').nth(1).tap(); await expect(ask).toHaveCount(0); expect((await b.state()).encoded).toEqual(['e2e4']); await b.tapSq('e7'); expect((await b.state()).selected).not.toBeNull(); await b.tapSq('e7');   // 先不用 → 解锁
    await page.locator('#b-undo').tap(); await expect(page.locator('.bk-f2f-card.is-wait')).toBeVisible(); await page.locator('.bk-f2f-card.is-wait .bk-f2f-btn').tap(); await expect(page.locator('.bk-f2f-card')).toHaveCount(0); expect((await b.state()).locked).toBe(false);     // 撤回
    await page.locator('#b-undo').tap(); await page.locator('.bk-f2f-card[data-seat="1"]:not(.is-wait) .bk-f2f-btn').first().tap(); await b.waitIdle(); await page.waitForTimeout(150); expect((await b.state()).encoded).toEqual([]); expect(await b.viewMatchesState()).toBeNull();   // 同意
    await page.screenshot({ path: `${SHOTS_DIR}/pw-f2f-consent-${test.info().project.name}.png` });
  });
  test('面对面认输：二次确认；确认后胜负显示、输入被拒；轮次灯跟随', async ({ page }) => {
    const b = await open(page, 'game=chess&f2f=1'); expect(await page.evaluate(() => (window as any).__board.f2f.lamp)).toBe(0); await b.tapSq('e2'); await b.tapSq('e4'); await b.waitIdle(); expect(await page.evaluate(() => (window as any).__board.f2f.lamp)).toBe(1);
    await page.evaluate(() => (document.getElementById('b-resign') as HTMLElement).click()); const card = page.locator('.bk-f2f-card'); await expect(card).toHaveCount(1); await card.locator('.bk-f2f-btn').nth(1).tap(); await expect(card).toHaveCount(0);   // 继续下
    await page.evaluate(() => (document.getElementById('b-resign') as HTMLElement).click()); await page.locator('.bk-f2f-card .bk-f2f-btn').first().tap(); await expect(page.locator('#status')).toContainText('白方胜'); await b.tapSq('e7'); expect((await b.state()).selected).toBeNull();
  });
  test('复盘：进入 → ◀ ▶ ⏮ → 视图与该手局面一致；退出后回到当前局面', async ({ page }) => {
    const b = await open(page, 'game=chess'); for (const t of ['e2e4', 'e7e5', 'g1f3']) { await page.evaluate((x) => (window as any).__board.play(x), t); await b.waitIdle(); }
    await page.evaluate(() => (document.getElementById('b-replay') as HTMLElement).click()); await expect(page.locator('#status')).toContainText('复盘'); expect(await page.evaluate(() => (window as any).__board.replay.ply)).toBe(3);
    await page.locator('#r-prev').tap(); await page.waitForTimeout(350); await page.locator('#r-prev').tap(); await page.waitForTimeout(350); expect(await page.evaluate(() => (window as any).__board.replay.ply)).toBe(1);
    const n = await page.evaluate(() => (window as any).__board.view.debug().pieces.length); expect(n).toBe(32); const e4 = await page.evaluate(() => { const b2 = (window as any).__board; return b2.view.debug().pieces.filter((p: { sq: number }) => b2.rules.geometry.name(p.sq) === 'e4').length; }); expect(e4).toBe(1);
    await page.locator('#r-start').tap(); expect(await page.evaluate(() => (window as any).__board.replay.ply)).toBe(0); await page.locator('#r-exit').tap(); await expect(page.locator('#status')).not.toContainText('复盘'); expect(await b.viewMatchesState()).toBeNull(); await b.tapSq('d7'); expect((await b.state()).selected).not.toBeNull();
  });
});
