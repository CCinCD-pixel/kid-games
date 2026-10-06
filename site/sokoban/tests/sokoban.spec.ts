/**
 * 星港搬运工 browser tests (spec §9.4), WebKit at 810×1080 and 1080×810 (picked up by
 * `npm run test:smoke`; tests/sokoban/playwright.dev.config.ts runs them against a dev server).
 * Build stage 1 groups: replay every shipped push level, real taps, input modes, race, rotation,
 * layout, deadlock naming, save/legacy/read-only, narration clips (shipped clips:true state; the clips:false
 * branch is voice.test.ts), QA r1 regressions (start-gate click-through, redo input queue, hidden-page
 * level-leave/resume marks, §8.6 perf gate), screenshots.
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
import { paletteGates } from '../src/dev/colour';

const CRATE_TOPS = ['#A27038', '#E64F78', '#3F7BE6', '#1AA892'];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
interface L { id: string; map: string[]; opt: { pushes: number; moves: number }; ref: string; star2: number; kind?: 'quiz' }
const read = (f: string) => (JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sokoban', f), 'utf8')) as { levels: L[] }).levels.filter((l) => l.kind !== 'quiz');
const LEVELS = [...read('levels.json'), ...read('classic.json')];
const byId = (id: string) => LEVELS.find((l) => l.id === id)!;

type SokState = { level: string; player: number; crates: number[]; pushes: number; solved: boolean; marks: number[]; pending: number; busy: boolean; mode: string; redo: boolean };
interface Sok {
  state(): SokState | null;
  replay(l: string): Promise<void>;
  cellCenter(c: number): { x: number; y: number };
  crateCenter(s: number): { x: number; y: number };
  setArrows(m: string): void;
  unlockAll(o?: { except?: string[]; rewards?: boolean }): void;
  lines(): string[];
  save(): Record<string, unknown>;
  load(id: string, fresh?: boolean): void;
  drawMs(): number;
  togo(): Promise<number>;
  tapCell(c: number): void;
  tapCrate(s: number): void;
  marks(): [string, Record<string, unknown>][];
  bench(frames?: number): { frameAvg: number; frameMax: number; staticMs: number; cells: number } | null;
}
declare global {
  interface Window {
    __sok: Sok;
  }
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/sokoban/?test=1&${query}`);
  await page.waitForSelector('#app[data-ready]');
  await page.waitForFunction(() => !!window.__sok?.state?.());
  await idle(page);
}

const idle = (page: Page) => page.waitForFunction(() => {
  const s = window.__sok?.state?.();
  return !!s && !s.busy;
}, null, { timeout: 10_000 });

const state = (page: Page) => page.evaluate(() => window.__sok.state()!);

async function tapCell(page: Page, cell: number): Promise<void> {
  const p = await page.evaluate((c) => window.__sok.cellCenter(c), cell);
  await page.touchscreen.tap(p.x, p.y);
  await idle(page);
}

async function tapCrate(page: Page, slot: number): Promise<void> {
  const p = await page.evaluate((s) => window.__sok.crateCenter(s), slot);
  await page.touchscreen.tap(p.x, p.y);
  await idle(page);
}

async function swipe(page: Page, from: { x: number; y: number }, dx: number, dy: number, ms: number): Promise<void> {
  const cdp = page;
  await cdp.mouse.move(from.x, from.y);
  await cdp.mouse.down();
  const steps = 6;
  for (let i = 1; i <= steps; i += 1) {
    await cdp.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    await page.waitForTimeout(ms / steps);
  }
  await cdp.mouse.up();
  await idle(page);
}

// ------------------------------------------------------------------ 1. replay every push level

test.describe('replay', () => {
  for (const L of LEVELS) {
    test(`${L.id}: the reference line solves it with 3 stars`, async ({ page }) => {
      test.setTimeout(L.id === 'C10' ? 120_000 : 30_000);
      const errors = watchErrors(page);
      await open(page, `level=${L.id}`);
      await page.evaluate((lurd) => window.__sok.replay(lurd), L.ref);
      await page.waitForSelector('.xg-modal');
      const st = await state(page);
      expect(st.solved).toBe(true);
      expect(st.pushes).toBe(L.opt.pushes);
      await expect(page.locator('.xg-rstar.is-earned')).toHaveCount(3, { timeout: 4000 });
      expect(errors).toEqual([]);
    });
  }
});

// ------------------------------------------------------------------ 2. real taps

test.describe('real taps', () => {
  test('0-1: tap the floor, then the crate → launch → result card', async ({ page }) => {
    await open(page, 'level=0-1');
    const W = byId('0-1').map[0].length;
    await tapCell(page, 3 * W + 5);
    expect((await state(page)).player).toBe(3 * W + 5);
    await tapCrate(page, 0);
    await page.waitForSelector('.xg-modal');
    expect((await state(page)).solved).toBe(true);
    await page.waitForTimeout(2000); // the kit reveals the stars at 520 + i·420 ms
    await shot(page, test.info().project.name, 'sokoban-result-3star');
  });

  test('0-2: walk around to the back and push twice', async ({ page }) => {
    await open(page, 'level=0-2');
    const W = 8;
    await tapCell(page, 3 * W + 2);
    expect((await state(page)).player).toBe(3 * W + 2);
    await tapCrate(page, 0);
    await tapCrate(page, 0);
    await page.waitForSelector('.xg-modal');
  });

  test('0-3: the tempting push makes a ✕, undo pulses, undo, then solve', async ({ page }) => {
    await open(page, 'level=0-3');
    await tapCrate(page, 0);
    const st = await state(page);
    expect(st.marks).toEqual([0]);
    await expect(page.locator('[data-testid=undo]')).toHaveAttribute('data-pulse', '');
    await shot(page, test.info().project.name, 'sokoban-level-0-3-dead-corner');
    // he listens: the corner is named, then the undo tip follows
    await page.waitForFunction(() => window.__sok.lines().includes('sok.tut.undo'));
    await page.click('[data-testid=undo]');
    await idle(page);
    expect((await state(page)).marks).toEqual([]);
    const heard = await page.evaluate(() => window.__sok.lines());
    expect(heard.indexOf('sok.tut.undo')).toBeGreaterThan(heard.indexOf('sok.dead.corner.first'));
    // 0-3 is the undo lesson: the redo tip waits for a later level
    expect(heard).not.toContain('sok.tut.redo');
    // walk above the crate and push it down twice
    const W = 5;
    await tapCell(page, 1 * W + 1);
    await tapCrate(page, 0);
    await tapCrate(page, 0);
    await page.waitForSelector('.xg-modal');
  });

  test('2-5: solve with real taps (walk to each stand cell, tap the crate)', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, 'level=2-5');
    for (const step of standSteps(byId('2-5'))) {
      if ((await state(page)).player !== step.stand) await tapCell(page, step.stand);
      expect((await state(page)).player).toBe(step.stand);
      await tapCrate(page, step.slot);
    }
    await page.waitForSelector('.xg-modal');
    expect((await state(page)).pushes).toBe(byId('2-5').opt.pushes);
  });
});

/** Stand cell and crate slot for every push of a level's reference line (identity slots = start order). */
function standSteps(L: L): { stand: number; slot: number }[] {
  const W = Math.max(...L.map.map((r) => r.length));
  const crates: number[] = [];
  let player = -1;
  L.map.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '$' || ch === '*') crates.push(r * W + c);
    if (ch === '@' || ch === '+') player = r * W + c;
  }));
  const D: Record<string, number> = { u: -W, d: W, l: -1, r: 1 };
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

