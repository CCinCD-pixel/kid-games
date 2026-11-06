import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { instrument } from '../../../tests/smoke/helpers';
import { bank } from '../src/domain/content';
import { blendRivals, initialSave } from '../src/domain/learning';
import { readsAsOne } from '../src/domain/sound';
import type { Question, Save } from '../src/domain/types';
import { parentPin } from './helpers';

/**
 * Fix round (castle stage 5), real taps: the home first screen, the shell 返回 right after an answer, damaged and old saves,
 * stale unfinished programmes, B / C / H with wrong tries, reloads in the middle of a programme / a drill / the reading book,
 * the recall page and the parent page controls. Muted: nothing is played, the spy only records.
 */
test.use({ serviceWorkers: 'block' });
const root = fileURLToPath(new URL('../../../', import.meta.url));
const shot = (page: Page, name: string, project: string) => process.env.KG_SHOTS_CASTLE && page.screenshot({ path: path.join(process.env.KG_SHOTS_CASTLE, `castle5-${name}-${project}.png`) });
const SPY = `(() => { const log = (window.__aud = []);
  const say = window.speechSynthesis && speechSynthesis.speak.bind(speechSynthesis);
  if (say) speechSynthesis.speak = (u) => { log.push({ speech: u.text }); try { u.volume = 0; } catch {} say(u); };
})();`;
const noDeviceVoice = async (page: Page) => expect((await page.evaluate(() => (window as any).__aud as { speech?: string }[])).filter((x) => x.speech)).toEqual([]);
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data);
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};
const TUTORIAL = { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true };

async function boot(page: Page, envelope: unknown, enter = true) {
  await instrument(page);
  await page.addInitScript(SPY);
  await page.addInitScript((env) => { if (!localStorage.getItem('kg:v1:pinyin-station')) localStorage.setItem('kg:v1:pinyin-station', JSON.stringify(env)); }, envelope);
  await page.goto('/pinyin-station/?mute');
  if (enter) {
    await page.getByRole('button', { name: '进入电台', exact: true }).click();
    await expect(page.locator('.kit-start')).toHaveCount(0);
  }
}
async function open(page: Page, tweak: (s: Save) => void = () => undefined) {
  const s = initialSave();
  s.tutorial = TUTORIAL;
  s.rulesSeen = { hint: true };
  tweak(s);
  await boot(page, { v: 1, updatedAt: Date.now(), data: s });
}
/** A child with a lot of old friends due (more than 20: the note says 好多) and the 小规则 hint still to be seen. */
function returning(s: Save) {
  s.settings.lesson = 12;
  s.sessions = 6;
  s.lastAttemptAt = Date.now() - 5 * 3600_000;
  for (const l of bank.letters.slice(0, 30)) s.atoms[`letter:${l.id}:hear`] = { box: 1, due: 0, successes: [1], kinds: ['A'], needsReview: false };
  delete s.rulesSeen;
}
const wordsFor = (n = 4) => bank.words.filter((w) => w.lesson <= 8 && !w.hold && !['sentence', 'cloze'].includes(w.kind) && !w.picture.startsWith('text:')).slice(0, n);
const qE = (target: string, others: string[]): Question => ({ id: `E:${target}`, kind: 'E', target, skill: `word:${target}:decode`, lesson: 8, phase: 'main', choices: [target, ...others] });
const threeE = (): Question[] => {
  const w = wordsFor(8);
  return [0, 1, 2].map((i) => qE(w[i].id, [w[3].id, w[4].id, w[5].id]));
};
const resumeOf = (queue: Question[], index = 0) => ({ mode: 'today', queue, index, at: Date.now() });

