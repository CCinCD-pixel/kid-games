import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { instrument } from '../../../tests/smoke/helpers';
import { initialSave } from '../src/domain/learning';
import { bank } from '../src/domain/content';
import { drillTables } from '../src/domain/drill';
import { RULES } from '../src/views/lines';
import type { Question, Save } from '../src/domain/types';

/**
 * 课本对齐 stage 3, real taps: 练读表, 小规则 cards (and their first-time hint), a whole-syllable question, the minimal-pair
 * confusions with their tips, and 字形对对碰. An "eavesdropper" (a spy on Web Audio and the device voice that only records) shows
 * that only real syllable recordings sound for sounds, and that nothing is ever read by the device voice.
 * Lines that have no recording yet (the rule cards, the drill lines, the stage-3 tips) show as silent subtitles; once they are
 * recorded the same tests accept the clip instead.
 */
test.use({ serviceWorkers: 'block' });
const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8')) as Record<string, { src: string; text: string; synthetic?: boolean }>;
const shot = (page: Page, name: string, project: string) => process.env.KG_SHOTS_CASTLE && page.screenshot({ path: path.join(process.env.KG_SHOTS_CASTLE, `castle3-${name}-${project}.png`) });
const SPY = `(() => {
  const log = (window.__aud = []);
  const abUrl = new WeakMap(), bufUrl = new WeakMap();
  const sub = () => { const el = document.querySelector('.kit-subtitle__text'); return el ? el.innerText.trim() : ''; };
  const rel = (u) => (u || '').replace(location.origin, '');
  const arr = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = function () { const url = this.url; return arr.call(this).then((ab) => { try { abUrl.set(ab, url); } catch {} return ab; }); };
  const BAC = window.BaseAudioContext || window.webkitBaseAudioContext;
  const dec = BAC.prototype.decodeAudioData;
  BAC.prototype.decodeAudioData = function (ab, ok, err) { const url = abUrl.get(ab); const p = dec.call(this, ab, ok, err); return p && p.then ? p.then((buf) => { if (url) bufUrl.set(buf, url); return buf; }) : p; };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    const e = { src: rel(this.buffer ? bufUrl.get(this.buffer) : ''), lit: [...document.querySelectorAll('.tip-chip.active')].map((c) => c.dataset.clip), sub: '' };
    log.push(e); setTimeout(() => (e.sub = sub()), 90); return start.apply(this, a);
  };
  const say = window.speechSynthesis && speechSynthesis.speak.bind(speechSynthesis);
  if (say) speechSynthesis.speak = (u) => { log.push({ speech: u.text }); try { u.volume = 0; } catch {} say(u); };
})();`;
const idsOf = (src: string) => Object.entries(manifest).filter(([, c]) => src.endsWith(c.src)).map(([id]) => id);
type Heard = { ids: string[]; lit: string[]; sub: string; speech?: string };
const heard = async (page: Page, from = 0): Promise<Heard[]> =>
  (await page.evaluate((n) => (window as any).__aud.slice(n), from)).map((e: any) => ({ ids: e.speech ? [] : idsOf(e.src), lit: e.lit ?? [], sub: e.sub ?? '', speech: e.speech }));
const mark = (page: Page) => page.evaluate(() => (window as any).__aud.length as number);
const noDeviceVoice = (h: Heard[]) => h.forEach((x) => expect(x.speech, 'nothing is read by the device voice').toBeUndefined());
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data);
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
const inView = async (page: Page, selector: string) => {
  const box = await page.locator(selector).first().boundingBox();
  const size = page.viewportSize()!;
  expect(box, selector).not.toBeNull();
  expect(box!.y + box!.height, `${selector} bottom`).toBeLessThanOrEqual(size.height + 1);
  expect(box!.x + box!.width, `${selector} right`).toBeLessThanOrEqual(size.width + 1);
};

