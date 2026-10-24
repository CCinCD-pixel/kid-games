import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
test.beforeEach(async ({ context }) => { await context.addInitScript({ path: path.join(ROOT, 'tools/qa/mute-audio.js') }); });

async function boot(page: Page): Promise<void> {
  await page.goto('/chess/?mute=1');
  await expect(page.locator('#app[data-ready]')).toBeVisible();
  await page.locator('.kit-start__go').click();
  await expect(page.locator('.kit-start')).toBeHidden();
}

async function move(page: Page, from: string, to: string): Promise<void> {
  const toIndex = (square: string) => (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;
  await page.locator(`[data-sq="${toIndex(from)}"]`).click();
  await page.locator(`[data-sq="${toIndex(to)}"]`).click();
}

test('piece lesson and save continue through a reload', async ({ page }) => {
  await boot(page);
  await expect(page.locator('[data-lesson]')).toHaveCount(6);
  await expect(page.locator('[data-ai]')).toHaveCount(3);
  await expect(page.locator('[data-puzzle]')).toHaveCount(16);
  await page.locator('[data-lesson="0"]').click();
  await move(page, 'a1', 'a6');
  await expect(page.getByText('找到了这一步！')).toBeVisible();
  await page.locator('[data-act="next-task"]').click();
  await move(page, 'a1', 'h1');
  await page.locator('[data-act="next-task"]').click();
  await expect(page.locator('#cx-learn .cx-section-title span')).toHaveText('1 / 6');
  await page.reload();
  await page.locator('.kit-start__go').click();
  await expect(page.locator('#cx-learn .cx-section-title span')).toHaveText('1 / 6');

  await page.locator('[data-lesson="3"]').click();
  await move(page, 'e1', 'e2');
  await expect(page.getByText('走得好，再想想下一步。')).toBeVisible();
  await page.locator('[data-act="lesson-hint"]').click();
  await expect(page.locator('.cx-square.legal').first()).toBeVisible();
  await move(page, 'e2', 'e3');
  await expect(page.getByText('找到了这一步！')).toBeVisible();
});

test('face-to-face moves, undo, restore and new-game confirmation', async ({ page }) => {
  await boot(page);
  await page.locator('[data-act="f2f"]').click();
  await move(page, 'e2', 'e4');
  await move(page, 'e7', 'e5');
  await expect(page.locator('.cx-count')).toContainText('2 步');
  await page.locator('[data-act="undo"]').click();
  await expect(page.locator('.cx-count')).toContainText('1 步');
  await page.reload();
  await page.locator('.kit-start__go').click();
  await page.locator('[data-act="resume"]').click();
  await expect(page.locator('.cx-count')).toContainText('1 步');
  await page.locator('[data-act="back"]').click();
  await page.locator('[data-ai="0"]').click();
  await expect(page.getByText('还有一盘没下完')).toBeVisible();
  await page.locator('[data-act="cancel-new"]').click();
  await page.locator('[data-act="resume"]').click();
  await expect(page.locator('.cx-count')).toContainText('1 步');
  await page.locator('[data-act="back"]').click();
  await page.locator('[data-ai="0"]').click();
  await page.locator('[data-act="confirm-new"]').click();
  await expect(page.locator('.cx-count')).toContainText('0 步');
  await move(page, 'e2', 'e4');
  await expect(page.locator('.cx-count')).toContainText('2 步', { timeout: 8_000 });
});

test('puzzle, restart and compact layouts stay usable', async ({ page }) => {
  await boot(page);
  await page.locator('[data-puzzle="0"]').click();
  await expect(page.locator('.cx-board .cx-square')).toHaveCount(64);
  await page.locator('[data-act="restart"]').click();
  await page.locator('[data-act="confirm-reset"]').click();
  await expect(page.locator('.cx-count')).toContainText('0 步');
  for (const { width, height } of [{ width: 320, height: 568 }, { width: 390, height: 664 }, { width: 810, height: 1080 }, { width: 1080, height: 810 }, { width: 844, height: 390 }]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.evaluate(() => {
      const board = document.querySelector('.cx-board')!.getBoundingClientRect();
      const actions = document.querySelector('.cx-actions')!.getBoundingClientRect();
      return { scroll: document.documentElement.scrollWidth, width: innerWidth, boardLeft: board.left, boardRight: board.right, boardWidth: board.width, actionsLeft: actions.left, actionsRight: actions.right };
    });
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.boardLeft).toBeGreaterThanOrEqual(0);
    expect(bounds.boardRight).toBeLessThanOrEqual(bounds.width + 1);
    if (width === 810) expect(bounds.boardWidth).toBeGreaterThanOrEqual(700);
    expect(bounds.actionsLeft).toBeGreaterThanOrEqual(0);
    expect(bounds.actionsRight).toBeLessThanOrEqual(bounds.width + 1);
    await page.locator('[data-act="hint"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-act="hint"]')).toBeInViewport();
    if (width === 810) {
      const guideTop = await page.locator('.cx-guide').evaluate((el) => el.getBoundingClientRect().top);
      const boardTop = await page.locator('.cx-board').evaluate((el) => el.getBoundingClientRect().top);
      expect(guideTop).toBeLessThan(boardTop);
    }
  }
});

