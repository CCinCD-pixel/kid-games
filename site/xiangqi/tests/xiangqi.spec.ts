import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { Chess, type Square } from '@weshell/xiangqi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const puzzles = JSON.parse(readFileSync(path.join(ROOT, 'content/xiangqi/puzzles.json'), 'utf8')) as { fen: string; hint: string }[];

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') });
  await page.goto('/xiangqi/?test&mute=1');
  await expect(page.locator('#app[data-ready]')).toBeVisible();
});

async function tapSquare(page: Page, square: Square): Promise<void> {
  const point = await page.locator('.xq-board').evaluate((board, target) => {
    const svg = board as SVGSVGElement;
    const col = target.charCodeAt(0) - 97;
    const rank = Number(target[1]);
    const pieceGroup = board.querySelector<SVGGElement>(`.xq-piece[data-square="${target}"]`);
    const piece = pieceGroup?.querySelector('circle.xq-piece-disc');
    if (piece) {
      const pt = svg.createSVGPoint();
      pt.x = Number(piece.getAttribute('cx'));
      pt.y = Number(piece.getAttribute('cy'));
      const screen = pt.matrixTransform(svg.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    }
    const redKing = board.querySelector<SVGGElement>('.xq-piece[data-square="e0"] .xq-piece-disc');
    const flipped = Number(redKing?.getAttribute('cy')) < 500;
    const pt = svg.createSVGPoint();
    pt.x = 50 + (flipped ? 8 - col : col) * 100;
    pt.y = 50 + (flipped ? rank : 9 - rank) * 100;
    const screen = pt.matrixTransform(svg.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  }, square);
  await page.touchscreen.tap(point.x, point.y);
}

test('family game rejects illegal moves, saves a turn, and undoes it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await tapSquare(page, 'b0');
  await tapSquare(page, 'd1');
  await expect(page.locator('.xq-status strong')).toContainText('红方行棋');
  await tapSquare(page, 'c2');
  await expect(page.locator('.xq-status strong')).toContainText('黑方行棋');
  await page.reload();
  await expect(page.locator('.xq-status strong')).toContainText('黑方行棋');
  await page.getByRole('button', { name: '悔棋' }).click();
  await expect(page.locator('.xq-status strong')).toContainText('红方行棋');
  expect(errors).toEqual([]);
});

test('junior AI opens as red and an undone turn cannot be replayed by a stale reply', async ({ page }) => {
  await page.getByRole('tab', { name: '和小军师下' }).click();
  await page.getByRole('button', { name: '执黑后行' }).click();
  await expect(page.locator('.xq-status strong')).toContainText('黑方行棋', { timeout: 8_000 });
  await expect(page.locator('.xq-history li')).toHaveCount(1);
  await tapSquare(page, 'b9');
  await tapSquare(page, 'c7');
  await expect(page.locator('.xq-history li')).toHaveCount(3, { timeout: 8_000 });
  await page.getByRole('button', { name: '悔棋' }).click();
  await expect(page.locator('.xq-history li')).toHaveCount(1);
  await page.waitForTimeout(600);
  await expect(page.locator('.xq-history li')).toHaveCount(1);
});

test('undo while the AI is thinking cancels its pending turn', async ({ page }) => {
  await page.getByRole('tab', { name: '和小军师下' }).click();
  await tapSquare(page, 'b0');
  await tapSquare(page, 'c2');
  await page.getByRole('button', { name: '悔棋' }).click();
  await expect(page.locator('.xq-history li')).toHaveCount(0);
  await page.waitForTimeout(650);
  await expect(page.locator('.xq-history li')).toHaveCount(0);
  await expect(page.locator('.xq-status strong')).toContainText('红方行棋');
});

test('family game can rotate for black and accept a black move', async ({ page }) => {
  await page.getByLabel('轮到黑方时自动翻盘').check();
  await tapSquare(page, 'b0');
  await tapSquare(page, 'c2');
  await expect(page.locator('.xq-status strong')).toContainText('黑方行棋');
  await tapSquare(page, 'b9');
  await tapSquare(page, 'c7');
  await expect(page.locator('.xq-history li')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.xq-history li')).toHaveCount(2);
});

test('an incomplete save recovers to a playable opening', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('kg:v1:xiangqi', JSON.stringify({ v: 1, updatedAt: Date.now(), data: { mode: 'local', initialFen: 'bad', moves: [] } })));
  await page.reload();
  await expect(page.locator('.xq-status strong')).toContainText('红方行棋');
  await tapSquare(page, 'b0');
  await tapSquare(page, 'c2');
  await expect(page.locator('.xq-status strong')).toContainText('黑方行棋');
});