async function open(page: Page, tweak: (s: Save) => void = () => undefined, queue: Question[] | null = null) {
  const s = initialSave();
  s.tutorial = { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true };
  tweak(s);
  if (queue) s.resume = { mode: 'today', queue, index: 0, at: Date.now() };
  await instrument(page);
  await page.addInitScript(SPY);
  await page.addInitScript((data) => { if (!localStorage.getItem('kg:v1:pinyin-station')) localStorage.setItem('kg:v1:pinyin-station', JSON.stringify({ v: 1, updatedAt: Date.now(), data })); }, s);
  await page.goto('/pinyin-station/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await expect(page.locator('.kit-start')).toHaveCount(0);
  if (queue) {
    await page.getByRole('button', { name: '接着上次的节目' }).click();
    await expect(page.locator('.practice')).toBeVisible();
  }
}
const q = (kind: Question['kind'], target: string, choices: string[], lesson: number): Question => ({ id: `${kind}:${target}`, kind, target, skill: `${kind === 'I' ? 'glyph' : 'letter'}:${target}:${kind === 'I' ? 'see' : 'hear'}`, lesson, phase: 'main', choices });

test.describe('练读表', () => {
  const table = drillTables(bank, 12).find((t) => t.kind === 'final')!;
  test('a full table: four columns, the real demonstration, a kind time at the end, nothing sideways, nothing hidden', async ({ page }, info) => {
    test.setTimeout(120_000);
    await open(page, (s) => {
      s.settings.lesson = 12;
      s.drillBest = { [table.id]: { best: 900, last: 900, at: Date.now() - 86400_000 } };
    });
    await page.getByRole('button', { name: '练读表', exact: true }).click();
    const choices = page.locator('.drill-choice');
    expect(await choices.count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.drill-choice.recommended')).toHaveAttribute('data-table', table.id);
    await expect(page.locator(`[data-table="${table.id}"]`)).toContainText('上次读了 900 秒');
    await shot(page, 'drill-menu', info.project.name);
    await page.locator(`[data-table="${table.id}"]`).click();
    // the table: every cell is there, in four columns, displayed with its tone mark
    await expect(page.locator('.drill-cell')).toHaveCount(table.cells.length);
    const columns = await page.locator('.drill-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(4);
    for (const cell of await page.locator('.drill-cell').allInnerTexts()) expect(cell).not.toMatch(/\d/);
    await page.getByRole('button', { name: '开始读', exact: true }).click();
    await expect(page.locator('.drill-cell.current')).toHaveAttribute('data-cell', table.cells[0]);
    await shot(page, 'drill-reading', info.project.name);
    // 听示范 plays the real recording of the current cell, only that
    const from = await mark(page);
    await page.getByRole('button', { name: '听示范', exact: true }).click();
    const demo = async () => (await heard(page, from)).filter((c) => c.ids.some((id) => id.startsWith('py.syl.')));
    await expect.poll(async () => (await demo()).length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(600);
    const h = await demo(); // (the line that introduces the table may also be heard, with its own recording)
    expect(h).toHaveLength(1);
    expect(h[0].ids).toContain(`py.syl.${table.cells[0]}`); // (an alias such as ie2 / ye2 is the same file)
    noDeviceVoice(await heard(page, from));
    // the whole table, cell by cell, with the buttons always on screen
    await inView(page, '.drill-actions .station-btn--primary');
    await page.waitForTimeout(3500); // a table is never "fast" by accident: a real child takes seconds
    for (const [i, id] of table.cells.entries()) {
      await expect(page.locator('.drill-cell.current')).toHaveAttribute('data-cell', id);
      await expect(page.locator('.drill-status')).toContainText(`第 ${i + 1} 格`);
      await page.getByRole('button', { name: '读好了', exact: true }).click();
    }
    await expect(page.locator('.drill-status.is-done')).toContainText('这一张读完啦');
    await expect(page.locator('.drill-status')).toContainText(/用了 \d+ 秒/);
    await expect(page.locator('.drill-compare')).toHaveText(/比上次快 \d+ 秒/);
    await expect(page.locator('.drill-cell.done')).toHaveCount(table.cells.length);
    await expect(page.getByRole('button', { name: '再读一张', exact: true })).toBeVisible();
    await shot(page, 'drill-done', info.project.name);
    await noSideways(page);
    const s = await saved(page);
    expect(s.drillBest[table.id].last).toBeLessThan(900);
    expect(s.drillBest[table.id].best).toBe(s.drillBest[table.id].last);
    noDeviceVoice(await heard(page));
    // back to the menu: this table now shows the new time
    await page.getByRole('button', { name: '再读一张', exact: true }).click();
    await expect(page.locator(`[data-table="${table.id}"]`)).toContainText(/上次读了 \d+ 秒/);
  });
  test('a slower round says nothing about time; the first round is just noted', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, (s) => {
      s.settings.lesson = 9;
      s.drillBest = { 'final:9': { best: 1, last: 1, at: Date.now() - 1000 } };
    });
    await page.getByRole('button', { name: '练读表', exact: true }).click();
    const own = drillTables(bank, 9).find((t) => t.id === 'final:9')!;
    await page.locator('[data-table="final:9"]').click();
    await page.getByRole('button', { name: '开始读', exact: true }).click();
    await page.waitForTimeout(5000);
    for (let i = 0; i < own.cells.length; i++) await page.getByRole('button', { name: '读好了', exact: true }).click();
    await expect(page.locator('.drill-status.is-done')).toBeVisible();
    await expect(page.locator('.drill-compare')).toHaveCount(0);
    expect((await saved(page)).drillBest['final:9'].best).toBe(1); // the best time is not overwritten by a slower round
    // another table that has never been read says the first round is noted
    await page.getByRole('button', { name: '再读一张', exact: true }).click();
    const other = drillTables(bank, 9).find((t) => t.kind === 'blend');
    if (other) {
      await page.locator(`[data-table="${other.id}"]`).click();
      await page.getByRole('button', { name: '开始读', exact: true }).click();
      for (let i = 0; i < other.cells.length; i++) await page.getByRole('button', { name: '读好了', exact: true }).click();
      await expect(page.locator('.drill-compare')).toHaveText('第一次读完，记下啦');
    }
  });
});

test.describe('小规则', () => {
  test('a hint shows once; the cards open from it and from the album; each line is a plain sentence, silent robot', async ({ page }, info) => {
    test.setTimeout(90_000);
    await open(page, (s) => (s.settings.lesson = 12));
    await expect(page.locator('.rule-hint')).toBeVisible();
    await shot(page, 'rule-hint', info.project.name);
    await page.getByRole('button', { name: '去看看', exact: true }).click();
    await expect(page.locator('[data-rule]')).toHaveCount(5);
    for (const r of RULES) await expect(page.locator(`[data-rule="${r.id}"] .rule-text`)).toHaveText(r.line.text);
    for (const r of RULES) await expect(page.locator(`[data-rule="${r.id}"] .rule-art svg`)).toBeVisible();
    await shot(page, 'rules', info.project.name);
    await noSideways(page);
    // the 小点点摘帽子 line is read as plain Chinese (a recording if there is one, otherwise a subtitle) and never by the device voice
    const from = await mark(page);
    await page.locator('[data-rule="i"]').getByRole('button', { name: '听一听' }).click();
    await expect(page.locator('.kit-subtitle__text')).toHaveText('有礼貌的小点点，标上声调就摘帽。');
    await page.waitForTimeout(600);
    const h = await heard(page, from);
    for (const x of h) expect(x.ids.every((id) => id === 'py.rule.i')).toBe(true);
    noDeviceVoice(h);
    await page.locator('[data-rule="v"]').getByRole('button', { name: '听一听' }).click();
    await expect(page.locator('.kit-subtitle__text')).toHaveText('两个小点点见到这几个字母，就擦掉眼泪笑嘻嘻。');
    // the hint is gone for good once the cards were opened
    await page.getByRole('button', { name: '回电台', exact: true }).first().click();
    await expect(page.locator('.station-home')).toBeVisible();
    await expect(page.locator('.rule-hint')).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: '进入电台', exact: true }).click();
    await expect(page.locator('.rule-hint')).toHaveCount(0);
    expect((await saved(page)).rulesSeen.hint).toBe(true);
    // ... but the album keeps the door open
    await page.getByRole('button', { name: '信号卡册', exact: true }).click();
    await page.getByRole('button', { name: '小规则', exact: true }).click();
    await expect(page.locator('[data-rule]')).toHaveCount(5);
    await page.goBack(); // (the browser / swipe back: one step, like 回电台)
    await expect(page.locator('.station-home')).toBeVisible();
  });
  test('"先不用" dismisses the hint; early stations only show the rules they need', async ({ page }) => {
    await open(page, (s) => (s.settings.lesson = 3));
    await page.getByRole('button', { name: '先不用', exact: true }).click();
    await expect(page.locator('.rule-hint')).toHaveCount(0);
    expect((await saved(page)).rulesSeen.hint).toBe(true);
    await page.getByRole('button', { name: '信号卡册', exact: true }).click();
    await page.getByRole('button', { name: '小规则', exact: true }).click();
    await expect(page.locator('[data-rule]')).toHaveCount(2);
    await noSideways(page);
  });
  test("the parent's 跳过开场和教学 keeps the hint away (and the cards stay reachable from the album)", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: true })));
    await open(page, (s) => (s.settings.lesson = 12));
    await expect(page.locator('.station-home')).toBeVisible();
    await expect(page.locator('.rule-hint')).toHaveCount(0);
    await page.getByRole('button', { name: '信号卡册', exact: true }).click();
    await page.getByRole('button', { name: '小规则', exact: true }).click();
    await expect(page.locator('[data-rule]')).toHaveCount(5);
  });
});