// ------------------------------------------------------------------ 3. input

test.describe('input', () => {
  test('footprints (1-1): a far crate shows stand prints, the robot stays put', async ({ page }) => {
    // real-time animation so the prints are on screen for the photo (in instant mode they fade at once)
    await open(page, 'level=1-1&anim=real');
    const before = await state(page);
    const c = await page.evaluate(() => window.__sok.crateCenter(0));
    await page.touchscreen.tap(c.x, c.y);
    await page.waitForTimeout(450);
    await shot(page, test.info().project.name, 'sokoban-level-1-1-footprints');
    const after = await state(page);
    expect(after.player).toBe(before.player);
    expect(after.mode).toBe('footprints');
    // 1-1: the crate in the lower corridor can go left (stand right of it) or right (stand left of it)
    await expect(page.locator('.sok-play')).toHaveAttribute('data-footprints', '2');
    // they fade by themselves (1.2 s + 0.3 s)
    await idle(page);
  });

  test('arrows (2-5): select → arrow push keeps the selection; tapping the crate again only deselects', async ({ page }) => {
    await open(page, 'level=2-5');
    await page.evaluate(() => {
      window.__sok.setArrows('on');
      window.__sok.load('2-5');
    });
    await idle(page);
    expect((await state(page)).mode).toBe('arrows');
    // crate slot 0 sits at row 2; its legal arrows appear; tap the "down" arrow (the robot walks round)
    const c = await page.evaluate(() => window.__sok.crateCenter(0));
    await page.touchscreen.tap(c.x, c.y);
    await page.waitForTimeout(300);
    await expect(page.locator('.sok-play')).toHaveAttribute('data-arrows', '2');
    await shot(page, test.info().project.name, 'sokoban-level-2-5-selected-arrows');
    const s = await page.evaluate(() => window.__sok.state()!);
    const cellPx = await page.evaluate(() => {
      const a = window.__sok.cellCenter(0);
      const b = window.__sok.cellCenter(1);
      return b.x - a.x;
    });
    // arrow below the crate
    await page.touchscreen.tap(c.x, c.y + 0.68 * cellPx);
    await idle(page);
    const after = await state(page);
    expect(after.pushes).toBe(s.pushes + 1);
    // tapping the (still selected) crate only deselects
    const c2 = await page.evaluate(() => window.__sok.crateCenter(0));
    await page.touchscreen.tap(c2.x, c2.y);
    await idle(page);
    expect((await state(page)).pushes).toBe(after.pushes);
  });

  test('unreachable floor: the robot does not move', async ({ page }) => {
    await open(page, 'level=2-5');
    const before = await state(page);
    await tapCell(page, 1 * 9 + 6); // right room, sealed off by the two crates
    expect((await state(page)).player).toBe(before.player);
  });

  test('swipe: walks in chapter 2, a short drag is a near miss, chapter 1 ignores swipes', async ({ page }) => {
    await open(page, 'level=2-8');
    const p0 = await state(page);
    const r = await page.evaluate(() => window.__sok.cellCenter(window.__sok.state()!.player));
    await swipe(page, { x: r.x, y: r.y + 120 }, 80, 0, 160);
    const p1 = await state(page);
    expect(p1.player).toBe(p0.player + 1);
    await swipe(page, { x: r.x, y: r.y + 120 }, 30, 0, 120);
    expect((await state(page)).player).toBe(p1.player);
    await open(page, 'level=1-4');
    const q0 = await state(page);
    const q = await page.evaluate(() => window.__sok.cellCenter(window.__sok.state()!.player));
    await swipe(page, { x: q.x, y: q.y + 100 }, 80, 0, 160);
    expect((await state(page)).player).toBe(q0.player);
  });

  test('long-press undo: 2 s = 10 ± 1 undos; redo appears and restores; a new push hides it', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, 'level=2-7');
    const L = byId('2-7');
    await page.evaluate((lurd) => window.__sok.replay(lurd), L.ref.slice(0, L.ref.length - 1));
    const full = await state(page);
    expect(full.pushes).toBe(L.opt.pushes - 1);
    const b = await page.locator('[data-testid=undo]').boundingBox();
    await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(2000);
    await page.mouse.up();
    await idle(page);
    const after = await state(page);
    const undone = full.pushes - after.pushes;
    expect(undone).toBeGreaterThanOrEqual(9);
    expect(undone).toBeLessThanOrEqual(10);
    await expect(page.locator('[data-testid=redo]')).toBeVisible();
    await page.click('[data-testid=redo]');
    await idle(page);
    expect((await state(page)).pushes).toBe(after.pushes + 1);
  });

  test('restart is undoable', async ({ page }) => {
    await open(page, 'level=2-1');
    await page.evaluate((lurd) => window.__sok.replay(lurd), 'llluRRR');
    const mid = await state(page);
    await page.click('[data-testid=restart]');
    await idle(page);
    expect((await state(page)).pushes).toBe(0);
    await page.click('[data-testid=undo]');
    await idle(page);
    const back = await state(page);
    expect(back.crates).toEqual(mid.crates);
    expect(back.pushes).toBe(mid.pushes);
  });
});