test('one-move mate rejects a miss, gives a legal hint, and counts only once', async ({ page }) => {
  await boot(page);
  await page.locator('[data-puzzle="0"]').click();
  await move(page, 'g1', 'g2');
  await expect(page.getByText('这一步还没将死，再想想。')).toBeVisible();
  await expect(page.locator('.cx-square.selected')).toHaveCount(1);
  await expect(page.locator('.cx-square.miss')).toHaveCount(1);
  await expect(page.locator('.cx-guide-text')).toContainText('换一个亮起的格子');
  await expect(page.locator('.cx-count')).toContainText('0 步');
  await page.locator('[data-act="restart"]').click();
  await page.locator('[data-act="confirm-reset"]').click();
  await expect(page.locator('.cx-square.miss')).toHaveCount(0);
  await move(page, 'g1', 'g2');
  await page.locator('[data-act="hint"]').click();
  await expect(page.locator('.cx-square.hint')).toHaveCount(1);
  await move(page, 'g1', 'g8');
  await expect(page.getByText('白方获胜')).toBeVisible();
  await page.locator('[data-act="undo"]').click();
  await move(page, 'g1', 'g8');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:chess')!).data);
  expect(saved.played).toBe(1);
  expect(saved.puzzles).toEqual(['in.C1.5']);
  await page.locator('[data-act="finish"]').click();
  await expect(page.locator('#cx-mates .cx-section-title span')).toHaveText('1 / 8');
  await expect(page.locator('#cx-endgames .cx-section-title span')).toHaveText('0 / 8');
});

test('second mate opens directly after leaving an unfinished first mate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.locator('[data-puzzle="0"]').tap();
  await page.locator('[data-act="back"]').tap();
  await expect(page.locator('[data-act="resume"]')).toContainText('一步将死');
  await page.locator('[data-puzzle="1"]').tap();
  await expect(page.locator('.cx-top strong')).toHaveText('一步将死 · 第 2 题');
  await expect(page.locator('.cx-overlay')).toHaveCount(0);
  await page.locator('[data-act="back"]').tap();
  await page.reload();
  await page.locator('.kit-start__go').tap();
  await page.locator('[data-puzzle="1"]').tap();
  await expect(page.locator('.cx-top strong')).toHaveText('一步将死 · 第 2 题');
  await expect(page.locator('.cx-overlay')).toHaveCount(0);
  await page.locator('[data-sq="56"]').tap();
  await expect(page.locator('.cx-square.selected')).toHaveCount(1);
  await page.locator('[data-sq="0"]').tap();
  await expect(page.getByText('白方获胜')).toBeVisible();
});

test('all one-move mates respond to phone taps and accept their solution', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  const solutions = [['g1', 'g8'], ['a1', 'a8'], ['g5', 'g8'], ['c6', 'c8'], ['h2', 'h8'], ['c4', 'c8'], ['e2', 'b5'], ['h6', 'g7']];
  const index = (s: string) => (8 - Number(s[1])) * 8 + s.charCodeAt(0) - 97;
  for (const [i, [from, to]] of solutions.entries()) {
    await page.locator(`[data-puzzle="${i}"]`).tap();
    await page.locator(`[data-sq="${index(from)}"]`).tap();
    await expect(page.locator('.cx-square.selected')).toHaveCount(1);
    await expect(page.locator('.cx-guide-text')).toContainText('选中了');
    await page.locator(`[data-sq="${index(to)}"]`).tap();
    await expect(page.locator('.cx-guide-text')).toContainText('将死了');
    await page.locator('[data-act="finish"]').tap();
  }
  await expect(page.locator('#cx-mates .cx-section-title span')).toHaveText('8 / 8');
});

test('coach offers replay and each recorded line resolves', async ({ page, request }) => {
  await boot(page);
  await expect(page.locator('.cx-bot-host .kit-companion')).toBeVisible();
  await page.locator('[data-act="replay"]').click();
  await page.locator('[data-puzzle="0"]').click();
  await expect(page.locator('.cx-guide-text')).toContainText('一步将死');
  const manifest = await (await request.get('/audio/chess/audio-manifest-v2.json')).json() as Record<string, { src: string }>;
  for (const id of ['cx.home', 'cx.mate', 'cx.select', 'cx.miss', 'cx.hint', 'cx.win']) {
    const response = await request.get(manifest[id].src);
    expect(response.ok(), id).toBe(true);
  }
});

test('voice stays on the current clip set across game navigation', async ({ page }) => {
  await page.addInitScript(() => {
    const state = globalThis as typeof globalThis & { __speechCalls?: number };
    state.__speechCalls = 0;
    const synth = globalThis.speechSynthesis;
    if (synth) {
      const speak = synth.speak.bind(synth);
      synth.speak = (utterance) => { state.__speechCalls = (state.__speechCalls ?? 0) + 1; speak(utterance); };
    }
  });
  const manifests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('audio-manifest')) manifests.push(new URL(request.url()).pathname);
  });

  await boot(page);
  await page.locator('[data-lesson="0"]').click();
  await page.waitForTimeout(250);
  expect(manifests).toContain('/audio/chess/audio-manifest-v2.json');
  expect(manifests).not.toContain('/audio/chess/audio-manifest.json');
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __speechCalls?: number }).__speechCalls)).toBe(0);
});

test('visual review of the academy and board', async ({ page }, testInfo) => {
  await boot(page);
  await page.screenshot({ path: testInfo.outputPath('academy.png') });
  await page.locator('[data-ai="0"]').click();
  await page.screenshot({ path: testInfo.outputPath('board.png') });
});
