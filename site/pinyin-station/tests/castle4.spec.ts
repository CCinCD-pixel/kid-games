import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { instrument } from '../../../tests/smoke/helpers';
import { bank } from '../src/domain/content';
import { initialSave, recordAttempt } from '../src/domain/learning';
import { drillTables } from '../src/domain/drill';
import type { Save } from '../src/domain/types';
import { parentPin } from './helpers';

/**
 * 课本对齐 stage 4, real taps: 朗读册 (+1 and the parent's stamp), the parent's 按课本页 report, the review note on the home screen,
 * the printable practice page and weekly review (checked in print media: one A4 page, black on white), and the weekly programme.
 * Muted: the spy only records; nothing is ever played.
 */
test.use({ serviceWorkers: 'block' });
const DAY = 86400000;
const shot = (page: Page, name: string, project: string) => process.env.KG_SHOTS_CASTLE && page.screenshot({ path: path.join(process.env.KG_SHOTS_CASTLE, `castle4-${name}-${project}.png`) });
const SPY = `(() => { const log = (window.__aud = []);
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { log.push({ audio: true }); return start.apply(this, a); };
  const say = window.speechSynthesis && speechSynthesis.speak.bind(speechSynthesis);
  if (say) speechSynthesis.speak = (u) => { log.push({ speech: u.text }); try { u.volume = 0; } catch {} say(u); };
})();`;
const noDeviceVoice = async (page: Page) => expect((await page.evaluate(() => (window as any).__aud as { speech?: string }[])).filter((x) => x.speech)).toEqual([]);
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data);
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