test.describe('input: adjacency, selection, queue (spec §3.2 rows 4/6/7, input queue)', () => {
  test('adjacent but blocked (C7): bump + shake, footprints for the other legal sides, no push', async ({ page }) => {
    await open(page, 'level=C7');
    const W = 7;
    await tapCell(page, 3 * W + 4); // under the crate at (2,4); above it (1,4) is wall
    expect((await state(page)).player).toBe(3 * W + 4);
    const slot = (await state(page)).crates.indexOf(2 * W + 4);
    await tapCrate(page, slot);
    const st = await state(page);
    expect(st.pushes).toBe(0);
    expect(st.player).toBe(3 * W + 4);
    // left (stand (2,5)) and right (stand (2,3)) are legal; up is blocked by the wall
    await expect(page.locator('.sok-play')).toHaveAttribute('data-footprints', '2');
  });

  test('arrows: with a crate selected, a floor tap deselects and walks; another crate is judged on its own', async ({ page }) => {
    await open(page, 'level=2-5');
    await page.evaluate(() => {
      window.__sok.setArrows('on');
      window.__sok.load('2-5');
    });
    await idle(page);
    await tapCrate(page, 0);
    await expect(page.locator('.sok-play')).toHaveAttribute('data-arrows', /\d/);
    await tapCell(page, 4 * 9 + 1);
    await expect(page.locator('.sok-play')).not.toHaveAttribute('data-arrows', /.*/);
    expect((await state(page)).player).toBe(4 * 9 + 1);
    await tapCrate(page, 0);
    await expect(page.locator('.sok-play')).toHaveAttribute('data-arrows', /\d/);
    await tapCrate(page, 1);
    // crate 1 at (2,4) is judged on its own: wall below and above, crate 0 on its left → no legal
    // push at all, so it only shakes; crate 0 is no longer selected and nothing moved
    await expect(page.locator('.sok-play')).not.toHaveAttribute('data-arrows', /.*/);
    expect((await state(page)).pushes).toBe(0);
    // crate 0 can still be selected again (its arrows come back)
    await tapCrate(page, 0);
    await expect(page.locator('.sok-play')).toHaveAttribute('data-arrows', /\d/);
  });

  test('real time: a new target during a walk re-paths from where the robot is after the current cell', async ({ page }) => {
    await open(page, 'level=1-4&anim=real');
    const s0 = await state(page);
    await page.evaluate(() => window.__sok.tapCell(3 * 9 + 7)); // far corner: an 8-cell walk
    await page.waitForFunction((p0) => window.__sok.state()!.player !== p0, s0.player);
    await page.evaluate(() => window.__sok.tapCell(1 * 9 + 2)); // back next to the start
    await idle(page);
    expect((await state(page)).player).toBe(1 * 9 + 2);
  });

  test('real time: five quick taps on a crate = one push now + only the newest queued', async ({ page }) => {
    await open(page, 'level=C7&anim=real');
    const slot = (await state(page)).crates.indexOf(4 * 7 + 3); // right above the robot, 3 free cells up
    await page.evaluate((s) => {
      for (let i = 0; i < 5; i += 1) window.__sok.tapCrate(s);
    }, slot);
    await idle(page);
    expect((await state(page)).pushes).toBe(2);
  });
});

