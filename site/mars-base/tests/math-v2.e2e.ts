import { expect, test } from '@playwright/test';
import {
  MUTE_SCRIPT, OPEN_ALL, answerNow, bigTargets, boot, finishRound, fit, input, nextQuestion, noOverflow, press, readTokens, saveOf, seed, shot, solveTokens, typeNumber,
  checkResultFit, smallText,
} from './support';
import { LINES, RUNTIME_LINES } from '../src/math/lines';

test.beforeEach(async ({ context }) => { await context.addInitScript({ path: MUTE_SCRIPT }); });
// every work screen, at every step: the main button and the keys are fully visible without scrolling (collected by support.checkFit)
test.afterEach(() => { const problems = [...fit.problems]; fit.problems.length = 0; input.touch = false; expect(problems).toEqual([]); });

test('home: five lines, 44 segments, placement tip, big targets, no overflow', async ({ page }, info) => {
  await seed(page, {});
  await boot(page);
  await expect(page.locator('[data-track]')).toHaveCount(5);
  await expect(page.locator('.ma-bay-group i')).toHaveCount(44);
  await expect(page.locator('.ma-stage')).toHaveCount(44);
  await expect(page.locator('.ma-tip')).toHaveCount(0);                              // the robot's first caption already says it
  await expect(page.locator('.ma-guide-text')).toContainText('欢迎来到火星算术站');           // first visit: welcome (recorded) + placement tip
  await expect(page.locator('.ma-guide-text')).toContainText('点测起点');
  await expect(page.locator('[data-stage="add-1"]')).toBeEnabled();
  await expect(page.locator('[data-stage="add-2"]')).toBeDisabled();
  await expect(page.locator('[data-stage="mix-1"]')).toBeEnabled();
  await expect(page.locator('[data-stage="mix-2"]')).toBeDisabled();
  await noOverflow(page);
  expect(await bigTargets(page)).toEqual([]);
  if (info.project.name.startsWith('ipad')) expect(await smallText(page), 'iPad: nothing the child reads is under 14 px (home)').toEqual([]);
  await shot(page, info, 'home-top');
  await page.evaluate(() => { document.querySelector('.ma-page')!.scrollTop = 520; });
  await shot(page, info, 'home-tracks');
  await page.evaluate(() => { document.querySelector('.ma-page')!.scrollTop = 99999; });
  await shot(page, info, 'home-bottom');
});

test('stage 1-6 still works with the dot picture; wrong answer, hint, show answer; old v1 save loads', async ({ page }, info) => {
  const old = { v: 1, updatedAt: 1, data: { best: { 'add-1': 8, 'add-2': 6, 'mul-1': 5, 'bogus-9': 3 }, plays: { 'add-1': 2, 'add-2': 1 }, run: { stageId: 'add-3', round: 1, index: 2, correct: 1, retrying: false, attempts: 0, reviews: [], reviewed: 0 } } };
  await page.addInitScript((v) => { if (!localStorage.getItem('kg:v1:mars-arithmetic')) localStorage.setItem('kg:v1:mars-arithmetic', JSON.stringify(v)); }, old);
  await boot(page);
  await expect(page.locator('[data-stage="add-3"]')).toBeEnabled();
  await expect(page.locator('[data-stage="add-4"]')).toBeDisabled();
  await expect(page.locator('[data-stage="mul-2"]')).toBeEnabled();
  await expect(page.locator('[data-action="resume"]')).toContainText('第 3 题');
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('.ma-qno')).toHaveText('第 3 / 8 题');
  await page.locator('[data-key="hint"]').click();
  await expect(page.locator('.ma-model')).toBeVisible();
  await shot(page, info, 'stage3-hint-dots');
  await page.locator('[data-key="hint"]').click();
  for (let i = 0; i < 2; i++) { await page.locator('[data-key="0"]').click(); await page.locator('.ma-primary').click(); }
  await expect(page.locator('.ma-retry-note')).toContainText('再试一次');
  await page.locator('[data-key="0"]').click(); await page.locator('.ma-primary').click();
  await expect(page.locator('[data-action="show-answer"]')).toBeVisible();
  await shot(page, info, 'stage3-retry');
  await page.locator('[data-action="show-answer"]').click();
  await expect(page.locator('.ma-feedback.wrong')).toContainText('正确答案是');
  await nextQuestion(page);
  await expect(page.locator('.ma-score')).toHaveText('一次就对 1');
  const save = await saveOf(page);
  expect(save.v).toBe(2);
  expect(save.data.best['add-2']).toBe(6);
});

test('add-9: warm-up 拆一拆 (path), a wrong step, then a scored round with a miss that opens the guide', async ({ page }, info) => {
  await seed(page, OPEN_ALL);
  await boot(page);
  await page.locator('[data-stage="add-9"]').click();
  await expect(page.locator('.ma-qno')).toHaveText('跟我做 1 / 2');
  await expect(page.locator('.ma-path')).toBeVisible();
  await expect(page.locator('.ma-guide-text')).toContainText('先带你做两题');
  await shot(page, info, 'add9-warm-step1');
  await page.locator('[data-key="0"]').click(); await page.locator('.ma-primary').click();
  await expect(page.locator('.ma-retry-note')).toContainText('再想想');
  await shot(page, info, 'add9-warm-wrong-step');
  await page.locator('[data-key="0"]').click(); await page.locator('.ma-primary').click();
  await page.locator('[data-action="show-step"]').click();                    // gives the step away after two misses
  await expect(page.locator('.ma-step-no')).toContainText('第 2 步');
  await answerNow(page);
  await expect(page.locator('.ma-feedback.split')).toBeVisible();
  await shot(page, info, 'add9-warm-done');
  await nextQuestion(page);
  await expect(page.locator('.ma-qno')).toHaveText('跟我做 2 / 2');
  await answerNow(page); while (!(await page.locator('.ma-feedback').count())) await answerNow(page);
  await nextQuestion(page);
  await expect(page.locator('.ma-qno')).toHaveText('第 1 / 8 题');
  await expect(page.locator('.ma-score')).toHaveText('一次就对 0');
  // find a splittable scored question, miss it: the guide opens, score stays 0
  let guard = 0;
  while (!(await page.locator('[data-action="split"]').count()) && guard++ < 8) { await answerNow(page); await nextQuestion(page); }
  const before = await page.locator('.ma-score').innerText();
  await shot(page, info, 'add9-scored');
  await answerNow(page, false);
  await expect(page.locator('.ma-step-eq')).toBeVisible();
  await shot(page, info, 'add9-miss-guided');
  while (!(await page.locator('.ma-feedback').count())) await answerNow(page);
  await expect(page.locator('.ma-feedback.split')).toBeVisible();
  await nextQuestion(page);
  await expect(page.locator('.ma-score')).toHaveText(before);
  await finishRound(page);
  await expect(page.getByText('完成挑战')).toBeVisible();
  await shot(page, info, 'add9-result');
  const save = await saveOf(page);
  expect(save.data.best['add-9']).toBeGreaterThanOrEqual(5);
  expect(save.data.lastSec['add-9']).toBeGreaterThan(0);
});

