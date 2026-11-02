/** Shared helpers for the arithmetic-station browser tests: boot, seeded saves, a DOM-reading solver, an audio spy that only records. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const SHOTS = process.env.MATH_SHOTS || path.join(os.homedir(), 'kid-games-work/shots/math-v2');
export const MUTE_SCRIPT = path.join(ROOT, 'tools/qa/mute-audio.js');

/** Records every clip that is started (decoded buffer → url) without making any sound: the kit already routes output to a zero-gain node under automation. */
export const AUDIO_SPY = `(() => {
  const bufferUrl = new WeakMap(); const arrayUrl = new WeakMap(); window.__spoken = [];
  const arr = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = async function () { const buf = await arr.call(this); if (this.url) arrayUrl.set(buf, this.url); return buf; };
  const decode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (data, ...rest) {
    const url = arrayUrl.get(data);
    const p = decode.call(this, data, ...rest);
    return Promise.resolve(p).then((b) => { if (b && url) bufferUrl.set(b, url); return b; });
  };
  window.__utterances = []; const Utter = window.SpeechSynthesisUtterance;   // any device-voice attempt would create one
  if (Utter) window.SpeechSynthesisUtterance = function (text) { window.__utterances.push(String(text)); return new Utter(text); };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer && bufferUrl.get(this.buffer)) window.__spoken.push(new URL(bufferUrl.get(this.buffer)).pathname); return start.apply(this, a); };
})();`;

export interface SeedSave {
  best?: Record<string, number>; plays?: Record<string, number>; run?: unknown; placed?: Record<string, number>; fast?: Record<string, unknown>; lastSec?: Record<string, number>;
}
/** Put a save in place before the page loads (only when none exists yet, so reloads keep progress). */
export async function seed(page: Page, data: SeedSave | null, version = 2): Promise<void> {
  if (data === null) return;
  await page.addInitScript(([payload, v]) => {
    if (!localStorage.getItem('kg:v1:mars-arithmetic')) localStorage.setItem('kg:v1:mars-arithmetic', JSON.stringify({ v, updatedAt: Date.now(), data: payload }));
  }, [{ best: {}, plays: {}, run: null, placed: {}, fast: {}, lastSec: {}, ...data }, version] as const);
}
export const OPEN_ALL: SeedSave = { placed: { add: 9, sub: 9, mul: 9, div: 9 }, best: { 'mix-1': 8, 'mix-2': 8, 'mix-3': 8 } };

export async function boot(page: Page, spy = false): Promise<void> {
  if (spy) await page.addInitScript(AUDIO_SPY);
  await page.goto('/mars-base/?mute=1');
  await expect(page.locator('#app[data-ready]')).toBeVisible();
  await press(page, '.kit-start__go');
  await expect(page.locator('.kit-start')).toBeHidden();
  await expect(page.locator('.ma-track').first()).toBeVisible();
}

let shotCount = 0;
export async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  if (process.env.MATH_SHOTS === '0') return;
  const dir = path.join(SHOTS, info.project.name);
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(dir, `${String(++shotCount).padStart(2, '0')}-${name}.png`) });
}

// ---------------------------------------------------------------- reading and solving problems from the screen
type Tok = { k: 'n' | 'op' | 'box'; v: string };
const OPS: Record<string, string> = { '+': '+', '−': '-', '×': '*', '÷': '/' };
export async function readTokens(page: Page, scope: string): Promise<Tok[]> {
  const raw = await page.$$eval(`${scope} .ma-n, ${scope} em, ${scope} .ma-box`, (els) => els.map((e) => (e.classList.contains('ma-box') ? { k: 'box', v: '' } : e.tagName === 'EM' ? { k: 'op', v: e.textContent ?? '' } : { k: 'n', v: e.textContent ?? '' })));
  return (raw as Tok[]).filter((t) => t.v !== '…');
}
function evaluate(tokens: Tok[]): number {
  const nums: number[] = [], ops: string[] = [];
  for (const t of tokens) { if (t.k === 'n') nums.push(Number(t.v)); else if (t.k === 'op') ops.push(OPS[t.v]); }
  const stack = [nums[0]], rest: string[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i] === '*') stack[stack.length - 1] *= nums[i + 1];
    else if (ops[i] === '/') stack[stack.length - 1] /= nums[i + 1];
    else { rest.push(ops[i]); stack.push(nums[i + 1]); }
  }
  return rest.reduce((acc, op, i) => (op === '+' ? acc + stack[i + 1] : acc - stack[i + 1]), stack[0]);
}
export type Answer = { fields: number[] } | { cmp: -1 | 0 | 1 };
export function solveTokens(tokens: Tok[]): Answer {
  const eq = tokens.findIndex((t) => t.k === 'op' && t.v === '=');
  if (eq < 0) {                                         // compare: left box right
    const b = tokens.findIndex((t) => t.k === 'box');
    const l = evaluate(tokens.slice(0, b)), r = evaluate(tokens.slice(b + 1));
    return { cmp: Math.sign(l - r) as -1 | 0 | 1 };
  }
  const left = tokens.slice(0, eq), right = tokens.slice(eq + 1);
  if (right.filter((t) => t.k === 'box').length === 2) { const v = evaluate(left); const [a, b] = [left[0], left[2]].map((t) => Number(t.v)); return { fields: [Math.floor(a / b), a % b] }; void v; }
  if (right.some((t) => t.k === 'box')) return { fields: [evaluate(left)] };
  const c = Number(right[0].v);                          // fill: one blank on the left
  const [x, op, y] = left;
  if (x.k === 'box') return { fields: [op.v === '+' ? c - Number(y.v) : op.v === '−' ? c + Number(y.v) : op.v === '×' ? c / Number(y.v) : c * Number(y.v)] };
  return { fields: [op.v === '+' ? c - Number(x.v) : op.v === '−' ? Number(x.v) - c : op.v === '×' ? c / Number(x.v) : Number(x.v) / c] };
}

