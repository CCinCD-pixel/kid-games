/**
 * Shared helpers for 星晶消消乐's Playwright tests (play.spec.ts, shots.spec.ts). Pages are driven
 * through the `?test=1` hook (window.__em, src/dev/test-hook.ts): no start gate, voices silent
 * (subtitles still shown), kit automute under automation (SILENCE RULE).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

export interface Move { t: 'swap' | 'tap'; a: number; b?: number }
export interface EmHook {
  state(): { id: string; mode: string; movesUsed: number; ready: boolean; done: boolean; won: boolean; seed: number; energy: number } | null;
  screen(): { s: string } | null;
  bestMove(): Move | null;
  lessonMove(): Move | null;
  solution(): Move[] | null;
  legal(): Move[];
  play(m: Move): Promise<boolean>;
  tool(u: unknown): Promise<boolean>;
  aiming(): boolean;
  toolUses(): number;
  advanceClock(ms: number): void;
  setSeed(n: number): void;
  forceAssist(t: number): void;
  goto(r: unknown): void;
  timeScale(n: number): void;
  step(ms: number): void;
  pause(): void;
  resume(): void;
  setSave(o: Record<string, unknown>): void;
  setPin(pin: string | null): void;
  save(): Record<string, any>;
  rects(): Record<string, any> | null;
  board(): string | null;
  width(): number;
  voiceLog(): string[];
  marks(): { name: string; data?: Record<string, unknown> }[];
  mask(): number[] | null;
  ghost(): boolean;
  hintCells(): number[] | null;
  goals(): string[];
  art(): Promise<{ iou: number[][]; area: number[]; ice: number[][]; strokes: { before: number; after: number }[]; rim: number[][] }>;
  bar(id: string): void;
  plant(list: [number, number][]): number[];
  cutscene(): Promise<void>;
}
declare global { interface Window { __em: EmHook } }

export const land = (info: TestInfo) => info.project.name.startsWith('landscape');
export const SHOTS = path.join(os.homedir(), 'kid-games-work/shots/emoji-match');
export async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  const dir = path.join(SHOTS, land(info) ? 'landscape' : 'portrait');
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

/** console errors / page errors collector (asserted empty at the end of a test) */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  // WebKit reports a fetch that a reload cancels while it goes through the service worker (production build) as an
  // "access control checks" page error; the game catches it (audio.ts loadSprite().catch) and the player never sees it
  page.on('pageerror', (e) => { if (!/due to access control checks/.test(e.message)) errors.push(`pageerror: ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`); });
  return errors;
}

/** fresh page on the test hook; `save` is merged into a clean save; `scale` speeds animations up */
export async function boot(page: Page, o: { save?: Record<string, unknown>; scale?: number; keep?: boolean } = {}): Promise<void> {
  await page.goto('/emoji-match/?test=1');
  await page.waitForSelector('#app[data-ready]', { timeout: 20000 });
  if (!o.keep) {
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});   // let the sfx sprite fetch finish first
    await page.evaluate(() => { localStorage.removeItem('kg:v1:emoji-match'); });
    await page.reload();
    await page.waitForSelector('#app[data-ready]', { timeout: 20000 });
  }
  await page.evaluate(([s, k]) => { if (s) window.__em.setSave(s as Record<string, unknown>); window.__em.timeScale(k as number); }, [o.save ?? null, o.scale ?? 4] as const);
}

export async function goPlay(page: Page, id: string, o: { seed?: number; mode?: 'play' | 'puzzle' | 'free' } = {}): Promise<void> {
  await page.evaluate(([i, s, m]) => {
    if (s != null) window.__em.setSeed(s as number);
    window.__em.goto(m === 'puzzle' ? { s: 'puzzle', id: i } : m === 'free' ? { s: 'free' } : { s: 'play', id: i });
  }, [id, o.seed ?? null, o.mode ?? 'play'] as const);
  await page.waitForFunction(() => window.__em.state()?.ready === true, null, { timeout: 15000 });
}

export const settle = (page: Page, timeout = 20000) => page.waitForFunction(() => { const s = window.__em.state(); return !!s && (s.ready || s.done); }, null, { timeout });

export async function cellXY(page: Page, i: number): Promise<{ x: number; y: number }> {
  return page.evaluate((k) => { const r = window.__em.rects()!; const w = window.__em.width(); return { x: r.ox + ((k % w) + 0.5) * r.cell, y: r.oy + (Math.floor(k / w) + 0.5) * r.cell }; }, i);
}

/** a finger drag from cell a to cell b with the real pointer (input.ts path) */
export async function drag(page: Page, a: number, b: number): Promise<void> {
  const p = await cellXY(page, a), q = await cellXY(page, b);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let k = 1; k <= 6; k += 1) await page.mouse.move(p.x + ((q.x - p.x) * k) / 6, p.y + ((q.y - p.y) * k) / 6);
  await page.mouse.up();
}
export async function tapCell(page: Page, i: number, holdMs = 0): Promise<void> {
  const p = await cellXY(page, i);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

/** play best moves until the level ends (or `max` moves) */
export async function playOut(page: Page, max = 40): Promise<{ won: boolean; moves: number }> {
  for (let k = 0; k < max; k += 1) {
    const s = await page.evaluate(() => window.__em.state());
    if (!s || s.done || s.won) break;
    await page.evaluate(async () => { const m = window.__em.bestMove(); if (m) await window.__em.play(m); });
    await settle(page);
  }
  const s = await page.evaluate(() => window.__em.state());
  return { won: !!s?.won, moves: s?.movesUsed ?? 0 };
}

/** click like a finger: visible, on top at its centre (breathing buttons never become "stable") */
export async function press(page: Page, sel: string): Promise<void> {
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  const box = (await loc.boundingBox())!;
  const top = await page.evaluate(([s, x, y]) => { const el = document.querySelector(s as string); const at = document.elementFromPoint(x as number, y as number); return !!el && !!at && (el === at || el.contains(at)); }, [sel, box.x + box.width / 2, box.y + box.height / 2] as const);
  if (!top) throw new Error(`press: ${sel} is covered at its centre`);
  await loc.click({ force: true });
}

export interface Box { x: number; y: number; width: number; height: number }
export const overlap = (a: Box, b: Box, slack = 0.5) => a.x + a.width > b.x + slack && b.x + b.width > a.x + slack && a.y + a.height > b.y + slack && b.y + b.height > a.y + slack;
export const inside = (a: Box, w: number, h: number) => a.x >= -0.5 && a.y >= -0.5 && a.x + a.width <= w + 0.5 && a.y + a.height <= h + 0.5;