test('mul-9: area picture, 拆一拆 button, full round, result sentence', async ({ page }, info) => {
  await seed(page, OPEN_ALL);
  await boot(page);
  await page.locator('[data-stage="mul-9"]').click();
  await expect(page.locator('.ma-area')).toBeVisible();
  await expect(page.locator('.ma-block')).toHaveCount(2);
  await shot(page, info, 'mul9-warm-step1');
  await answerNow(page);
  await shot(page, info, 'mul9-warm-step2');
  await answerNow(page);
  await shot(page, info, 'mul9-warm-merge');
  await answerNow(page);
  await expect(page.locator('.ma-feedback.split')).toBeVisible();
  await shot(page, info, 'mul9-warm-done');
  await nextQuestion(page);
  await finishRound(page);
  await expect(page.locator('.ma-result-stat')).toContainText('秒');
  await expect(page.locator('.ma-guide-text')).toContainText('这次');
  await shot(page, info, 'mul9-result');
  await page.locator('[data-action="retry"]').click();                            // a second round: the guide button works on demand
  await expect(page.locator('.ma-qno')).toHaveText('第 1 / 8 题');
  await page.locator('[data-action="split"]').click();
  await expect(page.locator('.ma-area')).toBeVisible();
});

test('div-10 and div-9: two answer boxes (quotient and remainder), guided division', async ({ page }, info) => {
  await seed(page, { placed: { div: 10 } });
  await boot(page);
  await page.locator('[data-stage="div-10"]').click();
  await expect(page.locator('.ma-bar')).toBeVisible();
  await shot(page, info, 'div10-warm-step1');
  await answerNow(page);
  await expect(page.locator('.ma-step-eq [data-field]')).toHaveCount(2);        // second step: quotient + remainder
  await shot(page, info, 'div10-warm-step2');
  await answerNow(page);
  await answerNow(page);
  await expect(page.locator('.ma-feedback.split')).toBeVisible();
  await nextQuestion(page);
  await page.locator('[data-action="home"]').click();
  await expect(page.locator('[data-action="resume"]')).toBeVisible();
  await seedless(page);
  await page.locator('[data-stage="div-9"]').click();
  await expect(page.locator('.ma-equation [data-field]')).toHaveCount(2);
  await shot(page, info, 'div9-question');
  await typeNumber(page, 3);
  await expect(page.locator('.ma-primary')).toHaveText('再填剩下的');
  await page.locator('.ma-primary').click();
  await expect(page.locator('.ma-equation [data-field="1"]')).toHaveClass(/is-active/);
  await typeNumber(page, 9);
  await page.locator('.ma-primary').click();
  await expect(page.locator('.ma-retry-note')).toBeVisible();                   // wrong remainder -> try again
  await shot(page, info, 'div9-retry');
  await answerNow(page);
  await expect(page.locator('.ma-feedback')).toBeVisible();
});
async function seedless(_page: unknown): Promise<void> { /* the saved run is kept on purpose: starting another stage replaces it */ }

test('mix lines: fill, fill (multiplication), compare buttons, two-step with the first-step hint', async ({ page }, info) => {
  await seed(page, { best: { 'mix-1': 8, 'mix-2': 8, 'mix-3': 8 } });
  await boot(page);
  await page.locator('[data-stage="mix-1"]').click();
  await expect(page.locator('.ma-guide-text')).toContainText('填');
  await expect(page.locator('.ma-equation .ma-box')).toHaveCount(1);
  await shot(page, info, 'mix1-fill');
  await answerNow(page, false);
  await expect(page.locator('.ma-retry-note')).toBeVisible();
  await answerNow(page);
  await expect(page.locator('.ma-feedback')).toBeVisible();
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-stage="mix-2"]').click();
  await shot(page, info, 'mix2-fill');
  await answerNow(page); await expect(page.locator('.ma-feedback')).toBeVisible();
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-stage="mix-3"]').click();
  await expect(page.locator('[data-cmp]')).toHaveCount(3);
  await shot(page, info, 'mix3-compare');
  await answerNow(page, false);
  await expect(page.locator('.ma-retry-note')).toBeVisible();
  await expect(page.locator('.ma-primary')).toHaveText('再试一次');
  await answerNow(page);
  await expect(page.locator('.ma-feedback')).toBeVisible();
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-stage="mix-4"]').click();
  await page.locator('[data-key="hint"]').click();
  await expect(page.locator('.ma-first')).toBeVisible();
  await shot(page, info, 'mix4-two-step-hint');
  await page.locator('[data-key="hint"]').click();
  await finishRound(page);
  await expect(page.locator('.ma-result-body')).toBeVisible();
  await shot(page, info, 'mix4-result');
});

