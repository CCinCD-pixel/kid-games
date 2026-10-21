/**
 * 双人分屏对战 · 怎么玩 + 结果语音 (2026-10-20). Headless and muted (the kit auto-mutes under automation; `silentvoice` makes the
 * narrator show every line as text at reading pace, so no clip is ever decoded or played).
 *   npx vite --port 5304 --strictPort    (another shell)
 *   npx playwright test -c tests/snake-battle/playwright.dev.config.ts versus-intro
 * Proves: the card shows once on the first entry (the match waits under it), the six rules are read in order and light up,
 * the kit bar carries the same line, 再听一遍 restarts the reading, the kit 跳过 and 开始比赛 end it and start the 3-2-1, it never
 * comes back by itself (also not after 再来一局 / 回大厅), the parent's 跳过开场和教学 skips it, 设置 and the pause card re-open it,
 * the result card says the verdict (with its own 再听一遍), and on phones nothing overlaps a control.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';

const mute = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../tools/qa/mute-audio.js');
const URL = '/snake-battle/?test=1&nogate&mute=1&silentvoice';
const INTRO = [1, 2, 3, 4, 5, 6].map((n) => `snake.vs.intro.${n}`);

type R = { x: number; y: number; r: number; b: number; w: number; h: number };
const rectOf = (loc: Locator): Promise<R> => loc.evaluate((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height }; });
const overlap = (a: R, b: R) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
const inside = (a: R, vw: number, vh: number) => a.x >= 0 && a.y >= 0 && a.r <= vw + 0.5 && a.b <= vh + 0.5;
const state = (page: Page) => page.evaluate(() => (window as any).__sbVersus?.match?.state as string | undefined);
const voiceLog = (page: Page) => page.evaluate(() => (window as any).__sbApp.voice.log as string[]);
const seen = (page: Page) => page.evaluate(() => (window as any).__sbApp.save.seen('versus:intro') as boolean);

test.beforeEach(async ({ page }) => { await page.addInitScript({ path: mute }); });

async function lobby(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForSelector('.sb-lobby');
  return errors;
}
const enter = async (page: Page) => { await page.locator('.sb-versus-entry').click(); };
const toLobby = async (page: Page) => { await page.locator('.sb-versus__pause').click(); await page.getByRole('button', { name: '回大厅' }).click(); await expect(page.locator('.sb-lobby')).toBeVisible(); };

test('第一次进双人对战：怎么玩卡出现一次，六句依次读并亮起，开始后 3-2-1，之后不再出现', async ({ page }, info) => {
  test.setTimeout(75_000);
  const errors = await lobby(page);
  expect(await seen(page)).toBe(false);
  await enter(page);
  const card = page.locator('.sb-vsintro');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading')).toHaveText('双人对战怎么玩');
  // the match waits (paused) under the card — no 3-2-1 yet, nothing moves
  await page.waitForFunction(() => (window as any).__sbVersus?.match?.state === 'paused');
  const rows = card.locator('.sb-vsintro__row');
  await expect(rows).toHaveCount(6);
  // exactly the voiced lines, in order, as visible text
  const yamlText = await page.evaluate(async () => { const r = await fetch('/audio/snake-battle/audio-manifest.json'); const m = await r.json(); return [1, 2, 3, 4, 5, 6].map((n) => m[`snake.vs.intro.${n}`].text as string); });
  await expect(rows).toHaveText(yamlText);
  // the first line is being read: row 1 lit, the kit bar (hidden under the card) carries the same text, the voice log has it
  await expect(rows.nth(0)).toHaveClass(/is-on/);
  await expect(page.locator('.kit-subtitle__text')).toHaveText(yamlText[0]);
  expect((await voiceLog(page)).filter((id) => id.startsWith('snake.vs.intro.'))).toEqual([INTRO[0]]);
  // …then the second (a silent line takes about 3–4 s at reading pace)
  await expect(rows.nth(1)).toHaveClass(/is-on/, { timeout: 9000 });
  await expect(rows.nth(0)).not.toHaveClass(/is-on/);
  await expect(page.locator('.kit-subtitle__text')).toHaveText(yamlText[1]);
  expect((await voiceLog(page)).filter((id) => id.startsWith('snake.vs.intro.'))).toEqual([INTRO[0], INTRO[1]]);
  // 再听一遍 starts the reading again from the first line
  const replay = page.locator('.sb-vsintro__replay');
  expect((await rectOf(replay)).h).toBeGreaterThanOrEqual(44);
  await replay.click();
  await expect(rows.nth(0)).toHaveClass(/is-on/);
  expect((await voiceLog(page)).filter((id) => id.startsWith('snake.vs.intro.')).slice(-1)).toEqual([INTRO[0]]);
  await page.screenshot({ path: info.outputPath('intro.png') });
  // 开始比赛 → the card goes, the 3-2-1 runs (三，二，一，出发！ said), the match plays; the once-flag is set
  await page.locator('.sb-vsintro__done').click();
  await expect(card).toHaveCount(0);
  await page.waitForFunction(() => (window as any).__sbVersus?.match?.state === 'playing');
  expect(await voiceLog(page)).toContain('snake.match.go');
  expect(await seen(page)).toBe(true);
  // never again by itself: 回大厅 → 双人对战 (and 再来一局) go straight to the 3-2-1
  await toLobby(page);
  await enter(page);
  await expect(page.locator('.sb-versus__pane')).toHaveCount(2);
  await expect(card).toHaveCount(0);
  await page.waitForFunction(() => ['countdown', 'playing'].includes((window as any).__sbVersus?.match?.state));
  await page.evaluate(() => { (window as any).__sbVersus.match.world.t = 179.95; });
  await expect(page.locator('.sb-versus__modal')).toContainText(/获胜|平局/, { timeout: 9000 });
  await page.getByRole('button', { name: '再来一局' }).click();
  await expect(page.locator('.sb-versus__pane')).toHaveCount(2);
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('kit 跳过：1.5 秒后出现，点了就关掉卡片、开始比赛、记为已看', async ({ page }) => {
  const errors = await lobby(page);
  await enter(page);
  const skip = page.locator('.xg-skip.sb-vsskip');
  await expect(skip).toHaveAttribute('data-state', 'waiting');            // not tappable at first (a child tapping through hits nothing)
  await expect(skip).toHaveAttribute('data-state', 'shown', { timeout: 4000 });
  const card = await rectOf(page.locator('.sb-vsintro__card'));
  const s = await rectOf(skip);
  expect(s.h).toBeGreaterThanOrEqual(44); expect(s.w).toBeGreaterThanOrEqual(44);
  expect(overlap(s, card), JSON.stringify({ s, card })).toBe(false);
  await skip.click();
  await expect(page.locator('.sb-vsintro')).toHaveCount(0);
  await expect(page.locator('.xg-skip.sb-vsskip')).toHaveCount(0);
  await page.waitForFunction(() => (window as any).__sbVersus?.match?.state === 'playing');
  expect(await seen(page)).toBe(true);
  // the reading was cut: the subtitle bar is on the 3-2-1 line now, not on a rule of the card
  await expect(page.locator('.kit-subtitle__text')).toHaveText('三，二，一，出发！');
  expect(errors).toEqual([]);
});

test('家长「跳过开场和教学」：不弹卡片直接 3-2-1；暂停 → 玩法说明 和 大厅的「？」仍能重看', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => { try { localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: true })); } catch { /* */ } });
  const errors = await lobby(page);
  await enter(page);
  await expect(page.locator('.sb-versus__pane')).toHaveCount(2);
  await page.waitForFunction(() => ['countdown', 'playing'].includes((window as any).__sbVersus?.match?.state));
  expect(await page.locator('.sb-vsintro').count()).toBe(0);
  expect(await seen(page)).toBe(true);
  // pause card → 玩法说明 → the card (知道了) over the pause card; closing it leaves the match paused
  await page.waitForFunction(() => (window as any).__sbVersus?.match?.state === 'playing');
  await page.locator('.sb-versus__pause').click();
  await expect(page.locator('.sb-versus__modal')).toContainText('暂停');
  await page.getByRole('button', { name: '玩法说明' }).click();
  const card = page.locator('.sb-vsintro');
  await expect(card).toBeVisible();
  await expect(card.locator('.sb-vsintro__done')).toHaveText('知道了');
  await expect(card.locator('.sb-vsintro__row').nth(0)).toHaveClass(/is-on/);
  await card.locator('.sb-vsintro__done').click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.sb-versus__modal')).toContainText('暂停');
  expect(await state(page)).toBe('paused');
  // lobby → the ？ beside 双人分屏对战: the same card, no match behind it
  await page.getByRole('button', { name: '回大厅' }).click();
  await expect(page.locator('.sb-lobby')).toBeVisible();
  const help = page.locator('.sb-versus-help');
  const hr = await rectOf(help); const er = await rectOf(page.locator('.sb-versus-entry'));
  expect(hr.w).toBeGreaterThanOrEqual(44); expect(hr.h).toBeGreaterThanOrEqual(44); expect(overlap(hr, er)).toBe(false);
  await help.click();
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => (window as any).__sbApp.versus)).toBeNull();
  await card.locator('.sb-vsintro__done').click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.sb-lobby')).toBeVisible();
  expect(errors).toEqual([]);
});

