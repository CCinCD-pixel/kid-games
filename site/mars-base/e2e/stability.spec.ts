/**
 * QA fix-mars-r2 (blockers 1-3) as browser regressions, with REAL touches (locator.tap):
 *  - DOM STABILITY: tapping the same control N times must not grow the control bar (array.ts once appended a whole new row of buttons per tap);
 *  - WRONG -> CLEAR -> RETRY: after a wrong answer the item can still be finished by the child (multi-cell keypad stages, 一样多 / 不一样多), and the H3 answer shown is the right one.
 * Each scenario is a ONE-ITEM mission of one stage signature (test hook `playSig`), so it runs in seconds on every project.
 */
import { expect, test, type Page } from '@playwright/test';
import { boot, prepare } from './lib';

const play = async (page: Page, sig: string): Promise<void> => {
  await page.evaluate((s) => (window as any).__mars.setSave(s), { onboarded: true, session: { index: 1, lastActiveAt: Date.now(), missions: 3 }, cert: { C1: { state: 'lit', attempts: 1, at: 1 }, C2: { state: 'lit', attempts: 1, at: 1 }, C3: { state: 'lit', attempts: 1, at: 1 } }, probes: { vault: { done: true }, factory: { done: true }, balance: { done: true } } });
  await page.waitForSelector('.mb-map');
  expect(await page.evaluate((s) => (window as any).__mars.playSig(s), sig), `signature ${sig} exists`).toBe(true);
  await page.waitForSelector('.mb-mission .mb-stage .ar, .mb-mission .mb-stage .pd, .mb-mission .mb-stage .st-pic', { timeout: 8000 });
  await page.waitForFunction(() => (window as any).__mars.item(), undefined, { timeout: 8000 });
};
/** back to the map by real taps: leave a running mission, or press through the result card (the one-item mission ends after the item) */
async function toMap(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await count(page, '.xg-modal')) { await page.locator('.xg-modal__actions button').first().tap({ timeout: 4000 }).catch(() => undefined); await page.waitForTimeout(350); continue; }
    if (await count(page, '.kit-modal')) { await page.locator('.kit-modal__actions button').last().tap({ timeout: 2000 }).catch(() => undefined); await page.waitForTimeout(350); continue; }
    if (await count(page, '.mb-build')) { await page.locator('.mb-build').first().tap({ timeout: 1500 }).catch(() => undefined); await page.waitForTimeout(350); continue; }
    if (await count(page, '.mb-map')) return;
    if (await count(page, '.mb-map-btn')) { await page.locator('.mb-map-btn').tap({ timeout: 2000 }).catch(() => undefined); }
    await page.waitForTimeout(250);
  }
  throw new Error('never got back to the map');
}
const item = (page: Page) => page.evaluate(() => { const i = (window as any).__mars.item(); return i ? { key: i.key as string, params: i.params, slot: i.slot as string } : null; });
const count = (page: Page, sel: string) => page.locator(sel).count();
const comm = (page: Page) => page.locator('.mb-comm-text').innerText();
async function nextItem(page: Page, key: string): Promise<void> { await page.waitForFunction((k) => { const i = (window as any).__mars.item(); return !i || i.key !== k; }, key, { timeout: 9000 }); }

test('DOM stability: tapping an array / pods control N times never piles up controls', async ({ page }, ti) => {
  const w = await prepare(page); await boot(page, ti);
  // open.arrays: 行加一 / 列加一 x5 each, 放进册子 once; the control bar keeps exactly 2 steppers + 1 keep button
  await play(page, 'open.arrays||||hi');
  const stable = async (what: string) => { expect(await count(page, '.ar-bar > *'), `${what}: .ar-bar children`).toBe(3); expect(await count(page, '.ar-bar .ar-keep'), `${what}: keep buttons`).toBe(1); expect(await count(page, '.mb-stage button'), `${what}: buttons in the stage`).toBe(await count(page, '.ar-bar button')); };
  await stable('start');
  for (let i = 0; i < 5; i++) { await page.locator('[aria-label="行加一"]').tap(); await stable(`row tap ${i + 1}`); }
  for (let i = 0; i < 5; i++) { await page.locator('[aria-label="列加一"]').tap(); await stable(`column tap ${i + 1}`); }
  // the same bar after the 放进册子 tap and after reductions
  for (let i = 0; i < 3; i++) { await page.locator('[aria-label="行减一"]').tap(); await stable(`row minus ${i + 1}`); }
  // mul.array (add columns until the board is as big as the order) and the build stage: a constant number of controls
  for (const sig of (await page.evaluate(() => (window as any).__mars.stageSigs() as string[])).filter((x) => /^mul\.(array|missingFactor)\|/.test(x))) {
    await toMap(page); await play(page, sig);
    if (!(await count(page, '.ar'))) continue;   // a typed / keypad variant has no array stage
    const n0 = await count(page, '.ar-bar > *'); const b0 = await count(page, '.mb-stage button');
    for (let i = 0; i < 4; i++) { const t = page.locator('.ar-keep:not([disabled]), [aria-label="列加一"]:not([disabled])').first(); if (!(await t.count())) break; await t.tap(); expect(await count(page, '.ar-bar > *'), `${sig} tap ${i + 1}`).toBe(n0); expect(await count(page, '.mb-stage button'), `${sig} buttons after tap ${i + 1}`).toBe(b0); }
  }
  expect(w.errors).toEqual([]);
});