test('测起点: all right goes high, all wrong goes to the start, never lowers an opened line', async ({ page }, info) => {
  await seed(page, {});
  await boot(page);
  await page.locator('[data-action="place"][data-op="mul"]').click();
  await expect(page.locator('.ma-qno')).toHaveText('第 1 题');
  await expect(page.locator('.ma-guide-text')).toContainText('哪一阶');
  await shot(page, info, 'place-q1');
  let n = 0;
  while (!(await page.locator('.ma-result-body').count()) && n++ < 12) await answerNow(page);
  expect(n).toBeGreaterThanOrEqual(6); expect(n).toBeLessThanOrEqual(9);
  await expect(page.locator('.ma-result h1')).toContainText('出发');
  await checkResultFit(page, 'placement result');
  await shot(page, info, 'place-done-high');
  const placed = (await saveOf(page)).data.placed.mul;
  expect(placed).toBeGreaterThanOrEqual(8);
  await page.locator('[data-action="home"]').click();
  await expect(page.locator(`[data-stage="mul-${placed}"]`)).toBeEnabled();
  await expect(page.locator('[data-stage="mul-1"]')).toHaveClass(/is-placed/);
  await expect(page.locator('[data-stage="mul-1"] .ma-stage-state')).toHaveText('测起点通过');
  await shot(page, info, 'place-home-after');
  // second test on the same line with only wrong answers: nothing is lowered
  await page.locator('[data-action="place"][data-op="mul"]').click();
  n = 0;
  while (!(await page.locator('.ma-result-body').count()) && n++ < 12) await answerNow(page, false);
  await expect(page.locator('.ma-result h1')).toContainText('保持不变');
  await checkResultFit(page, 'placement result (keep)');
  await shot(page, info, 'place-done-same');
  expect((await saveOf(page)).data.placed.mul).toBe(placed);
  // sub line: all wrong from scratch starts at 1 and changes nothing
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-action="place"][data-op="sub"]').click();
  n = 0;
  while (!(await page.locator('.ma-result-body').count()) && n++ < 12) await answerNow(page, false);
  await expect(page.locator('.ma-result h1')).toContainText('第 1 阶');
});

test('超频 is locked until stage 3 of the line is passed', async ({ page }) => {
  await seed(page, { placed: { mul: 3 } });                                         // tiers 1-2 passed by 测起点, stage 3 only open
  await boot(page);
  await page.locator('[data-action="sprint"][data-op="mul"]').click({ force: true });  // aria-disabled: the tap still lands and the robot explains
  await expect(page.locator('.ma-guide-text')).toContainText('第三阶');
  await expect(page.locator('.ma-qno')).toHaveCount(0);
});

test('超频: ten questions, a miss is not a best, a clean run sets the best', async ({ page }, info) => {
  await seed(page, { placed: { mul: 5 } });
  await boot(page);
  await expect(page.locator('.ma-tool-sprint[data-op="mul"]')).not.toHaveAttribute('aria-disabled', 'true');
  await page.locator('[data-action="sprint"][data-op="mul"]').click();
  await expect(page.locator('.ma-qno')).toHaveText('第 1 / 10 题');
  await shot(page, info, 'sprint-q1');
  await answerNow(page, false);                                                       // one miss
  await expect(page.locator('.ma-feedback.wrong')).toBeVisible();
  await shot(page, info, 'sprint-miss');
  await page.locator('.ma-primary').click();
  for (let i = 1; i < 10; i++) await answerNow(page);
  await expect(page.locator('.ma-result h1')).toHaveText('超频完成');
  await expect(page.locator('.ma-guide-text')).toContainText('不计入最好');
  await checkResultFit(page, 'sprint result (miss)');
  expect((await saveOf(page)).data.fast.mul).toBeUndefined();
  await shot(page, info, 'sprint-done-miss');
  await page.locator('[data-action="sprint"]').click();
  for (let i = 0; i < 10; i++) await answerNow(page);
  await expect(page.locator('.ma-guide-text')).toContainText('最好成绩');
  await checkResultFit(page, 'sprint result (best)');
  const best = (await saveOf(page)).data.fast.mul.best;
  expect(best).toBeGreaterThan(0);
  await shot(page, info, 'sprint-done-best');
  await page.locator('[data-action="home"]').click();
  await expect(page.locator('.ma-tool-sprint[data-op="mul"]')).toContainText(`最好 ${best} 秒`);
});

test('refresh resumes the round (also in 拆一拆); back keeps the run; targets stay big on every work screen', async ({ page }, info) => {
  await seed(page, { placed: { mul: 10 } });
  await boot(page);
  await page.locator('[data-stage="mul-10"]').click();
  expect(await bigTargets(page)).toEqual([]);
  await noOverflow(page);
  await answerNow(page); await answerNow(page); await answerNow(page); await nextQuestion(page);        // finish warm-up 1
  await expect(page.locator('.ma-qno')).toHaveText('跟我做 2 / 2');
  await page.locator('[data-action="home"]').click();
  await expect(page.locator('[data-action="resume"]')).toContainText('跟我做 2');
  await page.reload(); await page.locator('.kit-start__go').click();
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('.ma-qno')).toHaveText('跟我做 2 / 2');
  await answerNow(page); await answerNow(page); await answerNow(page); await nextQuestion(page);
  await expect(page.locator('.ma-qno')).toHaveText('第 1 / 8 题');
  expect(await bigTargets(page)).toEqual([]);
  await shot(page, info, 'mul10-scored');
  await answerNow(page); await nextQuestion(page);
  await answerNow(page, false);                                                       // miss -> guide
  await expect(page.locator('.ma-step-eq')).toBeVisible();
  await page.reload(); await page.locator('.kit-start__go').click();
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('.ma-step-eq')).toBeVisible();                            // the guide is reopened for a missed splittable problem
  await expect(page.locator('.ma-qno')).toHaveText('第 2 / 8 题');
  await shot(page, info, 'mul10-resume-guide');
  expect(await bigTargets(page)).toEqual([]);
  await noOverflow(page);
});