// ------------------------------------------------------------------ 4. race, 5. rotation, 6. layout

test('race: taps right after the winning push do not change the result', async ({ page }) => {
  await open(page, 'level=0-4');
  const L = byId('0-4');
  await page.evaluate((lurd) => window.__sok.replay(lurd), L.ref.slice(0, -1));
  const c = await page.evaluate(() => window.__sok.crateCenter(0));
  await page.evaluate((lurd) => window.__sok.replay(lurd), L.ref.slice(-1));
  await page.touchscreen.tap(c.x, c.y);
  await page.click('[data-testid=undo]', { force: true }).catch(() => {});
  await page.waitForSelector('.xg-modal');
  expect((await state(page)).solved).toBe(true);
});

test('rotation mid-push: no misplacement, no scrollbars', async ({ page }) => {
  await open(page, 'level=2-8');
  const vp = page.viewportSize()!;
  await page.evaluate(() => window.__sok.replay('r'));
  void page.evaluate(() => window.__sok.replay('D'));
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForTimeout(400);
  await idle(page);
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.documentElement.scrollHeight <= document.documentElement.clientHeight);
  expect(ok).toBe(true);
  expect((await state(page)).pushes).toBe(1);
});

test('layout: cells ≥ 48 px, buttons ≥ 48 px (76 where specified), nothing scrolls', async ({ page }) => {
  for (const id of ['0-1', '1-6', '2-7', 'C9', 'C10']) {
    await open(page, `level=${id}`);
    const m = await page.evaluate(() => {
      const a = window.__sok.cellCenter(0);
      const b = window.__sok.cellCenter(1);
      const btns = ['undo', 'restart', 'map'].map((t) => document.querySelector(`[data-testid=${t}]`)!.getBoundingClientRect());
      return { cell: b.x - a.x, btns: btns.map((r) => [r.width, r.height]), scroll: document.documentElement.scrollHeight > document.documentElement.clientHeight || document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    expect(m.cell).toBeGreaterThanOrEqual(48);
    for (const [w, h] of m.btns) expect(Math.min(w, h)).toBeGreaterThanOrEqual(76);
    expect(m.scroll).toBe(false);
  }
  await shot(page, test.info().project.name, 'sokoban-level-C10');
});

// ------------------------------------------------------------------ 9. deadlock naming (stage 1: generic before the lesson)

test('2-6: a pair before its lesson shows ✕ and only the generic line', async ({ page }) => {
  await open(page, 'level=2-6');
  const line = pairLine(byId('2-6'));
  expect(line).not.toBe('');
  await page.evaluate((lurd) => window.__sok.replay(lurd), line);
  await idle(page);
  expect((await state(page)).marks.length).toBeGreaterThan(0);
  const lines = await page.evaluate(() => window.__sok.lines());
  expect(lines).toContain('sok.dead.generic');
  expect(lines).not.toContain('sok.dead.pair.first');
});

/** A two-push line from the start that ends in a pair deadlock (first push not dead), as LURD. */
function pairLine(L: L): string {
  const l = parseLevel(L.map);
  const s0 = { player: l.start.player, boxes: Uint16Array.from(l.start.boxes) };
  for (const p1 of legalPushes(l, s0).pushes) {
    const s1 = { player: p1.from, boxes: applyPush(l, s0.boxes, p1) };
    if (detectAll(l, s1.boxes).length) continue;
    for (const p2 of legalPushes(l, s1).pushes) {
      const b2 = applyPush(l, s1.boxes, p2);
      if (detectAll(l, b2).some((d) => d.type === 'pair')) return lurdForPush(l, s0, p1) + lurdForPush(l, s1, p2);
    }
  }
  return '';
}

test('layer 2: an invisible dead end → after 8 s the prompt; its button rewinds to a solvable state', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, 'level=2-6');
  const line = invisibleLine(byId('2-6'), 0);
  expect(line).not.toBe('');
  await page.evaluate((lurd) => window.__sok.replay(lurd), line);
  await idle(page);
  await expect(page.locator('[data-testid=rewind-solvable]')).toBeHidden();
  await expect(page.locator('[data-testid=rewind-solvable]')).toBeVisible({ timeout: 12_000 });
  await shot(page, test.info().project.name, 'sokoban-stuck-rewind');
  await page.click('[data-testid=rewind-solvable]');
  await page.waitForTimeout(1500);
  await idle(page);
  expect(await page.evaluate(() => window.__sok.togo())).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => window.__sok.lines())).toEqual(expect.arrayContaining(['sok.stuck.1', 'sok.stuck.2']));
});