test.describe('whole-syllable question', () => {
  test('zhi / chi / yi / wu are heard as real recordings and picked like any other letter', async ({ page }, info) => {
    test.setTimeout(90_000);
    const choices = ['zhi', 'chi', 'yi', 'wu'].filter((id) => bank.letters.some((l) => l.id === id));
    await open(page, (s) => (s.settings.lesson = 8), [q('A', 'zhi', choices, 8), q('A', 'wu', choices, 8)]);
    await expect(page.locator('.pinyin-key')).toHaveText(choices);
    await shot(page, 'whole', info.project.name);
    // the question says its small instruction, then plays the sound of the letter by itself (a real recording, quietly: no subtitle)
    const count = async () => (await heard(page)).filter((x) => x.ids.includes('py.syl.zhi1')).length;
    await expect.poll(count, { timeout: 20000 }).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(500);
    const first = await count();
    await page.getByRole('button', { name: '听来信' }).click(); // ... and again on request
    await expect.poll(count, { timeout: 10000 }).toBeGreaterThan(first);
    await page.locator('[data-choice="chi"]').click();
    await expect(page.locator('[data-choice="chi"]')).toHaveClass(/miss/);
    await page.locator('[data-choice="zhi"]').click();
    await expect(page.locator('[data-choice="zhi"]')).toHaveClass(/ok/);
    const h = await heard(page);
    noDeviceVoice(h);
    for (const x of h) for (const id of x.ids) if (id.startsWith('py.syl.')) expect(manifest[id].synthetic).toBeFalsy();
    for (const x of h.filter((y) => y.ids.includes('py.syl.zhi1'))) expect(x.sub, 'the sound is not printed').not.toMatch(/zh/);
  });
});

