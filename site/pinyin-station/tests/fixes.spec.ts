import { test, expect, type Page } from '@playwright/test';
import { instrument, watch, shot } from '../../../tests/smoke/helpers';
import { initialSave, schedule } from '../src/domain/learning';
import { displayPinyin, parseSyllable } from '../src/domain/pinyin';
import { bank } from '../src/domain/content';
import type { Question, Save } from '../src/domain/types';
import { parentPin, stubMicrophone } from './helpers';

/**
 * Player-QA round 1 (fix-pinyin-r1). Real taps on the built page. A question is injected through the “continue
 * last programme” snapshot, which also exercises the resume path itself. Everything runs muted (?mute).
 */
const E_CHOICES = (target: string) => {
  const pool = bank.words.filter((w) => w.kind === 'noun' && w.lesson <= 4 && !w.beyond && w.id !== target);
  const seen = new Set([bank.words.find((w) => w.id === target)!.picture]);
  const out = [target];
  for (const w of pool) {
    if (out.length === 4) break;
    if (seen.has(w.picture) || w.syllables.join(' ') === bank.words.find((x) => x.id === target)!.syllables.join(' ')) continue;
    seen.add(w.picture);
    out.push(w.id);
  }
  return out;
};
const qE = (target: string, extra: Partial<Question> = {}): Question => ({
  id: `E:${target}`,
  kind: 'E',
  target,
  skill: `word:${target}:decode`,
  lesson: 4,
  phase: 'main',
  choices: E_CHOICES(target),
  ...extra,
});
const qF = (target: string, extra: Partial<Question> = {}): Question => ({
  id: `F:${target}`,
  kind: 'F',
  target,
  skill: `word:${target}:spell`,
  lesson: 4,
  phase: 'main',
  choices: [target],
  ...extra,
});
const qA = (target: string, choices: string[]): Question => ({
  id: `A:${target}`,
  kind: 'A',
  target,
  skill: `letter:${target}:hear`,
  lesson: 3,
  phase: 'main',
  choices,
});
const qB = (target: string, choices: string[]): Question => ({
  id: `B:${target}`,
  kind: 'B',
  target,
  skill: `syl:${target}:hear`,
  lesson: 4,
  phase: 'main',
  choices,
});
const qC = (target: string, choices: string[]): Question => ({
  id: `C:${target}`,
  kind: 'C',
  target,
  skill: `syl:${target}:blend`,
  lesson: 3,
  phase: 'main',
  choices,
});
const qG = (target: string): Question => ({
  id: `G:${target}`,
  kind: 'G',
  target,
  skill: `word:${target}:decode`,
  lesson: 4,
  phase: 'main',
  choices: [...(bank.words.find((w) => w.id === target)!.chunks ?? [])].reverse(),
});

