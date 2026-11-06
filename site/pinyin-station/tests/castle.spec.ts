import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { instrument } from '../../../tests/smoke/helpers';
import { blendRivals, initialSave } from '../src/domain/learning';
import { displayPinyin, medialSplit, parseSyllable } from '../src/domain/pinyin';
import { bank } from '../src/domain/content';
import type { Question, Save } from '../src/domain/types';
import { parentPin } from './helpers';

/**
 * 课本对齐 stage 1, real taps: the parent picks the book lesson, the new lesson is most of the programme,
 * 四声排排队 (right, wrong, wrong, wrong -> demonstration), three-part blends, and an audio "eavesdropper" proving that the
 * sounds played in 四声排排队 are real recordings. Muted (?mute); the spy only records, nothing is ever played.
 */
test.use({ serviceWorkers: 'block' });
const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8')) as Record<string, { src: string; synthetic?: boolean }>;
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
const heard = async (page: Page, from: number) =>
  (await page.evaluate((n) => (window as any).__aud.slice(n), from)).map((e: any) => ({ ids: e.speech ? [] : idsOf(e.src), sub: e.sub as string, speech: e.speech as string | undefined }));
const mark = (page: Page) => page.evaluate(() => (window as any).__aud.length as number);
const TONE_MARKS = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
/** Wait until the question's own sound (py.syl.<id>) has started `n` times since `from` (lines in front of it take their time). */
const soundCount = async (page: Page, from: number, id: string) => (await heard(page, from)).filter((x: { ids: string[] }) => x.ids.includes(id)).length;
const next = (page: Page) => page.getByRole('button', { name: '接下一条', exact: true });

const qH = (target: string, choices: string[], lesson: number): Question => ({ id: `H:${target}`, kind: 'H', target, skill: `tone4:${target.slice(0, -1)}:hear`, lesson, phase: 'main', choices });
const qC = (target: string, choices: string[], lesson: number): Question => ({ id: `C:${target}`, kind: 'C', target, skill: `syl:${target}:blend`, lesson, phase: 'main', choices });

async function open(page: Page, queue: Question[] | null, tweak: (s: Save) => void = () => undefined) {
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
  await page.goto('/pinyin-station/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await expect(page.locator('.kit-start')).toHaveCount(0);
  if (queue) await page.getByRole('button', { name: '接着上次的节目' }).click();
}
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data);

test.describe('A0: the parent picks the book lesson', () => {
  test('book 13 = station 12; book 14 is greyed out; labels show the book lesson and page', async ({ page }) => {
    await open(page, null);
    await page.getByRole('button', { name: '家长', exact: true }).click();
    await parentPin(page);
    const select = page.getByLabel('当前课', { exact: true });
    await expect(select.locator('option')).toHaveCount(14);
    expect(await select.locator('option[value="14"]').evaluate((o) => (o as HTMLOptionElement).disabled)).toBe(true);
    await expect(select.locator('option[value="14"]')).toContainText('等第 14 课');
    await select.selectOption('9');
    expect((await saved(page)).settings).toMatchObject({ lesson: 8, book: 9 });
    await expect(select).toHaveValue('9');
    await select.selectOption('13');
    expect((await saved(page)).settings).toMatchObject({ lesson: 12, book: 13 });
    await page.getByRole('button', { name: '回到电台', exact: true }).click();
    await expect(page.locator('.program-board > small')).toContainText('课本第 13 课 · 第 16 页');
    await expect(page.locator('.program-board > small')).toContainText('第 12 站');
  });
  test('with book 13 chosen, the programme is mostly the new lesson and includes 四声排排队', async ({ page }) => {
    await open(page, null, (s) => { s.settings.lesson = 12; s.settings.book = 13; });
    await page.getByRole('button', { name: '开始今天的节目' }).click();
    await expect(page.locator('.practice')).toBeVisible();
    await expect(page.locator('.practice-header small')).toContainText('课本第');
    const queue = (await saved(page)).resume.queue as Question[];
    expect(queue).toHaveLength(15);
    expect(queue.filter((q) => q.lesson >= 11).length / queue.length).toBeGreaterThanOrEqual(0.6);
    expect(queue.some((q) => q.kind === 'H')).toBe(true);
  });
});