test.describe('minimal-pair confusions of stage 3', () => {
  const NEW = ['d-p', 'f-t', 'm-n', 'ai-ei', 'ao-ou', 'ui-iu', 'ie-ve', 'an-en', 'in-un'];
  const live = NEW.map((k) => bank.confusions.find((c) => c.pair.join('-') === k)!);
  const tipClip = (c: (typeof live)[number]) => (manifest[`py.tip.${c.pair.join('-')}`] ? [`py.tip.${c.pair.join('-')}`] : []);
  const active = (c: (typeof live)[number]) => c.minimalPairs.find((p) => p.every((id) => manifest[`py.syl.${id}`]));
  test('a wrong answer shows the tip as text with the two letters, then the two real call sounds (no robot, no device voice)', async ({ page }, info) => {
    test.setTimeout(150_000);
    const pairs = live.filter(active);
    test.skip(!pairs.length, 'waiting for audio: no stage-3 pair has two recorded syllables yet');
    expect(pairs.length, 'every new pair has two recorded syllables').toBe(NEW.length);
    const queue = pairs.map((c) => {
      const [target] = active(c)!;
      return { ...q('B', target, active(c)!, 12), id: `B:${c.pair.join('-')}`, skill: `pair:${c.pair.join('|')}:hear` } as Question;
    });
    await open(page, (s) => (s.settings.lesson = 12), queue);
    for (const c of pairs) {
      const [target, other] = active(c)!;
      await page.waitForTimeout(400);
      const calls = c.pair.map((id) => bank.letters.find((l) => l.id === id)!.callSound);
      const from = await mark(page);
      await page.locator(`[data-choice="${other}"]`).click();
      await expect(page.locator('.feedback')).toContainText(c.tip);
      const lead = tipClip(c); // the tip is read by the companion when it has a recording, else it stays a silent subtitle
      await expect.poll(() => page.evaluate((f) => (window as any).__aud.length - f, from), { timeout: 20000 }).toBeGreaterThanOrEqual(lead.length + calls.length);
      await page.waitForTimeout(900);
      const h = await heard(page, from);
      const ids = h.map((x) => x.ids.find((id) => id.startsWith('py.')));
      // the tip (if recorded), then the two letters as their real call sounds
      expect(ids.slice(0, lead.length + calls.length), c.pair.join('-')).toEqual([...lead, ...calls.map((cs) => `py.syl.${cs}`)]);
      noDeviceVoice(h);
      await expect(page.locator('.tip-chip')).toHaveText(c.pair.map((id) => id.replace('v', 'ü')));
      expect(c.tip).toMatch(/左边这个.*右边这个|右边这个.*左边这个/);
      calls.forEach((cs, i) => expect(h[lead.length + i].lit, `lit ${i}`).toEqual([cs]));
      if (c === pairs[0]) await shot(page, `tip-${c.pair.join('-')}`, info.project.name);
      // the right one is still to be found: tapping it moves the programme on
      await page.waitForTimeout(500);
      await page.locator(`[data-choice="${target}"]`).click();
      await expect(page.locator(`[data-choice="${target}"]`)).toHaveClass(/ok/);
      if (c !== pairs[pairs.length - 1]) await page.getByRole('button', { name: '接下一条', exact: true }).click({ timeout: 10000 });
    }
  });
});

