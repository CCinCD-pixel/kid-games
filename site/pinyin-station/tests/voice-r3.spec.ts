import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { instrument } from '../../../tests/smoke/helpers';
import { initialSave } from '../src/domain/learning';
import { bank } from '../src/domain/content';
import type { Question, Save } from '../src/domain/types';

/**
 * Round 3 (dad, 2026-11-01): the robot says ordinary sentences only; every sound to imitate is a REAL recording.
 * An "eavesdropper" (a spy on Web Audio that only records, never plays) lists, for every mnemonic card and every tip:
 * the clips that really started, the subtitle shown while each started, and which letter was lit on the screen.
 *
 * The audio files of the 17 rewritten lines are still the OLD recordings until the voice step re-synthesises them, so the
 * manifest text of those ids is stale. The test serves the manifest with exactly the change the voice step will make
 * (the new text of the rewritten lines, same files) and checks the UI against that. No sound is ever played.
 */
test.use({ serviceWorkers: 'block' });
const root = fileURLToPath(new URL('../../../', import.meta.url));
const yaml = JSON.parse(fs.readFileSync(path.join(root, 'content/narration/pinyin-station.yaml'), 'utf8')) as { lines: { id: string; text: string }[] };
const manifestFile = JSON.parse(fs.readFileSync(path.join(root, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8')) as Record<string, { src: string; text: string; synthetic?: boolean }>;
const manifest = Object.fromEntries(Object.entries(manifestFile).map(([id, c]) => [id, { ...c, text: yaml.lines.find((l) => l.id === id)?.text ?? c.text }]));
const evidence = process.env.KG_EVIDENCE_DIR;
const keep = (name: string, rows: unknown) =>
  evidence && fs.writeFileSync(path.join(evidence, `${name}-${test.info().project.name}.json`), JSON.stringify(rows, null, 1));

const SPY = `(() => {
  const log = (window.__aud = []);
  const abUrl = new WeakMap(), bufUrl = new WeakMap();
  const sub = () => { const el = document.querySelector('.kit-subtitle__text'); return el ? el.innerText.trim() : ''; };
  const rel = (u) => (u || '').replace(location.origin, '');
  const arr = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = function () { const url = this.url; return arr.call(this).then((ab) => { try { abUrl.set(ab, url); } catch {} return ab; }); };
  const BAC = window.BaseAudioContext || window.webkitBaseAudioContext;
  const dec = BAC.prototype.decodeAudioData;
  BAC.prototype.decodeAudioData = function (ab, ok, err) {
    const url = abUrl.get(ab); const p = dec.call(this, ab, ok, err);
    return p && p.then ? p.then((buf) => { if (url) bufUrl.set(buf, url); return buf; }) : p;
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    const e = { src: rel(this.buffer ? bufUrl.get(this.buffer) : ''), lit: [...document.querySelectorAll('.tip-chip.active')].map((c) => c.dataset.clip), focus: [...document.querySelectorAll('.tip-chip.focus')].map((c) => c.dataset.side), sub: '' };
    log.push(e);
    setTimeout(() => (e.sub = sub()), 90);
    return start.apply(this, a);
  };
  const say = window.speechSynthesis && speechSynthesis.speak.bind(speechSynthesis);
  if (say) speechSynthesis.speak = (u) => { log.push({ speech: u.text }); try { u.volume = 0; } catch {} say(u); };
})();`;
const idOfSrc = (src: string) => Object.entries(manifest).filter(([, c]) => src.endsWith(c.src)).map(([id]) => id);
type Heard = { ids: string[]; lit: string[]; focus: string[]; sub: string; speech?: string };
const heard = async (page: Page, from: number): Promise<Heard[]> =>
  (await page.evaluate((n) => (window as any).__aud.slice(n), from)).map((e: any) => ({ ids: e.speech ? [] : idOfSrc(e.src), lit: e.lit ?? [], focus: e.focus ?? [], sub: e.sub ?? '', speech: e.speech }));
const mark = (page: Page) => page.evaluate(() => (window as any).__aud.length as number);

async function open(page: Page, queue: Question[] | null, tweak: (s: Save) => void = () => undefined) {
  const s = initialSave();
  s.tutorial = { A: true, B: true, C: true, D: true, E: true, F: true, G: true };
  tweak(s);
  if (queue) s.resume = { mode: 'today', queue, index: 0, at: Date.now() };
  await instrument(page);
  await page.addInitScript(SPY);
  await page.addInitScript((data) => localStorage.setItem('kg:v1:pinyin-station', JSON.stringify({ v: 1, updatedAt: Date.now(), data })), s);
  await page.route(/pinyin-station\/audio-manifest\.json/, async (route) => {
    const res = await route.fetch();
    const m = (await res.json()) as Record<string, { text: string; words?: unknown }>;
    for (const l of yaml.lines)
      if (m[l.id] && m[l.id].text !== l.text) {
        m[l.id].text = l.text; // what the voice step will write ...
        delete m[l.id].words; // ... (the old word timings belong to the old sentence)
      }
    await route.fulfill({ response: res, json: m });
  });
  await page.goto('/pinyin-station/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await expect(page.locator('.kit-start')).toHaveCount(0);
}
/** Wait until `n` clips started after `from`, then a moment more to be sure nothing else follows. */
async function until(page: Page, from: number, n: number, ms = 20000) {
  await expect.poll(() => page.evaluate((f) => (window as any).__aud.length - f, from), { timeout: ms }).toBeGreaterThanOrEqual(n);
  await page.waitForTimeout(n ? 700 : 2500);
}
const robotOnly = (h: Heard[]) => h.filter((x) => x.ids.length && !x.ids.some((id) => id.startsWith('py.syl.')));

test.describe('mnemonic cards: a plain sentence, then the real call-sound recording', () => {
  // the 8 rewritten ones, a normal one, a 2-letter initial, er (real recording is ér), a lesson 9+ card, and eng (no recording yet)
  const cards = ['a', 'o', 'e', 'i', 'u', 'v', 'y', 'w', 'b', 'zh', 'er', 'ai', 'eng'];
  test('clip sequence, subtitle and silence of the robot for every card', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page, null, (s) => (s.settings.lesson = 13));
    await page.getByRole('button', { name: '信号卡册', exact: true }).click();
    const rows: unknown[] = [];
    for (const id of cards) {
      const letter = bank.letters.find((l) => l.id === id)!;
      const mnemonic = `py.mnemonic.${id}`;
      const call = `py.syl.${letter.callSound}`;
      const expected = [...(manifest[mnemonic] ? [mnemonic] : []), ...(manifest[call] ? [call] : [])];
      const card = page.locator(`.signal-card[data-letter="${id}"]`);
      await card.scrollIntoViewIfNeeded();
      const from = await mark(page);
      await card.tap();
      await until(page, from, expected.length);
      const h = await heard(page, from);
      rows.push({ card: id, clips: h.map((x) => x.ids.join('/')), subtitles: h.map((x) => x.sub) });
      // 1. exactly the expected clips, in this order: the mnemonic sentence first, then the real recording
      expect(h, `card ${id}: clips ${JSON.stringify(h.map((x) => x.ids))}`).toHaveLength(expected.length);
      h.forEach((x, i) => expect(x.ids, `card ${id} clip ${i}`).toContain(expected[i]));
      // 2. the only robot speech is the mnemonic sentence; the sound itself is a real recording; no device voice
      expect(robotOnly(h).map((x) => x.ids), `card ${id}`).toEqual(manifest[mnemonic] ? [[mnemonic]] : []);
      for (const x of h) {
        expect(x.speech, `card ${id} device voice`).toBeUndefined();
        for (const clipId of x.ids) if (clipId !== mnemonic) expect(manifest[clipId]?.synthetic, `${clipId} is a real recording`).toBeFalsy();
      }
      // 3. the subtitle is the sentence that is said (no letters), then the text of the recording that is heard
      if (expected[0] === mnemonic) {
        expect(h[0].sub, `card ${id} subtitle`).toBe(letter.mnemonic);
        expect(h[0].sub).not.toMatch(/[A-Za-z]/);
      }
      if (manifest[call]) expect(h[h.length - 1].sub, `card ${id} call-sound subtitle`).toBe(manifest[call].text);
      // 4. the card carries the same words and the label of the recording that plays
      await expect(card.locator('small')).toHaveText(letter.mnemonic);
    }
    // er: the label and the subtitle both say ér (the recording is er2); eng: nothing plays and nothing breaks
    await expect(page.locator('.signal-card[data-letter="er"]')).toHaveAttribute('aria-label', /读音 ér$/);
    await expect(page.locator('.signal-card[data-letter="eng"] > span:last-child')).toHaveText('点一点，看看样子');
    await expect(page.locator('.signal-card[data-letter="ong"] > span:last-child')).toHaveText('点一点，看看样子');
    keep('eavesdrop-cards', rows);
  });
});

test.describe('tips: a plain sentence, the two letters on screen, then the real recordings', () => {
  const pairs = bank.confusions.filter((c) => c.pair.every((id) => bank.letters.some((l) => l.id === id)));
  for (const c of pairs) {
    const key = c.pair.join('-');
    test(`tip ${key}`, async ({ page }, info) => {
      test.setTimeout(90_000);
      const [target, other] = c.minimalPairs[0];
      const q: Question = { id: `B:${target}`, kind: 'B', target, skill: `pair:${c.pair.join('|')}:hear`, lesson: 8, phase: 'main', choices: [target, other] };
      await open(page, [q, q], (s) => (s.settings.lesson = 8));
      await page.getByRole('button', { name: '接着上次的节目' }).click();
      await expect(page.locator('.practice')).toBeVisible();
      await page.waitForTimeout(300);
      const calls = c.pair.map((id) => bank.letters.find((l) => l.id === id)!.callSound);
      const from = await mark(page);
      await page.locator(`[data-choice="${other}"]`).click(); // the wrong one -> the hint
      await until(page, from, 2 + calls.length);
      const h = await heard(page, from);
      const tip = `py.tip.${key}`;
      const rows = h.map((x) => ({ clip: x.ids.join('/'), subtitle: x.sub, lit: x.lit, focus: x.focus }));
      keep(`eavesdrop-tip-${key}`, rows);
      // clip sequence: the tip sentence, the two real call sounds in order, then the sound of the question itself
      expect(h.map((x) => x.ids.find((id) => id === tip || id.startsWith('py.syl.'))), key).toEqual([tip, ...calls.map((cs) => `py.syl.${cs}`), `py.syl.${target}`].map((id) => id));
      // the robot says one thing only: the tip; nothing else is TTS and nothing is read by the device voice
      expect(robotOnly(h).map((x) => x.ids), key).toEqual([[tip]]);
      for (const x of h) expect(x.speech).toBeUndefined();
      // subtitles: the tip text, then the same plain caption while both recordings sound; the question's own sound stays silent
      expect(h[0].sub, 'tip subtitle').toBe(c.tip);
      expect(c.tip).not.toMatch(/[A-Za-z]/);
      calls.forEach((cs, i) => {
        expect(h[1 + i].sub, `caption ${i}`).toBe('听一听：先听左边，再听右边。');
        // the letter that lights up is the letter whose recording is playing
        expect(h[1 + i].lit, `lit ${i}`).toEqual([cs]);
      });
      expect(h[1 + calls.length].sub, 'the sound of the question is not printed').not.toMatch(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
      // the screen: the tip text is on screen as written, the two letters are there, the one it points at is marked
      await expect(page.locator('.feedback')).toContainText(c.tip);
      await expect(page.locator('.tip-chip')).toHaveText(c.pair.map((id) => id));
      const focusSides = c.focus === 'both' ? ['left', 'right'] : [c.focus];
      expect(h[0].focus, 'letters marked while the tip is said').toEqual(focusSides);
      if (process.env.KG_SHOTS_R3) await page.screenshot({ path: path.join(process.env.KG_SHOTS_R3, `r3-tip-${key}-${info.project.name}.png`) });
    });
  }
});