async function seed(page: Page, queue: Question[], tweak: (s: Save) => void = () => undefined, index = 0) {
  const s = initialSave();
  s.tutorial = { A: true, B: true, C: true, D: true, E: true, F: true, G: true };
  tweak(s);
  s.resume = { mode: 'today', queue, index, at: Date.now() };
  await page.addInitScript((data) => {
    if (!localStorage.getItem('kg:v1:pinyin-station'))
      localStorage.setItem('kg:v1:pinyin-station', JSON.stringify({ v: 1, updatedAt: Date.now(), data }));
  }, s);
}
async function enter(page: Page, resume = true) {
  await instrument(page);
  await page.goto('/pinyin-station/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await expect(page.locator('.kit-start')).toHaveCount(0);
  if (resume) await page.getByRole('button', { name: '接着上次的节目' }).click();
  await expect(page.locator('.practice')).toBeVisible();
}
const subtitle = (page: Page) => page.locator('.kit-subtitle__text');
const next = (page: Page) => page.getByRole('button', { name: '接下一条', exact: true });

test.describe('看图拼音: what is tapped is shown before anything is decided (B1)', () => {
  for (const scaffold of ['initial', 'final', 'tone', 'full'] as const) {
    test(`${scaffold} level: the last tapped letter or tone fills the cell, then the question is done`, async ({ page }, info) => {
      const diagnostics = watch(page);
      const word = bank.words.find((w) => w.id === 'datu')!; // two syllables: dà tù
      await seed(page, [qF(word.id)], (s) => (s.settings.scaffold = scaffold));
      await enter(page);
      for (let i = 0; i < word.syllables.length; i++) {
        const syl = parseSyllable(word.syllables[i])!;
        const parts = scaffold === 'full' ? (syl.initial ? 3 : 2) : 1;
        for (let part = 0; part < parts; part++) {
          const line = await page.locator('.instruction').getAttribute('data-line');
          const piece = line === 'py.initial' ? syl.initial : line === 'py.final' ? syl.final : String(syl.tone);
          const lastTap = i === word.syllables.length - 1 && part === parts - 1;
          await page.locator(`[data-piece="${piece}"]`).click();
          if (!lastTap) continue;
          // Straight after the last tap: the whole word is in the cells, the keys are still there, nothing is "done" yet.
          expect((await page.locator('.grid-slot').allInnerTexts()).join(' ')).toBe(word.display);
          await expect(page.locator('.grid-slot.done')).toHaveCount(word.syllables.length);
          await expect(page.locator('.spelling-keys')).toBeVisible();
          await expect(page.locator('.spelling-keys button:not(:disabled)')).toHaveCount(0);
          await expect(next(page)).toHaveCount(0);
          if (scaffold === 'initial') await shot(page, info.project.name, 'fix-spell-echo-last');
        }
      }
      await expect(next(page)).toBeVisible();
      await expect(page.locator('.feedback')).toContainText(/你/);
      expect(diagnostics.errors).toEqual([]);
    });
  }
  test('a wrong tap is echoed in the cell, dims its key and leaves a gentle retry', async ({ page }) => {
    const word = bank.words.find((w) => w.id === 'ditu')!;
    await seed(page, [qF(word.id)], (s) => (s.settings.scaffold = 'initial'));
    await enter(page);
    const syl = parseSyllable(word.syllables[0])!;
    const wrong = page.locator(`[data-piece]:not([data-piece="${syl.initial}"])`).first();
    const wrongLetter = (await wrong.getAttribute('data-piece'))!;
    await wrong.click();
    await expect(page.locator('.grid-slot.try').first()).toContainText(wrongLetter);
    await expect(wrong).toBeDisabled();
    await expect(page.locator('.feedback')).toContainText('先听一听，再找线索。');
    await expect(page.locator('.grid-slot.try')).toHaveCount(0, { timeout: 3000 });
    await page.locator(`[data-piece="${syl.initial}"]`).click();
    await expect(page.locator('.grid-slot').first()).toHaveText(displayPinyin(word.syllables[0]));
  });
  test('the level of a word does not change half way after a wrong tap', async ({ page }) => {
    const word = bank.words.find((w) => w.id === 'datu')!;
    await seed(page, [qF(word.id)], (s) => {
      s.atoms[`word:${word.id}:spell`] = { box: 2, due: 0, successes: [1], kinds: ['F'], needsReview: false };
    });
    await enter(page);
    await expect(page.locator('.instruction')).toHaveAttribute('data-line', 'py.tone');
    const first = parseSyllable(word.syllables[0])!;
    await page.locator(`[data-piece="${(first.tone + 1) % 5}"]`).click();
    await page.locator(`[data-piece="${first.tone}"]`).click();
    await expect(page.locator('.instruction')).toHaveAttribute('data-line', 'py.tone');
  });
  test('naming the picture (听听图画) is part of the question and does not stop the answer from counting', async ({ page }) => {
    const word = bank.words.find((w) => w.id === 'ditu')!;
    await seed(page, [qF(word.id)], (s) => (s.settings.scaffold = 'initial'));
    await enter(page);
    await page.getByRole('button', { name: '听听图画', exact: true }).click();
    for (const id of word.syllables) await page.locator(`[data-piece="${parseSyllable(id)!.initial}"]`).click();
    await expect(next(page)).toBeVisible();
    const atoms = await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data.atoms);
    expect(Object.keys(atoms)).toEqual([`word:${word.id}:spell`]);
    expect(atoms[`word:${word.id}:spell`].box).toBe(1);
  });
  test('three wrong taps show the answer filled in and never leave a dead end', async ({ page }) => {
    const word = bank.words.find((w) => w.id === 'ditu')!;
    await seed(page, [qF(word.id)], (s) => (s.settings.scaffold = 'tone'));
    await enter(page);
    const tone = String(parseSyllable(word.syllables[0])!.tone);
    const wrongs = page.locator(`[data-piece]:not([data-piece="${tone}"])`);
    for (let i = 0; i < 3; i++) await wrongs.nth(i).click();
    await expect(next(page)).toBeVisible();
    await expect(page.locator('.grid-slot.done').first()).toContainText(displayPinyin(word.syllables[0]));
    await expect(page.locator('.feedback')).toContainText('一起看示范');
  });
});

