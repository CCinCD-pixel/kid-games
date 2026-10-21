/**
 * V10 behaviour probes (spec §9): silence before the start tap, ≤ 1 AudioContext, decodedBytes ≤ 48 MB, save v=5, the three probes
 * (hint key with the narration OFF, three wrong deliveries → answer + assisted + twin, empty delivery not counted), neutral hint line in a
 * calibration item, 45 s idle is a reminder only, an empty manifest still shows every subtitle, rotate / back / refresh keep the mission,
 * offline reload (service worker, production bundle only).
 */
import { expect, test, type Page } from '@playwright/test';
import { boot, itemKey, leaveMission, prepare, resetSave, startNode } from './lib';

const BY_FAMILY: [string, string][] = [['nl', 'orbit.O1.1'], ['tray', 'vault.K1.3'], ['counter', 'vault.K1.5'], ['pods', 'factory.P1.3'], ['array', 'factory.P2.5'], ['keypad', 'cert.C1.4']];
const emptyManifest = (page: Page) => page.route('**/audio/mars-base/*manifest.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
const comm = (page: Page) => page.locator('.mb-comm-text').innerText();
/** one real touch on the stage / keypad so the item counts as attempted (the hint key only escalates after an op) */
async function touch(page: Page): Promise<void> {
  if (await page.locator('.mb-stage .nl').count()) { const b = (await page.locator('.mb-stage .nl-svg').boundingBox())!; await page.mouse.click(b.x + b.width / 2, await page.evaluate(() => (window as any).__nlCtl.trackClientY())); return; }
  if (await page.locator('.mb-keypad .xg-key[data-key="1"]:visible').count()) { await page.locator('.mb-keypad .xg-key[data-key="1"]').first().click(); return; }
  await page.locator('.mb-stage button:not([disabled]):visible').first().click();
}

test('silence before the start tap; ≤ 1 AudioContext; decoded audio ≤ 48 MB; save v=5; console clean', async ({ page }, ti) => {
  const w = await prepare(page); await emptyManifest(page);
  await boot(page, ti, { gate: false });
  const before = await page.evaluate(() => ((window as any).__acs as AudioContext[]).filter((c) => c.state === 'running').length);
  expect(before, 'nothing may be running before the first tap').toBe(0);
  await page.locator('.kit-start__go').click(); await page.waitForSelector('#app[data-ready]'); await page.waitForFunction(() => !!(window as any).__mars);
  await page.evaluate((s) => (window as any).__mars.setSave(s), { onboarded: true });
  await startNode(page, 'vault.K1.1'); await leaveMission(page);
  const n = await page.evaluate(() => ((window as any).__acs as unknown[]).length); expect(n).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => (window as any).__mars.decodedBytes())).toBeLessThanOrEqual(48 * 1024 * 1024);
  const v = await page.evaluate(() => { const raw = localStorage.getItem('kg:v1:mars-base'); return raw ? JSON.parse(raw).v : null; });
  expect(v).toBe(5); expect(w.errors).toEqual([]);
});

test('probe 1: narration OFF, every family group — a touch then the hint key writes a line and marks the order', async ({ page }, ti) => {
  const w = await prepare(page, { narration: false }); await emptyManifest(page); await boot(page, ti);
  const bad: string[] = [];
  for (const [grp, node] of BY_FAMILY) {
    await resetSave(page); await page.waitForSelector('.mb-map');
    await startNode(page, node);
    await page.locator('.mb-hint-btn').click(); const first = await comm(page);   // before any touch: the neutral "try first" line, no escalation
    if (await page.locator('.mb-order.is-hinted').count()) bad.push(`${grp}: hinted before any touch`);
    await touch(page); await page.locator('.mb-hint-btn').click(); await page.waitForTimeout(150);
    const line = (await comm(page)).trim();
    if (!line) bad.push(`${grp}: empty line after the hint key`);
    if (line === first.trim() && !(await page.locator('.mb-order.is-hinted').count())) bad.push(`${grp}: the hint key did nothing`);
    if (!(await page.locator('.mb-order.is-hinted').count())) bad.push(`${grp}: order not marked .is-hinted`);
    await leaveMission(page);
  }
  expect(bad, bad.join('\n')).toEqual([]); expect(w.errors).toEqual([]);
});

test('probe 2+3: an empty delivery is not counted; three wrong deliveries show the answer, deliver assisted and deal a twin', async ({ page }, ti) => {
  const w = await prepare(page); await emptyManifest(page); await boot(page, ti);
  let keypad = false;   // the first item of a node differs per viewport (a short phone stage turns a tray read-out into a 4-button choice): take the first node that opens on a keypad
  for (const node of ['cert.C1.1', 'cert.C1.2', 'cert.C1.4', 'cert.C2.2', 'cert.C2.4', 'cert.C3.2', 'cert.C3.3', 'cert.C3.4']) { await startNode(page, node); if (await page.locator('.mb-mission[data-kind="keypad"]').count()) { keypad = true; break; } await leaveMission(page); }
  expect(keypad, 'a keypad item (the answer lands in the box)').toBe(true);
  const k0 = await itemKey(page);
  await page.evaluate(() => (window as any).__mars.answer(null)); await page.waitForTimeout(250);
  expect(await page.locator('.mb-order.is-hinted').count(), 'an empty delivery must not escalate the hint').toBe(0);
  expect(await itemKey(page)).toBe(k0);
  const correct = await page.evaluate(() => (window as any).__mars.correct());
  for (let i = 0; i < 3; i++) { await page.evaluate(([c, d]) => (window as any).__mars.answer(c + d), [correct, 7 + i]); await page.waitForTimeout(700); }
  await page.waitForFunction(() => document.querySelector('.mb-order.is-hinted'), undefined, { timeout: 4000 });
  const shown = await page.evaluate(() => (document.querySelector('.mb-answer') as HTMLElement).innerText.replace(/\s/g, ''));
  expect(shown, `H3 puts the answer in the box · ${await page.evaluate(() => (document.querySelector('.mb-answer') as HTMLElement).outerHTML.slice(0, 300) + ' | comm: ' + document.querySelector('.mb-comm-text')?.textContent + ' | kind ' + (document.querySelector('.mb-mission') as HTMLElement).dataset.kind)}`).toContain(String(correct));
  await page.evaluate((c) => (window as any).__mars.answer(c), correct); await page.waitForTimeout(1200);
  const twins = await page.evaluate(() => (window as any).__mars.app.save.mission?.twins ?? 0);
  expect(twins, 'assisted delivery deals a twin').toBeGreaterThanOrEqual(1); expect(w.errors).toEqual([]);
});