// ---------------------------------------------------------------- audio (round 3): the robot says whole sentences only; what is on the screen = the caption = the clips started
test('whole sentences only: caption = clips started (spy records, no sound), nothing spliced, no numbers read, no device voice, no number list requested', async ({ page, context, request }, info) => {
  test.skip(info.project.name !== 'ipad-p', 'viewport independent: run once');
  test.setTimeout(240_000);
  const urls: string[] = [];
  context.on('request', (r) => urls.push(r.url()));
  const manifest = await (await request.get('/audio/mars-arithmetic/audio-manifest-v2.json')).json() as Record<string, { src: string; text: string; role: string }>;
  const idOfPath = new Map(Object.entries(manifest).map(([id, clip]) => [clip.src, id]));
  const hasClip = (id: string) => id in manifest;                                   // every runtime sentence has a recording now (companion voice A)
  const byText = Object.entries(LINES).sort((a, b) => b[1].length - a[1].length);
  const expectedIds = (caption: string): string[] => {
    const out: string[] = []; let i = 0;
    while (i < caption.length) {
      const hit = byText.find(([, text]) => caption.startsWith(text, i));
      if (!hit) throw new Error(`caption text that is not a whole sentence of the table: "${caption.slice(i, i + 14)}"`);
      out.push(hit[0]); i += hit[1].length;
    }
    return out;
  };
  const allSpoken: string[] = [];
  const settle = async () => { let n = -1; for (let i = 0; i < 14; i++) { const now = await page.evaluate(() => (window as any).__spoken.length as number); if (now === n) return; n = now; await page.waitForTimeout(1700); } };
  const goHome = async () => { await page.locator('[data-action="home"]').click(); await settle(); };
  const check = async (what: string, act: () => Promise<void>, mode: 'say' | 'quiet'): Promise<string> => {
    const before = await page.evaluate(() => (window as any).__spoken.length as number);
    await act();
    await page.waitForTimeout(250);
    const caption = (await page.locator('.ma-guide-text').innerText()).trim();
    expect(await page.locator('.ma-guide-text').getAttribute('data-speak'), `${what}: speak mode`).toBe(mode);
    expect(caption, `${what}: no digits in a spoken caption`).not.toMatch(/\d/);
    const ids = expectedIds(caption), playable = ids;
    for (const id of ids) expect(hasClip(id), `${what}: ${id} has a recording`).toBe(true);   // all audible: no silent caption any more
    for (const id of ids) expect(RUNTIME_LINES[id], `${what}: ${id} is a runtime sentence`).toBeTruthy();
    const want = mode === 'quiet' ? [] : playable;
    if (want.length) await page.waitForFunction(([n, k]) => (window as any).__spoken.length >= (n as number) + (k as number), [before, want.length], { timeout: 25_000 });
    await page.waitForTimeout(mode === 'quiet' ? 1200 : 600);
    const spoken = (await page.evaluate(() => (window as any).__spoken as string[])).slice(before).map((p) => idOfPath.get(p) ?? `?${p}`);
    expect(spoken, `${what}: "${caption}"`).toEqual(want);
    for (const id of spoken) { expect(manifest[id].text, id).toBe(LINES[id]); expect(caption, id).toContain(manifest[id].text); allSpoken.push(id); }
    return caption;
  };

  await seed(page, { ...OPEN_ALL, placed: { ...OPEN_ALL.placed, add: 10 }, best: { ...OPEN_ALL.best, 'mix-4-dummy': 0 } });
  await boot(page, true);
  await page.waitForTimeout(300);
  expect(await page.locator('.ma-guide-text').innerText()).toBe(LINES['ma.home.again']);
  // 1. first question of a round: the how-to sentence is spoken; the equation is only on the screen
  let c = await check('add-1 first question', async () => { await page.locator('[data-stage="add-1"]').click(); }, 'say');
  expect(c).toBe(LINES['ma.how.calc']);
  await expect(page.locator('.ma-equation')).toContainText('+');
  // 2. hint: an existing whole sentence with a recording
  c = await check('hint', async () => { await page.locator('[data-key="hint"]').click(); }, 'say');
  expect(c).toBe(LINES['ma.hint.add']); await expect(page.locator('.ma-hint')).toHaveText(c);
  // 3. hiding the hint shows the how-to sentence again, quietly; the speaker button plays it
  c = await check('hint hidden', async () => { await page.locator('[data-key="hint"]').click(); }, 'quiet');
  expect(c).toBe(LINES['ma.how.calc']);
  c = await check('speaker button', async () => { await page.locator('[data-action="replay"]').click(); }, 'say');
  await settle();
  // 4. a right answer: the existing sentence; the next question of the same kind is quiet
  await answerNow(page);
  await expect(page.locator('.ma-feedback b')).toHaveText(LINES['ma.right']);
  await settle();
  c = await check('next question of the same kind', async () => { await nextQuestion(page); }, 'quiet');
  expect(c).toBe(LINES['ma.how.calc']);
  // 5. two misses, then the answer: ma.wrong is spoken, the answer itself is only on the screen
  await answerNow(page, false); await settle(); await answerNow(page, false); await settle();
  c = await check('show the answer', async () => { await page.locator('[data-action="show-answer"]').click(); }, 'say');
  expect(c).toBe(LINES['ma.wrong']); await expect(page.locator('.ma-feedback b')).toContainText('正确答案是');
  await goHome();
  // 6. a 拆一拆 warm-up: two existing sentences, no numbers; each step one sentence
  c = await check('warm-up first step', async () => { await page.locator('[data-stage="add-9"]').click(); }, 'say');
  expect(c).toBe(`${LINES['ma.warm']}${LINES['ma.step.add.1']}`);
  await settle();
  c = await check('warm-up next step', async () => { await answerNow(page); }, 'say');
  expect(c).toBe(LINES['ma.step.add.2']);
  await goHome();
  // 7. a stage that alternates two kinds of question: the sentence is spoken each time the kind changes
  const seen: string[] = [];
  c = await check('add-7 first question', async () => { await page.locator('[data-stage="add-7"]').click(); }, 'say'); seen.push(c);
  await settle(); await answerNow(page); await settle();
  c = await check('add-7 other kind', async () => { await nextQuestion(page); }, 'say'); seen.push(c);
  expect(new Set(seen).size).toBe(2);
  await goHome();
  // 8. new kinds of question: the stage sentence (cmp / two-step already say how) and the quiet follow-ups
  c = await check('remainder stage', async () => { await page.locator('[data-stage="div-9"]').click(); }, 'say');
  expect(c).toBe(`${LINES['ma.intro.rem2']}${LINES['ma.how.rem']}`);
  await expect(page.locator('.ma-equation [data-field]')).toHaveCount(2);
  await goHome();
  c = await check('fill stage', async () => { await page.locator('[data-stage="mix-1"]').click(); }, 'say');
  expect(c).toBe(`${LINES['ma.intro.fill']}${LINES['ma.how.fill']}`);
  await goHome();
  c = await check('compare stage', async () => { await page.locator('[data-stage="mix-3"]').click(); }, 'say');
  expect(c).toBe(LINES['ma.intro.cmp']);
  await settle(); await answerNow(page); await settle();
  c = await check('compare, next question', async () => { await nextQuestion(page); }, 'quiet');
  expect(c).toBe(LINES['ma.ask.cmp']);
  c = await check('compare, speaker button', async () => { await page.locator('[data-action="replay"]').click(); }, 'say');
  await goHome();
  // 9. the whole session: only whole sentences were started, never an atom; no device voice; no number list was requested
  expect(allSpoken.length).toBeGreaterThan(5);
  for (const id of allSpoken) { expect(id).toMatch(/^ma\./); expect(RUNTIME_LINES[id], id).toBeTruthy(); expect(LINES[id].length, id).toBeGreaterThanOrEqual(6); }
  expect(await page.evaluate(() => (window as any).__utterances as string[]), 'no device voice').toEqual([]);
  expect(urls.filter((u) => /numbers|\/num\.\d|mars\.num/.test(u)), 'no number list or number clip requested').toEqual([]);
});