test.describe('把声音接起来 has a target and says what each try makes (B2)', () => {
  test('hear the target, tap the missing sound, see it land in the empty cell', async ({ page }, info) => {
    await seed(page, [qC('po2', ['po2', 'pa2'])]);
    await enter(page);
    await expect(page.locator('.instruction')).toHaveText('听一听，选出缺的那一段声音。');
    await expect(page.locator('.blend-tile')).toHaveText(['p']);
    await expect(page.locator('.blend-slot')).toHaveText('？');
    await expect(page.getByRole('button', { name: '听一听', exact: true })).toBeVisible();
    await expect(page.locator('.three-lamps')).toHaveCount(0); // lamps only mean something with the cloud check
    await shot(page, info.project.name, 'fix-blend-start');
    await page.locator('[data-final="a"]').click();
    await expect(page.locator('.blend-slot')).toHaveText('á');
    await expect(page.locator('.blend-slot.miss')).toHaveCount(1);
    await expect(page.locator('.feedback')).toHaveText('先听一听，再找线索。');
    await expect(page.locator('[data-final="a"]')).toBeDisabled();
    await page.locator('[data-final="o"]').click();
    await expect(page.locator('.blend-slot.ok')).toHaveText('ó');
    await expect(page.locator('.blend-result')).toHaveText('pó');
    await expect(page.locator('.feedback.is-lit')).toContainText('你');
    await expect(next(page)).toBeVisible();
    await shot(page, info.project.name, 'fix-blend-done');
  });
  test('the stale “找线索” line is gone and the first tap can be right', async ({ page }) => {
    await seed(page, [qC('pu4', ['pu4', 'pa4'])]);
    await enter(page);
    await expect(page.locator('.feedback')).toHaveText('');
    await page.locator('[data-final="u"]').click();
    await expect(page.locator('.feedback')).not.toContainText('线索');
    await expect(next(page)).toBeVisible();
  });
});

test.describe('praise and endings only say what happened (B3)', () => {
  test('finding the picture is praised as finding the picture, never as speaking', async ({ page }) => {
    await seed(page, [qE('ditu'), qE('mama')]);
    await enter(page);
    await page.getByRole('button', { name: '地图', exact: true }).click();
    await expect(page.locator('.feedback.is-lit')).toContainText(/图画|词语/);
    await expect(page.locator('.feedback')).not.toContainText(/说给|拼音听|读给|收到|送到|声音已经/);
    await next(page).click();
    await page.getByRole('button', { name: '妈妈', exact: true }).click();
    await expect(page.locator('.feedback')).not.toContainText(/说给|拼音听|读给|收到|送到|声音已经/);
  });
  test('the ending page does not claim a recording that never happened', async ({ page }) => {
    await seed(page, [qE('ditu')]);
    await enter(page);
    await page.getByRole('button', { name: '地图', exact: true }).click();
    await next(page).click();
    await expect(page.getByRole('heading', { name: '今天的节目，播完啦' })).toBeVisible();
    await expect(page.locator('.finish-page')).not.toContainText('声音，收到啦');
    await expect(subtitle(page)).toContainText('今天的节目播完啦');
    await page.getByRole('button', { name: '收好电台', exact: true }).click();
    await expect(page.getByRole('button', { name: '开始今天的节目' })).toBeVisible();
    await expect(page.locator('.program-done')).toBeVisible();
  });
  test('following along without the microphone says “follow me”, not “listen to yourself”', async ({ page }) => {
    await seed(page, [{ ...qE('ditu'), kind: 'D', id: 'D:ditu', skill: 'word:ditu:say' }]);
    await enter(page);
    await expect(page.locator('.instruction')).toHaveText('准备好，就读给台长听。');
    await page.getByRole('button', { name: '不开麦，跟着读', exact: true }).click();
    await expect(page.locator('.feedback')).toHaveText('跟着台长读一遍。');
    await expect(page.locator('.feedback')).not.toContainText('自己的声音');
  });
});