/** `touch: true` makes every helper press with a finger (page.touchscreen.tap at the middle of the button, after checking that the button really is what is under the fingertip). */
export const input = { touch: false };
export async function press(page: Page, target: Locator | string): Promise<void> {
  const loc = typeof target === 'string' ? page.locator(target) : target;
  if (!input.touch) { await loc.click(); return; }
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (!box) throw new Error(`no box for ${String(target)}`);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const covered = await loc.evaluate((el, [px, py]) => { const top = document.elementFromPoint(px as number, py as number); return !top || !(top === el || el.contains(top)); }, [x, y]);
  if (covered) throw new Error(`a finger at ${Math.round(x)},${Math.round(y)} would not hit ${String(target)}: something covers it`);
  await expect(loc).toBeEnabled();
  await page.touchscreen.tap(x, y);
}

/** Layout facts that must hold on every work screen, at every step: the main button and the keys are fully in the viewport without scrolling, and the button is at least 44 px high. */
export const fit = { problems: [] as string[] };
export async function checkFit(page: Page, what: string): Promise<void> {
  const r = await page.evaluate(() => {
    const pg = document.querySelector('.ma-page') as HTMLElement | null;
    if (pg) pg.scrollTop = 0;
    const vh = document.documentElement.clientHeight, vw = document.documentElement.clientWidth;
    const rect = (sel: string) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height) }; };
    const clone = document.querySelector('#app')?.cloneNode(true) as HTMLElement | undefined;                 // the robot's own drawing (a sleepy z) is not text
    clone?.querySelectorAll('.ma-bot-host').forEach((e) => e.remove());
    const text = clone?.textContent ?? '';
    return { vh, vw, text, primary: rect('.ma-primary'), pad: rect('.ma-keypad') ?? rect('.ma-cmp') ?? rect('.ma-feedback'), step: rect('.ma-step'), qno: document.querySelector('.ma-qno')?.textContent ?? '' };
  });
  const bad: string[] = [];
  const inView = (b: { t: number; b: number; l: number; r: number } | null) => !b || (b.t >= -1 && b.b <= r.vh + 1 && b.l >= -1 && b.r <= r.vw + 1);
  if (!inView(r.primary)) bad.push(`button ${JSON.stringify(r.primary)}`);
  if (r.primary && r.primary.h < 44) bad.push(`button only ${r.primary.h}px high`);
  if (!inView(r.pad)) bad.push(`keys ${JSON.stringify(r.pad)}`);
  if (!inView(r.step)) bad.push(`step ${JSON.stringify(r.step)}`);
  if (/[A-Za-z]/.test(r.text)) bad.push(`Latin letters on screen: ${r.text.match(/\S*[A-Za-z]\S*/)?.[0]}`);
  const grown = r.text.match(/首答|带做|变式|复练|解锁|成绩单|余/);                             // grown-up words the child should not meet
  if (grown) bad.push(`grown-up word on screen: ${grown[0]}`);
  if (bad.length) fit.problems.push(`${what} [${r.qno}] viewport ${r.vw}x${r.vh}: ${bad.join('; ')}`);
}