// ---------------------------------------------------------------- every stage, in the browser: no overflow, big targets, a full round with one miss
const WALK_IDS = ['add', 'sub', 'mul', 'div'].flatMap((op) => Array.from({ length: 10 }, (_, i) => `${op}-${i + 1}`)).concat(['mix-1', 'mix-2', 'mix-3', 'mix-4']);
test('walk: all 44 stages start cleanly and finish a full round with a miss (no overflow, targets >= 44 px)', async ({ page }, info) => {
  test.skip(!process.env.MATH_WALK, 'long (about 5 minutes per viewport): set MATH_WALK=1');
  test.setTimeout(900_000);
  await seed(page, { placed: { add: 10, sub: 10, mul: 10, div: 10 }, best: { 'mix-1': 8, 'mix-2': 8, 'mix-3': 8 } });
  await boot(page);
  const problems: string[] = [];
  for (const id of WALK_IDS) {
    await page.locator(`[data-stage="${id}"]`).click();
    await expect(page.locator('.ma-play')).toBeVisible();
    await noOverflow(page);
    const small = await bigTargets(page);
    if (small.length) problems.push(`${id}: ${small.join(' | ')}`);
    if (process.env.MATH_SHOTS !== '0') { const dir = (await import('node:path')).join(process.env.MATH_SHOTS || `${process.env.HOME}/kid-games-work/shots/math-v2`, info.project.name, 'walk'); (await import('node:fs')).mkdirSync(dir, { recursive: true }); await page.waitForTimeout(120); await page.screenshot({ path: `${dir}/${id}.png` }); }
    await finishRound(page, { miss: (n) => n === 3 });
    await noOverflow(page);
    const res = await bigTargets(page);
    if (res.length) problems.push(`${id} result: ${res.join(' | ')}`);
    expect((await saveOf(page)).data.best[id], id).toBeGreaterThanOrEqual(5);
    await page.locator('[data-action="home"]').click();
  }
  expect(problems).toEqual([]);
});

// ---------------------------------------------------------------- no number list is requested in a whole session
test('no number list or number clip is requested anywhere in a session (home, small and 3-digit rounds, placement, 拆一拆, 超频)', async ({ page, context }) => {
  test.skip(process.env.MATH_WALK === '1', 'covered by the other runs');
  const urls: string[] = [];
  context.on('request', (r) => urls.push(r.url()));
  await seed(page, { placed: { add: 10, mul: 5 } });
  await boot(page);
  await page.waitForTimeout(500);
  await page.locator('[data-stage="add-1"]').click();
  await answerNow(page); await nextQuestion(page);
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-stage="add-10"]').click();                               // 3-digit numbers on the screen
  await finishRound(page);
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-action="place"][data-op="sub"]').click();
  for (let i = 0; i < 3; i++) await answerNow(page);
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-action="sprint"][data-op="mul"]').click();
  for (let i = 0; i < 10; i++) await answerNow(page);
  await page.waitForTimeout(500);
  expect(urls.filter((u) => /numbers|\/num\.\d|mars\.num/.test(u)), 'number list / clip requests').toEqual([]);
  expect(urls.some((u) => /audio-manifest-v2\.json/.test(u)), 'the sentence manifest is still loaded').toBe(true);
});