test.describe('listening questions: one right answer, nothing printed (M)', () => {
  test('the sound that is played is not written in the subtitle', async ({ page }) => {
    await seed(page, [qA('f', ['f', 'e', 't', 'p']), qB('nu4', ['nu4', 'lu4'])]);
    await enter(page);
    await page.getByRole('button', { name: '听来信', exact: true }).click();
    await page.waitForTimeout(700);
    expect(await subtitle(page).innerText()).not.toMatch(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
    await page.locator('[data-choice="f"]').click();
    await expect(page.locator('.feedback.is-lit')).toContainText('这个字母');
    await next(page).click();
    await page.getByRole('button', { name: '听来信', exact: true }).click();
    await page.waitForTimeout(700);
    expect(await subtitle(page).innerText()).not.toMatch(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
  });
  test('the first time a kind appears a hand shows the way, the second time it is gone', async ({ page }) => {
    await seed(page, [qA('f', ['f', 'e', 't', 'p']), qA('b', ['b', 'e', 't', 'p'])], (s) => (s.tutorial = {}));
    await enter(page);
    await expect(page.locator('.guide-hand')).toHaveCount(1);
    await page.locator('[data-choice="f"]').click();
    await expect(page.locator('.guide-hand')).toHaveCount(0);
    await next(page).click();
    await expect(page.locator('.guide-hand')).toHaveCount(0);
  });
});

test.describe('one voice at a time (P07)', () => {
  test('tapping the right picture while the scene is told is praised, not talked over', async ({ page }) => {
    await seed(page, [qE('mi', { scene: 'rice' }), qE('ditu')]);
    await enter(page);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '米', exact: true }).click();
    await expect(subtitle(page)).toContainText(/图画|词语/);
    await page.waitForTimeout(2500);
    await expect(subtitle(page)).not.toContainText('看一看拼音');
  });
  test('听听这个词 during the scene plays the word and nothing cuts it off', async ({ page }) => {
    await seed(page, [qE('mi', { scene: 'rice' })]);
    await enter(page);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '听听这个词', exact: true }).click();
    await expect(subtitle(page)).toHaveText('mǐ');
    await page.waitForTimeout(2200);
    await expect(subtitle(page)).not.toContainText('看一看拼音');
  });
});