/** QA-02/06: on a result screen every action button is fully inside the viewport (no scrolling), at least 44 px high, and no sentence is shown twice */
export async function checkResultFit(page: Page, what: string): Promise<void> {
  const r = await page.evaluate(() => {
    const pg = document.querySelector('.ma-page') as HTMLElement | null;
    if (pg) pg.scrollTop = 0;
    const vh = document.documentElement.clientHeight, vw = document.documentElement.clientWidth;
    const buttons = [...document.querySelectorAll('.ma-result-actions button')].map((b) => { const q = b.getBoundingClientRect(); return { label: (b.textContent ?? '').trim(), t: Math.round(q.top), b: Math.round(q.bottom), l: Math.round(q.left), r: Math.round(q.right), h: Math.round(q.height) }; });
    const clone = document.querySelector('#app')?.cloneNode(true) as HTMLElement | undefined;
    clone?.querySelectorAll('.ma-bot-host, .ma-result-actions').forEach((e) => e.remove());
    return { vh, vw, buttons, text: clone?.textContent ?? '' };
  });
  const bad: string[] = [];
  if (!r.buttons.length) bad.push('no action buttons');
  for (const b of r.buttons) if (b.t < -1 || b.b > r.vh + 1 || b.l < -1 || b.r > r.vw + 1 || b.h < 44) bad.push(`${b.label} ${JSON.stringify(b)}`);
  const sentences = r.text.split(/[。！？]/).map((x) => x.trim()).filter((x) => x.length >= 6);
  const dup = sentences.find((x, i) => sentences.indexOf(x) !== i);
  if (dup) bad.push(`sentence twice: ${dup}`);
  if (bad.length) fit.problems.push(`${what} viewport ${r.vw}x${r.vh}: ${bad.join('; ')}`);
}
/** text the child reads that is smaller than `min` px (elements with their own visible text) */
export async function smallText(page: Page, min = 14): Promise<string[]> {
  return page.evaluate((limit) => {
    const out = new Set<string>();
    for (const el of document.querySelectorAll('#app *')) {
      if (el.closest('.ma-bot-host') || el.closest('svg')) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0);
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.fontSize) < limit) { if (cs.display !== 'none' && cs.visibility !== 'hidden') out.add(`${el.className || el.tagName} ${cs.fontSize} "${(el.textContent ?? '').trim().slice(0, 12)}"`); }
    }
    return [...out];
  }, min);
}

export async function typeNumber(page: Page, value: number | string): Promise<void> { for (const d of String(value)) await press(page, `[data-key="${d}"]`); }
/** Solve (or deliberately miss) whatever is being asked right now: a step of 拆一拆, or the problem itself. */
export async function answerNow(page: Page, right = true): Promise<void> {
  const scope = (await page.locator('.ma-step-eq').count()) ? '.ma-step-eq' : '.ma-equation';
  await checkFit(page, scope === '.ma-step-eq' ? 'guide step' : 'question');
  const answer = solveTokens(await readTokens(page, scope));
  const primary = page.locator('.ma-primary');
  if ('cmp' in answer) {
    const pick = right ? answer.cmp : ((answer.cmp + 2) % 3 - 1) as -1 | 0 | 1;
    await press(page, `[data-cmp="${pick}"]`);
  } else {
    const values = right ? answer.fields : answer.fields.map((v) => v + 1);
    await typeNumber(page, values[0]);
    if (values.length === 2) { await press(page, primary); await typeNumber(page, values[1]); }
  }
  await press(page, primary);
}
export async function nextQuestion(page: Page): Promise<void> { await checkFit(page, 'feedback'); await press(page, '.ma-primary[data-action="next"]'); }

/** Play the open round to the end (every question right unless `miss` says otherwise). Returns the number of questions seen. */
export async function finishRound(page: Page, opts: { miss?: (n: number) => boolean } = {}): Promise<number> {
  let n = 0;
  for (let guard = 0; guard < 80; guard++) {
    if (await page.locator('.ma-result-body').count()) { await checkResultFit(page, 'result'); return n; }
    if (await page.locator('.ma-feedback').count()) { await nextQuestion(page); continue; }
    const scored = /^第/.test((await page.locator('.ma-qno').innerText()).trim());
    const miss = scored && !!opts.miss?.(n);
    if (scored && !(await page.locator('.ma-step-eq').count())) n++;
    await answerNow(page, !miss);
    if (miss) {
      // a miss on a 拆一拆 problem opens the guide; on others it asks to try again
      if (await page.locator('.ma-step-eq').count()) {
        await answerNow(page, false); await answerNow(page, false);                        // two misses on a step: the note shows 看这一步的答案 (the tallest guide state)
        await checkFit(page, 'guide step with the show-answer button');
        continue;
      }
      await answerNow(page, false);                                                        // a second miss: the note now also has the 看答案 button (the tallest state)
      await answerNow(page, true);
    }
  }
  throw new Error('round did not finish');
}

export async function noOverflow(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, page: (document.querySelector('.ma-page') as HTMLElement | null)?.scrollWidth ?? 0, pw: (document.querySelector('.ma-page') as HTMLElement | null)?.clientWidth ?? 0 }));
  expect(o.w, 'document overflows horizontally').toBeLessThanOrEqual(o.cw + 1);
  expect(o.page, '.ma-page overflows horizontally').toBeLessThanOrEqual(o.pw + 1);
}
/** every visible button of the game is at least 44 × 44 px */
export async function bigTargets(page: Page): Promise<string[]> {
  return page.$$eval('#app button', (els) => els.filter((b) => { const r = b.getBoundingClientRect(); const s = getComputedStyle(b); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && (r.width < 43.5 || r.height < 43.5); }).map((b) => `${b.className || b.tagName}:${b.textContent?.trim().slice(0, 10)} ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`));
}
export const saveOf = async (page: Page): Promise<any> => page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:mars-arithmetic') || 'null'));