let n = 0;
/** A child who has practised for a few days: some right, some wrong, in the stations up to 12. */
function practised(s: Save, now = Date.now()) {
  s.settings.lesson = 12;
  s.settings.book = 13;
  s.sessions = 6;
  const add = (skill: string, correct: boolean, session: number, at: number) => recordAttempt(s, { id: `p${++n}`, skill, kind: 'E', correct, judge: 'deterministic', session, at });
  const words = (st: number, k: number) => bank.words.filter((w) => w.lesson === st && !w.hold).slice(0, k);
  for (const w of words(12, 3)) for (let i = 0; i < 2; i++) add(`word:${w.id}:decode`, false, 5, now - 2 * 3600_000);
  for (const w of words(9, 3)) add(`word:${w.id}:decode`, false, 4, now - 2 * DAY);
  for (const w of words(5, 2)) add(`word:${w.id}:decode`, true, 3, now - 3 * DAY);
  for (const x of bank.syllables.filter((y) => y.lesson === 12 && y.initial && y.tone > 0 && !y.wordOnly).slice(0, 5)) add(`syl:${x.id}:blend`, false, 5, now - 2 * 3600_000);
  add('tone4:ai:hear', false, 5, now - 3600_000);
  add('letter:b:hear', true, 3, now - 4 * DAY);
  s.lastAttemptAt = now - 5 * 3600_000; // a new session starts at the next programme: the old friends are due
  s.dates = [now - 2 * DAY, now - 5 * 3600_000];
}
async function open(page: Page, tweak: (s: Save) => void = () => undefined) {
  const s = initialSave();
  s.tutorial = { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true };
  s.rulesSeen = { hint: true };
  tweak(s);
  await instrument(page);
  await page.addInitScript(SPY);
  await page.addInitScript((data) => { if (!localStorage.getItem('kg:v1:pinyin-station')) localStorage.setItem('kg:v1:pinyin-station', JSON.stringify({ v: 1, updatedAt: Date.now(), data })); }, s);
  await page.goto('/pinyin-station/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await expect(page.locator('.kit-start')).toHaveCount(0);
}
async function openParent(page: Page) {
  await page.getByRole('button', { name: '家长', exact: true }).click();
  await parentPin(page);
  await expect(page.getByRole('heading', { name: '电台值班室' })).toBeVisible();
}

test.describe('朗读册', () => {
  test('one row per book page, +1 per tap with no limit, kept after a reload; the parent stamps a page', async ({ page }, info) => {
    test.setTimeout(90_000);
    await open(page, (s) => (s.settings.lesson = 12));
    await page.getByRole('button', { name: /朗读册/ }).first().click();
    await expect(page.locator('.readbook-row')).toHaveCount(15);
    await expect(page.locator('.readbook-row').first()).toContainText('还没开始读');
    await shot(page, 'readbook', info.project.name);
    const row = page.locator('[data-page="16"]');
    await row.scrollIntoViewIfNeeded();
    for (let i = 1; i <= 4; i++) {
      await row.getByRole('button', { name: '我读了一遍' }).click();
      await expect(row.locator('.readbook-count')).toHaveText(`已读 ${i} 遍`);
    }
    await expect(page.locator('.kit-subtitle__text')).toHaveText('记下啦，又读了一遍。');
    await noSideways(page);
    await noDeviceVoice(page);
    const s = await saved(page);
    expect(s.book['16'].reads).toBe(4);
    expect(s.book['16'].signedAt).toBeUndefined();
    expect(s.settings.lesson).toBe(12); // the book habit never touches where the teacher is
    await page.reload();
    await page.getByRole('button', { name: '进入电台', exact: true }).click();
    await page.getByRole('button', { name: /朗读册/ }).first().click();
    await expect(page.locator('[data-page="16"] .readbook-count')).toHaveText('已读 4 遍');
    // the parent page lists the pages that were read and stamps "已签字"
    await page.getByRole('button', { name: '家长', exact: true }).click();
    await parentPin(page);
    const stamp = page.locator('[data-card="stamps"] [data-page="16"]');
    await stamp.scrollIntoViewIfNeeded();
    await expect(stamp).toContainText('已读 4 遍');
    await stamp.getByRole('button', { name: /已签字/ }).click();
    await expect(stamp.getByRole('button', { name: /撤销/ })).toBeVisible();
    expect((await saved(page)).book['16'].signedAt).toBeGreaterThan(0);
    await page.getByRole('button', { name: '回到电台', exact: true }).first().click();
    await page.getByRole('button', { name: /朗读册/ }).first().click();
    await expect(page.locator('[data-page="16"] .seal')).toBeVisible();
    await expect(page.locator('[data-page="1"] .seal')).toBeHidden();
    await shot(page, 'readbook-signed', info.project.name);
  });
});

test.describe('按课本页 (parent)', () => {
  test('rows per page with column counts, the ten shakiest with their page, the last 7 days; nothing sideways at any width', async ({ page }, info) => {
    test.setTimeout(90_000);
    await open(page, (s) => practised(s));
    await openParent(page);
    const pages = page.locator('[data-card="pages"]');
    await pages.scrollIntoViewIfNeeded();
    await expect(pages.locator('.page-row')).toHaveCount(12);
    await expect(pages.locator('[data-station="12"]')).toContainText('第 16 页');
    await expect(pages.locator('[data-station="12"]')).toContainText(/拼一拼 \d+\/\d+/);
    await expect(pages.locator('[data-station="11"]')).toContainText('第 14、15 页');
    const weak = page.locator('[data-card="weak"] li');
    expect(await weak.count()).toBe(10);
    await expect(weak.first()).toContainText(/第 \d+ 页/);
    await expect(weak.first()).toContainText('答错 2 次');
    const week = page.locator('[data-card="week"]');
    await expect(week).toContainText('共练了');
    await expect(week.locator('.week-row')).toHaveCount(7);
    await expect(page.getByRole('button', { name: '回听' })).toHaveCount(0); // (the recording list is a different card; none exists for this child)
    await shot(page, 'parent-pages', info.project.name);
    await noSideways(page);
    for (const card of await page.locator('.parent-card').all()) {
      const box = await card.boundingBox();
      if (box) expect(box.x + box.width, 'a card is wider than the screen').toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
  });
});

test.describe('复习队列 (home)', () => {
  test('a quiet note about the old friends, by book page; none for a fresh child or after today\'s programme', async ({ page }, info) => {
    await open(page, (s) => practised(s));
    const hint = page.locator('.due-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText(/今天有 \d+ 个老朋友想见你。/);
    await expect(hint).toContainText(/第 \d+ 页/);
    await expect(hint).not.toContainText(/错|失败|没做|落后/);
    await shot(page, 'home-due', info.project.name);
    await noSideways(page);
  });
  test('nothing for a fresh child, nothing once today\'s programme is done', async ({ page }) => {
    await open(page, (s) => (s.settings.lesson = 12));
    await expect(page.locator('.station-home')).toBeVisible();
    await expect(page.locator('.due-hint')).toHaveCount(0);
  });
  test('after a programme finished today the note is gone', async ({ page }) => {
    await open(page, (s) => {
      practised(s);
      s.lastFinishAt = Date.now() - 60_000;
    });
    await expect(page.locator('.station-home')).toBeVisible();
    await expect(page.locator('.due-hint')).toHaveCount(0);
  });
  test('a 练读表 that is due says so, and reading it again pushes its next time out', async ({ page }) => {
    test.setTimeout(90_000);
    const table = drillTables(bank, 12).find((t) => t.kind === 'final')!;
    await open(page, (s) => {
      s.settings.lesson = 12;
      s.drillBest = { [table.id]: { best: 30, last: 30, at: Date.now() - 2 * DAY, box: 0, due: Date.now() - 1000 } };
    });
    await expect(page.locator('.due-hint')).toContainText('1 个老朋友');
    await page.getByRole('button', { name: '练读表', exact: true }).click();
    await expect(page.locator(`[data-table="${table.id}"]`)).toHaveClass(/due/);
    await expect(page.locator(`[data-table="${table.id}"]`)).toContainText('该再读一读啦');
    await page.locator(`[data-table="${table.id}"]`).click();
    await page.getByRole('button', { name: '开始读', exact: true }).click();
    for (let i = 0; i < table.cells.length; i++) await page.getByRole('button', { name: '读好了', exact: true }).click();
    await expect(page.locator('.drill-status.is-done')).toBeVisible();
    const d = (await saved(page)).drillBest[table.id];
    expect(d.box).toBe(1);
    expect(d.due - d.at).toBe(2 * DAY); // box 1 = read again in 2 days
    await page.getByRole('button', { name: '再读一张', exact: true }).click();
    await expect(page.locator(`[data-table="${table.id}"]`)).not.toHaveClass(/due/);
  });
});

async function sheetChecks(page: Page, project: string, name: string) {
  await page.evaluate(() => { (window as any).__printed = 0; window.print = () => { (window as any).__printed++; }; });
  await page.getByRole('button', { name: '打印', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__printed)).toBe(1);
  await shot(page, `${name}-preview`, project);
  await page.emulateMedia({ media: 'print' });
  // only the paper is left: the header, the toolbar and the kit chrome are gone
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#app > header')!).display)).toBe('none');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.print-toolbar')!).display)).toBe('none');
  const paper = page.locator('.print-sheet');
  await expect(paper).toBeVisible();
  const m = await paper.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const mm = (v: number) => v / 3.7795;
    const css = getComputedStyle(el);
    return {
      widthMm: mm(r.width),
      heightMm: mm(r.height),
      color: css.color,
      background: css.backgroundColor,
      clippedX: el.scrollWidth > el.clientWidth + 1,
      clipped: [...el.querySelectorAll<HTMLElement>('.ps-group, .ps-q, .ps-head')].filter((x) => x.scrollHeight > x.clientHeight + 1).length,
      foot: el.querySelector('.ps-foot')?.textContent ?? '',
      inkColors: [...new Set([...el.querySelectorAll('*')].map((x) => getComputedStyle(x).color))],
    };
  });
  expect(m.widthMm, 'the paper is 186 mm wide (A4 with 12 mm margins)').toBeLessThanOrEqual(186.5);
  expect(m.heightMm, `the paper is ${m.heightMm.toFixed(0)} mm high: it must fit one A4 page (273 mm)`).toBeLessThanOrEqual(273);
  expect(m.clippedX).toBe(false);
  expect(m.clipped, 'something is cut off inside the paper').toBe(0);
  expect(m.color).toBe('rgb(0, 0, 0)');
  expect(m.background).toBe('rgb(255, 255, 255)');
  expect(m.inkColors).toEqual(['rgb(0, 0, 0)']); // black and white only
  expect(m.foot).toContain('我已朗读（　　）遍');
  expect(m.foot).toContain('家长签字：＿');
  await paper.screenshot({ path: process.env.KG_SHOTS_CASTLE ? path.join(process.env.KG_SHOTS_CASTLE, `castle4-${name}-print-${project}.png`) : undefined });
  await page.emulateMedia({ media: 'screen' });
}

test.describe('打印练习页和一周回顾卷', () => {
  test('the weak-spots page: grouped by book page, A4, black and white, a signature line', async ({ page }, info) => {
    test.setTimeout(90_000);
    await open(page, (s) => practised(s));
    await openParent(page);
    const card = page.locator('[data-card="print"]');
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', { name: '生成练习页' }).click();
    await expect(page.locator('.print-sheet')).toBeVisible();
    const groups = page.locator('.ps-group');
    expect(await groups.count()).toBeGreaterThan(0);
    expect(await groups.count()).toBeLessThanOrEqual(3);
    for (const label of await page.locator('.ps-page').allInnerTexts()) expect(label).toMatch(/^第 [\d、]+ 页$/);
    await expect(page.locator('.ps-grid').first()).toBeVisible();
    await expect(page.locator('.ps-blank').first()).toBeVisible();
    // no book text and no pictures on the paper
    await expect(page.locator('.print-sheet img, .print-sheet svg, .print-sheet picture')).toHaveCount(0);
    await noSideways(page);
    await sheetChecks(page, info.project.name, 'weak');
    // back to the parent page without a second PIN
    await page.getByRole('button', { name: '回家长页', exact: true }).click();
    await expect(page.getByRole('heading', { name: '电台值班室' })).toBeVisible();
  });
  test('one chosen page, and the weekly review paper: 15 to 20 questions with tick boxes', async ({ page }, info) => {
    test.setTimeout(90_000);
    await open(page, (s) => practised(s));
    await openParent(page);
    const card = page.locator('[data-card="print"]');
    await card.scrollIntoViewIfNeeded();
    await card.locator('select').selectOption({ label: '第 16 页' });
    await card.getByRole('button', { name: '生成练习页' }).click();
    await expect(page.locator('.ps-group')).toHaveCount(1);
    await expect(page.locator('.ps-page')).toHaveText('第 16 页');
    await sheetChecks(page, info.project.name, 'page16');
    await page.getByRole('button', { name: '回家长页', exact: true }).click();
    await page.locator('[data-card="print"]').getByRole('button', { name: '生成一周回顾卷' }).click();
    const qs = page.locator('.ps-q');
    expect(await qs.count()).toBeGreaterThanOrEqual(15);
    expect(await qs.count()).toBeLessThanOrEqual(20);
    await expect(page.locator('.ps-box')).toHaveCount(await qs.count());
    await expect(page.locator('.print-sheet')).toContainText('一周回顾卷');
    await sheetChecks(page, info.project.name, 'week');
  });
});

test.describe('一周回顾 in the game', () => {
  test('a programme of 18 questions, started from the home screen, muted and without errors', async ({ page }, info) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, (s) => practised(s));
    await expect(page.getByRole('button', { name: /一周回顾/ }).first()).toBeVisible();
    if (process.env.KG_SHOTS_CASTLE) await page.locator('.practice-paths').screenshot({ path: path.join(process.env.KG_SHOTS_CASTLE, `castle4-home-routes-${info.project.name}.png`) });
    await expect(page.locator('.practice-paths .route-card')).toHaveCount(6);
    await page.getByRole('button', { name: /一周回顾/ }).first().click();
    await expect(page.locator('.practice')).toBeVisible();
    await expect(page.locator('.signal-steps')).toHaveAttribute('aria-label', /共 18 条/); // (the dots are hidden on a short landscape phone, the label is not)
    await page.waitForTimeout(800);
    await noDeviceVoice(page);
    expect(errors).toEqual([]);
    // leaving keeps the programme to be picked up again (the home screen offers it)
    await page.getByRole('button', { name: '回电台', exact: true }).first().click();
    await expect(page.locator('.resume-card')).toContainText('一周回顾');
  });
});