test.describe('going back is one step, and the programme is kept (navigation)', () => {
  const three = () => [qE('ditu'), qE('mama'), qE('mi')];
  test('回电台 is one step and the programme can be picked up again', async ({ page }) => {
    await seed(page, three(), undefined, 1);
    await enter(page);
    await expect(page.locator('.signal-steps i.current')).toHaveCount(1);
    await page.getByRole('button', { name: '回电台', exact: true }).click();
    await expect(page.getByRole('button', { name: '接着上次的节目' })).toBeVisible();
    await expect(page.locator('.resume-card')).toContainText('第 2 / 3 条');
    await expect(page.locator('.finish-page')).toHaveCount(0);
    await page.getByRole('button', { name: '接着上次的节目' }).click();
    await expect(page.locator('.question-pinyin')).toHaveText(bank.words.find((w) => w.id === 'mama')!.display);
  });
  test('the kit 返回, Escape and the browser back all do the same single step', async ({ page }) => {
    await seed(page, three());
    await enter(page);
    await page.locator('.kit-back').click();
    await expect(page.getByRole('button', { name: '接着上次的节目' })).toBeVisible();
    await page.getByRole('button', { name: '接着上次的节目' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '接着上次的节目' })).toBeVisible();
    await page.getByRole('button', { name: '接着上次的节目' }).click();
    await page.goBack();
    await expect(page.getByRole('button', { name: '接着上次的节目' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/pinyin-station/');
  });
  test('the lock screen or an app switch keeps the screen and the question', async ({ page }) => {
    await seed(page, three(), undefined, 1);
    await enter(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);
    await expect(page.locator('.practice')).toBeVisible();
    await expect(page.locator('.question-pinyin')).toHaveText(bank.words.find((w) => w.id === 'mama')!.display);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.getByRole('button', { name: '地图', exact: true }).waitFor({ state: 'detached' }).catch(() => undefined);
    // a cold reload (iOS can kill a backgrounded app) still offers the same place
    await page.reload();
    await page.getByRole('button', { name: '进入电台', exact: true }).click();
    await expect(page.locator('.resume-card')).toContainText('第 2 / 3 条');
  });
  test('opening the album or the parent page mid-programme keeps the programme', async ({ page }) => {
    await seed(page, three());
    await enter(page);
    await page.getByRole('button', { name: '信号卡册', exact: true }).click();
    await page.getByRole('button', { name: '回到电台', exact: true }).click();
    await expect(page.locator('.resume-card')).toContainText('第 1 / 3 条');
    await page.getByRole('button', { name: '接着上次的节目' }).click();
    await page.getByRole('button', { name: '家长', exact: true }).click();
    await page.getByRole('button', { name: '回到电台', exact: true }).click();
    await expect(page.locator('.resume-card')).toContainText('第 1 / 3 条');
  });
  test('finishing the programme clears it', async ({ page }) => {
    await seed(page, [qE('ditu')]);
    await enter(page);
    await page.getByRole('button', { name: '地图', exact: true }).click();
    await next(page).click();
    await page.getByRole('button', { name: '收好电台', exact: true }).click();
    await expect(page.locator('.resume-card')).toHaveCount(0);
  });
});

test.describe('layout on small screens', () => {
  test('读词找图 keeps real pictures, and the small buttons are finger sized', async ({ page }, info) => {
    await seed(page, [qE('ditu', { scene: 'travel' })]);
    await enter(page);
    const boxes = await page.locator('.picture-choice').evaluateAll((els) =>
      els.map((e) => {
        const r = e.querySelector('.illustration')!.getBoundingClientRect();
        return [Math.round(r.width), Math.round(r.height)];
      }),
    );
    for (const [w, h] of boxes) {
      expect(w).toBeGreaterThanOrEqual(64);
      expect(h).toBeGreaterThanOrEqual(64);
    }
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('.listening-tools button, .practice-header button, .practice-actions button')]
        .map((b) => ({ t: b.textContent, h: Math.round(b.getBoundingClientRect().height) }))
        .filter((b) => b.h < 44),
    );
    expect(small).toEqual([]);
    await shot(page, info.project.name, 'fix-readpicture-layout');
  });
});

test.describe('把一句话接通: the last card is shown before the sentence is judged (G)', () => {
  test('hear the whole sentence, see it written, and watch the last card land', async ({ page }, info) => {
    const sentence = bank.words.find((w) => w.id === 'mama-labi')!;
    await seed(page, [{ ...qG(sentence.id), choices: [...(sentence.chunks ?? [])] }]);
    await enter(page);
    await expect(page.locator('.sentence-target')).toHaveText(sentence.hanzi);
    await expect(page.getByRole('button', { name: '听整句', exact: true })).toBeVisible();
    const chunks = sentence.chunks ?? [];
    for (let i = 0; i < chunks.length; i++) {
      const label = chunks[i].split(' ').map(displayPinyin).join(' ');
      await page.locator('.sentence-choices').getByRole('button', { name: label, exact: true }).click();
      if (i === chunks.length - 1) {
        await expect(page.locator('.sentence-chunk')).toHaveCount(chunks.length);
        await expect(next(page)).toHaveCount(0);
        await shot(page, info.project.name, 'fix-sentence-last-card');
      }
    }
    await expect(next(page)).toBeVisible();
  });
});

test('the parent page asks a grown-up question before a first PIN can be set', async ({ page }) => {
  await instrument(page);
  await page.goto('/pinyin-station/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await page.getByRole('button', { name: '家长', exact: true }).click();
  await expect(page.locator('.adult-question')).toBeVisible();
  await expect(page.getByLabel('设置家长 PIN')).toHaveCount(0);
  await page.getByLabel('算术答案').fill('1');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.getByLabel('设置家长 PIN')).toHaveCount(0);
  await parentPin(page);
  await expect(page.getByRole('heading', { name: '电台值班室' })).toBeVisible();
});

