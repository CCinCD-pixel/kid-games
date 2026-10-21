/**
 * V10 徽章墙 "一起验货" (spec §3.6 / §2.4 S7): the wall screen is laid out on every viewport (nothing off-screen / overlapping / cut / scrolling), one
 * tap starts ONE mission with the 4 cert items of every unlit card (12 dots, one attempt each, no per-item verdict), the result lights the badges;
 * a refresh in the middle resumes the same mission; two misses in one card → half-lit + "去练". Console must stay clean.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { boot, leaveMission, prepare, shotPath } from './lib';

const NONE = { C1: { state: 'none', attempts: 0 }, C2: { state: 'none', attempts: 0 }, C3: { state: 'none', attempts: 0 } };
const FULL_PROJECTS = ['ipad-l', 'phone-p', 'se', 'phone-l-inset'];   // the projects that also run behaviour.spec (refresh / half-lit variants)
const emptyManifest = (page: Page) => page.route('**/audio/mars-base/*manifest.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
const keyOf = (page: Page) => page.evaluate(() => (window as any).__mars.item()?.key ?? '');

/** layout rules of the wall screen, evaluated in the page */
function auditWall(): string[] {
  const out: string[] = []; const VW = window.innerWidth, VH = window.innerHeight; const shown = (e: Element) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && !(e as HTMLElement).hidden; };
  const q = (s: string) => Array.from(document.querySelectorAll(s)).filter(shown);
  const tops = [...q('.mb-ch-back').map((e) => ['back', e] as const), ...q('.mb-plaque').map((e, i) => [`plaque${i}`, e] as const), ...q('.mb-wall-go').map((e) => ['wallGo', e] as const), ...q('.mb-badges-note').map((e) => ['note', e] as const), ...q('.mb-ch-title').map((e) => ['title', e] as const)];
  for (const [n, e] of tops) { const r = e.getBoundingClientRect(); if (r.left < -1 || r.top < -1 || r.right > VW + 1 || r.bottom > VH + 1) out.push(`${n} off-screen ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)},${Math.round(r.bottom)} in ${VW}×${VH}`); }
  for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) { const a = tops[i][1].getBoundingClientRect(), b = tops[j][1].getBoundingClientRect(); if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) out.push(`overlap ${tops[i][0]}×${tops[j][0]}`); }
  document.querySelectorAll('.mb-badges button, .kit-back').forEach((b) => { if (!shown(b)) return; const r = b.getBoundingClientRect(); const s = getComputedStyle(b, '::after'); const hw = Math.max(r.width, s.position === 'absolute' ? parseFloat(s.width) || 0 : 0), hh = Math.max(r.height, s.position === 'absolute' ? parseFloat(s.height) || 0 : 0); if (hw < 43.5 || hh < 43.5) out.push(`tap .${(b as HTMLElement).className.split(' ')[0]} ${Math.round(hw)}×${Math.round(hh)} < 44`); });
  const root = document.querySelector('.mb-badges') as HTMLElement | null;
  if (!root) out.push('no .mb-badges'); else if (root.scrollHeight > root.clientHeight + 1 || root.scrollWidth > root.clientWidth + 1) out.push(`the wall scrolls ${root.scrollWidth}×${root.scrollHeight} > ${root.clientWidth}×${root.clientHeight}`);
  document.querySelectorAll('.mb-badges b, .mb-badges span, .mb-badges-note, .mb-wall-go, .mb-plaque-go').forEach((e) => { const h = e as HTMLElement; if (shown(h) && h.textContent && (h.scrollWidth > h.clientWidth + 1 && getComputedStyle(h).display !== 'inline')) out.push(`text cut .${h.className.split(' ')[0] || h.tagName}: "${h.textContent.slice(0, 14)}"`); });
  const de = document.documentElement; if (de.scrollWidth > VW + 1 || de.scrollHeight > VH + 1) out.push(`page scrolls ${de.scrollWidth}×${de.scrollHeight}`);
  if (!q('.mb-wall-go').length && document.querySelectorAll('.mb-plaque.is-lit').length < 3) out.push('the 一起验货 button is missing although a badge is not lit');
  return out;
}
async function openWall(page: Page, ti: TestInfo, shot?: string): Promise<void> {
  await page.evaluate(() => (window as any).__mars.badges()); await page.waitForSelector('.mb-badges .mb-plaque');
  await page.waitForTimeout(250);
  const issues = await page.evaluate(auditWall); expect(issues, issues.join('\n')).toEqual([]);
  if (shot && process.env.MARS_SHOTS !== '0') await page.screenshot({ path: shotPath(ti, shot) });
}
/** deliver the item on screen (right, or wrong by one) and wait until the next item (or the end of the mission) */
async function deliverOne(page: Page, wrong = false): Promise<boolean> {
  const k = await keyOf(page);
  await page.evaluate((wr) => { const m = (window as any).__mars; const c = m.correct(); m.answer(wr && typeof c === 'number' ? c + 1 : c); }, wrong);
  await page.waitForFunction((prev) => !document.querySelector('.mb-mission') || (window as any).__mars.item()?.key !== prev, k, { timeout: 8000 });
  return !!(await page.locator('.mb-mission').count());
}
async function finishWrap(page: Page): Promise<void> {
  await page.waitForSelector('.xg-modal', { timeout: 8000 });
  await page.locator('.xg-modal [data-act="home"]').click();
  await page.waitForSelector('.mb-map', { timeout: 10_000 }).catch(async () => { await page.locator('.mb-build').click({ timeout: 1000 }).catch(() => undefined); await page.waitForSelector('.mb-map', { timeout: 6000 }); });
}