test('a calibration item: the hint key gives only the neutral line; idle 45 s is a reminder, not a hint', async ({ page }, ti) => {
  await page.clock.install(); const w = await prepare(page); await emptyManifest(page); await boot(page, ti);
  await startNode(page, 'orbit.O1.0');
  await touch(page); await page.locator('.mb-hint-btn').click(); await page.waitForTimeout(100);
  expect(await page.locator('.mb-order.is-hinted').count(), 'no hint in a calibration item').toBe(0);
  expect((await comm(page)).trim().length).toBeGreaterThan(0);
  await resetSave(page); await page.waitForSelector('.mb-map');
  await startNode(page, 'vault.K1.1');
  await page.clock.fastForward(46_000); await page.waitForTimeout(200);
  expect(await page.locator('.mb-hint-btn.is-glow').count(), 'the hint key glows after 45 s').toBe(1);
  expect(await page.locator('.mb-order.is-hinted').count(), 'idle never escalates').toBe(0); expect(w.errors).toEqual([]);
});

test('an empty manifest still shows every subtitle (order line, comm line, map line)', async ({ page }, ti) => {
  await prepare(page); await emptyManifest(page); await boot(page, ti);
  expect((await page.locator('.mb-map').innerText()).trim().length).toBeGreaterThan(0);
  await startNode(page, 'vault.K1.1'); await page.waitForTimeout(300);
  expect((await comm(page)).trim().length).toBeGreaterThan(0);
  expect((await page.locator('.mb-order-big').innerText()).trim().length).toBeGreaterThan(0);
});

test('rotate, back to the map and refresh keep the mission', async ({ page }, ti) => {
  const w = await prepare(page); await emptyManifest(page); await boot(page, ti);
  await startNode(page, 'vault.K1.1');
  await page.evaluate(() => (window as any).__mars.answer((window as any).__mars.correct())); await page.waitForTimeout(1300);
  const k1 = await itemKey(page); const idx = await page.evaluate(() => (window as any).__mars.app.save.mission.idx);
  const vp = page.viewportSize()!;
  if (ti.project.name !== 'se') {   // SE landscape (568×320) is not one of the six acceptance viewports
    await page.setViewportSize({ width: vp.height, height: vp.width }); await page.waitForTimeout(400);
    expect(await page.locator('.mb-mission[data-layout-warn]').count(), 'rotated layout is valid').toBe(0);
    expect(await itemKey(page)).toBe(k1);
    await page.setViewportSize(vp); await page.waitForTimeout(300);
  }
  await leaveMission(page);
  expect(await page.evaluate(() => (window as any).__mars.app.save.mission?.idx)).toBe(idx);
  await page.reload(); await page.locator('.kit-start__go').click().catch(() => undefined); await page.waitForSelector('#app[data-ready]');
  await page.waitForFunction(() => !!(window as any).__mars); await page.waitForSelector('.mb-map');
  expect(await page.evaluate(() => (window as any).__mars.app.save.mission?.idx), 'the mission survives a refresh').toBe(idx);
  await startNode(page, 'vault.K1.1'); expect(await page.evaluate(() => (window as any).__mars.app.save.mission.idx)).toBe(idx);
  expect(w.errors).toEqual([]);
});

test('offline ready: after the service worker installs, every script / style / manifest the page loaded is in the cache (production bundle only)', async ({ page }, ti) => {
  test.setTimeout(60_000);
  await prepare(page); await boot(page, ti);
  const hasSw = await page.evaluate(async () => { if (!('serviceWorker' in navigator)) return false; try { await Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(rej, 6000))]); return true; } catch { return false; } });
  test.skip(!hasSw, 'no service worker on this server (dev); run against the production preview');
  await page.reload(); await page.waitForSelector('#app[data-ready]', { timeout: 10_000 }).catch(() => page.locator('.kit-start__go').click()); await page.waitForTimeout(1200);
  const missing = await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.startsWith(location.origin) && /\.(js|css|json|woff2|webp|svg)(\?|$)/.test(u));
    const out: string[] = []; for (const u of [location.href.split('?')[0], ...urls]) if (!(await caches.match(u))) out.push(u.replace(location.origin, ''));
    return out;
  });
  expect(missing, `not cached: ${missing.join(' ')}`).toEqual([]);
});