/** First push → an undetected dead end (layer 2), then `more` further legal pushes that stay undetected. */
function invisibleLine(L: L, more: number): string {
  const l = parseLevel(L.map);
  const s0 = { player: l.start.player, boxes: Uint16Array.from(l.start.boxes) };
  const solvable = (s: { player: number; boxes: Uint16Array }) => solvePushOptimal(l, s, { nodes: 50000, ms: 2000 });
  for (const p1 of legalPushes(l, s0).pushes) {
    const s1 = { player: p1.from, boxes: applyPush(l, s0.boxes, p1) };
    if (detectAll(l, s1.boxes).length) continue;
    if (!('dead' in solvable(s1))) continue;
    let line = lurdForPush(l, s0, p1);
    let cur = s1;
    let ok = true;
    for (let k = 0; k < more && ok; k += 1) {
      const next = legalPushes(l, cur).pushes.find((p) => !detectAll(l, applyPush(l, cur.boxes, p)).length);
      if (!next) ok = false;
      else {
        line += lurdForPush(l, cur, next);
        cur = { player: next.from, boxes: applyPush(l, cur.boxes, next) };
      }
    }
    if (ok) return line;
  }
  return '';
}

// ------------------------------------------------------------------ 10. save, legacy import, read-only

test.describe('save', () => {
  test('a level left half-way comes back (including a restart)', async ({ page }) => {
    await open(page, 'level=2-1');
    await page.evaluate((lurd) => window.__sok.replay(lurd), 'llluRRR');
    await page.click('[data-testid=restart]');
    await idle(page);
    await page.evaluate((lurd) => window.__sok.replay(lurd), 'llluR');
    const st = await state(page);
    await page.click('[data-testid=map]');
    await page.waitForSelector('.sok-map');
    await open(page, 'level=2-1');
    const back = await state(page);
    expect(back.crates).toEqual(st.crates);
    expect(back.pushes).toBe(1);
    await page.click('[data-testid=undo]');
    await idle(page);
    await page.click('[data-testid=undo]');
    await idle(page);
    expect((await state(page)).pushes).toBe(3);
  });

  test('old sokoban_save → 经典仓库 旧记录 + frontier; the old key stays', async ({ page }) => {
    await page.goto('/sokoban/?test=1&screen=map');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('sokoban_save', JSON.stringify({ best: { 0: 12, 3: 40 }, unlocked: 4 }));
    });
    await page.goto('/sokoban/?test=1&screen=map');
    await page.waitForSelector('.sok-map');
    await page.click('[data-tab=classic]');
    await expect(page.locator('[data-testid=node-C1] .sok-node__legacy')).toBeVisible();
    await expect(page.locator('[data-testid=node-C4] .sok-node__legacy')).toBeVisible();
    await expect(page.locator('[data-testid=node-C6].xg-node--locked')).toHaveCount(0);
    await expect(page.locator('[data-testid=node-C7].xg-node--locked')).toHaveCount(1);
    await shot(page, test.info().project.name, 'sokoban-map-classic');
    expect(await page.evaluate(() => localStorage.getItem('sokoban_save'))).toBe(JSON.stringify({ best: { 0: 12, 3: 40 }, unlocked: 4 }));
  });

  test('a save from a newer build is never overwritten', async ({ page }) => {
    await page.goto('/sokoban/?test=1&screen=map');
    const raw = JSON.stringify({ v: 2, updatedAt: 1, data: { future: true } });
    await page.evaluate((r) => {
      localStorage.clear();
      localStorage.setItem('kg:v1:sokoban', r);
    }, raw);
    await open(page, 'level=0-1');
    await page.evaluate(() => window.__sok.replay('rrrrddL'));
    await page.waitForSelector('.xg-modal');
    await page.click('.xg-modal [data-act=map]').catch(() => {});
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => localStorage.getItem('kg:v1:sokoban'))).toBe(raw);
  });
});

