/**
 * 星港搬运工 browser tests, build stage 2 (spec §9.4), WebKit at 810×1080 and 1080×810 (picked up by
 * `npm run test:smoke`; tests/sokoban/playwright.dev.config.ts runs them against a dev server):
 * 侦探题 (group 1), real taps on the chapter 3/4 bosses (2), the 💡 ladder and 镜子仓库 (8), deadlock
 * timing and naming after the lessons (9 b–e), the 跳级考试 path (11), 随机新仓库 (12), the launch
 * sequence, the v1 finale, the 收尾卡, the hangar, and the stage-2 screenshots (14).
 * The page API is `window.__sok` (src/dev.ts), called through `sok()` so this file needs no globals.
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shot } from '../../../tests/smoke/helpers';
import { detectAll } from '../../../engines/puzzle/src/deadlock';
import { parseLevel } from '../../../engines/puzzle/src/level';
import { applyPush, legalPushes } from '../../../engines/puzzle/src/rules';
import { lurdForPush, solvePushOptimal } from '../../../engines/puzzle/src/solver';
import type { DeadType, Level, State } from '../../../engines/puzzle/src/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
interface L { id: string; map: string[]; opt: { pushes: number; moves: number }; ref: string; star2: number; kind?: 'quiz' }
const read = (f: string) => (JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sokoban', f), 'utf8')) as { levels: L[] }).levels;
const ALL = [...read('levels.json'), ...read('classic.json')];
const byId = (id: string) => ALL.find((l) => l.id === id)!;

interface SokState { level: string; player: number; crates: number[]; pushes: number; solved: boolean; marks: number[]; pending: number; busy: boolean; mode: string; redo: boolean; demo: boolean }
interface HintState { usedMax: number; ring: number | null; chevron: { slot: number; dir: number } | null; demo: boolean }
interface QuizState { board: string; idx: number; attempt: number; firstTry: number; dead: { r: number; c: number }[] }
interface Save {
  levels: Record<string, { stars: number; twinStars?: number; best: number | null }>;
  quiz: Record<string, { stars: number; firstTry: number }>;
  cert: { passed: boolean };
  arrows: string;
  finale: { v1At?: number };
  random: { nextSeed: number; recent: number[]; byTier: number[] };
  cosmetics: { owned: string[]; equipped: Record<string, string> };
  settings: { swipe: string };
  launched: { total: number; byDest: Record<string, number> };
}

/** Call `window.__sok.<fn>(...args)` in the page (resolves with its awaited, serialisable result). */
async function sok<T = unknown>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return (await page.evaluate(({ fn, args }) => {
    const api = (window as unknown as { __sok: Record<string, (...a: unknown[]) => unknown> }).__sok;
    return api[fn](...args);
  }, { fn, args })) as T;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

const idle = (page: Page) => page.waitForFunction(() => {
  const s = (window as unknown as { __sok?: { state(): { busy: boolean } | null } }).__sok?.state();
  return !!s && !s.busy;
}, null, { timeout: 15_000 });