test('a whole programme has no duplicate pictures, double answers or console errors', async ({ page }) => {
  const diagnostics = watch(page);
  const s = initialSave();
  s.settings.scaffold = 'initial';
  const queue = schedule(s, bank, 'today');
  await seed(page, queue, (x) => (x.tutorial = {}));
  await enter(page);
  for (const q of queue) {
    if (q.kind === 'E') {
      const pictures = await page.locator('.picture-choice').count();
      expect(pictures).toBe(q.choices.length);
      await page.getByRole('button', { name: bank.words.find((w) => w.id === q.target)!.hanzi, exact: true }).click();
    } else if (q.kind === 'A' || q.kind === 'B') {
      const keys = await page.locator('[data-choice]').count();
      expect(keys).toBe(q.choices.length);
      await page.locator(`[data-choice="${q.target}"]`).click();
    } else if (q.kind === 'F') {
      const w = bank.words.find((w) => w.id === q.target)!;
      for (const id of w.syllables) {
        const syl = parseSyllable(id)!;
        const line = await page.locator('.instruction').getAttribute('data-line');
        await page
          .locator(`[data-piece="${line === 'py.initial' ? syl.initial : line === 'py.final' ? syl.final : syl.tone}"]`)
          .click();
      }
    } else if (q.kind === 'C') {
      await page.locator(`[data-choice="${q.target}"]`).click();
    } else if (q.kind === 'D') {
      await page.getByRole('button', { name: '不开麦，跟着读', exact: true }).click();
      await page.getByRole('button', { name: '我读过啦', exact: true }).click();
      continue;
    } else if (q.kind === 'G') {
      const w = bank.words.find((w) => w.id === q.target)!;
      for (const chunk of w.chunks ?? [])
        await page
          .locator('.sentence-choices')
          .getByRole('button', { name: chunk.split(' ').map(displayPinyin).join(' '), exact: true })
          .click();
    }
    await next(page).click();
  }
  await expect(page.getByRole('heading', { name: '今天的节目，播完啦' })).toBeVisible();
  expect(diagnostics.errors).toEqual([]);
});

/* ================= round 2 (fix-pinyin-r2) ================= */
const TONE_MARKS = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;