test('mul.equalCheck: a wrong 一样多 / 不一样多 choice can be taken back; H3 shows the right branch', async ({ page }, ti) => {
  const w = await prepare(page); await boot(page, ti);
  const sigs = (await page.evaluate(() => (window as any).__mars.stageSigs() as string[])).filter((x) => x.startsWith('mul.equalCheck'));
  expect(sigs.length).toBeGreaterThanOrEqual(2);
  await play(page, sigs[0]);
  const it = (await item(page))!; const sz: number[] = it.params.sizes; const same = sz.every((x) => x === Math.min(...sz));
  // 1) both answers stay on screen after the first choice (they used to disappear)
  await page.locator(same ? '.pd-no' : '.pd-yes').tap();   // the WRONG branch
  expect(await count(page, '.pd-yes'), 'yes stays').toBe(1); expect(await count(page, '.pd-no'), 'no stays').toBe(1);
  await page.locator('.mb-ok').tap(); await expect.poll(() => comm(page), { timeout: 5000 }).not.toBe('');
  expect((await item(page))!.key, 'a wrong branch is not accepted').toBe(it.key);
  // 2) take it back and finish with the right branch (real taps)
  if (same) { await page.locator('.pd-yes').tap(); await page.locator(`.cd-card[data-v="${sz[0]}"]`).tap(); await page.locator(`.cd-card[data-v="${sz.length}"]`).tap(); }
  else { await page.locator('.pd-no').tap(); const mn = Math.min(...sz); for (let i = 0; i < sz.reduce((a, x) => a + x - mn, 0); i++) await page.locator('.pd-rm:not([disabled])').tap(); }
  await page.locator('.mb-ok').tap(); await nextItem(page, it.key);
  // 3) the other direction + H3: wrong branch, three wrong deliveries -> the answer shown is the oracle's branch, ✓ completes it (assisted)
  await toMap(page); await play(page, sigs[0]);
  const it2 = (await item(page))!; const same2 = (it2.params.sizes as number[]).every((x) => x === Math.min(...(it2.params.sizes as number[])));
  for (let i = 0; i < 3; i++) { await page.locator(same2 ? '.pd-no' : '.pd-yes').tap(); if (!same2 && i === 0) { await page.locator('.cd-card[data-v="1"]').tap(); await page.locator('.cd-card[data-v="2"]').tap(); } await page.locator('.mb-ok').tap(); await page.waitForFunction((n) => (window as any).__marsItem?.state?.().subs >= n && !(window as any).__marsItem.state().locked, i + 1, { timeout: 8000 }); }
  await page.waitForTimeout(300);
  expect(await count(page, same2 ? '.pd-yes.is-on' : '.pd-no.is-on'), 'H3 switched to the right branch').toBe(1);
  await page.locator('.mb-ok').tap(); await nextItem(page, it2.key);
  expect((await item(page))?.slot, 'the twin follows an assisted finish').toBe('twin');
  expect(w.errors).toEqual([]);
});

