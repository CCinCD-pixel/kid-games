import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { instrument } from '../../../tests/smoke/helpers';
import { initialSave } from '../src/domain/learning';
import { bank } from '../src/domain/content';
import { parseSyllable } from '../src/domain/pinyin';
import type { Question, Save } from '../src/domain/types';

/**
 * 课本对齐 stage 2b, real taps: text cards (汉字卡) in E / F / D, and 阶段复习 (记一记 screen + 20 questions).
 * The school words are held until their word voices exist (the generator decides). They exist now; this spec still gives every
 * school word WITHOUT a voice one by routing the manifest, so it also runs before the audio lands: a copy of an existing real word clip (py.word.hecha) is served under py.word.<id> ("a made-up word
 * with a clip"). The question is injected through the resume snapshot, which bypasses the hold. The spy only records.
 */
test.use({ serviceWorkers: 'block' });
const root = fileURLToPath(new URL('../../../', import.meta.url));
const real = JSON.parse(fs.readFileSync(path.join(root, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8')) as Record<string, { src: string; text: string; synthetic?: boolean }>;
const SCHOOL = bank.words.filter((w) => w.source === '学校拼音练习');
const manifest: typeof real = { ...real };
for (const w of SCHOOL) if (!manifest[`py.word.${w.id}`]) manifest[`py.word.${w.id}`] = { ...real['py.word.hecha'], text: w.hanzi };
const SPY = `(() => {
  const log = (window.__aud = []);
  const abUrl = new WeakMap(), bufUrl = new WeakMap();
  const sub = () => { const el = document.querySelector('.kit-subtitle__text'); return el ? el.innerText.trim() : ''; };
  const arr = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = function () { const url = this.url; return arr.call(this).then((ab) => { try { abUrl.set(ab, url); } catch {} return ab; }); };
  const BAC = window.BaseAudioContext || window.webkitBaseAudioContext;
  const dec = BAC.prototype.decodeAudioData;
  BAC.prototype.decodeAudioData = function (ab, ok, err) { const url = abUrl.get(ab); const p = dec.call(this, ab, ok, err); return p && p.then ? p.then((buf) => { if (url) bufUrl.set(buf, url); return buf; }) : p; };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { const e = { src: (this.buffer ? bufUrl.get(this.buffer) : '') || '', sub: '' }; log.push(e); setTimeout(() => (e.sub = sub()), 90); return start.apply(this, a); };
  const say = window.speechSynthesis && speechSynthesis.speak.bind(speechSynthesis);
  if (say) speechSynthesis.speak = (u) => { log.push({ speech: u.text }); try { u.volume = 0; } catch {} say(u); };
})();`;
const idsOf = (src: string) => Object.entries(manifest).filter(([, c]) => src.endsWith(c.src)).map(([id]) => id);
type Heard = { ids: string[]; sub: string; speech?: string };
const heard = async (page: Page, from = 0): Promise<Heard[]> => (await page.evaluate((n) => (window as any).__aud.slice(n), from)).map((e: any) => ({ ids: e.speech ? [] : idsOf(e.src), sub: e.sub as string, speech: e.speech as string | undefined }));
const TONE_MARKS = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
const next = (page: Page) => page.getByRole('button', { name: '接下一条', exact: true });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data);
const shots = (page: Page, name: string, project: string) => process.env.KG_SHOTS_CASTLE && page.screenshot({ path: path.join(process.env.KG_SHOTS_CASTLE, `castle2b-${name}-${project}.png`) });

const q = (kind: Question['kind'], target: string, choices: string[], lesson: number): Question => ({ id: `${kind}:${target}`, kind, target, skill: `word:${target}:${kind === 'F' ? 'spell' : kind === 'D' ? 'say' : 'decode'}`, lesson, phase: 'main', choices });

async function start(page: Page, queue: Question[] | null, tweak: (s: Save) => void = () => undefined) {
  const s = initialSave();
  s.tutorial = { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true };
  tweak(s);
  // an unfinished programme is checked at start-up: its questions must belong to a station the child has reached
  if (queue) {
    s.settings.lesson = Math.max(s.settings.lesson, ...queue.map((q) => q.lesson));
    s.resume = { mode: 'today', queue, index: 0, at: Date.now() };
  }
  await instrument(page);
  await page.addInitScript(SPY);
  await page.addInitScript((data) => { if (!localStorage.getItem('kg:v1:pinyin-station')) localStorage.setItem('kg:v1:pinyin-station', JSON.stringify({ v: 1, updatedAt: Date.now(), data })); }, s);
  await page.route(/pinyin-station\/audio-manifest\.json/, async (route) => {
    const res = await route.fetch();
    const m = (await res.json()) as Record<string, unknown>;
    for (const w of SCHOOL) if (!m[`py.word.${w.id}`]) m[`py.word.${w.id}`] = { ...(m['py.word.hecha'] as object), text: w.hanzi };
    await route.fulfill({ response: res, json: m });
  });
  await page.goto('/pinyin-station/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await expect(page.locator('.kit-start')).toHaveCount(0);
  if (queue) await page.getByRole('button', { name: '接着上次的节目' }).click();
}

test.describe('E with text cards: read the pinyin, pick the characters', () => {
  test('four text cards, no caption, wrong tries narrow it down, the word is read by the word voice', async ({ page }, info) => {
    test.setTimeout(90_000);
    await start(page, [q('E', 'baozhi', ['baozhi', 'baicai', 'xiaodao', 'baitu'], 10), q('E', 'laoniu', ['laoniu', 'laoshu', 'laoye', 'xiaodao'].filter((id) => bank.words.some((w) => w.id === id)), 10)]);
    await expect(page.locator('.question-pinyin')).toHaveText('bào zhǐ');
    await expect(page.locator('.picture-choice .text-card')).toHaveCount(4);
    for (const w of ['报纸', '白菜', '小刀', '白兔']) await expect(page.getByRole('button', { name: w, exact: true })).toBeVisible();
    // the cards are cards, and the characters are inside them (not cropped)
    const fit = await page.locator('.picture-choice .text-card svg text').evaluateAll((els) => els.map((t) => { const b = (t as SVGTextElement).getBBox(); return b.width <= 152 && b.height <= 100; }));
    expect(fit).toEqual([true, true, true, true]);
    await shots(page, 'E', info.project.name);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '小刀', exact: true }).click();
    await expect(page.getByRole('button', { name: '小刀', exact: true })).toHaveClass(/miss/);
    await expect(page.locator('.picture-caption')).toHaveCount(0);
    await page.getByRole('button', { name: '白兔', exact: true }).click();
    await expect(page.getByRole('button', { name: '报纸', exact: true })).toHaveClass(/clue/);
    await page.getByRole('button', { name: '白菜', exact: true }).click();
    await expect(page.locator('.feedback')).toContainText('一起看示范');
    await expect(next(page)).toBeVisible();
    // the eavesdropper: the word is read by the word clip (copy of a real clip here), nothing by the device voice
    // (the demonstration line is said first, then the word)
    await expect.poll(async () => (await heard(page)).some((x) => x.ids.includes('py.word.baozhi')), { timeout: 20000 }).toBe(true);
    const h = await heard(page);
    for (const x of h) {
      expect(x.speech).toBeUndefined();
      for (const id of x.ids.filter((i) => i.startsWith('py.syl.'))) expect(manifest[id].synthetic).toBeFalsy();
    }
    await next(page).click();
    await expect(page.locator('.picture-choice .text-card').first()).toBeVisible();
    await page.locator('.picture-choice').first().click();
    await expect(page.locator('.feedback.is-lit')).toContainText('你');
  });
});

test.describe('F with a text card: hear the word, then spell it', () => {
  test('the card is on screen, the word is heard first and not printed, the last tap is shown', async ({ page }, info) => {
    test.setTimeout(90_000);
    await start(page, [q('F', 'laoniu', ['laoniu'], 10)], (s) => (s.settings.scaffold = 'initial'));
    await expect(page.locator('.spelling-picture .text-card')).toBeVisible();
    await expect(page.getByRole('button', { name: '听听这个词', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '听听图画' })).toHaveCount(0);
    await expect(page.locator('.instruction')).toHaveAttribute('data-line', 'py.initial');
    await shots(page, 'F', info.project.name);
    await page.waitForTimeout(1500);
    const first = await heard(page);
    expect(first.some((x) => x.ids.includes('py.word.laoniu'))).toBe(true);
    for (const x of first.filter((x) => x.ids.includes('py.word.laoniu'))) expect(x.sub, 'the word is heard, not printed').not.toMatch(TONE_MARKS);
    const word = bank.words.find((w) => w.id === 'laoniu')!;
    for (const id of word.syllables) await page.locator(`[data-piece="${parseSyllable(id)!.initial}"]`).click();
    expect((await page.locator('.grid-slot').allInnerTexts()).join(' ')).toBe(word.display);
    await expect(next(page)).toHaveCount(0);
    await expect(next(page)).toBeVisible();
    for (const x of await heard(page)) expect(x.speech).toBeUndefined();
  });
});

test.describe('D with a text card: pinyin and characters, the demonstration first', () => {
  test('the word is read out before the child reads it', async ({ page }, info) => {
    await start(page, [q('D', 'baicai', ['baicai'], 10)]);
    await expect(page.locator('.reading-picture .text-card')).toBeVisible();
    await expect(page.locator('.question-pinyin')).toHaveText('bái cài');
    await shots(page, 'D', info.project.name);
    await expect.poll(async () => (await heard(page)).some((x) => x.ids.includes('py.word.baicai')), { timeout: 15000 }).toBe(true);
    await page.getByRole('button', { name: '不开麦，跟着读', exact: true }).click();
    await page.getByRole('button', { name: '我读过啦', exact: true }).click();
    await expect(page.getByRole('heading', { name: /播完啦|收到啦/ })).toBeVisible();
    for (const x of await heard(page)) expect(x.speech).toBeUndefined();
  });
});

test.describe('the real schedule with the school words unlocked', () => {
  test('book 13: text-card questions appear, never two in a row, at most 6 of 15, and E never mixes cards with drawings', async ({ page }) => {
    await start(page, null, (s) => { s.settings.lesson = 12; s.settings.book = 13; });
    await page.getByRole('button', { name: '开始今天的节目' }).click();
    await expect(page.locator('.practice')).toBeVisible();
    const queue = (await saved(page)).resume.queue as Question[];
    const text = (id: string) => bank.words.find((w) => w.id === id)?.picture.startsWith('text:') ?? false;
    const flags = queue.map((x) => ['E', 'F', 'D'].includes(x.kind) && text(x.target));
    expect(flags.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(flags.filter(Boolean).length).toBeLessThanOrEqual(6);
    flags.forEach((f, i) => expect(f && flags[i - 1]).toBeFalsy());
    for (const x of queue.filter((y) => y.kind === 'E')) expect(new Set(x.choices.map(text)).size).toBe(1);
    expect(queue.filter((x) => x.lesson >= 11).length / queue.length).toBeGreaterThanOrEqual(0.6);
  });
});

test.describe('A10 阶段复习', () => {
  test('appears from book lesson 9 on, not before', async ({ page }) => {
    await start(page, null, (s) => { s.settings.lesson = 4; });
    await expect(page.getByRole('button', { name: '阶段复习', exact: true })).toHaveCount(0);
  });
  test('记一记 plays real recordings; the programme is 20 questions and finishes without punishment', async ({ page }, info) => {
    test.setTimeout(240_000);
    await start(page, null, (s) => { s.settings.lesson = 12; s.settings.book = 13; });
    await page.getByRole('button', { name: '阶段复习', exact: true }).click();
    await expect(page.locator('.recall-tile')).toHaveCount(6 + 23 + 10);
    await shots(page, 'recall', info.project.name);
    const from = await page.evaluate(() => (window as any).__aud.length as number);
    await page.locator('.recall-tile[data-letter="zh"]').tap();
    await expect.poll(async () => (await heard(page, from)).length, { timeout: 15000 }).toBeGreaterThanOrEqual(1);
    const h = await heard(page, from);
    expect(h[0].ids).toContain('py.syl.zhi1');
    expect(manifest['py.syl.zhi1'].synthetic).toBeFalsy();
    expect(h.every((x) => !x.speech)).toBe(true);
    await page.getByRole('button', { name: '开始阶段复习', exact: true }).click();
    await expect(page.locator('.practice')).toBeVisible();
    const queue = (await saved(page)).resume.queue as Question[];
    expect(queue).toHaveLength(20);
    expect(queue.map((x) => x.kind).join('')).toBe('CCDCCDCCDCCDCCDCCDCC');
    expect(new Set(queue.filter((x) => x.kind === 'C').map((x) => parseSyllable(x.target)!.initial)).size).toBeGreaterThanOrEqual(9);
    for (let n = 0; n < 20; n++) {
      const cur = (await saved(page)).resume;
      const question = cur.queue[cur.index] as Question;
      expect(cur.index).toBe(n);
      if (question.kind === 'C') {
        // a wrong first try is gently allowed on every fifth blend
        await page.locator(`[data-choice="${question.target}"]`).click();
        await next(page).click();
      } else {
        await page.getByRole('button', { name: '不开麦，跟着读', exact: true }).click();
        await page.getByRole('button', { name: '我读过啦', exact: true }).click();
      }
    }
    await expect(page.getByRole('heading', { name: /播完啦|收到啦/ })).toBeVisible();
    for (const x of await heard(page)) expect(x.speech).toBeUndefined();
  });
});