// ---------------------------------------------------------------- real touch: page.touchscreen.tap at the middle of every button (the helpers check that the button is what is under the fingertip)
test.describe('real touch', () => {
  test.beforeEach(() => { input.touch = true; });
  const afterReload = async (page: import('@playwright/test').Page) => { await page.reload(); await press(page, '.kit-start__go'); await expect(page.locator('.ma-track').first()).toBeVisible(); };

  test('测起点 on one line, tapped', async ({ page }, info) => {
    await seed(page, {});
    await boot(page);
    await press(page, '[data-action="place"][data-op="mul"]');
    let n = 0;
    while (!(await page.locator('.ma-result-body').count()) && n++ < 12) await answerNow(page);
    expect(n).toBeGreaterThanOrEqual(6);
    await expect(page.locator('.ma-result h1')).toContainText('出发');
    await shot(page, info, 'touch-place-done');
    await press(page, '[data-action="home"]');
    await expect(page.locator('[data-stage="mul-1"]')).toHaveClass(/is-placed/);
  });

  test('乘法 9 阶: the whole 拆一拆 (warm-ups, a miss that opens the guide, the 拆一拆 button) by tapping', async ({ page }, info) => {
    await seed(page, OPEN_ALL);
    await boot(page);
    await press(page, '[data-stage="mul-9"]');
    await expect(page.locator('.ma-area')).toBeVisible();
    await shot(page, info, 'touch-mul9-warm');
    await finishRound(page, { miss: (n) => n === 2 });
    await expect(page.getByText('完成挑战')).toBeVisible();
    await press(page, '[data-action="retry"]');
    await expect(page.locator('.ma-qno')).toHaveText('第 1 / 8 题');
    await press(page, '[data-action="split"]');
    await expect(page.locator('.ma-area')).toBeVisible();
    await answerNow(page); await answerNow(page); await answerNow(page);
    await expect(page.locator('.ma-feedback.split')).toBeVisible();
  });

  test('除法 9 阶: tap the quotient, the remainder box, the keys and the button', async ({ page }, info) => {
    await seed(page, OPEN_ALL);
    await boot(page);
    await press(page, '[data-stage="div-9"]');
    const [q, r] = (solveTokens(await readTokens(page, '.ma-equation')) as { fields: number[] }).fields;
    await typeNumber(page, q);
    await expect(page.locator('.ma-primary')).toHaveText('再填剩下的');
    await press(page, '[data-field="1"]');                                              // tap the remainder box itself
    await expect(page.locator('.ma-equation [data-field="1"]')).toHaveClass(/is-active/);
    await typeNumber(page, r + 1);                                                      // a wrong remainder first
    await press(page, '.ma-primary');
    await expect(page.locator('.ma-retry-note')).toBeVisible();
    await shot(page, info, 'touch-div9-retry');
    await answerNow(page);
    await expect(page.locator('.ma-feedback')).toBeVisible();
  });

  test('比大小: three symbol buttons by tapping', async ({ page }, info) => {
    await seed(page, { best: { 'mix-1': 8, 'mix-2': 8 } });
    await boot(page);
    await press(page, '[data-stage="mix-3"]');
    await expect(page.locator('[data-cmp]')).toHaveCount(3);
    await answerNow(page, false);
    await expect(page.locator('.ma-retry-note')).toBeVisible();
    await shot(page, info, 'touch-cmp-retry');
    await answerNow(page);
    await expect(page.locator('.ma-feedback')).toBeVisible();
    await nextQuestion(page);
    await answerNow(page); await nextQuestion(page);
  });

  test('超频: one round of ten, tapped', async ({ page }) => {
    await seed(page, { placed: { mul: 5 } });
    await boot(page);
    await press(page, '[data-action="sprint"][data-op="mul"]');
    for (let i = 0; i < 10; i++) await answerNow(page);
    await expect(page.locator('.ma-result h1')).toHaveText('超频完成');
    expect((await saveOf(page)).data.fast.mul.best).toBeGreaterThan(0);
  });

  test('refresh in the middle of 拆一拆 and carry on by tapping 继续', async ({ page }) => {
    await seed(page, { placed: { mul: 10 } });
    await boot(page);
    await press(page, '[data-stage="mul-10"]');
    await answerNow(page); await answerNow(page); await answerNow(page); await nextQuestion(page);
    await expect(page.locator('.ma-qno')).toHaveText('跟我做 2 / 2');
    await press(page, '[data-action="home"]');
    await afterReload(page);
    await expect(page.locator('[data-action="resume"]')).toContainText('跟我做 2');
    await press(page, '[data-action="resume"]');
    await expect(page.locator('.ma-qno')).toHaveText('跟我做 2 / 2');
    await finishRound(page, { miss: (n) => n === 1 });
    await expect(page.locator('.ma-result-body')).toBeVisible();
  });
});

// ---------------------------------------------------------------- round 4 (QA fixes)
const touchAll = () => { input.touch = true; };

test.describe('QA-01: the quotient + 剩下的 two-box question works in 测起点 and 超频 (tapped)', () => {
  test.beforeEach(touchAll);
  /** from a screen where a remainder question is showing: tap the quotient, tap 再填剩下的, tap the remainder, tap 确定 */
  const remSequence = async (page: import('@playwright/test').Page, right: boolean) => {
    const [q, r] = (solveTokens(await readTokens(page, '.ma-equation')) as { fields: number[] }).fields;
    await typeNumber(page, q);
    await expect(page.locator('.ma-primary')).toHaveText('再填剩下的');
    await press(page, '.ma-primary');                                                  // used to do nothing in 测起点 / 超频
    await expect(page.locator('.ma-equation [data-field="1"]')).toHaveClass(/is-active/);
    await typeNumber(page, right ? r : r + 1);
    await expect(page.locator('.ma-primary')).toHaveText('确定');
    await press(page, '.ma-primary');
  };
  test('测起点 (division): reaches a remainder question and answers it', async ({ page }, info) => {
    await seed(page, {});
    await boot(page);
    await press(page, '[data-action="place"][data-op="div"]');
    let seen = false;
    for (let i = 0; i < 9 && !(await page.locator('.ma-result-body').count()); i++) {
      if ((await page.locator('.ma-equation [data-field]').count()) === 2) {
        seen = true;
        const before = await page.locator('.ma-qno').innerText();
        await shot(page, info, 'touch-place-rem');
        await remSequence(page, true);
        if (!(await page.locator('.ma-result-body').count())) expect(await page.locator('.ma-qno').innerText(), 'the test moved on to the next question').not.toBe(before);
        break;
      }
      await answerNow(page);
    }
    expect(seen, 'a remainder question showed up in the placement test').toBe(true);
    await expect(page.locator('[data-action="skip"]')).toHaveCount(await page.locator('.ma-result-body').count() ? 0 : 1);   // 这题不会 is there
  });
  test('超频 (division): a remainder question, and 这题不会 is a way out', async ({ page }, info) => {
    await seed(page, { placed: { div: 10 } });
    await boot(page);
    let seen = false;
    for (let attempt = 0; attempt < 8 && !seen; attempt++) {
      await press(page, attempt === 0 ? '[data-action="sprint"][data-op="div"]' : '[data-action="sprint"]');
      for (let i = 0; i < 10 && !(await page.locator('.ma-result-body').count()); i++) {
        if ((await page.locator('.ma-equation [data-field]').count()) === 2) {
          seen = true;
          await shot(page, info, 'touch-sprint-rem');
          await remSequence(page, true);
          break;
        }
        await answerNow(page);
      }
      if (!seen) { while (!(await page.locator('.ma-result-body').count())) await answerNow(page); }
    }
    expect(seen, 'a remainder question showed up in 超频').toBe(true);
    // the way out: 这题不会 shows the answer, never counts for the best time, and the round goes on
    while (!(await page.locator('.ma-result-body').count()) && !(await page.locator('[data-action="sprint-skip"]').count())) await answerNow(page);
    let skipped = false;   // the way out exists only while a remainder question is on screen: the round may end without one
    if (await page.locator('[data-action="sprint-skip"]').count()) {
      await press(page, '[data-action="sprint-skip"]');
      skipped = true;
      await expect(page.locator('.ma-feedback.wrong')).toBeVisible();
      await press(page, '.ma-primary[data-action="sprint-next"]');
    }
    while (!(await page.locator('.ma-result-body').count())) await answerNow(page);
    if (skipped) await expect(page.locator('.ma-guide-text')).toContainText('不计入最好');
    await checkResultFit(page, 'sprint result (rem)');
  });
});