test.describe('A-C01 home first screen', () => {
  test('a returning child: the start button is whole and clear of the subtitle bar; the note is one line; the hint is a card among the routes', async ({ page }, info) => {
    await open(page, returning);
    const start = page.locator('.start-show').first();
    await expect(start).toBeVisible();
    await expect(page.locator('.due-hint')).toContainText('今天有好多个老朋友想见你。');
    await page.waitForTimeout(600);
    const vp = page.viewportSize()!;
    const box = (await start.boundingBox())!;
    const area = (await page.locator('.station-home').boundingBox())!;
    expect(box.y, 'top of the button inside the scroll area').toBeGreaterThanOrEqual(area.y - 1);
    expect(box.y + box.height, 'bottom of the button inside the scroll area').toBeLessThanOrEqual(area.y + area.height + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    const lane = page.locator('.kit-subtitle').first();
    if ((await lane.count()) && (await lane.isVisible())) {
      const l = (await lane.boundingBox())!;
      expect(box.y + box.height <= l.y + 1 || box.y >= l.y + l.height, 'the button does not meet the subtitle bar').toBe(true);
    }
    // a tap in the middle of it really lands on the button (nothing covers it)
    const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.start-show'), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit).toBe(true);
    // the reminder is one line; the hint is in the route area, not in the programme card
    expect((await page.locator('.due-hint').boundingBox())!.height).toBeLessThanOrEqual(40);
    await expect(page.locator('.practice-paths .rule-hint')).toHaveCount(1);
    await expect(page.locator('.program-board .rule-hint')).toHaveCount(0);
    await shot(page, 'home', info.project.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    // the rest is reachable by scrolling the home area
    await page.locator('.practice-paths').scrollIntoViewIfNeeded();
    const rule = page.locator('.rule-hint').getByRole('button', { name: '去看看' });
    await rule.scrollIntoViewIfNeeded();
    const r = (await rule.boundingBox())!;
    const area2 = (await page.locator('.station-home').boundingBox())!;
    expect(r.y + r.height, 'the hint button is not cut by the bottom of the area').toBeLessThanOrEqual(area2.y + area2.height + 1);
    await rule.click();
    await expect(page.locator('[data-rule]').first()).toBeVisible();
  });
  test('the note says 好多 without spaces and a number with them', async ({ page }) => {
    await open(page, (s) => {
      returning(s);
      for (const id of Object.keys(s.atoms).slice(5)) delete s.atoms[id];
    });
    await expect(page.locator('.due-hint span')).toHaveText('今天有 5 个老朋友想见你。');
  });
});

test.describe('A-C02 the shell 返回', () => {
  test('right after a right answer, after a wrong one and while the question is still talking, it goes home within a second and keeps the programme', async ({ page }) => {
    test.setTimeout(90_000);
    const w = wordsFor(8);
    const errors = errorsOf(page);
    await open(page, (s) => {
      s.settings.lesson = 8;
      s.resume = resumeOf(threeE());
    });
    for (const round of ['right', 'wrong', 'talking']) {
      await page.getByRole('button', { name: '接着上次的节目' }).click();
      await expect(page.locator('.practice')).toBeVisible();
      const index = (await saved(page)).resume.index as number;
      const q = threeE()[index];
      if (round === 'right') await page.getByRole('button', { name: bank.words.find((x) => x.id === q.target)!.hanzi, exact: true }).click();
      if (round === 'wrong') await page.getByRole('button', { name: w[3].hanzi, exact: true }).click();
      const t0 = Date.now();
      await page.locator('.kit-back').click(); // the shell's own pill (an <a class="kit-back">, not role=button)
      await expect(page.locator('#app[data-view="home"] .station-home')).toBeVisible({ timeout: 1500 });
      expect(Date.now() - t0, 'home within a second and a half').toBeLessThan(1500);
      await expect(page.getByRole('button', { name: '接着上次的节目' })).toBeVisible();
    }
    expect(errors).toEqual([]);
    await noDeviceVoice(page);
  });
});

test.describe('P2-7 damaged and old saves', () => {
  const lessons: [string, unknown][] = [
    ['data null', null],
    ['no atoms', { settings: { lesson: 5, ai: false, strictness: 'gentle', scaffold: 'initial' }, history: [], sessions: 3, dates: [], confusions: {}, customWords: [], atoms: null }],
    ['no dates, confusions, customWords', { settings: { lesson: 5, ai: false, strictness: 'gentle', scaffold: 'initial' }, history: [], sessions: 2, atoms: {} }],
    ['lesson 0', { settings: { lesson: 0 }, history: [], atoms: {} }],
    ['lesson abc', { settings: { lesson: 'abc' }, history: [], atoms: {} }],
    ['lesson 99', { settings: { lesson: 99 }, history: [], atoms: {} }],
    ['lesson 13 (greyed)', { settings: { lesson: 13 }, history: [], atoms: {} }],
  ];
  for (const [name, data] of lessons)
    test(`${name}: the home opens, a programme starts, the station is 1-12`, async ({ page }) => {
      const errors = errorsOf(page);
      await boot(page, { v: 1, updatedAt: Date.now(), data });
      await expect(page.locator('.station-home')).toBeVisible();
      const label = await page.locator('.program-board > small').innerText();
      const station = Number(/第 (\d+) 站/.exec(label)![1]);
      expect(station, label).toBeGreaterThanOrEqual(1);
      expect(station, label).toBeLessThanOrEqual(12);
      await page.locator('.start-show').first().click();
      await expect(page.locator('.practice')).toBeVisible();
      await expect(page.locator('.signal-steps')).toHaveAttribute('aria-label', /共 15 条/);
      expect(errors).toEqual([]);
    });
  test('the real save of the old build (origin/main) opens with everything in it', async ({ page }) => {
    const errors = errorsOf(page);
    const env = JSON.parse(fs.readFileSync(path.join(root, 'site/pinyin-station/tests/fixtures/save-old.json'), 'utf8')) as { data: Save };
    const before = { atoms: Object.keys(env.data.atoms).length, history: env.data.history.length, custom: env.data.customWords.length, lesson: env.data.settings.lesson };
    await boot(page, env);
    await expect(page.locator('.station-home')).toBeVisible();
    await page.locator('.start-show').first().click();
    await expect(page.locator('.practice')).toBeVisible();
    await page.getByRole('button', { name: '回电台', exact: true }).first().click();
    const s = await saved(page);
    expect(Object.keys(s.atoms).length).toBeGreaterThanOrEqual(before.atoms);
    expect(s.history.length).toBeGreaterThanOrEqual(before.history);
    expect(s.customWords).toHaveLength(before.custom);
    expect(s.settings.lesson).toBe(before.lesson);
    expect(errors).toEqual([]);
  });
  test('an unfinished programme with bad questions (unknown word, withheld tone, held word, a station too far) keeps only the good one', async ({ page }) => {
    const errors = errorsOf(page);
    const held = bank.words.find((w) => w.hold)!;
    const [good] = threeE();
    const bad: Question[] = [
      { ...qE('no-such-word', ['ditu']), id: 'E:gone' },
      { id: 'H:ao4', kind: 'H', target: 'ao4', skill: 'tone4:ao:hear', lesson: 10, phase: 'main', choices: ['ao1', 'ao2', 'ao3', 'ao4'] },
      { ...qE(held.id, [good.target]), id: 'E:held', lesson: 8 },
      { ...good, id: 'E:future', lesson: 12 },
    ];
    await open(page, (s) => {
      s.settings.lesson = 10;
      s.resume = resumeOf([...bad.slice(0, 2), good, ...bad.slice(2)], 2);
    });
    await page.getByRole('button', { name: '接着上次的节目' }).click();
    await expect(page.locator('.practice')).toBeVisible();
    await expect(page.locator('.signal-steps')).toHaveAttribute('aria-label', /共 1 条/);
    expect(errors).toEqual([]);
  });
});

test.describe('B / C / H wrong tries and reloads', () => {
  const pairs = bank.confusions.find((c) => c.pair.join('|') === 'd|p')!.minimalPairs.filter((p) => p.every((id) => bank.syllables.find((x) => x.id === id && !x.wordOnly)));
  const c = (() => {
    const all = bank.syllables.filter((x) => x.lesson <= 12 && x.tone > 0 && !x.wordOnly);
    for (const sy of all) {
      if (!sy.initial || ['y', 'w'].includes(sy.initial) || readsAsOne(sy)) continue;
      const rivals = blendRivals(sy, all);
      if (rivals.length) return { target: sy.id, rival: rivals[0].id };
    }
    throw new Error('no blend with a rival');
  })();
  const mk = (kind: Question['kind'], target: string, choices: string[], skill: string): Question => ({ id: `${kind}:${target}`, kind, target, skill, lesson: 12, phase: 'main', choices });
  test('B and C: one wrong tap gets a hint and the right one goes on; H: three wrong taps get the demonstration; then the programme ends cleanly', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = errorsOf(page);
    const queue = [mk('B', pairs[0][0], [pairs[0][0], pairs[0][1]], 'pair:d|p:hear'), mk('C', c.target, [c.target, c.rival], `syl:${c.target}:blend`), mk('H', 'ai3', ['ai1', 'ai2', 'ai3', 'ai4'], 'tone4:ai:hear')];
    await open(page, (s) => {
      s.settings.lesson = 12;
      s.resume = resumeOf(queue);
    });
    await page.getByRole('button', { name: '接着上次的节目' }).click();
    const next = page.getByRole('button', { name: '接下一条', exact: true });
    for (const q of queue.slice(0, 2)) {
      const wrong = q.choices.find((x) => x !== q.target)!;
      await page.waitForTimeout(500);
      await page.locator(`[data-choice="${wrong}"]`).click();
      await expect(page.locator(`[data-choice="${wrong}"]`)).toBeDisabled();
      await expect(page.locator('.feedback')).not.toBeEmpty();
      await expect(page.locator('.feedback.is-lit')).toHaveCount(0); // nothing is "wrong", nothing is praised yet
      await page.locator(`[data-choice="${q.target}"]`).click();
      await expect(page.locator('.feedback.is-lit')).toBeVisible();
      await next.click();
    }
    await expect(page.locator('[data-choice="ai3"]')).toBeVisible();
    await page.waitForTimeout(500);
    for (const id of ['ai1', 'ai2', 'ai4']) await page.locator(`[data-choice="${id}"]`).click();
    await expect(page.locator('.feedback')).toContainText('一起看示范');
    await expect(next).toBeVisible();
    await next.click();
    // three misses add one twin question of the same kind: answer it too, then the programme ends
    const done = page.getByRole('heading', { name: /播完啦|收到啦/ });
    for (let i = 0; i < 2 && !(await done.isVisible()); i++) {
      await page.locator('[data-answer]').first().click();
      await next.click();
    }
    await expect(done).toBeVisible();
    await page.getByRole('button', { name: '收好电台', exact: true }).click();
    await expect(page.locator('.station-home')).toBeVisible();
    expect(errors).toEqual([]);
    await noDeviceVoice(page);
  });
  test('a reload in the middle of a programme picks it up again at the next question', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = errorsOf(page);
    const w = wordsFor(8);
    await open(page, (s) => {
      s.settings.lesson = 8;
      s.resume = resumeOf(threeE());
    });
    await page.getByRole('button', { name: '接着上次的节目' }).click();
    await page.getByRole('button', { name: w[0].hanzi, exact: true }).click();
    await expect(page.locator('.feedback.is-lit')).toBeVisible();
    await page.getByRole('button', { name: '接下一条', exact: true }).click();
    await expect(page.locator('.signal-steps')).toHaveAttribute('aria-label', /第 2 条/);
    await page.reload();
    await page.getByRole('button', { name: '进入电台', exact: true }).click();
    await expect(page.locator('.resume-card')).toContainText('第 2 / 3 条');
    await page.getByRole('button', { name: '接着上次的节目' }).click();
    await expect(page.locator('.signal-steps')).toHaveAttribute('aria-label', /第 2 条/);
    expect(errors).toEqual([]);
  });
  test('a reload in a 练读表 or on the 朗读册 lands on the home and nothing is lost', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = errorsOf(page);
    await open(page, (s) => (s.settings.lesson = 12));
    await page.getByRole('button', { name: '练读表', exact: true }).click();
    await page.locator('.drill-choice').first().click();
    await page.getByRole('button', { name: '开始读', exact: true }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '读好了', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: '进入电台', exact: true }).click();
    await expect(page.locator('.station-home')).toBeVisible();
    await page.getByRole('button', { name: '练读表', exact: true }).click();
    await expect(page.locator('.drill-choice').first()).toBeVisible();
    await page.goBack();
    await page.getByRole('button', { name: /朗读册/ }).first().click();
    const row = page.locator('[data-page="16"]');
    await row.scrollIntoViewIfNeeded();
    for (let i = 0; i < 2; i++) await row.getByRole('button', { name: '我读了一遍' }).click();
    await page.reload();
    await page.getByRole('button', { name: '进入电台', exact: true }).click();
    await expect(page.locator('.station-home')).toBeVisible();
    await page.getByRole('button', { name: /朗读册/ }).first().click();
    await expect(page.locator('[data-page="16"] .readbook-count')).toHaveText('已读 2 遍');
    expect(errors).toEqual([]);
  });
});

