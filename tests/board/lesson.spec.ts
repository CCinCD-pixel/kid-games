// 课播放器端到端（WebKit；游乐场 /dev/board/?lesson=Lxx）：机器人用真触摸 / 点击按"引擎答案"通关真实课程（lessons.v1.json），
// 检查答题按钮条在视口内、不压棋盘与控制面板、按钮 ≥44 px；截图给人眼看。
import { expect, test, type Page } from '@playwright/test';
import { boardPage } from '../../engines/board/test/pw';
import { xqRules } from '../../engines/board/test/reference/xq-adapter.mjs';
import { makeXqLessonData } from '../../engines/board/test/xq-lesson-core';
import { lessonTask } from '../../engines/board/lesson/steps-move';
import { guessable } from '../../engines/board/lesson/steps-ask';
import { twinOf } from '../../engines/board/lesson/twins';
import type { LessonStep } from '../../engines/board/lesson/registry';
import { readFileSync } from 'node:fs';
import { SHOTS_DIR } from './playwright.config';

/* eslint-disable @typescript-eslint/no-explicit-any */
const readJson = (n: string): any => JSON.parse(readFileSync(new URL(`../../engines/board/test/fixtures/${n}`, import.meta.url), 'utf8'));
const xqLessons: { id: string; steps: LessonStep[] }[] = readJson('xq-lessons.v1.json').lessons; const rules = xqRules(); const data = makeXqLessonData(rules, readJson('xq-puzzles.v1.json')); const SAFE = '24,0,20,0';
const errs = new WeakMap<Page, string[]>();
async function open(page: Page, lesson: string): Promise<ReturnType<typeof boardPage>> {
  const list: string[] = []; errs.set(page, list); page.on('pageerror', (e) => list.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
  await page.goto(`/dev/board/?mute=1&safe=${SAFE}&bot=0&lesson=${lesson}`, { waitUntil: 'networkidle' }); const b = boardPage(page); await b.waitReady(); return b;
}
async function waitStep(page: Page, id: string): Promise<void> {
  try { await page.waitForFunction((x) => (window as any).__board.lesson.state.step === x, id, { timeout: 20000 }); } catch (e) { const st = await page.evaluate(() => ({ s: (window as any).__board.lesson.state, ev: (window as any).__board.events.slice(-12) })); throw new Error(`等不到步骤 ${id}：${JSON.stringify(st).slice(0, 700)}`); }
}
const sqNames = (enc: string): [string, string] => { const m = /^([a-z]\d{1,2})([a-z]\d{1,2})/.exec(enc)!; return [m[1], m[2]]; };
async function checkBar(page: Page, name: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.bk-su-btn')] as HTMLElement[]; if (!btns.length) return 'no buttons'; const board = (document.querySelector('.bk-board') as HTMLElement).getBoundingClientRect(); const panel = (document.getElementById('panel') as HTMLElement).getBoundingClientRect(); const out: string[] = [];
    const hit = (a: DOMRect, b: DOMRect): boolean => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    for (const el of btns) { const r = el.getBoundingClientRect(); if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) out.push(`${el.textContent} 出屏 ${JSON.stringify(r)}`); if (r.height < 44 || r.width < 44) out.push(`${el.textContent} 太小 ${r.width}×${r.height}`); if (hit(r, board)) out.push(`${el.textContent} 压棋盘`); if (hit(r, panel)) out.push(`${el.textContent} 压面板`); }
    return out.join('; ') || null;
  }); expect(bad, name).toBeNull();
}
async function solve(page: Page, b: ReturnType<typeof boardPage>, step: LessonStep): Promise<void> {
  const k = step.k; const c = { rules, data } as any;
  if (['stars', 'capture', 'sweep', 'escape', 'make', 'trade'].includes(k)) {
    const T = lessonTask<unknown, unknown>(k as 'stars', step, c); let node = T.start;
    for (let i = 0; i < 12; i++) { const m = T.best(node)!; const j = T.judge(node, m); const [a, z] = sqNames(rules.encode(m as never)); await b.tapSq(a); await b.tapSq(z); await b.waitIdle(); node = j.next; if (j.done) return; }
  } else if (k === 'tap') for (const n of step.targets as string[]) await b.tapSq(n);
  else if (k === 'quiz') { if (Array.isArray(step.answer)) for (const n of step.answer as string[]) await b.tapSq(n); else { await page.waitForSelector(`.bk-su-btn[data-id="${step.answer as string}"]`); await checkBar(page, step.id); await page.locator(`.bk-su-btn[data-id="${step.answer as string}"]`).first().tap(); } }
  else if (k === 'setup') for (const [n] of data.setup!(step.part as string, step)!.place) await b.tapSq(n);
  else if (k === 'card') { await page.locator(`.bk-su-btn[data-id="card-${step.id}"]`).tap(); }
}
async function runLesson(page: Page, b: ReturnType<typeof boardPage>, id: string, shots?: { prefix: string; atKinds: string[] }): Promise<void> {
  const lesson = xqLessons.find((l) => l.id === id)!; const shot = new Set<string>();
  for (const step of lesson.steps) {
    if (step.k === 'battle') continue; await waitStep(page, step.id); await page.waitForTimeout(80);
    if (shots?.atKinds.includes(step.k) && !shot.has(step.k)) { shot.add(step.k); await page.waitForTimeout(250); await page.screenshot({ path: `${SHOTS_DIR}/${shots.prefix}-${id}-${step.k}.png` }); }
    await solve(page, b, step);
    if (step.twin === 'mirror' && step.k === 'quiz' && guessable(step)) { const t = twinOf(step, rules as never, () => null, step.pos ?? data.position!(step)); await waitStep(page, t!.id); await page.waitForTimeout(80); await solve(page, b, t!); }
  }
  await page.waitForFunction(() => (window as any).__board.lesson.state.done, null, { timeout: 20000 });
}
const stateOf = (page: Page): Promise<any> => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__board.lesson.state)));