test('徽章墙: layout on this viewport, one 一起验货 mission of 12 orders lights all three badges', async ({ page }, ti) => {
  test.setTimeout(120_000);
  const w = await prepare(page); await emptyManifest(page); await boot(page, ti, { save: { cert: NONE } });
  await openWall(page, ti, 'wall_0_none');
  expect(await page.locator('.mb-plaque.is-none').count()).toBe(3);
  await page.locator('.mb-wall-go').click(); await page.waitForSelector('.mb-mission .mb-stage'); await page.waitForFunction(() => (window as any).__mars.item());
  expect(await page.locator('.mb-dot').count(), '4 orders per card × 3 cards').toBe(12);
  expect(await page.evaluate(() => (window as any).__mars.app.save.mission.kind)).toBe('wall');
  let n = 0; const lines = new Set<string>();
  for (let guard = 0; guard < 16; guard++) {
    if (n === 5 && process.env.MARS_SHOTS !== '0') await page.screenshot({ path: shotPath(ti, 'wall_1_mid') });
    const fam = await page.evaluate(() => (window as any).__mars.item().slot);
    expect(fam, 'every wall order is a cert slip').toBe('cert');
    const more = await deliverOne(page); n++;
    if (more) lines.add((await page.locator('.mb-comm-text').innerText()).trim());   // no verdict mid-wall: the comm line is the neutral "received" line or the next order
    if (!more) break;
  }
  expect(n, '12 orders (no extras when everything is right)').toBe(12);
  await page.waitForSelector('.xg-modal'); await page.waitForTimeout(700);
  if (process.env.MARS_SHOTS !== '0') await page.screenshot({ path: shotPath(ti, 'wall_2_result') });
  const txt = await page.locator('.xg-modal').innerText(); expect(txt.trim().length).toBeGreaterThan(8);
  await finishWrap(page);
  const st = await page.evaluate(() => { const s = (window as any).__mars.app.save; return { cert: Object.values(s.cert).map((c: any) => c.state), mission: s.mission }; });
  expect(st.cert).toEqual(['lit', 'lit', 'lit']); expect(st.mission).toBeNull();
  await openWall(page, ti, 'wall_3_lit');
  expect(await page.locator('.mb-plaque.is-lit').count()).toBe(3); expect(await page.locator('.mb-wall-go:visible').count(), 'nothing left to verify').toBe(0);
  expect(w.errors).toEqual([]);
});

test('徽章墙: a refresh in the middle resumes the same mission; two misses in one card leave it half-lit with 去练', async ({ page }, ti) => {
  test.skip(!FULL_PROJECTS.includes(ti.project.name), 'the full variants run on the behaviour projects');
  test.setTimeout(120_000);
  const w = await prepare(page); await emptyManifest(page); await boot(page, ti, { save: { cert: NONE } });
  await openWall(page, ti); await page.locator('.mb-wall-go').click(); await page.waitForSelector('.mb-mission .mb-stage'); await page.waitForFunction(() => (window as any).__mars.item());
  for (let i = 0; i < 5; i++) await deliverOne(page);
  await leaveMission(page);   // the 回地图 key (and a tab switch) writes the save
  const idx = await page.evaluate(() => (window as any).__mars.app.save.mission.idx); expect(idx).toBeGreaterThanOrEqual(5);
  await page.reload(); await page.locator('.kit-start__go').click().catch(() => undefined); await page.waitForSelector('#app[data-ready]'); await page.waitForFunction(() => !!(window as any).__mars); await page.waitForSelector('.mb-map');
  expect(await page.evaluate(() => { const m = (window as any).__mars.app.save.mission; return m ? `${m.kind}:${m.idx}` : null }), 'the wall mission survives the refresh').toBe(`wall:${idx}`);
  await openWall(page, ti); await page.locator('.mb-wall-go').click(); await page.waitForSelector('.mb-mission .mb-stage'); await page.waitForFunction(() => (window as any).__mars.item());
  expect(await page.evaluate(() => (window as any).__mars.app.save.mission.idx), 'resumed, not restarted').toBeGreaterThanOrEqual(idx);
  // finish: from here on the last card (C3) misses twice, the rest are right
  let more = true, c3 = 0;
  while (more) { const card = await page.evaluate(() => (window as any).__mars.item().card); const wrong = card === 'C3' && c3 < 2; if (card === 'C3') c3++; more = await deliverOne(page, wrong); }
  await finishWrap(page);
  expect(await page.evaluate(() => Object.values((window as any).__mars.app.save.cert).map((c: any) => c.state)), 'C1 / C2 lit; C3 missed twice').toEqual(['lit', 'lit', 'half']);
  await openWall(page, ti, 'wall_4_half');
  expect(await page.locator('.mb-plaque.is-half').count()).toBe(1); expect(await page.locator('.mb-plaque-go:visible').count()).toBe(1);
  await page.locator('.mb-plaque-go').click(); await page.waitForSelector('.mb-chapter');
  expect(w.errors).toEqual([]);
});
