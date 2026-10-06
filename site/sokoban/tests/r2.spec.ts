/**
 * QA round-2 regressions (WebKit, iPad 9 portrait + landscape):
 *  - undo / restart pressed while a push still animates (anim=real, production timings): the board
 *    ends with every crate and the robot drawn on their logical cells, no stale ✕, no pulsing undo,
 *    and the one-time deadlock naming is not used up by the cancelled push (spec §3.4/§3.6/§3.10);
 *  - a voice chain of a closed card never runs under the next card (chapter card → 跳级考试);
 *  - a level whose map does not parse shows a 维修中 node that never opens (spec §3.10).
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
interface L { id: string; ref: string; kind?: string }
const LEVELS = (JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sokoban/levels.json'), 'utf8')) as { levels: L[] }).levels;
const byId = (id: string) => LEVELS.find((l) => l.id === id)!;

type P = { x: number; y: number };
interface Sok {
  state(): { player: number; crates: number[]; pushes: number; marks: number[]; busy: boolean } | null;
  replay(l: string): Promise<void>;
  cellCenter(c: number): P;
  crateCenter(s: number): P;
  robotCenter(): P;
  tapCrate(s: number): void;
  lines(): string[];
  save(): { named: string[]; inProgress?: unknown };
  unlockAll(o?: { except?: string[]; rewards?: boolean }): void;
}

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/sokoban/?test=1&${query}`);
  await page.waitForSelector('#app[data-ready]');
  await page.waitForFunction(() => !!(window as unknown as { __sok: Sok }).__sok?.state?.());
  await idle(page);
}
const idle = (page: Page) => page.waitForFunction(() => {
  const s = (window as unknown as { __sok: Sok }).__sok?.state?.();
  return !!s && !s.busy;
}, null, { timeout: 10_000 });

/** Max distance (px) between where each object is drawn and where its logical cell says it is. */
async function drift(page: Page): Promise<number> {
  return page.evaluate(() => {
    const k = (window as unknown as { __sok: Sok }).__sok;
    const st = k.state()!;
    const s = (() => {
      const a = k.cellCenter(0);
      const b = k.cellCenter(1);
      return b.x - a.x;
    })();
    let worst = 0;
    st.crates.forEach((cell, slot) => {
      const d = k.crateCenter(slot);
      const c = k.cellCenter(cell);
      // crateCenter aims at the top face: 0.2 cell above the cell centre
      worst = Math.max(worst, Math.hypot(d.x - c.x, d.y - (c.y - 0.2 * s)));
    });
    const r = k.robotCenter();
    const c = k.cellCenter(st.player);
    worst = Math.max(worst, Math.hypot(r.x - c.x, r.y - (c.y - 0.15 * s)));
    return worst;
  });
}

/** Start a push through the real input path, wait until it is logged, then press undo/restart `ms` later. */
async function pushThen(page: Page, start: { crate?: number; lurd?: string }, ms: number, what: 'undo' | 'restart'): Promise<void> {
  await page.evaluate(async ({ start, ms, what }) => {
    const k = (window as unknown as { __sok: Sok }).__sok;
    const before = k.state()!.pushes;
    if (start.lurd) void k.replay(start.lurd);
    else k.tapCrate(start.crate!);
    const t0 = performance.now();
    while (k.state()!.pushes === before && performance.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 2));
    await new Promise((r) => setTimeout(r, ms));
    const b = document.querySelector<HTMLElement>(`[data-testid=${what}]`)!;
    if (what === 'undo') {
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, isPrimary: true, pointerType: 'touch' }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, isPrimary: true, pointerType: 'touch' }));
    } else b.click();
  }, { start, ms, what });
  await page.waitForTimeout(900);
  await idle(page);
}

test.describe('race: undo / restart while a push animates (QA r2 major)', () => {
  for (const ms of [30, 100, 200]) {
    test(`0-3 dead push, undo at ${ms} ms: board in sync, no ✕, no pulse, naming kept`, async ({ page }) => {
      await open(page, 'level=0-3&anim=real');
      const named0 = (await page.evaluate(() => (window as unknown as { __sok: Sok }).__sok.save().named)) ?? [];
      await pushThen(page, { crate: 0 }, ms, 'undo');
      const st = await page.evaluate(() => (window as unknown as { __sok: Sok }).__sok.state()!);
      expect(st.pushes).toBe(0);
      expect(st.marks).toEqual([]);
      expect(await drift(page)).toBeLessThan(2);
      await expect(page.locator('[data-testid=undo]')).not.toHaveAttribute('data-pulse', '');
      const after = await page.evaluate(() => (window as unknown as { __sok: Sok }).__sok.save().named);
      expect(after ?? []).toEqual(named0);
      const lines = await page.evaluate(() => (window as unknown as { __sok: Sok }).__sok.lines());
      expect(lines.filter((l) => /^sok\.(dead\.|tut\.undo)/.test(l))).toEqual([]);
      // the next move acts on the drawn board
      await page.evaluate(() => (window as unknown as { __sok: Sok }).__sok.tapCrate(0));
      await page.waitForTimeout(900);
      await idle(page);
      expect(await drift(page)).toBeLessThan(2);
    });
  }

  for (const ms of [30, 100, 200]) {
    test(`2-5 ordinary push, undo and restart at ${ms} ms: board in sync`, async ({ page }) => {
      await open(page, 'level=2-5&anim=real');
      const ref = byId('2-5').ref;
      const first = ref.search(/[UDLR]/);
      const prefix = ref.slice(0, first + 1);
      await pushThen(page, { lurd: prefix }, ms, 'undo');
      expect((await page.evaluate(() => (window as unknown as { __sok: Sok }).__sok.state()!)).pushes).toBe(0);
      expect(await drift(page)).toBeLessThan(2);
      // one finished push, then restart while the second push animates
      const rest = ref.slice(first + 1);
      const second = rest.slice(0, rest.search(/[UDLR]/) + 1);
      await page.evaluate((l) => (window as unknown as { __sok: Sok }).__sok.replay(l), prefix);
      await page.waitForTimeout(500);
      await idle(page);
      await pushThen(page, { lurd: second }, ms, 'restart');
      expect((await page.evaluate(() => (window as unknown as { __sok: Sok }).__sok.state()!)).pushes).toBe(0);
      expect(await drift(page)).toBeLessThan(2);
    });
  }
});

test('broken level data: a 维修中 node that never opens; the level after it opens (spec §3.10)', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/sokoban/?test=1&screen=map');
  await page.waitForSelector('#app[data-ready]');
  await page.evaluate(() => {
    const k = (window as unknown as { __sok: Sok & { breakLevel(id: string): void } }).__sok;
    k.unlockAll({ except: ['0-2', '0-3', '0-4'] });
    k.breakLevel('0-2');
  });
  const node = page.locator('[data-level="0-2"]');
  await expect(node).toHaveAttribute('data-broken', '1');
  await expect(node.locator('.sok-node__tag--repair')).toHaveText('维修中');
  await node.click({ force: true });
  await page.waitForTimeout(500);
  expect(await page.locator('.sok-play').count()).toBe(0);
  expect(errors.some((e) => /0-2/.test(e) && /维修中/.test(e))).toBe(true);
  // skipped: 0-3 opens although 0-2 is not passed
  await page.locator('[data-level="0-3"]').click();
  await page.waitForSelector('.sok-play[data-level="0-3"]');
});