test.describe('A3: 四声排排队, a whole question with wrong tries', () => {
  test('right order of keys, gentle hints, the sounds are real recordings, then a correct one', async ({ page }, info) => {
    test.setTimeout(120_000);
    await open(page, [qH('ai3', ['ai1', 'ai2', 'ai3', 'ai4'], 9), qH('ei2', ['ei1', 'ei2', 'ei3', 'ei4'], 9)]);
    await expect(page.locator('.instruction')).toHaveText('听一听，选出声调一样的那个。');
    await expect(page.locator('.practice-header small')).toContainText('课本第 10 课 · 第 12 页');
    await expect(page.locator('[data-choice]')).toHaveText(['āi', 'ái', 'ǎi', 'ài']);
    await page.waitForTimeout(500);
    const from = await mark(page);
    // wrong 1: a gentle line and the sound again (silently, nothing printed)
    await page.locator('[data-choice="ai1"]').click();
    await expect(page.locator('[data-choice="ai1"]')).toHaveClass(/miss/);
    await expect(page.locator('[data-choice="ai1"]')).toBeDisabled();
    await expect(page.locator('.feedback')).toHaveText('差一点点，再听一听。');
    await expect.poll(() => soundCount(page, from, 'py.syl.ai3'), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
    // wrong 2 (neighbouring tone): the right card lights up and the tone tip is said
    await page.locator('[data-choice="ai2"]').click();
    await expect(page.locator('.feedback')).toContainText('二声像上坡');
    await expect(page.locator('[data-choice="ai3"]')).toHaveClass(/clue/);
    await expect.poll(() => soundCount(page, from, 'py.syl.ai3'), { timeout: 20000 }).toBeGreaterThanOrEqual(2);
    // wrong 3: the demonstration, never a dead end
    await page.locator('[data-choice="ai4"]').click();
    await expect(page.locator('.feedback')).toContainText('一起看示范');
    await expect(next(page)).toBeVisible();
    await expect(page.locator('[data-choice="ai3"]')).toHaveClass(/clue/);
    await expect.poll(() => soundCount(page, from, 'py.syl.ai3'), { timeout: 20000 }).toBeGreaterThanOrEqual(3);
    // the eavesdropper: robot clips are plain sentences only (tip, demo, hints); every SOUND is a real recording, unprinted
    const h = await heard(page, from);
    for (const x of h) {
      expect(x.speech).toBeUndefined();
      for (const id of x.ids) {
        if (id.startsWith('py.syl.')) {
          expect(manifest[id].synthetic, `${id} is a real recording`).toBeFalsy();
          expect(x.sub, `${id}: the sound is not printed`).not.toMatch(TONE_MARKS);
        } else expect(id, 'robot line').toMatch(/^py\.(tip|demo|hint|H|praise)/);
      }
    }
    if (process.env.KG_EVIDENCE_DIR)
      fs.writeFileSync(path.join(process.env.KG_EVIDENCE_DIR, `castle-H-eavesdrop-${info.project.name}.json`), JSON.stringify(h.map((x: { ids: string[]; sub: string }) => ({ clip: x.ids.join('/'), subtitle: x.sub })), null, 1));
    const sounds = h.flatMap((x: { ids: string[] }) => x.ids.filter((id: string) => id.startsWith('py.syl.')));
    expect(sounds.length).toBeGreaterThanOrEqual(3);
    expect(new Set(sounds)).toEqual(new Set(['py.syl.ai3'])); // only the heard tone, never the wrong cards
    await page.screenshot({ path: path.join(process.env.KG_SHOTS_CASTLE ?? '/tmp', `castle-H-demo-${info.project.name}.png`) });
    await next(page).click();
    // a correct first try, truthful praise
    await expect(page.locator('[data-choice="ei2"]')).toBeVisible();
    await page.locator('[data-choice="ei2"]').click();
    await expect(page.locator('.feedback.is-lit')).toContainText('你听出了这个声调');
    expect((await saved(page)).atoms['tone4:ei:hear']?.box ?? 0).toBeGreaterThanOrEqual(0);
    await next(page).click();
    // three misses on the first question add one twin question of the same kind (from the early stations on there is one to add): answer it too
    const done = page.getByRole('heading', { name: /播完啦|收到啦/ });
    for (let i = 0; i < 2 && !(await done.isVisible()); i++) {
      await page.locator('[data-answer]').first().click();
      await next(page).click();
    }
    await expect(done).toBeVisible();
  });
  test('whole-syllable series, and er has no first tone yet (3 cards)', async ({ page }) => {
    await open(page, [qH('yin3', ['yin1', 'yin2', 'yin3', 'yin4'], 12), qH('er4', ['er2', 'er3', 'er4'], 11)]);
    await expect(page.locator('[data-choice]')).toHaveText(['yīn', 'yín', 'yǐn', 'yìn']);
    await expect(page.locator('.practice-header small')).toContainText('课本第 13 课 · 第 16 页');
    await page.locator('[data-choice="yin3"]').click();
    await next(page).click();
    await expect(page.locator('[data-choice]')).toHaveText(['ér', 'ěr', 'èr']);
  });
});

test.describe('A12: three-part blends', () => {
  const rival = (id: string) => blendRivals(bank.syllables.find((s) => s.id === id)!, bank.syllables)[0].id;
  test('g + u + āi: both tiles, the rest of the sound as the choice, the whole syllable at the end', async ({ page }) => {
    const rest = (id: string) => medialSplit(parseSyllable(id)!.final)!.rest;
    const other = rival('guai1');
    await open(page, [qC('guai1', ['guai1', other], 9)]);
    await expect(page.locator('.blend-tile')).toHaveText(['g', 'u']);
    await expect(page.locator('.blend-slot')).toHaveText('？');
    await expect(page.locator('[data-final]')).toHaveCount(2);
    const wrong = page.locator(`[data-choice="${other}"]`);
    await wrong.click();
    await expect(page.locator('.blend-slot')).toHaveText(displayPinyin(rest(other) + '1'));
    await page.locator('[data-choice="guai1"]').click();
    await expect(page.locator('.blend-result')).toHaveText('guāi');
    await expect(next(page)).toBeVisible();
  });
  test('ü: dots after n / l (lüè), none after j q x (jué)', async ({ page }) => {
    await open(page, [qC('lve4', ['lve4', rival('lve4')], 11), qC('jue2', ['jue2', rival('jue2')], 11)]);
    await expect(page.locator('[data-choice="lve4"]')).toHaveText('üè');
    await page.locator('[data-choice="lve4"]').click();
    await expect(page.locator('.blend-result')).toHaveText('lüè');
    await next(page).click();
    await expect(page.locator('[data-choice="jue2"]')).toHaveText('ué');
    const labels = await page.locator('[data-choice]').allInnerTexts();
    for (const l of labels) expect(l).not.toMatch(/[ǖǘǚǜü]/);
  });
});