test.describe('R01 看图拼音 never prints the pinyin of the word being spelled', () => {
  // 塔 / 鹅 / 扑 are single syllables (the subtitle used to read “tǎ”), 土地 / 瀑布 have two.
  for (const id of ['ta', 'e', 'pu', 'tudi', 'pubu']) {
    test(`${id}: no subtitle shows its pinyin while the question opens`, async ({ page }) => {
      const word = bank.words.find((w) => w.id === id)!;
      await seed(page, [qF(id)]);
      await page.addInitScript(() => {
        const seen = ((window as any).__subSeen = new Set<string>());
        new MutationObserver(() => {
          const el = document.querySelector<HTMLElement>('.kit-subtitle__text');
          if (el && el.innerText.trim()) seen.add(el.innerText.trim());
        }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
      });
      await enter(page);
      // the word plays first (silently), then the first step line is said and shown: wait for it, however slow the machine
      await expect
        .poll(() => page.evaluate(() => [...(window as any).__subSeen].join(' | ')), { timeout: 9000 })
        .toMatch(/先找开头|再找后面|小帽子/);
      await page.waitForTimeout(600);
      const seen = await page.evaluate(() => [...(window as any).__subSeen] as string[]);
      for (const text of seen) {
        expect(text, `subtitle “${text}”`).not.toMatch(TONE_MARKS);
        expect(text.replaceAll(' ', '').toLowerCase(), `subtitle “${text}”`).not.toContain(word.display.replaceAll(' ', '').toLowerCase());
      }
      // 听听图画 plays the word again, still without printing it
      await page.getByRole('button', { name: '听听图画', exact: true }).click();
      await page.waitForTimeout(1200);
      expect(await subtitle(page).innerText()).not.toMatch(TONE_MARKS);
    });
  }
});

test.describe('R02 信号卡册 at lesson 8 scrolls and every card can be tapped', () => {
  test('all 29 cards reach the screen, zh / ch / the last card take a real tap, the button stays clear', async ({ page }, info) => {
    await seed(page, [qE('ditu')], (s) => (s.settings.lesson = 8));
    await instrument(page);
    await page.goto('/pinyin-station/?mute');
    await page.getByRole('button', { name: '进入电台', exact: true }).click();
    await page.getByRole('button', { name: '信号卡册', exact: true }).click();
    const cards = page.locator('.signal-card');
    expect(await cards.count()).toBeGreaterThanOrEqual(28);
    // the first row is below the title, not hidden under the top bar
    const first = await cards.first().evaluate((el) => el.getBoundingClientRect().top);
    const titleBottom = await page.locator('.album-title').evaluate((el) => el.getBoundingClientRect().bottom);
    expect(first).toBeGreaterThanOrEqual(titleBottom - 1);
    // the page itself does not scroll; the card area does, and the button sits outside it
    const layout = await page.evaluate(() => {
      const area = document.querySelector('.signal-album')!.getBoundingClientRect();
      const button = [...document.querySelectorAll('.album-page > .station-btn')].map((b) => b.getBoundingClientRect());
      return { area: [area.top, area.bottom], button: button.map((b) => [b.top, b.bottom, b.left, b.right]), vh: innerHeight };
    });
    expect(layout.button).toHaveLength(1);
    expect(layout.button[0][0]).toBeGreaterThanOrEqual(layout.area[1] - 1);
    expect(layout.button[0][1]).toBeLessThanOrEqual(layout.vh);
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      const hit = await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const area = document.querySelector('.signal-album')!.getBoundingClientRect();
        return { own: !!top && el.contains(top), inside: r.top >= area.top - 1 && r.bottom <= area.bottom + 1 };
      });
      expect(hit, `card ${i}`).toEqual({ own: true, inside: true });
    }
    await shot(page, info.project.name, 'fix-r2-album-L8-bottom');
    for (const sel of ['zh', 'ch']) {
      const card = page.locator(`.signal-card[aria-label^="${sel}，"]`);
      await card.scrollIntoViewIfNeeded();
      await card.tap(); // Playwright refuses a tap that something else would intercept
      await expect(page.locator('.kit-subtitle__text')).not.toHaveText('');
    }
    await cards.last().scrollIntoViewIfNeeded();
    await cards.last().tap();
    await page.getByRole('button', { name: '去读给台长听' }).tap();
    await expect(page.locator('.practice')).toBeVisible();
  });
});

test.describe('R03 看图拼音 with a scene card keeps its cells and keys on screen', () => {
  test('the cells have width, every key is inside the screen and finger sized', async ({ page }, info) => {
    const scene = bank.scenes!.find((x) => x.targets.includes('pu'))!;
    await seed(page, [qF('pu', { scene: scene.id })]);
    await enter(page);
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const box = (e: Element) => e.getBoundingClientRect();
      const keys = [...document.querySelectorAll('.practice button')].map((b) => {
        const r = box(b);
        return { t: b.textContent!.trim(), l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
      });
      return {
        W: innerWidth,
        H: innerHeight,
        work: Math.round(box(document.querySelector('.spelling-work')!).width),
        slots: [...document.querySelectorAll('.grid-slot')].map((s) => Math.round(box(s).width)),
        keys,
        scrollW: document.documentElement.scrollWidth,
      };
    });
    expect(m.work).toBeGreaterThan(150);
    for (const w of m.slots) expect(w).toBeGreaterThan(40);
    for (const k of m.keys) {
      expect(k.l, k.t).toBeGreaterThanOrEqual(0);
      expect(k.r, k.t).toBeLessThanOrEqual(m.W);
      expect(k.w, k.t).toBeGreaterThanOrEqual(44);
      expect(k.h, k.t).toBeGreaterThanOrEqual(44);
    }
    expect(m.scrollW).toBeLessThanOrEqual(m.W);
    await shot(page, info.project.name, 'fix-r2-scene-F');
  });
});