test.describe('P2-9 small things', () => {
  test('the recall page: no tile meets the start button, and a scrolling page shows a cue', async ({ page }, info) => {
    await open(page, (s) => (s.settings.lesson = 12));
    await page.getByRole('button', { name: '阶段复习', exact: true }).click();
    await expect(page.locator('.recall-tile')).toHaveCount(39);
    const btn = (await page.getByRole('button', { name: '开始阶段复习' }).boundingBox())!;
    const area = (await page.locator('.recall-scroll').boundingBox())!;
    expect(area.y + area.height, 'the scroll area ends above the button').toBeLessThanOrEqual(btn.y + 1);
    const tiles = await page.locator('.recall-tile').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
    for (const [x, y, w, h] of tiles) {
      // what can be seen of a tile is what the scroll area lets through
      const top = Math.max(y, area.y),
        bottom = Math.min(y + h, area.y + area.height);
      if (bottom > top) expect(bottom <= btn.y + 1 || top >= btn.y + btn.height || x + w <= btn.x || x >= btn.x + btn.width, 'a visible tile meets the button').toBe(true);
    }
    const scrolls = await page.locator('.recall-scroll').evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    if (scrolls) expect(await page.locator('.recall-scroll').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('gradient');
    await shot(page, 'recall', info.project.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
  test('the parent page controls are easy to hit: selects and checkboxes at least 44 px (iPad) or 40 px (phone)', async ({ page }) => {
    await open(page, (s) => (s.settings.lesson = 12));
    await page.getByRole('button', { name: '家长', exact: true }).click();
    await parentPin(page);
    await expect(page.getByRole('heading', { name: '电台值班室' })).toBeVisible();
    const vp = page.viewportSize()!;
    const need = Math.min(vp.width, vp.height) >= 700 ? 44 : 40;
    const controls = page.locator('.parent-panel select, .parent-panel input[type="checkbox"]');
    expect(await controls.count()).toBeGreaterThanOrEqual(4);
    for (const el of await controls.all()) {
      const b = (await el.boundingBox())!;
      const label = (await el.getAttribute('aria-label')) ?? '';
      expect(b.height, `${label} is ${b.height}px high`).toBeGreaterThanOrEqual(need - 0.5);
      if ((await el.getAttribute('type')) === 'checkbox') expect(b.width, `${label} is ${b.width}px wide`).toBeGreaterThanOrEqual(need - 0.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});

test.describe('A-C03 hub header (platform)', () => {
  test('in portrait the moon does not cover the sound button', async ({ page }) => {
    const vp = page.viewportSize()!;
    test.skip(vp.width > vp.height, 'the landscape sky is painted around the moon; only portrait was reported');
    await page.goto('/');
    await page.waitForTimeout(1800);
    const m = (await page.locator('.hub-moon').boundingBox())!;
    const sound = (await page.locator('button[aria-label^="声音："]').boundingBox())!;
    const overlap = Math.min(m.x + m.width, sound.x + sound.width) > Math.max(m.x, sound.x) && Math.min(m.y + m.height, sound.y + sound.height) > Math.max(m.y, sound.y);
    expect(overlap, `moon ${JSON.stringify(m)} sound ${JSON.stringify(sound)}`).toBe(false);
    expect(m.x + m.width).toBeLessThanOrEqual(vp.width + 1);
  });
});

test.describe('B-C11 praise says what the child did', () => {
  test('a right answer on a hanzi card is never praised for "pictures"', async ({ page }) => {
    const cards = bank.words.filter((w) => w.picture.startsWith('text:') && !w.hold && w.lesson <= 12);
    const target = cards[0];
    const q: Question = { id: `E:${target.id}`, kind: 'E', target: target.id, skill: `word:${target.id}:decode`, lesson: 12, phase: 'main', choices: [target.id, ...cards.slice(1, 4).map((w) => w.id)] };
    await open(page, (s) => {
      s.settings.lesson = 12;
      s.resume = resumeOf([q]);
    });
    await page.getByRole('button', { name: '接着上次的节目' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: target.hanzi, exact: true }).click();
    await expect(page.locator('.feedback.is-lit')).toContainText('词语里的意思');
    await expect(page.locator('.feedback.is-lit')).not.toContainText('图画');
  });
});
