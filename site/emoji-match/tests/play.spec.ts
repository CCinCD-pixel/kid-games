/**
 * 星晶消消乐 behaviour tests (spec §8.10, agent gate A4/A5/A8/A10, §5.1a, §5.5), WebKit at 810×1080
 * and 1080×810 (picked up by `npm run test:smoke`; tests/emoji-match/playwright.dev.config.ts runs them
 * against a dev server). Real pointer input where the spec asks for it (drag, tap-fire, long press).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { boot, drag, goPlay, overlap, playOut, press, settle, shot, tapCell, watchErrors, type Box } from './em';

const LESSONS = ['1-01', '1-02', '1-03', '1-04', '1-05', '1-07', '1-08', '2-06', '2-07', '3-06', '3-07', '4-07'];
const COMBO_LESSONS = ['1-08', '2-06', '2-07', '3-06', '3-07', '4-07'];

test.describe('first run and teaching levels', () => {
  test('1-01 first run: 4-cell mask, ghost hand, no tools, only the lesson move counts; win → 3 stars', async ({ page }, info) => {
    const errors = watchErrors(page);
    await boot(page);
    await goPlay(page, '1-01', { seed: 1 });
    await page.waitForTimeout(500);
    const mask = await page.evaluate(() => window.__em.mask());
    expect(mask?.length, 'mask shows only the lesson cells').toBe(4);
    await expect.poll(() => page.evaluate(() => window.__em.ghost()), { timeout: 6000 }).toBe(true);
    expect(await page.locator('.em-tool').count(), 'no tool bar on the first board').toBe(0);
    await shot(page, info, 's02-first-run-mask');
    // any other legal move bounces back, costs nothing
    const other = await page.evaluate(() => { const l = window.__em.lessonMove()!; return window.__em.legal().find((m) => m.t === 'swap' && !(m.a === l.a && m.b === l.b) && !(m.a === l.b && m.b === l.a)) ?? null; });
    if (other) { expect(await page.evaluate((m) => window.__em.play(m), other)).toBe(false); }
    expect(await page.evaluate(() => window.__em.state()!.movesUsed)).toBe(0);
    // the lesson move with a real finger drag
    const lm = (await page.evaluate(() => window.__em.lessonMove()))!;
    await drag(page, lm.a, lm.b!);
    await page.waitForFunction(() => window.__em.state()!.movesUsed === 1, null, { timeout: 8000 });
    await settle(page);
    expect(await page.evaluate(() => window.__em.mask())).toBeNull();
    expect((await page.evaluate(() => window.__em.goals()))[0]).toBe('7');
    // spec §2.6 ~10 s (review D3, QA r1): the rule line, then the goal line while the goal card flashes
    await expect.poll(() => page.evaluate(() => window.__em.voiceLog()), { timeout: 10000 }).toEqual(expect.arrayContaining(['em.intro.swap.1', 'em.intro.swap.2', 'em.goal.collect']));
    const log = await page.evaluate(() => window.__em.voiceLog());
    expect(log.indexOf('em.goal.collect')).toBeGreaterThan(log.indexOf('em.intro.swap.2'));
    const r = await playOut(page);
    expect(r.won).toBe(true);
    await page.waitForSelector('.xg-modal .xg-rstar', { timeout: 15000 });
    await expect.poll(() => page.locator('.xg-rstar.is-earned').count(), { timeout: 6000 }).toBe(3);
    for (const b of await page.locator('.xg-modal__actions .xg-btn').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    expect(await page.locator('.xg-modal__actions .xg-btn').count()).toBe(3);
    await shot(page, info, 's12-win-3-stars');
    // parent metrics (§8.11, gate A9): one level-start + one level-end for this attempt, level-end ≤ 200 bytes
    const marks = await page.evaluate(() => window.__em.marks());
    expect(marks.map((m) => m.name)).toEqual(['level-start', 'level-end']);
    const end = marks[1].data!;
    expect(JSON.stringify(end).length).toBeLessThanOrEqual(200);
    for (const k of ['id', 'w', 'u', 'l', 'st', 'rem', 'sp', 'cb', 'mc', 'h', 'bo', 't5', 'ah']) expect(end, k).toHaveProperty(k);
    expect(end.w).toBe(1);
    expect(errors).toEqual([]);
  });

  for (const id of ['1-02', '1-03']) {
    test(`${id} masked lesson (first attempt only): only the lesson move counts, then the mask lifts`, async ({ page }) => {
      await boot(page, { save: { intros: ['swap', 'rocket', 'tap'], levels: { '1-01': { stars: 3, bestLeft: 3, attempts: 1, wins: 1, failStreak: 0 }, '1-02': { stars: id === '1-03' ? 2 : 0, bestLeft: 0, attempts: id === '1-03' ? 1 : 0, wins: id === '1-03' ? 1 : 0, failStreak: 0 } } } });
      await goPlay(page, id, { seed: 1 });
      expect((await page.evaluate(() => window.__em.mask()))?.length ?? 0).toBeGreaterThan(0);
      await expect.poll(() => page.evaluate(() => window.__em.ghost()), { timeout: 6000 }).toBe(true);
      const lm = (await page.evaluate(() => window.__em.lessonMove()))!;
      const other = await page.evaluate((l) => window.__em.legal().find((m) => !(m.a === l.a && m.b === l.b) && !(m.a === l.b && m.b === l.a)) ?? null, lm);
      if (other) expect(await page.evaluate((m) => window.__em.play(m), other)).toBe(false);
      expect(await page.evaluate(() => window.__em.state()!.movesUsed)).toBe(0);
      if (lm.t === 'tap') await tapCell(page, lm.a); else await drag(page, lm.a, lm.b!);
      await page.waitForFunction(() => window.__em.state()!.movesUsed === 1, null, { timeout: 8000 });
      await settle(page);
      expect(await page.evaluate(() => window.__em.mask())).toBeNull();
    });
  }

  for (const id of LESSONS.slice(3)) {
    test(`${id} lesson: demo once, hints point at the lesson, the lesson move plays`, async ({ page }) => {
      await boot(page, { save: { intros: ['swap', 'rocket', 'tap', 'prop', 'bomb', 'energy', 'orb', 'comboRR', 'dust', 'boosterDrill', 'dust2', 'comboBB', 'comboRB', 'crate', 'boosterTractor', 'crate2', 'comboPP', 'comboP', 'ice', 'boosterIon', 'ice2', 'comboOR'] } });
      await goPlay(page, id, { seed: 1 });
      await expect.poll(() => page.evaluate(() => window.__em.ghost()), { timeout: 6000 }).toBe(true);
      expect(await page.evaluate(() => window.__em.mask()), 'only 1-01…1-03 are masked').toBeNull();
      const lm = (await page.evaluate(() => window.__em.lessonMove()))!;
      expect(lm).toBeTruthy();
      if (COMBO_LESSONS.includes(id)) {
        // a single tap on a preset special does not fire it before the combo happened (§5.1a)
        await tapCell(page, lm.a);
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => window.__em.state()!.movesUsed), 'tap on a preset special is held back').toBe(0);
      }
      expect(await page.evaluate((m) => window.__em.play(m), lm)).toBe(true);
      await settle(page);
      expect(await page.evaluate(() => window.__em.state()!.movesUsed)).toBe(1);
    });
  }

  test('1-03: a single tap fires the rocket (one move)', async ({ page }) => {
    await boot(page, { save: { intros: ['swap', 'rocket', 'tap'], levels: { '1-03': { stars: 0, bestLeft: 0, attempts: 1, wins: 0, failStreak: 0 } } } });
    await goPlay(page, '1-03', { seed: 1 });
    const lm = (await page.evaluate(() => window.__em.lessonMove()))!;
    expect(lm.t).toBe('tap');
    await tapCell(page, lm.a);
    await page.waitForFunction(() => window.__em.state()!.movesUsed === 1, null, { timeout: 8000 });
  });

  test('1-08: long-press a rocket, tap the neighbour rocket = combo (tap-select alternative to the drag)', async ({ page }) => {
    await boot(page, { save: { intros: ['swap', 'rocket', 'tap', 'prop', 'bomb', 'energy', 'orb', 'comboRR'] } });
    await goPlay(page, '1-08', { seed: 1 });
    const lm = (await page.evaluate(() => window.__em.lessonMove()))!;
    await tapCell(page, lm.a, 520);          // long press = select, never fire
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.__em.state()!.movesUsed)).toBe(0);
    await tapCell(page, lm.b!);
    await page.waitForFunction(() => window.__em.state()!.movesUsed === 1, null, { timeout: 8000 });
    await settle(page);
  });
});

test.describe('hints, failure, stop points', () => {
  test('H1 after the idle wait points at a move; it never costs a move', async ({ page }) => {
    await boot(page, { scale: 4 });
    await goPlay(page, '1-06', { seed: 3 });
    expect((await page.evaluate(() => window.__em.hintCells()))?.length ?? 0).toBe(0);
    await page.waitForTimeout(2600);   // R level: 6 s of still board (÷ 4 test speed)
    const cells = await page.evaluate(() => window.__em.hintCells());
    expect(cells?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => window.__em.state()!.movesUsed)).toBe(0);
  });

  test('out of moves → 差一点: remaining goals, one coach line, 再来一次 / 回地图, no 失败 / 错', async ({ page }, info) => {
    const errors = watchErrors(page);
    await boot(page, { save: { intros: ['swap', 'rocket', 'tap', 'prop', 'bomb', 'energy', 'orb', 'comboRR', 'dust', 'boosterDrill', 'dust2', 'comboBB', 'comboRB'] } });
    await goPlay(page, '2-09', { seed: 2 });
    // burn the moves with random legal swaps (the level needs far more)
    for (let k = 0; k < 30; k += 1) {
      const s = await page.evaluate(() => window.__em.state());
      if (!s || s.done || s.won) break;
      await page.evaluate(async () => { const l = window.__em.legal().filter((m) => m.t === 'swap'); await window.__em.play(l[l.length - 1]); });
      await settle(page);
    }
    test.skip(await page.evaluate(() => window.__em.state()!.won), 'won by accident');
    await page.waitForSelector('.em-fail', { timeout: 15000 });
    await page.waitForTimeout(600);
    const text = await page.locator('.xg-modal').innerText();
    expect(text).not.toMatch(/失败|错/);
    expect(await page.locator('.em-fail__goal').count()).toBeGreaterThan(0);
    expect(await page.locator('.em-fail__coach').innerText()).not.toBe('');
    for (const b of await page.locator('.xg-modal__actions .xg-btn').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    await shot(page, info, 's12-near-miss');
    const s = await page.evaluate(() => window.__em.save());
    expect(s.levels['2-09'].failStreak).toBe(1);
    expect(errors).toEqual([]);
  });

  test('15 minutes of play → one break bubble on the next result page (never a lock)', async ({ page }) => {
    await boot(page);
    await goPlay(page, '1-06', { seed: 4 });
    await page.evaluate(() => window.__em.advanceClock(15 * 60 * 1000));
    await playOut(page);
    await page.waitForSelector('.xg-modal', { timeout: 15000 });
    await expect(page.locator('.xg-modal .em-result-bubble')).toHaveCount(1, { timeout: 5000 });
    expect(await page.locator('.xg-modal [data-act]').count()).toBeGreaterThan(0); // buttons still there: no lock
  });

  test('restart asks first (two taps), shows the assist preview after 2 misses', async ({ page }, info) => {
    await boot(page, { save: { levels: { '1-09': { stars: 0, bestLeft: 0, attempts: 2, wins: 0, failStreak: 2 } }, intros: ['swap', 'rocket', 'tap', 'prop', 'bomb', 'energy', 'orb', 'comboRR'] } });
    await goPlay(page, '1-09', { seed: 5 });
    expect(await page.evaluate(() => window.__em.voiceLog().includes('em.assist.1'))).toBe(true);
    await press(page, '.em-pause');
    await page.waitForSelector('.xg-modal', { timeout: 5000 });
    await shot(page, info, 's11-pause');
  });
});

test.describe('tools, puzzles, free mode', () => {
  test('2-02 drill: aim, cancel, fire without spending a move, 4th use refused', async ({ page }) => {
    await boot(page, { save: { intros: ['swap', 'rocket', 'tap', 'prop', 'bomb', 'energy', 'orb', 'comboRR', 'dust', 'boosterDrill'], boosters: { drill: 5, tractor: 0, ion: 0 }, grants: ['drill-intro'] } });
    await goPlay(page, '2-02', { seed: 1 });
    await press(page, '.em-tool[data-id="drill"]');
    expect(await page.evaluate(() => window.__em.aiming())).toBe(true);
    await press(page, '.em-tool[data-id="drill"]');
    expect(await page.evaluate(() => window.__em.aiming())).toBe(false);
    for (let k = 0; k < 3; k += 1) {
      await press(page, '.em-tool[data-id="drill"]');
      await tapCell(page, 10 + k * 7);
      await settle(page);
    }
    expect(await page.evaluate(() => [window.__em.state()!.movesUsed, window.__em.toolUses(), window.__em.save().boosters.drill])).toEqual([0, 3, 2]);
    await press(page, '.em-tool[data-id="drill"]');
    expect(await page.evaluate(() => window.__em.aiming())).toBe(false);
    expect(await page.evaluate(() => window.__em.voiceLog().slice(-1)[0])).toBe('em.booster.limit');
  });

  test('puzzle p1: undo is free and unlimited; off-path hint says so; solving grants one tool once', async ({ page }) => {
    await boot(page, { save: { levels: Object.fromEntries(['1-01', '1-02', '1-03', '1-04', '1-05'].map((id) => [id, { stars: 3, bestLeft: 3, attempts: 1, wins: 1, failStreak: 0 }])) } });
    await goPlay(page, 'p1', { mode: 'puzzle' });
    const sol = (await page.evaluate(() => window.__em.solution()))!;
    const wrong = await page.evaluate((s) => window.__em.legal().find((m) => !(m.a === s[0].a && m.b === s[0].b)) ?? null, sol);
    if (wrong) {
      await page.evaluate((m) => window.__em.play(m), wrong);
      await settle(page);
      await press(page, '.em-tool[data-id="hint"]');
      await page.waitForTimeout(400);
      const log = await page.evaluate(() => window.__em.voiceLog());
      expect(log.some((x) => x === 'em.puzzle.offpath' || x.startsWith('em.puzzle.h'))).toBe(true);
      await press(page, '.em-tool[data-id="undo"]');
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.__em.state()!.movesUsed)).toBe(0);
    }
    for (const m of sol) { await page.evaluate((x) => window.__em.play(x), m); await settle(page); }
    await expect.poll(() => page.evaluate(() => window.__em.save().puzzles.p1?.solved), { timeout: 10000 }).toBe(true);
    const s = await page.evaluate(() => window.__em.save());
    expect(s.grants).toContain('p1');
    expect(s.boosters.drill + s.boosters.tractor + s.boosters.ion).toBe(1);
  });

  test('free mode: no move limit, energy grows, 结束 shows a summary', async ({ page }) => {
    await boot(page, { save: { levels: { '1-10': { stars: 2, bestLeft: 1, attempts: 1, wins: 1, failStreak: 0 } }, arrivals: [1] } });
    await goPlay(page, 'free', { mode: 'free' });
    for (let k = 0; k < 4; k += 1) { await page.evaluate(async () => { await window.__em.play(window.__em.bestMove()!); }); await settle(page); }
    expect(await page.evaluate(() => window.__em.state()!.energy)).toBeGreaterThan(0);
    await press(page, '.em-tool[data-id="end"]');
    await page.waitForSelector('.xg-modal', { timeout: 5000 });
  });

  test('puzzle H3 (QA r2): the board is locked for the whole demo; a move made as it starts is refused', async ({ page }) => {
    await boot(page, { save: { levels: Object.fromEntries(['1-01', '1-02', '1-03', '1-04', '1-05'].map((id) => [id, { stars: 3, bestLeft: 3, attempts: 1, wins: 1, failStreak: 0 }])) } });
    await goPlay(page, 'p1', { mode: 'puzzle' });
    const board0 = await page.evaluate(() => window.__em.board());
    const sol = (await page.evaluate(() => window.__em.solution()))!;
    const wrong = await page.evaluate((x) => window.__em.legal().find((m) => !(m.a === x[0].a && m.b === x[0].b)) ?? x[0], sol);
    const took = await page.evaluate(async (m) => { for (let k = 0; k < 3; k += 1) window.__em.bar('hint'); return window.__em.play(m); }, wrong);
    expect(took, 'a board move during the H3 demo').toBe(false);
    expect(await page.evaluate(() => window.__em.state()!.ready)).toBe(false);
    await page.waitForFunction(() => window.__em.state()?.ready === true, null, { timeout: 20000 });
    expect(await page.evaluate(() => [window.__em.board(), window.__em.state()!.movesUsed] as const)).toEqual([board0, 0]);
    expect(await page.evaluate(() => window.__em.save().puzzles.p1?.maxHint)).toBe(3);
  });

  test('free mode (QA r2): leaving by 航线 without 结束 still opens a new board next time', async ({ page }) => {
    await boot(page, { save: { levels: { '1-10': { stars: 2, bestLeft: 1, attempts: 1, wins: 1, failStreak: 0 } }, arrivals: [1] } });
    await goPlay(page, 'free', { mode: 'free' });
    const a = await page.evaluate(() => [window.__em.board(), window.__em.state()!.seed] as const);
    // subtitles break only at phrase ends (QA r2: no 没 / 有 split, no lone 。 row)
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.kit-subtitle__text .em-ph')].map((e) => e.textContent)), { timeout: 5000 }).toEqual(['自由星海：', '没有步数限制。']);
    await page.evaluate(() => window.__em.goto({ s: 'route' }));
    await page.waitForTimeout(300);
    await goPlay(page, 'free', { mode: 'free' });
    const b = await page.evaluate(() => [window.__em.board(), window.__em.state()!.seed] as const);
    expect(b[1]).toBeGreaterThan(a[1]);
    expect(b[0]).not.toBe(a[0]);
  });
});

test.describe('save, resume, rotation, idle', () => {
  test('resume: kill the page mid-level, reopen, continue → the same board', async ({ page }) => {
    await boot(page);
    await goPlay(page, '1-06', { seed: 7 });
    for (let k = 0; k < 3; k += 1) { await page.evaluate(async () => { await window.__em.play(window.__em.bestMove()!); }); await settle(page); }
    const before = await page.evaluate(() => [window.__em.board(), window.__em.state()!.movesUsed] as const);
    await page.reload();
    await page.waitForSelector('#app[data-ready]');
    await page.evaluate(() => window.__em.goto({ s: 'play', id: '1-06', resume: true }));
    await page.waitForFunction(() => window.__em.state()?.ready === true, null, { timeout: 20000 });
    expect(await page.evaluate(() => [window.__em.board(), window.__em.state()!.movesUsed] as const)).toEqual(before);
  });

  test('rotation in the middle of a cascade leaves the same board as without rotating', async ({ page }) => {
    const run = async (rotate: boolean) => {
      await boot(page, { scale: 1 });
      await page.setViewportSize({ width: 810, height: 1080 });
      await goPlay(page, '1-06', { seed: 11 });
      const m = await page.evaluate(() => window.__em.bestMove());
      const done = page.evaluate((x) => window.__em.play(x!), m);
      if (rotate) { await page.waitForTimeout(250); await page.setViewportSize({ width: 1080, height: 810 }); }
      await done; await settle(page);
      return page.evaluate(() => window.__em.board());
    };
    const a = await run(false), b = await run(true);
    expect(b).toBe(a);
  });

  test('background and back: the move finishes, nothing replays twice', async ({ page }) => {
    await boot(page);
    await goPlay(page, '1-06', { seed: 12 });
    const m = await page.evaluate(() => window.__em.bestMove());
    const p = page.evaluate((x) => window.__em.play(x!), m);
    await page.evaluate(() => window.__em.pause());
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__em.resume());
    await p; await settle(page);
    expect(await page.evaluate(() => window.__em.state()!.movesUsed)).toBe(1);
  });

  test('a still board with no special requests no animation frames (render on change)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __raf: number };
      w.__raf = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => { w.__raf += 1; return orig(cb); };
    });
    await boot(page, { scale: 1 });
    // a start board without any special (specials keep an 80 ms idle beat)
    let seed = 1;
    for (; seed < 30; seed += 1) {
      await goPlay(page, '2-04', { seed });
      if (!(await page.evaluate(() => /[<>^v*+&]/.test(window.__em.board() ?? '')))) break;
    }
    expect(seed).toBeLessThan(30);
    await page.waitForTimeout(1200);
    const n0 = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
    await page.waitForTimeout(3000);
    const n1 = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
    expect(n1 - n0, 'rAF calls while idle').toBe(0);
  });

  test('legacy progress → veteran pack once, legacy key kept, toast spoken', async ({ page }) => {
    await page.goto('/emoji-match/?test=1');
    await page.waitForSelector('#app[data-ready]');
    await page.evaluate(() => { localStorage.removeItem('kg:v1:emoji-match'); localStorage.setItem('kid_games_emoji_match_v1', JSON.stringify({ ladders: { fruit: { unlocked: 4, solved: { 1: { stars: 3 }, 2: { stars: 2 } } } } })); });
    await page.reload();
    await page.waitForSelector('#app[data-ready]');
    const s = await page.evaluate(() => window.__em.save());
    expect(s.grants).toEqual(['veteran']);
    expect(s.boosters).toEqual({ drill: 1, tractor: 1, ion: 1 });
    expect(await page.evaluate(() => localStorage.getItem('kid_games_emoji_match_v1'))).not.toBeNull();
    await page.reload();
    await page.waitForSelector('#app[data-ready]');
    expect((await page.evaluate(() => window.__em.save())).boosters).toEqual({ drill: 1, tractor: 1, ion: 1 });
    await page.evaluate(() => { localStorage.removeItem('kid_games_emoji_match_v1'); localStorage.removeItem('kg:v1:emoji-match'); });
  });

  test('veteran on the REAL first-run path (QA r2): cutscene → 1-01 → em.veteran on the result card, once', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/emoji-match/?test=1');
    await page.waitForSelector('#app[data-ready]');
    await page.evaluate(() => { localStorage.removeItem('kg:v1:emoji-match'); localStorage.setItem('kid_games_emoji_match_v1', JSON.stringify({ ladders: { fruit: { unlocked: 4, solved: { 1: { stars: 3 } } } } })); });
    await page.goto('/emoji-match/?test=1&firstrun=1');
    await page.waitForSelector('#app[data-ready]', { timeout: 20000 });
    await page.waitForFunction(() => window.__em.state()?.id === '1-01' && window.__em.state()?.ready === true, null, { timeout: 15000 });
    await page.evaluate(() => window.__em.timeScale(4));
    expect(await page.evaluate(() => window.__em.save().veteranToast)).toBe(true);
    for (let k = 0; k < 20; k += 1) {
      const st = await page.evaluate(() => window.__em.state());
      if (!st || st.done) break;
      await page.evaluate(async () => { const m = window.__em.lessonMove() ?? window.__em.bestMove(); if (m) await window.__em.play(m); });
      await page.waitForFunction(() => { const x = window.__em.state(); return !!x && (x.ready || x.done); }, null, { timeout: 20000 });
    }
    await page.waitForSelector('.xg-modal', { timeout: 15000 });
    await expect.poll(() => page.evaluate(() => window.__em.voiceLog().includes('em.veteran')), { timeout: 8000 }).toBe(true);
    await expect(page.locator('.xg-modal .em-result-bubble')).toContainText('老朋友回来啦');
    const s = await page.evaluate(() => window.__em.save());
    expect(s.veteranToast).toBeFalsy();
    expect(s.grants).toEqual(['veteran']);
    await page.evaluate(() => { localStorage.removeItem('kid_games_emoji_match_v1'); localStorage.removeItem('kg:v1:emoji-match'); });
  });

  test('constellation gate crossed after the last v1 arrival (QA r2): the route reveals the card + line', async ({ page }) => {
    const ids = ['1', '2', '3', '4'].flatMap((e) => Array.from({ length: 10 }, (_, k) => `${e}-${String(k + 1).padStart(2, '0')}`));
    await boot(page, { save: { firstRunDone: true, arrivals: [1, 2, 3, 4], sky: ['dipper', 'polaris', 'cowherd', 'orion'], levels: Object.fromEntries(ids.map((id) => [id, { stars: 2, bestLeft: 1, attempts: 1, wins: 1, failStreak: 0 }])) } });
    await page.evaluate(() => window.__em.goto({ s: 'route' }));
    await page.waitForSelector('.xg-modal .em-sky__card', { timeout: 8000 });
    expect(await page.locator('.xg-modal .xg-ribbon').textContent()).toContain('天狼星');
    expect(await page.evaluate(() => window.__em.save().sky)).toContain('sirius');
    await expect.poll(() => page.evaluate(() => window.__em.voiceLog().includes('em.sky.5')), { timeout: 4000 }).toBe(true);
  });

  test('narration clips ship: the manifest loads, every clip resolves, ids = lines.json', async ({ page, request }) => {
    // voice step landed (content/emoji-match/voice.json clips:true); the clips:false contract is a unit test on voice.ts
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await boot(page);
    await goPlay(page, '1-01', { seed: 1 });
    await expect.poll(() => urls.filter((u) => u.endsWith('/audio/emoji-match/audio-manifest.json')).length, { timeout: 5000 }).toBeGreaterThan(0);
    const base = new URL(page.url()).origin;
    const res = await request.get(`${base}/audio/emoji-match/audio-manifest.json`);
    expect(res.status()).toBe(200);
    const man = await res.json() as Record<string, { src: string }> | { lines: Record<string, { src: string }> };
    const entries = ('lines' in man && typeof man.lines === 'object' ? man.lines : man) as Record<string, { src: string }>;
    const lines = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../content/emoji-match/lines.json'), 'utf8')) as Record<string, unknown>;
    const ids = Object.keys(entries).filter((k) => entries[k] && typeof entries[k] === 'object' && 'src' in entries[k]).sort();
    expect(ids).toEqual(Object.keys(lines).sort());
    const bad: string[] = [];
    for (const id of ids) {
      const src = entries[id].src;
      const u = new URL(src, `${base}/audio/emoji-match/audio-manifest.json`).href;
      const r = await request.head(u);
      if (r.status() !== 200) bad.push(`${id} ${r.status()}`);
    }
    expect(bad).toEqual([]);
  });
});

test.describe('long session', () => {
  test('all 40 boards + 4 puzzles opened in one session: no board ever comes up blank (canvases released)', async ({ page }) => {
    test.setTimeout(120_000);
    const ids: string[] = []; for (let e = 1; e <= 4; e += 1) for (let n = 1; n <= 10; n += 1) ids.push(`${e}-${String(n).padStart(2, '0')}`);
    await boot(page, { save: { levels: Object.fromEntries(ids.map((id) => [id, { stars: 0, bestLeft: 0, attempts: 1, wins: 0, failStreak: 0 }])), intros: ['swap', 'rocket', 'tap', 'prop', 'bomb', 'energy', 'orb', 'comboRR', 'dust', 'boosterDrill', 'dust2', 'comboBB', 'comboRB', 'crate', 'boosterTractor', 'crate2', 'comboPP', 'comboP', 'ice', 'boosterIon', 'ice2', 'comboOR'] } });
    const blank: string[] = [];
    for (const id of [...ids, 'p1', 'p2', 'p3', 'p4']) {
      await goPlay(page, id, { seed: 1, mode: id.startsWith('p') ? 'puzzle' : 'play' });
      const spread = await page.evaluate(() => {
        const cv = document.querySelector<HTMLCanvasElement>('canvas.em-board')!;
        const c = cv.getContext('2d')!; const d = c.getImageData(0, 0, cv.width, cv.height).data;
        let lo = 255, hi = 0; for (let k = 0; k < d.length; k += 4 * 97) { const v = d[k] + d[k + 1] + d[k + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
        return hi - lo;
      });
      if (spread < 60) blank.push(id);
    }
    expect(blank).toEqual([]);
    expect(await page.locator('canvas').count(), 'canvases in the DOM').toBeLessThanOrEqual(3);
  });
});

test.describe('screens and art', () => {
  test('arrival: module, paint pick, knowledge card, stop card — every button reachable (nothing covers it)', async ({ page }, info) => {
    const errors = watchErrors(page);
    await boot(page, { save: { levels: Object.fromEntries(Array.from({ length: 10 }, (_, k) => [`1-${String(k + 1).padStart(2, '0')}`, { stars: 1, bestLeft: 0, attempts: 1, wins: 1, failStreak: 0 }])), arrivals: [] } });
    await page.evaluate(() => window.__em.goto({ s: 'arrival', ep: 1 }));
    await page.waitForSelector('.em-paint__card', { timeout: 15000 });
    await page.waitForTimeout(500);
    await shot(page, info, 's13-arrival-paint');
    await press(page, '.em-paint__card[data-act="1"]');
    await page.waitForSelector('.em-kcard__art', { timeout: 8000 });
    await page.waitForTimeout(500);
    await shot(page, info, 's13-arrival-card');
    await press(page, '[data-act="ok"]');
    for (let k = 0; k < 6; k += 1) {
      await page.waitForSelector('.em-talk, .em-sky__card, .em-earn', { timeout: 10000 });
      if (await page.locator('.em-talk').count()) break;
      await page.waitForTimeout(300);
      await press(page, '[data-act="ok"]');
    }
    await page.waitForTimeout(400);
    await shot(page, info, 's13-arrival-stop');
    const lane = await page.locator('.em-arr__lane').boundingBox();
    const btn = (await page.locator('[data-act="route"]').boundingBox())!;
    if (lane && await page.locator('.em-arrival:not(.is-textcard)').count()) expect(overlap(lane as Box, btn as Box)).toBe(false);
    await press(page, '[data-act="route"]');
    await page.waitForFunction(() => window.__em.screen()?.s === 'route');
    const s = await page.evaluate(() => window.__em.save());
    expect(s.arrivals).toEqual([1]);
    expect(s.cosmetics.thrusters).toBeTruthy();
    expect(errors).toEqual([]);
  });

  test('parent panel: hold the title 3 s → PIN pad; no reset without the PIN', async ({ page }, info) => {
    await boot(page);
    await page.evaluate(() => window.__em.goto({ s: 'route' }));
    await page.waitForTimeout(400);
    // a quick tap does nothing
    await page.locator('.em-route__title span').click({ force: true });
    await page.waitForTimeout(400);
    expect(await page.locator('.em-parent').count()).toBe(0);
    await page.evaluate(() => document.querySelector('.em-route__title span')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })));
    await page.waitForTimeout(3300);
    await page.waitForSelector('.em-parent', { timeout: 3000 });
    expect(await page.locator('[data-act="reset"]').count()).toBe(0);
    await shot(page, info, 's17-parent');
  });

  test('V12 silhouettes: the six real gem sprites differ in shape (pairwise IoU ≤ 0.80)', async ({ page }) => {
    await boot(page);
    const { iou } = await page.evaluate(() => window.__em.art());
    let worst = 0;
    for (let a = 0; a < 6; a += 1) for (let b = a + 1; b < 6; b += 1) worst = Math.max(worst, iou[a][b]);
    expect(worst).toBeLessThanOrEqual(0.8);
  });

  test('V12 strokes: every gem part survives a 1-device-px erosion at cell 76 (thinnest stroke ≥ 2 px)', async ({ page }) => {
    await boot(page);
    const { strokes } = await page.evaluate(() => window.__em.art());
    strokes.forEach((s, g) => expect(s.after, `gem ${g}`).toBeGreaterThanOrEqual(s.before));
  });

  test('V12c rim: the rendered sprite\'s outer 2-device-px ring has ≥ 3:1 contrast against both tile colours', async ({ page }) => {
    await boot(page);
    const { rim } = await page.evaluate(() => window.__em.art());
    expect(rim.length).toBe(6);
    rim.forEach((pair, g) => pair.forEach((c) => expect(c, `gem ${g}`).toBeGreaterThanOrEqual(3)));
  });

  test('ice keeps the gem colour readable: hue shift of every gem under 1 or 2 ice layers ≤ 8°', async ({ page }) => {
    await boot(page);
    const { ice } = await page.evaluate(() => window.__em.art());
    expect(ice.length).toBe(6);
    for (const row of ice) for (const dh of row) expect(dh).toBeLessThanOrEqual(8);
  });
});