test('QA-03: one back step = one level (12 inner screens), the app back button is the same step, refresh keeps working', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipad-p', 'viewport independent: run once');
  test.setTimeout(300_000);
  const seedData = { placed: { add: 10, sub: 10, mul: 10, div: 10 }, best: { 'mix-1': 8, 'mix-2': 8, 'mix-3': 8 } };
  await seed(page, seedData);
  const path = () => new URL(page.url()).pathname;
  const fresh = async () => {                                                          // hub -> game, with an empty save, like a child coming from the hub
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('kg:v1:mars-arithmetic'));
    await page.goto('/mars-base/?mute=1');
    await expect(page.locator('#app[data-ready]')).toBeVisible();
    await page.locator('.kit-start__go').click();
    await expect(page.locator('.ma-hero')).toBeVisible();
  };
  const finish = async () => { while (!(await page.locator('.ma-result-body').count())) { if (await page.locator('.ma-feedback').count()) await page.locator('.ma-primary').click(); else await answerNow(page); } };
  const states: [string, () => Promise<void>][] = [
    ['question', async () => { await page.locator('[data-stage="add-1"]').click(); }],
    ['hint', async () => { await page.locator('[data-stage="add-1"]').click(); await page.locator('[data-key="hint"]').click(); }],
    ['retry', async () => { await page.locator('[data-stage="add-1"]').click(); await answerNow(page, false); await expect(page.locator('.ma-retry-note')).toBeVisible(); }],
    ['guide (warm-up)', async () => { await page.locator('[data-stage="mul-9"]').click(); await expect(page.locator('.ma-step')).toBeVisible(); }],
    ['guide step 2', async () => { await page.locator('[data-stage="mul-9"]').click(); await answerNow(page); await expect(page.locator('.ma-step-no')).toContainText('第 2 步'); }],
    ['feedback', async () => { await page.locator('[data-stage="add-1"]').click(); await answerNow(page); await expect(page.locator('.ma-feedback')).toBeVisible(); }],
    ['result', async () => { await page.locator('[data-stage="add-1"]').click(); await finish(); }],
    ['placement question', async () => { await page.locator('[data-action="place"][data-op="add"]').click(); await expect(page.locator('.ma-qno')).toHaveText('第 1 题'); }],
    ['placement result', async () => { await page.locator('[data-action="place"][data-op="add"]').click(); await finish(); }],
    ['sprint question', async () => { await page.locator('[data-action="sprint"][data-op="mul"]').click(); await expect(page.locator('.ma-clock')).toBeVisible(); }],
    ['sprint feedback', async () => { await page.locator('[data-action="sprint"][data-op="mul"]').click(); await answerNow(page, false); await expect(page.locator('.ma-feedback.wrong')).toBeVisible(); }],
    ['sprint result', async () => { await page.locator('[data-action="sprint"][data-op="mul"]').click(); await finish(); }],
  ];
  expect(states).toHaveLength(12);
  for (const [name, go] of states) {
    await fresh();
    expect(path(), name).toBe('/mars-base/');
    await go();
    await expect(page.locator('.ma-hero'), `${name}: an inner screen`).toHaveCount(0);
    await page.goBack();                                                                // browser back / iPad edge swipe
    await expect(page.locator('.ma-hero'), `${name}: one back = the home screen`).toBeVisible();
    expect(path(), `${name}: still in the game`).toBe('/mars-base/');
    await page.goBack();
    await expect.poll(path, { message: `${name}: the second back leaves to the hub` }).toBe('/');
  }
  // the app's own 返回 / 返回选关 is the same single step: one more back then leaves
  for (const [name, go, leave] of [
    ['question', states[0][1], '.ma-back'], ['sprint result', states[11][1], '[data-action="home"]'], ['placement result', states[8][1], '[data-action="home"]'],
  ] as [string, () => Promise<void>, string][]) {
    await fresh(); await go();
    await page.locator(leave).click();
    await expect(page.locator('.ma-hero'), `${name}: app back goes home`).toBeVisible();
    await page.goBack();
    await expect.poll(path, { message: `${name}: after the app's own back, browser back leaves` }).toBe('/');
  }
  // refresh in the middle of a round: home with the 继续 button, the round resumes, back from it is one step
  await fresh();
  await page.locator('[data-stage="add-1"]').click(); await answerNow(page); await page.locator('.ma-primary').click();
  await page.reload();
  await page.locator('.kit-start__go').click();
  await expect(page.locator('.ma-hero')).toBeVisible();
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('.ma-qno')).toHaveText('第 2 / 8 题');
  await page.goBack();
  await expect(page.locator('.ma-hero')).toBeVisible();
  await expect(page.locator('[data-action="resume"]')).toBeVisible();
});

