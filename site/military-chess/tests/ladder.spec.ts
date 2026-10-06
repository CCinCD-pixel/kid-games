/**
 * 陆战棋 browser tests, build stage 2 — games against the robots (spec §9.6 fan / an-noleak / lock /
 * resume groups): the real Worker AI answers; a robot without moves ends the game within a second;
 * a lost game has no confetti and plays jingle-round-over; messages to the Worker carry no hidden
 * identity; a restart while the robot thinks drops the old answer; a puzzle resumes after a reload.
 */
import { expect, test, type Page } from '@playwright/test';
import { shot } from '../../../tests/smoke/helpers';

const URL = '/military-chess/?test=1&fast=1';
async function open(page: Page, extra = ''): Promise<void> {
  await page.goto(URL + extra);
  await page.waitForSelector('#app[data-ready]');
}
async function tap(page: Page, at: string): Promise<void> {
  const pt = await page.evaluate((a) => (window as any).__mc.point(a), at);
  await page.touchscreen.tap(pt.x, pt.y);
}
async function position(page: Page, pieces: Record<string, string>, o: Record<string, unknown>): Promise<void> {
  await page.evaluate(([p, oo]) => (window as any).__mc.position(p, oo), [pieces, o] as const);
  await page.waitForFunction(() => ['idle', 'thinking'].includes((window as any).__mc.phase()));
}
const BAL = '527369B841371652M41BMFM32', FORT = '234216571B835B9146M723MFM';
function ladderMatch(mode: 'ming' | 'an', id: string) {
  return {
    v: 1, id, mode, setup: { firstMover: 0, red: BAL, blue: FORT }, actions: [], opponent: { kind: 'ai', level: 2 }, kidSide: 0, kidSeat: 'near', tags: {},
    hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: true,
  };
}