test.describe('R05 each button has one name and does what it says', () => {
  test('A: the practice button is 再听这个声音, only the subtitle bar says 再听一遍', async ({ page }) => {
    await seed(page, [qA('f', ['f', 'e', 't', 'p'])]);
    await enter(page);
    await page.waitForTimeout(700);
    await expect(page.getByRole('button', { name: '再听这个声音', exact: true })).toHaveCount(1);
    expect(await page.getByRole('button', { name: '再听一遍', exact: true }).count()).toBeLessThanOrEqual(1);
    const names = await page.locator('.practice button').evaluateAll((els) =>
      els.map((b) => ({ text: b.textContent!.trim(), label: b.getAttribute('aria-label') })),
    );
    for (const n of names) if (n.label) expect(n.label).toBe(n.text);
    // pressing it plays the sound only: no instruction subtitle comes back
    await page.getByRole('button', { name: '再听这个声音', exact: true }).click();
    await page.waitForTimeout(500);
    expect(await subtitle(page).innerText()).not.toContain('听一听，找到这个字母');
  });
  test('E: it is 再听指令 and says the instruction again', async ({ page }) => {
    await seed(page, [qE('ditu')]);
    await enter(page);
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: '再听指令', exact: true }).click();
    await expect(subtitle(page)).toContainText('看一看拼音');
  });
});

test.describe('R06 the welcome subtitle never covers a button on the home screen', () => {
  for (const withResume of [false, true]) {
    test(`home ${withResume ? 'with' : 'without'} a programme to resume`, async ({ page }, info) => {
      await seed(page, [qE('ditu'), qE('mama')]);
      if (!withResume) await page.addInitScript(() => localStorage.setItem('kg:v1:pinyin-station', JSON.stringify({ v: 1, updatedAt: Date.now(), data: { sessions: 0, dates: [], atoms: {}, history: [], confusions: {}, customWords: [], tutorial: {}, settings: { lesson: 4, ai: false, localScore: false, strictness: 'gentle', scaffold: 'initial' } } })));
      await instrument(page);
      await page.goto('/pinyin-station/?mute');
      await page.getByRole('button', { name: '进入电台', exact: true }).click();
      for (const at of [500, 500, 1000]) {
        await page.waitForTimeout(at);
        const covered = await page.evaluate(() => {
          const sub = document.querySelector<HTMLElement>('.kit-subtitle:not([hidden])');
          const sr = sub && sub.getBoundingClientRect();
          const home = document.querySelector('.station-home')!.getBoundingClientRect();
          const out: string[] = [];
          for (const b of document.querySelectorAll('#app button')) {
            const r = b.getBoundingClientRect();
            // only the part of the button that is inside the scrolling home area can be seen
            const top = Math.max(r.top, home.top), bottom = Math.min(r.bottom, home.bottom);
            if (bottom - top < 4 || !sr || sr.width === 0) continue;
            const ix = Math.min(r.right, sr.right) - Math.max(r.left, sr.left),
              iy = Math.min(bottom, sr.bottom) - Math.max(top, sr.top);
            if (ix > 2 && iy > 2) out.push(`${b.textContent!.trim()} ${Math.round(ix)}x${Math.round(iy)}`);
          }
          return { visible: !!sr, covered: out, homeBottom: Math.round(home.bottom), subTop: sr ? Math.round(sr.top) : null };
        });
        expect(covered.covered, JSON.stringify(covered)).toEqual([]);
        if (covered.subTop !== null) expect(covered.homeBottom).toBeLessThanOrEqual(covered.subTop + 1);
      }
      await shot(page, info.project.name, `fix-r2-home-${withResume ? 'resume' : 'plain'}`);
    });
  }
});

test.describe('R07 the ending page only speaks of recordings that were really kept', () => {
  for (const keep of [false, true]) {
    test(`保留录音 ${keep ? 'on' : 'off'}`, async ({ page }) => {
      await stubMicrophone(page);
      await seed(page, [{ ...qE('po'), kind: 'D', id: 'D:po', skill: 'word:po:say', lesson: 3 }], (s) => (s.settings.keepRecordings = keep));
      await enter(page);
      await page.getByRole('button', { name: '读给台长听' }).click();
      await expect(page.getByRole('button', { name: '听我的声音' })).toBeVisible({ timeout: 12000 });
      await next(page).click();
      if (keep) {
        await expect(page.getByRole('heading', { name: '今天的声音，收到啦' })).toBeVisible();
        await expect(subtitle(page)).toContainText('送到星港');
      } else {
        await expect(page.getByRole('heading', { name: '今天的节目，播完啦' })).toBeVisible();
        await expect(page.locator('.finish-page')).not.toContainText('收到啦');
        await expect(subtitle(page)).toContainText('今天的节目播完啦');
      }
    });
  }
});