test('multi-cell keypad stages: wrong -> clear -> retry is finishable; ⌫ on an empty box goes back a cell', async ({ page }, ti) => {
  const w = await prepare(page); await boot(page, ti);
  const key = async (k: string) => page.locator(`.mb-keypad .xg-key[data-key="${k}"]`).tap();
  const typeNum = async (n: number) => { for (const ch of String(n)) await key(ch); };
  for (const sig of ['col.add|||hands|lo', 'col.sub||||hi', 'mul.split|||hands|lo', 'mul.write|sum||hands|lo', 'mul.compareArr||||hi']) {
    if (!(await page.evaluate((s) => (window as any).__mars.stageSigs().includes(s), sig))) continue;
    await toMap(page); await play(page, sig);
    const it = (await item(page))!; const correct: number[] = await page.evaluate(() => (window as any).__mars.correct());
    const cells = await page.evaluate(() => (window as any).__marsItem.state().cells as number); expect(cells, `${sig} cells`).toBeGreaterThan(0);
    expect(await page.locator('.mb-answer').getAttribute('data-cell'), `${sig}: the first cell is named`).toBeTruthy();
    const pre = cells < correct.length ? correct.slice(0, correct.length - cells) : [];
    const pickPre = async () => { if (!pre.length) return; const b = (await item(page))!.params; const a = b.r1 * b.c1, c = b.r2 * b.c2; await page.locator(a === c ? '.ar-eq' : `.ar-pick[data-i="${pre[0]}"]`).tap(); };
    await pickPre();
    const tail = correct.slice(-cells);
    for (let round = 0; round < 2; round++) {   // two wrong answers: every one must start again on the FIRST cell
      for (let i = 0; i < cells; i++) { expect(await page.evaluate(() => (window as any).__marsItem.state().cell), `${sig} round ${round}: cell index before entering cell ${i}`).toBe(i); await typeNum(tail[i] + 1); await page.locator('.mb-keypad .xg-key--ok').tap(); }
      await page.waitForFunction((n) => (window as any).__marsItem?.state?.().subs >= n && !(window as any).__marsItem.state().locked, round + 1, { timeout: 9000 });
      expect(await page.evaluate(() => (window as any).__marsItem.state().cell), `${sig}: rewound to the first cell after a wrong answer`).toBe(0);
      expect(await page.locator('.mb-answer .xg-display').evaluate((e) => e.classList.contains('is-empty')), `${sig}: the display is clear`).toBe(true);
    }
    if (cells > 1) {   // ⌫ on an empty box: back to the previous cell with its number
      await typeNum(tail[0]); await page.locator('.mb-keypad .xg-key--ok').tap(); expect(await page.evaluate(() => (window as any).__marsItem.state().cell)).toBe(1);
      await page.locator('.mb-keypad .xg-key--del').tap(); expect(await page.evaluate(() => (window as any).__marsItem.state().cell), `${sig}: ⌫ goes back one cell`).toBe(0);
      expect(await page.locator('.mb-answer .xg-display').innerText()).toContain(String(tail[0]));
      await page.locator('.mb-keypad .xg-key--del').tap();   // now it deletes the digits
    } else await page.locator('.mb-keypad .xg-key--del').tap();
    for (let i = 0; i < 3; i++) await page.locator('.mb-keypad .xg-key--del').tap();   // clear whatever is left (the first cell)
    for (let i = 0; i < cells; i++) { await typeNum(tail[i]); await page.locator('.mb-keypad .xg-key--ok').tap(); }
    await nextItem(page, it.key);   // accepted after two wrong answers (third try, right numbers)
  }
  expect(w.errors).toEqual([]);
});

test('mul.commute: a wrong 会变 prediction is taken back by the hints (it used to stay for ever: the buttons are gone once chosen)', async ({ page }, ti) => {
  const w = await prepare(page); await boot(page, ti);
  await play(page, 'mul.commute||||hi'); const it = (await item(page))!; const { rows, cols } = it.params as { rows: number; cols: number };
  await page.getByRole('button', { name: '会变' }).tap();   // the WRONG prediction
  await page.locator('.ar-turn').tap(); await page.waitForSelector('.cd-slot', { timeout: 5000 });
  await page.locator(`.cd-card[data-v="${cols}"]`).tap(); await page.locator(`.cd-card[data-v="${rows}"]`).tap();   // the numbers are RIGHT
  for (let i = 0; i < 3; i++) {
    await page.locator('.mb-ok').tap();
    if (i < 2) { await page.waitForFunction((n) => (window as any).__marsItem?.state?.().subs >= n && !(window as any).__marsItem.state().locked, i + 1, { timeout: 8000 }); expect((await item(page))!.key, `delivery ${i + 1} is wrong`).toBe(it.key); }
  }
  await nextItem(page, it.key);   // the third delivery: H2 had set the prediction right, so the right numbers are accepted
  expect(w.errors).toEqual([]);
});