test.describe('陆战棋 · 对战机器人', () => {
  test('fan: a robot left without any move loses at once (result within a second)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { (window as any).__mc.app.save.settings.coachAlerts = 'off'; });
    // BLUE (the robot) only has a face-up flag boxed in by its mines: after RED's move it cannot act
    await position(page, { c6: 'r5^', a1: 'rF^', b12: 'bF^', a12: 'bM^', c12: 'bM^', b11: 'bM^' }, { mode: 'fan', family: false, ladder: true });
    await tap(page, 'c6');
    const t0 = Date.now();
    await tap(page, 'c5');
    await page.waitForFunction(() => (window as any).__mc.screen() === 'result', null, { timeout: 5_000 });
    expect(Date.now() - t0).toBeLessThan(1_500);
    await expect(page.locator('[data-testid="result-title"]')).toHaveText('演习胜利');
  });

  test('a lost game: no confetti, jingle-round-over, neutral title', async ({ page }, info) => {
    await open(page);
    await page.evaluate(() => { (window as any).__mc.app.save.settings.coachAlerts = 'off'; });
    // RED's only mobile piece attacks a bigger face-up piece and goes down; after BLUE's move RED cannot move
    await position(page, { c6: 'r3^', c7: 'b8^', a1: 'rF^', b1: 'rM^', b12: 'bF^', a12: 'bM^', e9: 'b4^' }, { mode: 'fan', family: false, ladder: true });
    await tap(page, 'c6');
    await tap(page, 'c7');
    await page.waitForFunction(() => (window as any).__mc.screen() === 'result', null, { timeout: 15_000 });
    await expect(page.locator('[data-testid="result-title"]')).toHaveText('这局结束啦');
    expect(await page.evaluate(() => (window as any).__mc.sounds.includes('jingle-round-over'))).toBe(true);
    await page.waitForTimeout(1200);
    await expect(page.locator('.xg-confetti, .kit-confetti')).toHaveCount(0);
    await shot(page, info.project.name, 'military-chess-result-loss');
  });

  test('an-noleak: the messages posted to the Worker never contain the child\'s identities', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { (window as any).__mc.app.save.settings.coachAlerts = 'off'; });
    await page.evaluate((m) => (window as any).__mc.app.go({ name: 'match', setup: m }), ladderMatch('an', 'leak1'));
    await page.waitForFunction(() => (window as any).__mc.phase() === 'idle', null, { timeout: 15_000 });
    for (let i = 0; i < 4; i++) {
      await page.waitForFunction(() => (window as any).__mc.phase() === 'idle' || (window as any).__mc.phase() === 'ended', null, { timeout: 15_000 });
      if ((await page.evaluate(() => (window as any).__mc.phase())) === 'ended') break;
      await page.evaluate(() => (window as any).__mc.autoMove('leak'));
      await page.waitForTimeout(150);
    }
    const sent = await page.evaluate(() => (window as any).__mcAi.sent as Array<{ view: { me: number; pside: number[]; ptype: number[]; flagShown: boolean[]; palive: number[] } }>);
    expect(sent.length).toBeGreaterThan(0);
    for (const msg of sent) {
      const v = msg.view;
      expect(v.me).toBe(1);
      v.pside.forEach((side, p) => {
        if (side === 0) expect(v.ptype[p] === -1 || (v.ptype[p] === 0 && v.flagShown[0]), `piece ${p}`).toBe(true);
      });
      expect(JSON.stringify(msg)).not.toContain('"state"');
    }
  });

  test('restart while the robot thinks: the old answer is dropped', async ({ page }) => {
    await open(page, '&aiwait=1500');
    await page.evaluate(() => { (window as any).__mc.app.save.settings.coachAlerts = 'off'; });
    await page.evaluate((m) => (window as any).__mc.app.go({ name: 'match', setup: m }), ladderMatch('ming', 'rs1'));
    await page.waitForFunction(() => (window as any).__mc.phase() === 'idle', null, { timeout: 15_000 });
    await page.evaluate(() => (window as any).__mc.autoMove('rs'));
    await page.waitForFunction(() => (window as any).__mc.phase() === 'thinking', null, { timeout: 5_000 });
    await page.locator('[data-testid="menu"]').click();
    await page.locator('[data-testid="menu-restart"]').click();
    await page.locator('[data-testid="sheet-primary"]').click();
    await page.waitForFunction(() => (window as any).__mc.screen() === 'match' && (window as any).__mc.ctx().notes.length === 0);
    await page.waitForTimeout(2500);
    // the new game is untouched by the old request (the child moves first)
    expect(await page.evaluate(() => (window as any).__mc.ctx().notes.length)).toBe(0);
    expect(await page.evaluate(() => (window as any).__mc.phase())).toBe('idle');
  });

  test('match hint 💡: first press points at a piece, the second draws the arrow; the same position gives the same hint', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { (window as any).__mc.app.save.settings.coachAlerts = 'off'; });
    await page.evaluate((m) => (window as any).__mc.app.go({ name: 'match', setup: m }), ladderMatch('ming', 'hint1'));
    await page.waitForFunction(() => (window as any).__mc.phase() === 'idle', null, { timeout: 15_000 });
    await page.locator('[data-testid="hint"]').tap();
    await page.waitForTimeout(400);
    await page.locator('[data-testid="hint"]').tap();
    await expect(page.locator('.mc-hint-arrow')).toHaveCount(1, { timeout: 8_000 });
    const d1 = await page.locator('.mc-hint-arrow').getAttribute('d');
    await page.reload();
    await page.waitForSelector('#app[data-ready]');
    await page.evaluate(() => (window as any).__mc.app.go({ name: 'match', resume: true }));
    await page.waitForFunction(() => (window as any).__mc.phase() === 'idle', null, { timeout: 15_000 });
    await page.locator('[data-testid="hint"]').tap();
    await page.waitForTimeout(400);
    await page.locator('[data-testid="hint"]').tap();
    await expect(page.locator('.mc-hint-arrow')).toHaveCount(1, { timeout: 8_000 });
    expect(await page.locator('.mc-hint-arrow').getAttribute('d')).toBe(d1);
  });

  test('暗棋 侦察便签: a long press on a hidden enemy piece opens the tag menu; the tag sticks', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { (window as any).__mc.app.save.settings.coachAlerts = 'off'; });
    await page.evaluate((m) => (window as any).__mc.app.go({ name: 'match', setup: m }), ladderMatch('an', 'tag1'));
    await page.waitForFunction(() => (window as any).__mc.phase() === 'idle', null, { timeout: 15_000 });
    const pt = await page.evaluate(() => (window as any).__mc.point('c12'));
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(page.locator('[data-testid="tag-mine"]')).toBeVisible();
    await page.locator('[data-testid="tag-mine"]').click();
    await expect(page.locator('[data-testid="tag"]')).toHaveCount(1);
  });

  test('resume: a puzzle two moves in survives a reload and continues from the same position', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__mc.app.go({ name: 'item', id: 'L1-6' }));
    await page.waitForFunction(() => (window as any).__mc.dbg()?.introDone(), null, { timeout: 15_000 });
    const play = async (a: string, b: string) => {
      await page.waitForFunction(() => (window as any).__mc.dbg().busy() === 0);
      await tap(page, a);
      await tap(page, b);
      await page.waitForFunction(() => (window as any).__mc.dbg().busy() === 0);
    };
    await play('c6', 'c7');
    await play('c7', 'd7');
    const before = await page.evaluate(() => { const s = (window as any).__mc.dbg().state(); return Array.from(s.board).join(','); });
    await page.reload();
    await page.waitForSelector('#app[data-ready]');
    expect(await page.evaluate(() => (window as any).__mc.save().puzzleResume?.red)).toEqual(['c6xc7', 'c7xd7']);
    await page.evaluate(() => (window as any).__mc.app.go({ name: 'item', id: 'L1-6', resume: true }));
    await page.waitForFunction(() => (window as any).__mc.dbg()?.pc(), null, { timeout: 10_000 });
    const after = await page.evaluate(() => { const s = (window as any).__mc.dbg().state(); return Array.from(s.board).join(','); });
    expect(after).toBe(before);
    await page.waitForFunction(() => (window as any).__mc.dbg().busy() === 0);
    await tap(page, 'a6');
    await tap(page, 'a7');
    await page.waitForFunction(() => (window as any).__mc.dbg()?.finished(), null, { timeout: 10_000 });
  });
});