for (const id of ['L03', 'L04', 'L17']) {
  test(`课 ${id}：机器人用真触摸通关 ★★★，按钮条不出屏不压棋盘`, async ({ page }, info) => {
    const b = await open(page, id); await runLesson(page, b, id, { prefix: info.project.name, atKinds: ['quiz', 'setup', 'stars', 'make'] });
    const st = await stateOf(page); expect(st.error).toBe(''); expect(st.done).toBe(true); expect(st.stars).toBe(3); expect(errs.get(page)).toEqual([]);
    expect(await b.expectNoOverflow()).toBeNull(); expect(await b.expectInViewport()).toBeNull();
  });
}
test('课 L24（小眼睛 / 吃子安全）与 L22（吃一个看赚亏：筹码）', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipadP' && info.project.name !== 'phoneP', '只在两个竖屏跑，省时间');
  for (const id of ['L24', 'L22']) { const b = await open(page, id); await runLesson(page, b, id, { prefix: info.project.name, atKinds: ['sweep', 'trade', 'quiz'] }); const st = await stateOf(page); expect(st.error).toBe(''); expect(st.done).toBe(true); expect(errs.get(page)).toEqual([]); }
});
test('取消课：cancel() 后输入归还给游乐场（可以正常走子）', async ({ page }) => {
  const b = await open(page, 'L04'); await waitStep(page, 'L04.1'); await page.evaluate(() => (window as any).__board.lesson.cancel()); await page.waitForTimeout(100); await page.evaluate(() => (window as any).__board.setFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w'));
  await b.waitIdle(); await b.tapSq('b3'); await b.tapSq('b10'); await b.waitIdle(); expect((await b.state()).encoded).toEqual(['b3b10']);
});

test('走错：不算数的着法走过去 → 悔回原位 → 连续 2 次后亮出提示（H1）；不出现任何"错"字', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipadP', '一个视口足够');
  const b = await open(page, 'L17'); await waitStep(page, 'L17.1'); await page.waitForTimeout(80); const step = xqLessons.find((l) => l.id === 'L17')!.steps[0]; const T = lessonTask<unknown, unknown>('make', step, { rules, data } as any);
  const bad = rules.legalMoves(T.start.s as never).filter((m) => !T.judge(T.start, m).ok); const pieces = async (): Promise<string> => page.evaluate(() => JSON.stringify(((window as any).__board.view.debug().pieces as any[]).map((p) => `${p.sq}:${p.type}:${p.side}`).sort()));
  const before = await pieces();
  for (let i = 0; i < 2; i++) { const [a, z] = sqNames(rules.encode(bad[i] as never)); await b.tapSq(a); await b.tapSq(z); await page.waitForTimeout(900); expect(await pieces(), `第 ${i + 1} 次悔回`).toBe(before); }
  const marks = await page.evaluate(() => ((window as any).__board.view.debug().marks as { kind: string }[]).map((m) => m.kind)); expect(marks).toContain('hint');
  expect(await page.evaluate(() => document.body.innerText.includes('错'))).toBe(false); expect(errs.get(page)).toEqual([]);
  await page.screenshot({ path: `${SHOTS_DIR}/ipadP-L17-wrong-hint.png` });
});