test('QA-04: three right in a row: the robot says ma.streak (a recording exists) instead of ma.right', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'ipad-p', 'viewport independent: run once');
  const manifest = await (await request.get('/audio/mars-arithmetic/audio-manifest-v2.json')).json() as Record<string, { src: string; text: string }>;
  await seed(page, {});
  await boot(page, true);
  const spoken = async () => (await page.evaluate(() => (window as any).__spoken as string[])).map((p) => Object.entries(manifest).find(([, c]) => c.src === p)?.[0]);
  await page.locator('[data-stage="add-1"]').click();
  await answerNow(page); await page.locator('.ma-primary').click();
  await answerNow(page); await page.locator('.ma-primary').click();
  const before = (await spoken()).length;
  await answerNow(page);
  await expect(page.locator('.ma-guide-text')).toHaveText(LINES['ma.streak']);
  await expect(page.locator('.ma-energy')).toHaveClass(/is-burst/);
  await expect.poll(async () => (await spoken()).slice(before).includes('ma.streak'), { timeout: 15_000 }).toBe(true);
  expect((await spoken()).slice(before)).not.toContain('ma.right');
});

test('QA-09: a scored problem solved with the 拆一拆 button and no wrong step counts as 一次就对; a wrong step or an answer shown does not', async ({ page }) => {
  await seed(page, OPEN_ALL);
  await boot(page);
  await page.locator('[data-stage="mul-9"]').click();
  for (let i = 0; i < 2; i++) { await answerNow(page); await answerNow(page); await answerNow(page); await nextQuestion(page); }   // the two warm-ups
  await expect(page.locator('.ma-qno')).toHaveText('第 1 / 8 题');
  await press(page, '[data-action="split"]');                                         // chosen on purpose, every step right
  await answerNow(page); await answerNow(page); await answerNow(page);
  await expect(page.locator('.ma-feedback.split')).toContainText('算一次就对');
  await nextQuestion(page);
  await expect(page.locator('.ma-score')).toHaveText('一次就对 1');
  await press(page, '[data-action="split"]');                                         // second time: one step is wrong first
  await answerNow(page, false);
  await answerNow(page); await answerNow(page); await answerNow(page);
  await expect(page.locator('.ma-feedback.split')).toContainText('不算分');
  await nextQuestion(page);
  await expect(page.locator('.ma-score')).toHaveText('一次就对 1');
  // and the rest of the round right: 7 of 8 would have been the old maximum; now 8 / 8 is reachable
  await finishRound(page);
  await expect(page.locator('.ma-result strong')).toContainText('7');
});

test('QA-10: the 超频 clock stands still while the page is hidden', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipad-p', 'viewport independent: run once');
  await seed(page, { placed: { mul: 5 } });
  await boot(page);
  await page.locator('[data-action="sprint"][data-op="mul"]').click();
  await page.waitForTimeout(1200);
  const clock = async () => { const [m, sec] = (await page.locator('.ma-clock').innerText()).split(':').map(Number); return m * 60 + sec; };
  const before = await clock();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(4500);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1200);
  expect(await clock(), 'about 2 s of play, not 6 s').toBeLessThanOrEqual(before + 3);
});

test('QA-11: the 继续 button names the real next screen; a card with an unfinished round asks first (接着做 / 重新开始这一阶)', async ({ page }, info) => {
  await seed(page, { placed: { mul: 5 } });
  await boot(page);
  await page.locator('[data-stage="mul-2"]').click();
  await answerNow(page, false); await answerNow(page);                                  // a miss: a 再来一道 comes back after two more questions
  await page.locator('.ma-primary').click();
  for (let i = 0; i < 2; i++) { await answerNow(page); await page.locator('.ma-primary').click(); }
  await expect(page.locator('.ma-qno')).toHaveText('再来一道 1');
  await page.locator('[data-action="home"]').click();
  await expect(page.locator('[data-action="resume"]')).toContainText('再来一道');         // not "第 4 题"
  await page.reload(); await page.locator('.kit-start__go').click();
  await expect(page.locator('[data-action="resume"]')).toContainText('再来一道');
  // tapping the same card: a clear two-button choice, nothing is dropped silently
  await page.locator('[data-stage="mul-2"]').click();
  await expect(page.locator('.ma-choice')).toBeVisible();
  await shot(page, info, 'choice-dialog');
  await expect(page.locator('.ma-choice [data-action="resume"]')).toHaveText('接着做');
  await expect(page.locator('.ma-choice [data-action="restart"]')).toHaveText('重新开始这一阶');
  const before = (await saveOf(page)).data.plays['mul-2'];
  await page.locator('.ma-choice [data-action="resume"]').click();
  await expect(page.locator('.ma-qno')).toHaveText('再来一道 1');
  expect((await saveOf(page)).data.plays['mul-2']).toBe(before);
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-stage="mul-2"]').click();
  await page.locator('.ma-choice [data-action="restart"]').click();
  await expect(page.locator('.ma-qno')).toHaveText('第 1 / 8 题');
  expect((await saveOf(page)).data.plays['mul-2']).toBe(before + 1);
});

test('QA-08: the kit home button never sits on a stage card while the home screen scrolls', async ({ page }, info) => {
  await seed(page, {});
  await boot(page);
  const top = await page.evaluate(() => document.querySelector('.ma-page')!.scrollHeight);
  for (const y of [200, 420, 640, 900, 1300, 1800, top]) {
    await page.evaluate((v) => { document.querySelector('.ma-page')!.scrollTop = v; }, y);
    const under = await page.evaluate(() => {
      const back = document.querySelector('.kit-back') as HTMLElement | null;
      if (!back) return 'no-back';
      const r = back.getBoundingClientRect();
      const names: string[] = [];
      for (const [x, y] of [[r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4], [r.left + r.width / 2, r.top + r.height / 2]]) {
        const below = document.elementsFromPoint(x, y).find((e) => e !== back && !back.contains(e) && !e.classList.contains('kit-back'));
        names.push(below?.closest('.ma-stage, .ma-track, .ma-bay, .ma-resume, .ma-home-guide, .ma-tool') ? (below.closest('.ma-stage, .ma-track, .ma-bay, .ma-resume, .ma-home-guide, .ma-tool') as HTMLElement).className.split(' ')[0] : 'ok');
      }
      return names.filter((n) => n !== 'ok').join(',');
    });
    expect(under, `scrolled to ${y}`).toBe('');
    if (y === 640) await shot(page, info, 'home-scrolled-bar');
  }
});