// ------------------------------------------------------------------ 7. palette gates on rendered pixels

test('palette: the pixels the renderers draw pass the §6.2 gates (crates, robot, floors, signals)', async ({ page }) => {
  await page.goto('/sokoban/?dev=styleboard&swatches=1');
  await page.waitForFunction(() => !!(window as unknown as { __sokSwatches?: unknown }).__sokSwatches);
  const px = await page.evaluate(() => {
    const cv = document.querySelector<HTMLCanvasElement>('canvas.sok-swatches')!;
    const g = cv.getContext('2d')!;
    const dpr = cv.width / parseFloat(cv.style.width);
    const p = (window as unknown as { __sokSwatches: { crateTop: [number, number][]; crateFront: [number, number][]; robotBody: [number, number]; floors: [number, number][]; signals: [number, number][] } }).__sokSwatches;
    const read = ([x, y]: [number, number]) => {
      const d = g.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    };
    return { crateTop: p.crateTop.map(read), crateFront: p.crateFront.map(read), robotBody: read(p.robotBody), floors: p.floors.map(read), signals: p.signals.map(read) };
  });
  const gates = paletteGates(px);
  expect(gates.failures).toEqual([]);
  // the drawn colours are the palette constants (no lighting drift on the sampled faces)
  expect(px.crateTop.slice(0, 4).map((c) => c.toUpperCase())).toEqual(CRATE_TOPS);
  expect(px.robotBody.toUpperCase()).toBe('#F9A726');
  expect(px.signals.every((c) => c.toUpperCase() === '#0C1230')).toBe(true);
});

// ------------------------------------------------------------------ 13. narration clips (shipped state: voice.json clips:true)
// The clips:false branch (no /audio/sokoban/ request at all) is a unit test: site/sokoban/voice.test.ts.