test('结果：比赛结束！ 之后卡片里写着并读出结果句（赢的一方 / 平局），语气不责备，带自己的再听一遍', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = await lobby(page);
  await enter(page);
  await page.locator('.sb-vsintro__done').click();
  const cases: [string, string, string][] = [['1', 'snake.vs.win.1', '1号获胜！'], ['2', 'snake.vs.win.2', '2号获胜！'], ['0', 'snake.vs.draw', '平局！']];
  let n = 0;
  for (const [who, id, title] of cases) {
    await page.waitForFunction(() => (window as any).__sbVersus?.match?.state === 'playing');
    // the world is frozen during the half second of 'ending': set the final lengths there (a draw needs them exactly equal)
    await page.evaluate(([w]) => {
      const m = (window as any).__sbVersus.match;
      const id = setInterval(() => {
        if (m.state !== 'ending' && m.state !== 'over') return;
        clearInterval(id);
        m.me.mass = w === '1' ? 90 : w === '2' ? 40 : 60; m.other.mass = w === '2' ? 90 : w === '1' ? 40 : 60;
        m.me.stats.kills = 0; m.other.stats.kills = 0;
      }, 4);
      m.world.t = 179.95;
    }, [who]);
    const modal = page.locator('.sb-versus__modal');
    await expect(modal).toContainText(title, { timeout: 9000 });
    const say = modal.locator('.sb-versus__say');
    await expect(say).toHaveAttribute('data-line', id);
    const text = await say.textContent();
    expect(text).toMatch(who === '0' ? /你们一样棒/ : /也玩得很棒/);   // the loser is thanked, never blamed
    const log = await voiceLog(page);
    expect(log.indexOf('snake.match.end')).toBeGreaterThanOrEqual(0);
    expect(log.lastIndexOf(id)).toBeGreaterThan(log.lastIndexOf('snake.match.end'));
    const rp = modal.locator('.sb-versus__replay');
    const rr = await rectOf(rp);
    expect(rr.h).toBeGreaterThanOrEqual(44);
    await rp.click();
    expect((await voiceLog(page)).slice(-1)).toEqual([id]);
    if (n++ === 0) await page.screenshot({ path: info.outputPath('result.png') });
    if (who !== '0') await page.getByRole('button', { name: '再来一局' }).click();
  }
  expect(errors).toEqual([]);
});