const state = (page: Page) => sok<SokState>(page, 'state');
const lines = (page: Page) => sok<string[]>(page, 'lines');
const save = (page: Page) => sok<Save>(page, 'save');

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/sokoban/?test=1&${query}`);
  await page.waitForSelector('#app[data-ready]');
  await idle(page);
}

async function openMap(page: Page, query = ''): Promise<void> {
  await page.goto(`/sokoban/?test=1&screen=map${query}`);
  await page.waitForSelector('.sok-map');
}

/** The play screen shows `id` (or a random order matching it) and is still. */
async function waitLevel(page: Page, id: string | RegExp): Promise<string> {
  const src = typeof id === 'string' ? `^${id.replace(/[~-]/g, '\\$&')}$` : id.source;
  await page.waitForFunction((re) => {
    const s = (window as unknown as { __sok?: { state(): { level: string; busy: boolean } | null } }).__sok?.state();
    return !!s && !s.busy && new RegExp(re).test(s.level);
  }, src, { timeout: 20_000 });
  return (await state(page)).level;
}

async function replay(page: Page, lurd: string): Promise<void> {
  await sok(page, 'replay', lurd);
  await page.waitForFunction(() => {
    const s = (window as unknown as { __sok?: { state(): { busy: boolean; solved: boolean } | null } }).__sok?.state();
    return !s || s.solved || !s.busy;
  }, null, { timeout: 15_000 });
}

async function tapCell(page: Page, cell: number): Promise<void> {
  const p = await sok<{ x: number; y: number }>(page, 'cellCenter', cell);
  await page.touchscreen.tap(p.x, p.y);
  await idle(page);
}

async function tapCrate(page: Page, slot: number): Promise<void> {
  const p = await sok<{ x: number; y: number }>(page, 'crateCenter', slot);
  await page.touchscreen.tap(p.x, p.y);
  await idle(page);
}

/** The result card is up: its stars, and a click on one of its buttons (optional). */
async function resultCard(page: Page, act?: string): Promise<number> {
  const card = page.locator('[data-testid=result]');
  await expect(card).toBeVisible({ timeout: 15_000 });
  const stars = Number(await card.getAttribute('data-stars'));
  if (act) await card.locator(`[data-act="${act}"]`).click();
  return stars;
}

/**
 * What a result card leads into: close chapter rewards / a new item ('ok'), the 收尾卡 (再玩一关) and
 * the finale (好, once enabled) until `done()` holds. Returns the names of the moments seen, in order.
 */
async function ceremonies(page: Page, done: () => Promise<boolean>, timeout = 30_000): Promise<string[]> {
  const seen: string[] = [];
  const t0 = Date.now();
  while (!(await done())) {
    if (Date.now() - t0 > timeout) throw new Error(`ceremonies: still waiting after ${seen.join(', ')}`);
    for (const [name, sel] of [['chapter-done', '[data-testid=chapter-done] [data-act="ok"]'], ['wrapup', '[data-testid=wrapup] [data-act="more"]'], ['finale', '[data-testid=finale-ok]:not([disabled])'], ['item', '[data-testid=new-item] [data-act="ok"]']] as const) {
      const b = page.locator(sel);
      if (await b.isVisible().catch(() => false)) {
        if (seen[seen.length - 1] !== name) seen.push(name);
        await b.click().catch(() => {});
        break;
      }
    }
    await page.waitForTimeout(120);
  }
  return seen;
}

const onScreen = (page: Page, name: string) => async () => (await page.locator('#app').getAttribute('data-screen')) === name;
const onLevel = (page: Page, id: string) => async () => (await state(page).catch(() => null))?.level === id;

/**
 * Start this tab's visit (sessionStorage `kg:sok:visit`) from `v` on the next page load. The app writes
 * its own visit when a page is hidden, so this goes in before the app boots, once per tab.
 */
async function injectVisit(page: Page, v: Record<string, unknown>): Promise<void> {
  await page.addInitScript((json) => {
    if (sessionStorage.getItem('__kgVisitSet')) return;
    sessionStorage.setItem('__kgVisitSet', '1');
    const now = Date.now();
    sessionStorage.setItem('kg:sok:visit', JSON.stringify({ start: now, last: now, ...JSON.parse(json) }));
  }, JSON.stringify(v));
}

/** No 收尾卡 in this visit (tests that play many levels and are not about it); call before the first page load. */
const quietVisit = (page: Page) => injectVisit(page, { shown: true });

// ------------------------------------------------------------------ level analysis (Node, the game's engine)

type St = State & { boxes: Uint16Array };
const startOf = (l: Level): St => ({ player: l.start.player, boxes: Uint16Array.from(l.start.boxes) });
const keyOf = (s: St) => `${s.player}|${Array.from(s.boxes).sort((a, b) => a - b).join(',')}`;
const dead = (l: Level, s: St) => 'dead' in solvePushOptimal(l, s, { nodes: 60_000, ms: 3000 });
const types = (l: Level, s: St): DeadType[] => detectAll(l, s.boxes).map((d) => d.type);

/** Breadth-first over pushes from the start (states with a visible deadlock are not expanded): the shortest LURD to a state `hit` accepts. */
function lineTo(L: L, hit: (l: Level, s: St) => boolean, maxDepth = 6): { lurd: string; l: Level; s: St } | null {
  const l = parseLevel(L.map);
  let frontier: { s: St; lurd: string }[] = [{ s: startOf(l), lurd: '' }];
  const seen = new Set([keyOf(frontier[0].s)]);
  for (let d = 0; d < maxDepth; d += 1) {
    const next: { s: St; lurd: string }[] = [];
    for (const { s, lurd } of frontier) {
      for (const p of legalPushes(l, s).pushes) {
        const t: St = { player: p.from, boxes: applyPush(l, s.boxes, p) };
        const k = keyOf(t);
        if (seen.has(k)) continue;
        seen.add(k);
        const line = lurd + lurdForPush(l, s, p);
        if (hit(l, t)) return { lurd: line, l, s: t };
        if (!types(l, t).length && !dead(l, t)) next.push({ s: t, lurd: line });
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * An invisible dead end (no rule sees it, the solver proves it) reached through solvable states, then
 * `more` pushes that stay invisible (depth-first), shallowest first.
 */
function invisibleLine(L: L, more: number, maxDepth = 8): { into: string; more: string[] } | null {
  const l = parseLevel(L.map);
  const extra = (s: St, n: number): string[] | null => {
    if (n === 0) return [];
    for (const q of legalPushes(l, s).pushes) {
      const t: St = { player: q.from, boxes: applyPush(l, s.boxes, q) };
      if (types(l, t).length) continue;
      const rest = extra(t, n - 1);
      if (rest) return [lurdForPush(l, s, q), ...rest];
    }
    return null;
  };
  let frontier: { s: St; lurd: string }[] = [{ s: startOf(l), lurd: '' }];
  const seen = new Set([keyOf(frontier[0].s)]);
  for (let d = 0; d < maxDepth; d += 1) {
    const next: { s: St; lurd: string }[] = [];
    for (const { s, lurd } of frontier) {
      for (const p of legalPushes(l, s).pushes) {
        const t: St = { player: p.from, boxes: applyPush(l, s.boxes, p) };
        const k = keyOf(t);
        if (seen.has(k)) continue;
        seen.add(k);
        const line = lurd + lurdForPush(l, s, p);
        if (types(l, t).length) continue;
        if (dead(l, t)) {
          const ex = extra(t, more);
          if (ex) return { into: line, more: ex };
        } else next.push({ s: t, lurd: line });
      }
    }
    frontier = next;
  }
  return null;
}

/** The crate cell and direction of the reference line's first push. */
function firstPush(L: L): { cell: number; dir: number } {
  const l = parseLevel(L.map);
  let player = l.start.player;
  for (const ch of L.ref) {
    const dir = 'udlr'.indexOf(ch.toLowerCase());
    const W = l.W;
    const next = player + [-W, W, -1, 1][dir];
    if (ch !== ch.toLowerCase()) return { cell: next, dir };
    player = next;
  }
  throw new Error('no push');
}

/** Stand cell and crate slot for every push of a level's reference line (identity slots = start order). */
function standSteps(L: L): { stand: number; slot: number }[] {
  const l = parseLevel(L.map);
  const crates = Array.from(l.start.boxes);
  let player = l.start.player;
  const D: Record<string, number> = { u: -l.W, d: l.W, l: -1, r: 1 };
  const out: { stand: number; slot: number }[] = [];
  for (const ch of L.ref) {
    const d = D[ch.toLowerCase()];
    const next = player + d;
    if (ch !== ch.toLowerCase()) {
      const slot = crates.indexOf(next);
      out.push({ stand: player, slot });
      crates[slot] = next + d;
    }
    player = next;
  }
  return out;
}

// ------------------------------------------------------------------ 1. 侦探题

test.describe('侦探题', () => {
  for (const id of ['3-3', '3-5']) {
    test(`${id}: every board right on the first try → 3 stars`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(`/sokoban/?test=1&level=${id}`);
      await page.waitForSelector('#app[data-ready]');
      await page.waitForFunction(() => !!(window as unknown as { __sok?: { quizState(): unknown } }).__sok?.quizState());
      expect(await page.locator('#app').getAttribute('data-screen')).toBe('quiz');
      if (id === '3-3') {
        await page.waitForTimeout(400);
        await shot(page, test.info().project.name, 'sokoban-quiz-a-board1');
      }
      for (let k = 0; k < 3; k += 1) {
        const q = await sok<QuizState>(page, 'quizState');
        expect(q.idx).toBe(k);
        expect(q.dead.length).toBeGreaterThan(0);
        await sok(page, 'quiz', 'right');
        // the last 完成 opens the result card (its promise ends with the card): do not wait for it
        if (k < 2) await sok(page, 'quizNext');
        else void sok(page, 'quizNext').catch(() => {});
      }
      expect(await resultCard(page)).toBe(3);
      await expect(page.locator('[data-testid=result] .xg-rstar.is-earned')).toHaveCount(3, { timeout: 4000 });
      expect((await save(page)).quiz[id]).toMatchObject({ stars: 3, firstTry: 3 });
      expect(errors).toEqual([]);
    });
  }

  test('3-5 (anim): nothing marked → the answer is shown with a ghost demo of why', async ({ page }) => {
    await page.goto('/sokoban/?test=1&anim=real&level=3-5');
    await page.waitForSelector('#app[data-ready]');
    await page.waitForFunction(() => !!(window as unknown as { __sok?: { quizState(): unknown } }).__sok?.quizState());
    await page.waitForTimeout(1200);
    const done = sok(page, 'quiz', 'none');
    await page.waitForTimeout(1300);
    await shot(page, test.info().project.name, 'sokoban-quiz-b-reveal-demo');
    await done;
    const q = await sok<QuizState>(page, 'quizState');
    expect(q.firstTry).toBe(0);
    expect(await lines(page)).toEqual(expect.arrayContaining([expect.stringMatching(/^sok\.quiz\./)]));
  });
});

// ------------------------------------------------------------------ 2. real taps (stage 2 levels)

test.describe('real taps', () => {
  for (const id of ['3-7', '4-7']) {
    test(`${id}: solve with real taps (walk to each stand cell, tap the crate)`, async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, `level=${id}`);
      for (const step of standSteps(byId(id))) {
        if ((await state(page)).player !== step.stand) await tapCell(page, step.stand);
        expect((await state(page)).player).toBe(step.stand);
        await tapCrate(page, step.slot);
      }
      expect(await resultCard(page)).toBe(3);
      expect((await state(page)).pushes).toBe(byId(id).opt.pushes);
    });
  }
});

// ------------------------------------------------------------------ 8. hints, 镜子仓库

test.describe('hints', () => {
  test('2-5: H1 rings the reference crate, H2 = its first push, H3 ghost leaves the board as it was; a dead state → the rewind offer', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    const p = test.info().project.name;
    await open(page, 'anim=real&level=2-5');
    await page.waitForTimeout(1500);
    await idle(page);
    const first = firstPush(byId('2-5'));
    await sok(page, 'hint');
    let hs = await sok<HintState>(page, 'hintState');
    expect(hs.usedMax).toBe(1);
    expect(hs.ring).not.toBeNull();
    const st0 = await state(page);
    expect(st0.crates[hs.ring!]).toBe(first.cell);
    await page.waitForTimeout(600);
    await shot(page, p, 'sokoban-hint-h1');
    await sok(page, 'hint');
    hs = await sok<HintState>(page, 'hintState');
    expect(hs.usedMax).toBe(2);
    expect(hs.chevron).toEqual({ slot: st0.crates.indexOf(first.cell), dir: first.dir });
    await page.waitForTimeout(900);
    await shot(page, p, 'sokoban-hint-h2');
    // H3: the ghost plays the next pushes; the real board never moves
    const h3 = sok(page, 'hint');
    await page.waitForFunction(() => (window as unknown as { __sok: { hintState(): { demo: boolean } | null } }).__sok.hintState()?.demo === true, null, { timeout: 8000 });
    await page.waitForTimeout(1100);
    await shot(page, p, 'sokoban-hint-h3-ghost');
    await h3;
    const st1 = await state(page);
    expect(st1.crates).toEqual(st0.crates);
    expect(st1.player).toBe(st0.player);
    expect(st1.pushes).toBe(0);
    expect((await sok<HintState>(page, 'hintState')).usedMax).toBe(3);
    // walk into a state that cannot be finished, press 💡 → 回到能推完的地方
    const into = lineTo(byId('2-5'), (l, s) => dead(l, s), 3);
    expect(into).not.toBeNull();
    await replay(page, into!.lurd);
    await page.waitForTimeout(500);
    await sok(page, 'hint');
    await expect(page.locator('[data-testid=rewind-solvable]')).toBeVisible({ timeout: 4000 });
    expect(await lines(page)).toContain('sok.hint.rewind');
    await page.click('[data-testid=rewind-solvable]');
    await page.waitForTimeout(800);
    await idle(page);
    expect(await sok<number>(page, 'togo')).toBeGreaterThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('跳级考试: no 💡', async ({ page }) => {
    for (const id of ['cert-1', 'cert-2']) {
      await open(page, `level=${id}`);
      await expect(page.locator('[data-testid=hint]')).toHaveCount(0);
    }
    await open(page, 'level=2-5');
    await expect(page.locator('[data-testid=hint]')).toHaveCount(1);
  });

  test('镜子仓库: after H3 the card offers the twin — a different picture, same optimum, its own stars', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, 'level=2-5');
    for (let k = 0; k < 3; k += 1) await sok(page, 'hint');
    expect((await sok<HintState>(page, 'hintState')).usedMax).toBe(3);
    const before = await state(page);
    expect(await sok<boolean>(page, 'solve')).toBe(true);
    // H3 → at most ★★
    expect(await resultCard(page)).toBeLessThanOrEqual(2);
    await expect(page.locator('[data-testid=result] [data-act="twin"]')).toBeVisible();
    await page.click('[data-testid=result] [data-act="twin"]');
    await waitLevel(page, '2-5~twin');
    const twin = await state(page);
    expect(twin.crates.slice().sort()).not.toEqual(before.crates.slice().sort());
    expect(await sok<number>(page, 'togo')).toBe(byId('2-5').opt.pushes);
    await expect(page.locator('[data-testid=result]')).toHaveCount(0);
    expect(await sok<boolean>(page, 'solve')).toBe(true);
    expect(await resultCard(page)).toBe(3);
    await expect(page.locator('[data-testid=result] .xg-ribbon')).toContainText('镜子仓库');
    // no twin of a twin
    await expect(page.locator('[data-testid=result] [data-act="twin"]')).toHaveCount(0);
    await page.waitForTimeout(2000); // the kit reveals the stars at 520 + i·420 ms
    await shot(page, test.info().project.name, 'sokoban-result-twin');
    const rec = (await save(page)).levels['2-5'];
    expect(rec.twinStars).toBe(3);
    expect(rec.stars).toBeLessThanOrEqual(2);
  });
});

// ------------------------------------------------------------------ 9. deadlock timing and naming (b–e)

test.describe('deadlocks', () => {
  test('3-1: a corner (screenshot)', async ({ page }) => {
    await open(page, 'level=3-1');
    const c = lineTo(byId('3-1'), (l, s) => types(l, s).length > 0 && types(l, s).every((t) => t === 'corner'), 3);
    expect(c).not.toBeNull();
    await replay(page, c!.lurd);
    expect((await state(page)).marks.length).toBeGreaterThan(0);
    await page.waitForTimeout(700);
    await shot(page, test.info().project.name, 'sokoban-level-3-1-dead-corner');
  });

  test('3-4 (the pair lesson): the first pair is named; once the lesson is passed a pair elsewhere is silent', async ({ page }) => {
    await open(page, 'level=3-4');
    const pr = lineTo(byId('3-4'), (l, s) => types(l, s).length > 0 && types(l, s).every((t) => t === 'pair'), 3);
    expect(pr).not.toBeNull();
    await replay(page, pr!.lurd);
    expect((await state(page)).marks.length).toBeGreaterThan(0);
    await page.waitForFunction(() => (window as unknown as { __sok: { lines(): string[] } }).__sok.lines().includes('sok.dead.pair.first'));
    expect(await lines(page)).not.toContain('sok.dead.generic');
    await page.waitForTimeout(500);
    await shot(page, test.info().project.name, 'sokoban-level-3-4-dead-pair');
    // pass the lesson
    await sok(page, 'load', '3-4');
    await waitLevel(page, '3-4');
    await replay(page, byId('3-4').ref);
    await resultCard(page);
    // a pair in another level: ✕, but no line any more
    await open(page, 'level=2-6');
    const p2 = lineTo(byId('2-6'), (l, s) => types(l, s).includes('pair'), 3);
    expect(p2).not.toBeNull();
    await replay(page, p2!.lurd);
    expect((await state(page)).marks.length).toBeGreaterThan(0);
    await page.waitForTimeout(800);
    expect((await lines(page)).filter((x) => x.startsWith('sok.dead.'))).toEqual([]);
  });

  test('4-2 (delayed marks): a square shows no ✕ for 3 s and undo does not pulse; undo then = a self-rescue; again + a tap → ✕', async ({ page }) => {
    await open(page, 'level=4-2');
    await sok(page, 'deadMarker', 'delayed');
    const sq = lineTo(byId('4-2'), (l, s) => types(l, s).includes('square'), 2);
    expect(sq).not.toBeNull();
    await replay(page, sq!.lurd);
    let st = await state(page);
    expect(st.pending).toBeGreaterThan(0);
    await page.waitForTimeout(3000);
    st = await state(page);
    expect(st.marks).toEqual([]);
    expect(await page.locator('[data-testid=undo]').getAttribute('data-pulse')).toBeNull();
    await page.click('[data-testid=undo]');
    await idle(page);
    await page.waitForFunction(() => (window as unknown as { __sok: { lines(): string[] } }).__sok.lines().includes('sok.praise.spot'));
    expect((await state(page)).pending).toBe(0);
    // into the square again (a fresh start), then any tap on the board shows the ✕
    await sok(page, 'load', '4-2');
    await waitLevel(page, '4-2');
    await sok(page, 'deadMarker', 'delayed');
    await replay(page, sq!.lurd);
    expect((await state(page)).pending).toBeGreaterThan(0);
    expect((await state(page)).marks).toEqual([]);
    await tapCell(page, (await state(page)).player);
    await expect.poll(async () => (await state(page)).marks.length, { timeout: 3000 }).toBeGreaterThan(0);
    await page.waitForTimeout(600);
    await shot(page, test.info().project.name, 'sokoban-level-4-2-dead-square');
  });

  test('3-7: an invisible dead end and two more pushes → the bubble at once (not the 8 s clock) with 回到能推完的地方', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, 'level=3-7');
    const inv = invisibleLine(byId('3-7'), 2, 3);
    expect(inv).not.toBeNull();
    await replay(page, inv!.into);
    await page.waitForTimeout(700);
    expect(await sok<number>(page, 'togo')).toBe(-1);
    expect(await lines(page)).not.toContain('sok.stuck.1');
    const t0 = Date.now();
    for (const m of inv!.more) {
      await replay(page, m);
      await page.waitForTimeout(400);
    }
    await page.waitForFunction(() => (window as unknown as { __sok: { lines(): string[] } }).__sok.lines().includes('sok.stuck.1'), null, { timeout: 4000 });
    expect(Date.now() - t0).toBeLessThan(6000);
    await expect(page.locator('[data-testid=rewind-solvable]')).toBeVisible();
  });

  test('cert-1: the invisible dead end at push 4 → the bubble, and no rewind button in the exam', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, 'level=cert-1');
    // the only invisible dead end: the crate in the bottom row with 小推 shut out of the pocket behind it;
    // one more push stays invisible (the next one is a corner) — so the 8 s clock brings the bubble
    const inv = invisibleLine(byId('cert-1'), 1);
    expect(inv).not.toBeNull();
    await replay(page, inv!.into);
    expect((await state(page)).pushes).toBe(4);
    await page.waitForTimeout(700);
    expect(await sok<number>(page, 'togo')).toBe(-1);
    await replay(page, inv!.more[0]);
    await page.waitForFunction(() => (window as unknown as { __sok: { lines(): string[] } }).__sok.lines().includes('sok.stuck.1'), null, { timeout: 12_000 });
    await expect(page.locator('[data-testid=rewind-solvable]')).toBeHidden();
    await expect(page.locator('[data-testid=undo]')).toHaveAttribute('data-pulse', '');
    expect((await state(page)).marks).toEqual([]);
  });
});

// ------------------------------------------------------------------ 11. 跳级考试 and the flow around it

test('跳级考试: 0-4 → 下一关 invites → 考一考 → cert-1 → cert-2 → chapter 2 open, chapter 1 ribbons, 2-1 celebrates once', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const p = test.info().project.name;
  await quietVisit(page);
  // a new player: chapter 0 in order (strict), then 0-4's 下一关 → chapter 0 done → the invitation
  await open(page, 'level=0-1');
  for (const id of ['0-1', '0-2', '0-3', '0-4']) {
    await waitLevel(page, id);
    await replay(page, byId(id).ref);
    await resultCard(page, 'next');
  }
  const seen0 = await ceremonies(page, () => page.locator('[data-testid=cert-offer]').isVisible());
  expect(seen0).toEqual(['chapter-done']);
  await expect(page.locator('[data-testid=cert-offer]')).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, p, 'sokoban-cert-offer');
  await page.click('[data-testid=cert-offer] [data-act="go"]');
  await waitLevel(page, 'cert-1');
  await expect(page.locator('[data-testid=hint]')).toHaveCount(0);
  await replay(page, byId('cert-1').ref);
  expect(await resultCard(page, 'next')).toBe(3);
  await waitLevel(page, 'cert-2');
  await expect(page.locator('[data-testid=hint]')).toHaveCount(0);
  await replay(page, byId('cert-2').ref);
  await resultCard(page, 'next');
  const seen = await ceremonies(page, onLevel(page, '2-1'));
  expect(seen).toContain('chapter-done');
  await waitLevel(page, '2-1');
  const sv = await save(page);
  expect(sv.cert.passed).toBe(true);
  // the 自动绕行 upgrade is celebrated on the first entry
  await page.waitForFunction(() => (window as unknown as { __sok: { lines(): string[] } }).__sok.lines().includes('sok.tut.upgrade'), null, { timeout: 8000 });
  await page.waitForFunction(() => (window as unknown as { __sok: { state(): { mode: string } | null } }).__sok.state()?.mode === 'arrows');
  // the map: chapter 1 shows the exam's ribbons, chapter 2 is open
  await sok(page, 'map', 1);
  await page.waitForSelector('.sok-map');
  await expect(page.locator('.sok-node__ribbon').first()).toBeVisible();
  await sok(page, 'map', 2);
  await expect(page.locator('[data-testid=node-2-1]')).toBeVisible();
  expect(await page.locator('[data-testid=node-2-1]').getAttribute('aria-label')).not.toContain('还没开放');
  // the second entry does not celebrate again
  await open(page, 'level=2-1');
  await page.waitForTimeout(1200);
  expect(await lines(page)).not.toContain('sok.tut.upgrade');
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------------ 12. 随机新仓库

test.describe('随机新仓库', () => {
  test('the pool chunk loads only with the order board; T1–T3 × 3 orders are generated and solve', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    const p = test.info().project.name;
    const reqs: string[] = [];
    page.on('request', (r) => reqs.push(r.url()));
    await quietVisit(page);
    await openMap(page);
    await sok(page, 'unlockAll');
    await openMap(page);
    await page.waitForSelector('[data-testid=random]');
    await page.waitForTimeout(500);
    expect(reqs.filter((u) => u.includes('random-fallback'))).toEqual([]);
    await page.click('[data-testid=random]');
    await expect(page.locator('[data-testid=order-board]')).toBeVisible();
    await expect.poll(() => reqs.some((u) => u.includes('random-fallback')), { timeout: 5000 }).toBe(true);
    await page.waitForTimeout(700);
    await shot(page, p, 'sokoban-random-tiers');
    await page.click('[data-testid=order-board] [data-act="close"]');
    await page.waitForTimeout(400);
    const ids: string[] = [];
    for (const tier of [1, 2, 3]) {
      for (let k = 0; k < 3; k += 1) {
        await sok(page, 'order', tier);
        const id = await waitLevel(page, new RegExp(`^T${tier}-`));
        ids.push(id);
        if (tier === 2 && k === 0) {
          await page.waitForTimeout(600);
          await shot(page, p, 'sokoban-random-board');
        }
        expect(await sok<boolean>(page, 'solve')).toBe(true);
        await resultCard(page, 'map');
        await ceremonies(page, onScreen(page, 'map'));
      }
    }
    const marks = (await sok<[string, { tier: number; fromPool: boolean; genMs: number | null; opt: number }][]>(page, 'marks')).filter(([n]) => n === 'random').map(([, m]) => m);
    test.info().annotations.push({ type: 'random', description: JSON.stringify({ ids, genMs: marks.map((m) => [m.tier, m.fromPool ? 'pool' : m.genMs]) }) });
    expect(marks.length).toBe(9);
    // T1/T2 always generate within the 1.5 s budget; T3 may fall back once (its late result fills the next order)
    for (const tier of [1, 2]) expect(marks.filter((m) => m.tier === tier && !m.fromPool).length).toBe(3);
    expect(marks.filter((m) => m.tier === 3 && !m.fromPool).length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(9);
    const sv = await save(page);
    expect(sv.random.byTier.slice(0, 3)).toEqual([3, 3, 3]);
    expect(new Set(sv.random.recent).size).toBe(9);
    expect(errors).toEqual([]);
  });

  test('a forced timeout takes an order from the fallback pool', async ({ page }) => {
    await openMap(page);
    await sok(page, 'unlockAll');
    await sok(page, 'forcePool', true);
    await sok(page, 'order', 2);
    await waitLevel(page, /^T2-p\d+$/);
    expect(await sok<boolean>(page, 'solve')).toBe(true);
    await resultCard(page);
  });

  test('the seed is saved: after a reload the next order is a different warehouse', async ({ page }) => {
    test.setTimeout(60_000);
    await openMap(page);
    await sok(page, 'unlockAll');
    await sok(page, 'seed', 700);
    await sok(page, 'order', 1);
    const a = await waitLevel(page, /^T1-/);
    expect(await sok<boolean>(page, 'solve')).toBe(true);
    await resultCard(page);
    expect((await save(page)).random.nextSeed).toBe(701);
    await openMap(page);
    expect((await save(page)).random.nextSeed).toBe(701);
    await sok(page, 'order', 1);
    const b = await waitLevel(page, /^T1-/);
    expect(b).not.toBe(a);
    expect(await sok<boolean>(page, 'solve')).toBe(true);
    await resultCard(page);
    const sv = await save(page);
    expect(new Set(sv.random.recent).size).toBe(2);
  });
});

// ------------------------------------------------------------------ the launch sequence (S4)

/** Record when the launch canvas comes and goes (page clock). */
async function watchLaunch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __launch: { add?: number; gone?: number; card?: number } };
    w.__launch = {};
    new MutationObserver(() => {
      const now = performance.now();
      const on = !!document.querySelector('[data-testid=launch]');
      if (on && w.__launch.add === undefined) w.__launch.add = now;
      if (!on && w.__launch.add !== undefined && w.__launch.gone === undefined) w.__launch.gone = now;
      if (document.querySelector('[data-testid=result]') && w.__launch.card === undefined) w.__launch.card = now;
    }).observe(document.body, { childList: true, subtree: true });
  });
}

const launchTimes = (page: Page) => page.evaluate(() => (window as unknown as { __launch: { add?: number; gone?: number; card?: number } }).__launch);

/** Wait until `ms` after the launch canvas appeared. */
async function atLaunch(page: Page, ms: number): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __launch: { add?: number } }).__launch.add !== undefined, null, { timeout: 15_000 });
  const since = await page.evaluate(() => performance.now() - (window as unknown as { __launch: { add: number } }).__launch.add);
  if (ms > since) await page.waitForTimeout(ms - since);
}

async function tapLaunch(page: Page): Promise<void> {
  const vp = page.viewportSize()!;
  await page.touchscreen.tap(vp.width / 2, vp.height * 0.45);
}

test.describe('launch', () => {
  test('the first launch on a route cannot be skipped; later ones can', async ({ page }) => {
    test.setTimeout(60_000);
    const p = test.info().project.name;
    await open(page, 'anim=real&level=0-1');
    await page.waitForTimeout(800);
    await idle(page);
    await watchLaunch(page);
    await replay(page, byId('0-1').ref);
    await atLaunch(page, 400);
    await tapLaunch(page);
    await atLaunch(page, 800);
    await shot(page, p, 'sokoban-launch-tiangong-mid');
    await expect(page.locator('[data-testid=result]')).toBeVisible({ timeout: 10_000 });
    let t = await launchTimes(page);
    // 1300 ms flight + 900 ms arrival, untouched by the tap
    expect(t.gone! - t.add!).toBeGreaterThan(2000);
    expect(await lines(page)).toContain('sok.launch.tiangong');
    // 0-2 flies the same route: a tap fast-forwards to the card
    await page.click('[data-testid=result] [data-act="next"]');
    await waitLevel(page, '0-2');
    await page.waitForTimeout(800);
    await idle(page);
    await watchLaunch(page);
    await replay(page, byId('0-2').ref);
    await atLaunch(page, 300);
    await tapLaunch(page);
    await expect(page.locator('[data-testid=result]')).toBeVisible({ timeout: 10_000 });
    t = await launchTimes(page);
    expect(t.gone! - t.add!).toBeLessThan(900);
  });

  test('the first moon launch (2-1) and the Mars boss with booster separation (4-7)', async ({ page }) => {
    test.setTimeout(90_000);
    const p = test.info().project.name;
    await openMap(page);
    await sok(page, 'unlockAll', { except: ['2-1', '4-7'] });
    for (const [id, name, at] of [['2-1', 'sokoban-launch-moon-mid', 900], ['4-7', 'sokoban-launch-mars-boss-separation', 950]] as const) {
      await open(page, `anim=real&level=${id}`);
      await page.waitForTimeout(800);
      await idle(page);
      await watchLaunch(page);
      await replay(page, byId(id).ref);
      await atLaunch(page, at);
      await shot(page, p, name);
      await expect(page.locator('[data-testid=result]')).toBeVisible({ timeout: 12_000 });
      const t = await launchTimes(page);
      // first on the route: the long version (the boss also flies 1800 ms)
      expect(t.gone! - t.add!).toBeGreaterThan(id === '4-7' ? 2500 : 2000);
      expect(await page.locator('[data-testid=launch]').count()).toBe(0);
    }
  });
});

test('voice (QA r2): 好 on the chapter card at once — its reward lines never play under the 跳级考试 question', async ({ page }) => {
  test.setTimeout(90_000);
  await quietVisit(page);
  await open(page, 'level=0-1');
  for (const id of ['0-1', '0-2', '0-3', '0-4']) {
    await waitLevel(page, id);
    await replay(page, byId(id).ref);
    await resultCard(page, 'next');
  }
  await expect(page.locator('[data-testid=chapter-done]')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(150);
  await page.click('[data-testid=chapter-done] [data-act="ok"]');
  await expect(page.locator('[data-testid=cert-offer]')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(2500);
  const lines = await page.evaluate(() => (window as unknown as { __sok: { lines(): string[] } }).__sok.lines());
  const ask = lines.lastIndexOf('sok.cert.ask');
  expect(ask).toBeGreaterThan(-1);
  expect(lines.slice(ask).filter((l) => /^sok\.(item|card|ch)\./.test(l))).toEqual([]);
});

// ------------------------------------------------------------------ the v1 finale, the 收尾卡, the hangar

test('v1 finale: the first pass of 4-7 → chapter 4 done → 一级调度员 certificate; never again', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await quietVisit(page);
  await openMap(page);
  await sok(page, 'unlockAll', { except: ['4-7'], rewards: true });
  await open(page, 'level=4-7');
  await replay(page, byId('4-7').ref);
  await resultCard(page, 'next');
  await expect(page.locator('[data-testid=chapter-done]')).toBeVisible({ timeout: 8000 });
  await page.click('[data-testid=chapter-done] [data-act="ok"]');
  await expect(page.locator('[data-testid=finale]')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('[data-testid=finale-ok]')).toBeEnabled({ timeout: 8000 });
  await page.waitForTimeout(600);
  await shot(page, test.info().project.name, 'sokoban-finale-certificate');
  expect(await lines(page)).toContain('sok.finale.1');
  await page.click('[data-testid=finale-ok]');
  await waitLevel(page, '4-8');
  expect((await save(page)).finale.v1At).toBeGreaterThan(0);
  // again: no finale
  await open(page, 'level=4-7');
  await replay(page, byId('4-7').ref);
  await resultCard(page, 'next');
  await waitLevel(page, '4-8');
  await expect(page.locator('[data-testid=finale]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('收尾卡: after six levels in one visit, once; 再玩一关 goes on', async ({ page }) => {
  test.setTimeout(60_000);
  await injectVisit(page, { activeMs: 420_000, levels: 5, launches: { tiangong: 3, moon: 2, mars: 0 }, shown: false });
  await openMap(page);
  await sok(page, 'unlockAll', { except: ['1-1', '1-2', '1-3'], rewards: true });
  await open(page, 'level=1-1');
  await replay(page, byId('1-1').ref);
  await resultCard(page, 'next');
  await expect(page.locator('[data-testid=wrapup]')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('[data-testid=wrapup]')).toContainText('6');
  await page.waitForTimeout(600);
  await shot(page, test.info().project.name, 'sokoban-wrapup');
  await page.click('[data-testid=wrapup] [data-act="more"]');
  await waitLevel(page, '1-2');
  await replay(page, byId('1-2').ref);
  await resultCard(page, 'next');
  await waitLevel(page, '1-3');
  await expect(page.locator('[data-testid=wrapup]')).toHaveCount(0);
});

test('hangar: owned items go on 小推, locked ones stay locked; knowledge cards; skills switch the save', async ({ page }) => {
  const p = test.info().project.name;
  await openMap(page);
  await sok(page, 'unlockAll', { rewards: true });
  await page.goto('/sokoban/?test=1&screen=hangar');
  await page.waitForSelector('[data-testid=hangar]');
  await page.waitForTimeout(900);
  await shot(page, p, 'sokoban-hangar');
  const owned = (await save(page)).cosmetics.owned;
  expect(owned).toEqual(expect.arrayContaining(['plate', 'hat', 'lamp', 'magnifier', 'stripes', 'retro']));
  await expect(page.locator('[data-testid=item-random]')).toHaveClass(/is-locked/);
  await page.click('[data-testid=item-retro]');
  expect((await save(page)).cosmetics.equipped.paint).toBe('retro');
  await page.click('[data-testid=item-random]');
  expect((await save(page)).cosmetics.equipped.badge).toBe('magnifier');
  await page.click('.sok-hangar__tabs button[data-id="cards"]');
  await page.waitForTimeout(500);
  expect(await page.locator('.sok-kcard:not(.is-locked)').count()).toBeGreaterThanOrEqual(5);
  await shot(page, p, 'sokoban-hangar-cards');
  await page.click('.sok-hangar__tabs button[data-id="skills"]');
  await page.waitForTimeout(500);
  await shot(page, p, 'sokoban-hangar-skills');
  await page.click('[data-testid=skill-swipe] button[data-id="off"]');
  expect((await save(page)).settings.swipe).toBe('off');
  await page.click('[data-testid=hangar-back]');
  await page.waitForSelector('.sok-map');
});

// ------------------------------------------------------------------ 14. screenshots (stage 2 set)

test('screenshots: chapter 3 map (侦探题 nodes), chapter 4 end (新货单在路上), 3-7, 4-7', async ({ page }) => {
  test.setTimeout(60_000);
  const p = test.info().project.name;
  await openMap(page);
  const later = ALL.filter((l) => /^3-[5-8]$|^4-/.test(l.id)).map((l) => l.id);
  await sok(page, 'unlockAll', { except: later });
  await sok(page, 'map', 3);
  await page.waitForSelector('.sok-node--quiz');
  await page.waitForTimeout(700);
  await shot(page, p, 'sokoban-map-ch3');
  expect(await page.locator('.sok-node--quiz').count()).toBe(2);
  await sok(page, 'unlockAll');
  await sok(page, 'map', 4);
  await page.waitForSelector('.sok-node--coming');
  await page.waitForTimeout(700);
  await shot(page, p, 'sokoban-map-ch4-end');
  for (const id of ['3-7', '4-7']) {
    await open(page, `level=${id}`);
    await page.waitForTimeout(400);
    await shot(page, p, `sokoban-level-${id}`);
  }
});