test('narration clips: every /audio/sokoban/ request is 200, the manifest = lines.json, subtitles show', async ({ page }) => {
  const audio: { url: string; status: number }[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/audio/sokoban/')) audio.push({ url: r.url(), status: r.status() });
  });
  await open(page, 'level=0-3');
  await tapCrate(page, 0);
  await page.waitForTimeout(500);
  await expect(page.locator('.sok-comp.is-on .sok-comp__text')).not.toHaveText('');
  await expect.poll(() => audio.some((a) => a.url.endsWith('/audio/sokoban/audio-manifest.json'))).toBe(true);
  expect(audio.filter((a) => a.status !== 200)).toEqual([]);
  const manifest = await page.evaluate(() => fetch('/audio/sokoban/audio-manifest.json').then((r) => r.json() as Promise<Record<string, { src: string; text: string }>>));
  const lines = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sokoban/lines.json'), 'utf8')) as { id: string; text: string }[];
  expect(Object.keys(manifest).sort()).toEqual(lines.map((l) => l.id).sort());
  for (const l of lines) expect(manifest[l.id].text, l.id).toBe(l.text);
  // every clip the manifest names is served
  const missing = await page.evaluate(async (srcs) => {
    const bad: string[] = [];
    for (const s of srcs) {
      const r = await fetch(s, { method: 'HEAD' });
      if (!r.ok) bad.push(s);
    }
    return bad;
  }, [...new Set(Object.values(manifest).map((m) => (m.src.startsWith('/') ? m.src : `/audio/sokoban/${m.src}`)))]);
  expect(missing).toEqual([]);
});

test('narration clips outside test mode: the opening line sok.open.1 plays from its clip', async ({ page }) => {
  const clips: string[] = [];
  page.on('response', (r) => {
    if (/\/audio\/sokoban\/sok\.open\.1\.[^/]*\.m4a/.test(r.url()) && r.status() === 200) clips.push(r.url());
  });
  await page.goto('/sokoban/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/sokoban/');
  await page.waitForSelector('.kit-start__go');
  await page.click('.kit-start__go');
  await page.waitForSelector('.sok-opening');
  await expect.poll(() => clips.length, { timeout: 8000 }).toBeGreaterThan(0);
});

// ------------------------------------------------------------------ 13b. QA r1 fixes

async function returningPlayerAtGate(page: Page): Promise<{ x: number; y: number }> {
  await page.goto('/sokoban/?test=1&screen=map');
  await page.waitForSelector('.sok-map');
  await page.evaluate(() => window.__sok.unlockAll({ except: ['4-5', '4-6', '4-7', '4-8'] }));
  await page.goto('/sokoban/');
  await page.waitForSelector('.kit-start__go');
  const b = (await page.locator('.kit-start__go').boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('start gate: the 开始 tap never clicks through to the map under it (single and double tap)', async ({ page }) => {
  const errors = watchErrors(page);
  for (const taps of [1, 2]) {
    const c = await returningPlayerAtGate(page);
    await page.touchscreen.tap(c.x, c.y);
    if (taps === 2) {
      await page.waitForTimeout(120);
      await page.touchscreen.tap(c.x, c.y);
    }
    await page.waitForSelector('.sok-map');
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => document.getElementById('app')?.dataset.screen)).toBe('map');
    // the test is only meaningful when a map node really sits under the button
    const under = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.xg-node, .sok-chcard, button'), c);
    expect(under).toBe(true);
    // a real tap afterwards still works (the guard is gone)
    await page.waitForTimeout(400);
    const node = page.locator('.xg-node--current').first();
    await node.tap();
    await page.waitForFunction(() => ['play', 'quiz'].includes(document.getElementById('app')?.dataset.screen ?? ''));
  }
  expect(errors).toEqual([]);
});

test('redo: a floor tap during the replayed push runs after it (input queue)', async ({ page }) => {
  await open(page, 'level=1-1&anim=real');
  const L = byId('1-1');
  const start = (await state(page)).player;
  const firstPush = L.ref.search(/[UDLR]/);
  await page.evaluate((lurd) => window.__sok.replay(lurd), L.ref.slice(0, firstPush + 1));
  await idle(page);
  const pushed = await state(page);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-testid=undo]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
  await idle(page);
  const back = await state(page);
  expect(back.pushes).toBe(pushed.pushes - 1);
  // redo and, while its push animates, tap the start cell (a floor cell far from the robot)
  expect(start).not.toBe(back.player);
  await page.evaluate((cell) => {
    document.querySelector<HTMLElement>('[data-testid=redo]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    window.__sok.tapCell(cell);
  }, start);
  await idle(page);
  await page.waitForTimeout(600);
  await idle(page);
  const after = await state(page);
  expect(after.pushes).toBe(pushed.pushes);
  expect(after.player).toBe(start);
});