for (const [name, viewport] of [
  ['phone-portrait', { width: 390, height: 664 }],
  ['phone-landscape', { width: 844, height: 390 }],
  ['phone-small-landscape', { width: 568, height: 320 }],
  ['phone-small-portrait', { width: 320, height: 568 }],
  ['ipad-portrait', { width: 810, height: 1080 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    test('怎么玩卡、3-2-1 字幕、结果卡：都在屏内，按钮 ≥44 px，互不遮挡', async ({ page }, info) => {
      test.skip(info.project.name !== 'portrait-810x1080', 'run the viewport cases once');
      test.setTimeout(60_000);
      const { width: vw, height: vh } = viewport;
      const errors = await lobby(page);
      // 0 · the lobby: ？ sits beside 双人分屏对战, ≥44 px, on screen, clear of it, the gear and a narration line
      await page.evaluate(() => (window as any).__sbApp.sub.onCue({ text: '玩了好几局，看看远处吧。' }));
      const hp = await rectOf(page.locator('.sb-versus-help'));
      expect(hp.w).toBeGreaterThanOrEqual(44); expect(hp.h).toBeGreaterThanOrEqual(44); expect(inside(hp, vw, vh), JSON.stringify(hp)).toBe(true);
      for (const sel of ['.sb-versus-entry', '.sb-gear', '.kit-subtitle']) expect(overlap(hp, await rectOf(page.locator(sel))), sel).toBe(false);
      await page.screenshot({ path: info.outputPath(`${name}-lobby.png`) });
      await enter(page);
      await expect(page.locator('.sb-vsintro')).toBeVisible();
      await expect(page.locator('.xg-skip.sb-vsskip')).toHaveAttribute('data-state', 'shown', { timeout: 4000 });
      // 1 · the card
      const card = await rectOf(page.locator('.sb-vsintro__card'));
      expect(inside(card, vw, vh), JSON.stringify(card)).toBe(true);
      for (const sel of ['.sb-vsintro__replay', '.sb-vsintro__done', '.xg-skip.sb-vsskip']) {
        const b = await rectOf(page.locator(sel));
        expect(b.w, sel).toBeGreaterThanOrEqual(44); expect(b.h, sel).toBeGreaterThanOrEqual(44);
        expect(inside(b, vw, vh), sel).toBe(true);
      }
      expect(overlap(await rectOf(page.locator('.xg-skip.sb-vsskip')), card)).toBe(false);
      const rowsOk = await page.locator('.sb-vsintro__row').evaluateAll((els) => els.every((e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1));
      expect(rowsOk).toBe(true);
      expect(await page.locator('.sb-vsintro').evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);   // nothing scrolls
      await page.screenshot({ path: info.outputPath(`${name}-intro.png`) });
      // 2 · the 3-2-1: the voiced line sits on the kit bar above the clock, clear of both boost keys, the pause key and both scores
      await page.locator('.sb-vsintro__done').click();
      await expect(page.locator('.kit-subtitle__text')).toHaveText('三，二，一，出发！');
      const sub = page.locator('.kit-subtitle');
      await expect(sub).not.toHaveCSS('display', 'none');
      await expect(sub).toHaveCSS('opacity', '1');   // (it fades in over 240 ms)
      const sr = await rectOf(sub);
      expect(inside(sr, vw, vh), JSON.stringify(sr)).toBe(true);
      for (const sel of ['.sb-versus__boost', '.sb-versus__pause', '.sb-versus__score', '.sb-versus__clock']) {
        for (const r of await page.locator(sel).evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height }; }))) {
          expect(overlap(sr, r), `${sel} ${JSON.stringify({ sr, r })}`).toBe(false);
        }
      }
      await page.screenshot({ path: info.outputPath(`${name}-count.png`) });
      // 3 · the result card
      await page.waitForFunction(() => (window as any).__sbVersus?.match?.state === 'playing');
      await page.evaluate(() => { const m = (window as any).__sbVersus.match; m.me.mass = 80; m.other.mass = 30; m.world.t = 179.95; });
      const modal = page.locator('.sb-versus__modal');
      await expect(modal).toContainText('1号获胜！', { timeout: 9000 });
      const cr = await rectOf(modal.locator('.sb-versus__card'));
      expect(inside(cr, vw, vh), JSON.stringify(cr)).toBe(true);
      for (const b of await modal.locator('button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; }))) {
        expect(b.h).toBeGreaterThanOrEqual(44); expect(b.w).toBeGreaterThanOrEqual(44); expect(inside(b, vw, vh)).toBe(true);
      }
      await page.screenshot({ path: info.outputPath(`${name}-result.png`) });
      expect(errors).toEqual([]);
    });
  });
}