test.describe('字形对对碰', () => {
  test('one big letter on a card, the identical key lights up, the others only dim; nothing is played', async ({ page }, info) => {
    test.setTimeout(90_000);
    await open(page, (s) => (s.settings.lesson = 6), [q('I', 'd', ['b', 'd', 'p', 'q'], 6), q('I', 'q', ['p', 'q', 'b', 'd'], 6)]);
    await expect(page.locator('.glyph-target')).toHaveText('d');
    await expect(page.locator('.glyph-key')).toHaveCount(4);
    await expect(page.locator('.instruction')).toHaveAttribute('data-line', 'py.I');
    await shot(page, 'glyph', info.project.name);
    const from = await mark(page);
    await page.locator('.glyph-key[data-choice="b"]').click();
    await expect(page.locator('.glyph-key[data-choice="b"]')).toHaveClass(/miss/);
    await page.locator('.glyph-key[data-choice="d"]').click();
    await expect(page.locator('.glyph-key[data-choice="d"]')).toHaveClass(/ok/);
    await expect(page.locator('.feedback')).toBeVisible();
    await page.waitForTimeout(600);
    const h = await heard(page, from);
    noDeviceVoice(h);
    for (const x of h) for (const id of x.ids) expect(id.startsWith('py.syl.'), `${id} is not a sound to imitate`).toBe(false);
    await noSideways(page);
    const s = await saved(page);
    expect(Object.keys(s.mastery ?? s.skills ?? {}).some((k) => k.startsWith('glyph:d')) || JSON.stringify(s.history).includes('glyph:d:see')).toBe(true);
    await page.getByRole('button', { name: '接下一条', exact: true }).click();
    await expect(page.locator('.glyph-target')).toHaveText('q');
    await page.locator('.glyph-key[data-choice="q"]').click();
    await expect(page.locator('.glyph-key[data-choice="q"]')).toHaveClass(/ok/);
  });
});