test('page hidden: level-leave {hidden} once, level-resume on return', async ({ page }) => {
  await open(page, 'level=1-2');
  const setVis = (v: 'hidden' | 'visible') => page.evaluate((vis) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);
  await setVis('hidden');
  await setVis('hidden'); // a repeated hide writes nothing new
  expect((await page.evaluate(() => window.__sok.marks())).filter(([n]) => n === 'level-leave').length).toBe(1);
  await setVis('visible');
  await setVis('hidden'); // flushes the buffered level-resume, then a second leave
  const marks = (await page.evaluate(() => window.__sok.marks())).map(([n, d]) => [n, d] as const).filter(([n]) => n === 'level-leave' || n === 'level-resume');
  expect(marks.map(([n]) => n)).toEqual(['level-leave', 'level-resume', 'level-leave']);
  expect(marks[0][1]).toMatchObject({ id: '1-2', hidden: true });
  expect(marks[1][1]).toMatchObject({ id: '1-2' });
  await setVis('visible');
});

test('perf gate (spec §8.6): fg frame and static layer within budget on 4-7 and C10', async ({ page }) => {
  for (const id of ['4-7', 'C10']) {
    await open(page, `level=${id}`);
    const b = (await page.evaluate(() => window.__sok.bench(240)))!;
    expect(b, id).not.toBeNull();
    // performance.now() has 1 ms granularity in WebKit: the mean carries the 1.5 ms budget
    expect(b.frameAvg, `${id} frameAvg`).toBeLessThanOrEqual(1.5);
    expect(b.frameMax, `${id} frameMax`).toBeLessThanOrEqual(4);
    expect(b.staticMs, `${id} staticMs`).toBeLessThanOrEqual(40);
  }
});

// ------------------------------------------------------------------ 14. screenshots (stage 1 set)

test('screenshots: map, levels, styleboard', async ({ page }) => {
  test.setTimeout(60_000);
  const p = test.info().project.name;
  await page.goto('/sokoban/?test=1&screen=map');
  await page.waitForSelector('.sok-map');
  await shot(page, p, 'sokoban-map-ch0');
  for (const id of ['0-1', '1-2', '1-6', '2-1', '2-7']) {
    await open(page, `level=${id}`);
    await shot(page, p, `sokoban-level-${id}`);
  }
  // the first entry into chapter 2 after the auto-route upgrade: the celebration line + arrows mode
  await page.evaluate(() => {
    window.__sok.setArrows('celebrate');
    window.__sok.load('2-1');
  });
  await page.waitForFunction(() => window.__sok.state()?.mode === 'arrows');
  await page.waitForFunction(() => window.__sok.lines().includes('sok.tut.arrows'));
  // the order the child hears: the upgrade, then how arrows work, and only then the level's line
  const heard = await page.evaluate(() => window.__sok.lines());
  expect(heard.indexOf('sok.tut.upgrade')).toBeGreaterThanOrEqual(0);
  expect(heard.indexOf('sok.tut.arrows')).toBeGreaterThan(heard.indexOf('sok.tut.upgrade'));
  const lv = heard.indexOf('sok.lv.2-1');
  if (lv >= 0) expect(lv).toBeGreaterThan(heard.indexOf('sok.tut.arrows'));
  await shot(page, p, 'sokoban-level-2-1-upgrade');
  expect((await page.evaluate(() => window.__sok.save()) as { arrows: string }).arrows).toBe('on');
  await page.goto('/sokoban/?dev=styleboard');
  await page.waitForSelector('#app[data-ready]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(process.env.KG_SHOTS_DIR ?? path.join(ROOT, 'test-results'), p, 'sokoban-styleboard.png'), fullPage: true });
});

test('screenshots: start gate and the opening (fresh player)', async ({ page }) => {
  const p = test.info().project.name;
  await page.goto('/sokoban/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/sokoban/');
  await page.waitForSelector('#app[data-ready]');
  await page.waitForSelector('.kit-start__go');
  await shot(page, p, 'sokoban-start-gate');
  await page.click('.kit-start__go');
  await page.waitForSelector('.sok-opening');
  await page.waitForTimeout(2200);
  await shot(page, p, 'sokoban-opening');
  // tap anywhere skips straight into 0-1
  await page.mouse.click(40, 400);
  await page.waitForFunction(() => document.getElementById('app')?.dataset.screen === 'play');
  await page.waitForTimeout(2600);
  await shot(page, p, 'sokoban-level-0-1-ghost');
});