test('endgame gives a hint, allows a retry, and retains completion after refresh', async ({ page }) => {
  await page.getByRole('tab', { name: '残局' }).click();
  const puzzle = puzzles[0];
  const game = new Chess(puzzle.fen);
  const solution = game.moves({ verbose: true }).find((move) => {
    game.move(move.lan);
    const mate = game.isCheckmate();
    game.undo();
    return mate;
  })!;
  const wrong = game.moves({ verbose: true }).find((move) => move.lan !== solution.lan)!;
  await tapSquare(page, wrong.from);
  await tapSquare(page, wrong.to);
  await expect(page.locator('.xq-status strong')).not.toContainText('残局解开了');
  await page.getByRole('button', { name: '线索' }).click();
  await expect(page.locator('.xq-coach')).toContainText(puzzle.hint);
  await tapSquare(page, solution.from);
  await tapSquare(page, solution.to);
  await expect(page.locator('.xq-status strong')).toContainText('残局解开了');
  await page.reload();
  await expect(page.locator('.xq-status strong')).toContainText('残局解开了');
  await expect(page.locator('.xq-puzzle-head')).toContainText('1/8');
});

test('board and current turn remain usable on phone and iPad sizes', async ({ page }, info) => {
  for (const { width, height } of [
    { width: 320, height: 568 },
    { width: 390, height: 664 },
    { width: 844, height: 390 },
    { width: 568, height: 320 },
    { width: 810, height: 1080 },
    { width: 1080, height: 810 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await expect(page.locator('.xq-board')).toBeVisible();
    await expect(page.locator('.xq-status strong')).toBeVisible();
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      board: document.querySelector('.xq-board')!.getBoundingClientRect().toJSON(),
      back: document.querySelector('.kit-back, .kit-back-adopted')!.getBoundingClientRect().toJSON(),
      tabs: document.querySelector('.xq-tabs')!.getBoundingClientRect().toJSON(),
      title: document.querySelector('.xq-header h1')!.getBoundingClientRect().toJSON(),
    }));
    expect(metrics.overflow, `${width}x${height} horizontal overflow`).toBeLessThanOrEqual(1);
    expect(metrics.board.width, `${width}x${height} board width`).toBeGreaterThan(height < 350 ? 180 : 250);
    if (width > height) expect(metrics.board.bottom, `${width}x${height} board bottom`).toBeLessThanOrEqual(height);
    if (width <= 900) {
      const overlaps = (a: typeof metrics.board, b: typeof metrics.board) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      expect(overlaps(metrics.back, metrics.board), `${width}x${height} back button and board`).toBe(false);
      expect(overlaps(metrics.back, metrics.tabs), `${width}x${height} back button and tabs`).toBe(false);
      expect(overlaps(metrics.back, metrics.title), `${width}x${height} back button and title`).toBe(false);
    }
    await tapSquare(page, 'b0');
    await tapSquare(page, 'c2');
    await expect(page.locator('.xq-status strong')).toContainText('黑方行棋');
    await page.screenshot({ path: info.outputPath(`xiangqi-${width}x${height}.png`) });
    await page.getByRole('button', { name: '悔棋' }).click();
  }
});
